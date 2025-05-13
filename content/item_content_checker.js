if (typeof window.MDPIFilterItemContentChecker === 'undefined') {
  window.MDPIFilterItemContentChecker = (() => {
    const M_JOURNALS_STRONG = ['Int J Mol Sci', 'IJMS', 'International Journal of Molecular Sciences'];
    const M_JOURNALS_WEAK = ['Nutrients', 'Molecules']; // This array includes the "WEAK" selection context

    const extractDoiFromLinkInternal = (hrefAttribute) => {
      if (!hrefAttribute) return null;
      let targetUrl = hrefAttribute;
      try {
        // Resolve relative URLs using window.location.origin if in a browser context
        const base = hrefAttribute.startsWith('/') ? (typeof window !== 'undefined' ? window.location.origin : undefined) : undefined;
        const urlObj = new URL(hrefAttribute, base);
        if (urlObj.searchParams.has('url')) {
          targetUrl = decodeURIComponent(urlObj.searchParams.get('url'));
        } else if (urlObj.searchParams.has('doi')) {
          const doiParam = decodeURIComponent(urlObj.searchParams.get('doi'));
          // Handle DOIs that are not full URLs but are actual DOI strings
          if (!doiParam.toLowerCase().startsWith('http') && doiParam.includes('/')) {
            targetUrl = `https://doi.org/${doiParam}`;
          } else {
            targetUrl = doiParam;
          }
        }
      } catch (e) {
        // console.warn('[MDPI Filter ItemChecker] Error parsing URL in extractDoiFromLink:', hrefAttribute, e);
      }
      // Regex to extract DOI: 10. followed by 4 or more digits, a slash, and then any characters except whitespace or common delimiters
      const doiMatch = targetUrl.match(/\b(10\.\d{4,9}\/[^"\s'&<>]+)\b/i);
      return doiMatch ? doiMatch[1] : null;
    };

    // Main function to check item content for MDPI indicators
    // It takes the DOM item, a runCache (Map), and the current MDPI_DOI and MDPI_DOMAIN strings
    function checkItemContent(item, runCache, currentMdpiDoi, currentMdpiDomain) {
      if (!item) return false;
      const itemIdentifier = item.id || item.dataset.mdpiFilterRefId || item.textContent.substring(0, 50);
      console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] --- Checking item ---`, item.textContent.substring(0, 200));

      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

      const isMdpiDoi = (doi) => doi && doi.startsWith(currentMdpiDoi);

      // Priority 1: MDPI DOI Check (from links)
      let hasNonMdpiDoiLink = false;
      for (const link of allLinksInItem) {
        const doiInLink = extractDoiFromLinkInternal(link.href);
        if (doiInLink) {
          console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: Extracted DOI '${doiInLink}' from link '${link.href}'`);
          if (isMdpiDoi(doiInLink)) {
            console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: MDPI DOI link FOUND: ${doiInLink}. Returning TRUE.`);
            return true; // Found an MDPI DOI link, this item is MDPI.
          } else {
            console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: Non-MDPI DOI link found: ${doiInLink}`);
            hasNonMdpiDoiLink = true; // A non-MDPI DOI link is present.
          }
        }
      }

      // Priority 2: MDPI DOI String in Text Content
      const mdpiDoiTextPattern = new RegExp(currentMdpiDoi.replace(/\./g, '\\.') + "\/[^\\s\"'<>&]+", "i");
      if (mdpiDoiTextPattern.test(textContent)) {
        const matchedDoi = textContent.match(mdpiDoiTextPattern);
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P2: MDPI DOI string FOUND in text: '${matchedDoi ? matchedDoi[0] : 'N/A'}'. Returning TRUE.`);
        return true;
      }

      // Priority 3: Link to MDPI Domain (general check)
      for (const link of allLinksInItem) {
        if (link.href && typeof link.href === 'string') {
            try {
                const linkHostname = new URL(link.href).hostname;
                if (linkHostname.endsWith(currentMdpiDomain)) {
                    console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P3: Link to MDPI domain FOUND: ${link.href}. Returning TRUE.`);
                    return true;
                }
            } catch (e) {
                // Invalid URL, ignore
            }
        }
      }

      // Priority 4: PMID/PMCID to DOI Conversion Check (via runCache)
      let pmcIdStrings = new Set();
      let pmidStrings = new Set();
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Starting NCBI ID extraction.`);
      for (const link of allLinksInItem) {
        if (link.href) {
          // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Checking link for NCBI ID: ${link.href}`);
          const pmcMatch = link.href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
          if (pmcMatch && pmcMatch[1]) {
            // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Found PMCID: ${pmcMatch[1]} in link: ${link.href}`);
            pmcIdStrings.add(pmcMatch[1].toUpperCase());
          } else {
            const pmidMatch = link.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
            if (pmidMatch && pmidMatch[1]) {
              // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Found PMID: ${pmidMatch[1]} in link: ${link.href}`);
              pmidStrings.add(pmidMatch[1]);
            }
          }
        }
      }
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Extracted PMIDs:`, Array.from(pmidStrings));
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Extracted PMCIDs:`, Array.from(pmcIdStrings));

      const allItemNcbiIds = [...pmidStrings, ...pmcIdStrings];
      let itemHasNcbiIds = allItemNcbiIds.length > 0;
      let allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = itemHasNcbiIds;

      if (itemHasNcbiIds) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Item has NCBI IDs, checking runCache for:`, allItemNcbiIds);
        for (const id of allItemNcbiIds) {
          if (runCache.has(id)) {
            const cacheEntry = runCache.get(id);
            console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: runCache HIT for ID '${id}'. Cached value:`, cacheEntry);
            if ((typeof cacheEntry === 'object' && cacheEntry.isMdpi === true) || cacheEntry === true) {
              console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: MDPI status TRUE from cache for NCBI ID '${id}'. Returning TRUE.`);
              return true;
            }
            if (!((typeof cacheEntry === 'object' && cacheEntry.isMdpi === false) || cacheEntry === false)) {
              allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
            }
          } else {
            console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: runCache MISS for ID '${id}'.`);
            allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
          }
        }
      } else {
        allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
      }

      // Priority 5: Journal Name Check
      const strongJournalRegex = new RegExp(`\\b(${M_JOURNALS_STRONG.map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
      if (strongJournalRegex.test(innerHTML)) {
        const matchedJournal = innerHTML.match(strongJournalRegex);
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P5: Strong MDPI journal name FOUND: '${matchedJournal ? matchedJournal[0] : 'N/A'}'. Returning TRUE.`);
        return true;
      }

      const weakJournalRegex = new RegExp(`\\b(${M_JOURNALS_WEAK.map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
      if (weakJournalRegex.test(innerHTML)) {
        const matchedJournal = innerHTML.match(weakJournalRegex);
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P5: Weak MDPI journal name FOUND: '${matchedJournal ? matchedJournal[0] : 'N/A'}'. Returning TRUE.`);
        return true;
      }

      // FINAL DECISION POINT:
      if (hasNonMdpiDoiLink) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] Final: Non-MDPI due to hasNonMdpiDoiLink. Returning FALSE.`);
        return false;
      }
      
      if (itemHasNcbiIds && allCheckedIdsWereInCacheAndDefinitivelyNonMdpi) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] Final: Non-MDPI due to all NCBI IDs cached as non-MDPI. Returning FALSE.`);
        return false;
      }

      console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] Final: Defaulting to non-MDPI. No MDPI indicators met, and no definitive non-MDPI DOI or NCBI cache status. Returning FALSE.`);
      return false;
    }

    return {
      checkItemContent: checkItemContent,
      extractDoiFromLinkInternal: extractDoiFromLinkInternal // Expose for potential use in content_script for pre-fetching
    };
  })();
}