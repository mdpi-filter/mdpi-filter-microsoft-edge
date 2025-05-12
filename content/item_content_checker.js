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
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

      const isMdpiDoi = (doi) => doi && doi.startsWith(currentMdpiDoi);

      // Priority 1: MDPI DOI Check (from links)
      let hasNonMdpiDoiLink = false;
      for (const link of allLinksInItem) {
        const doiInLink = extractDoiFromLinkInternal(link.href);
        if (doiInLink) {
          if (isMdpiDoi(doiInLink)) {
            // console.log(`[MDPI Filter ItemChecker] Priority 1: Found MDPI DOI link: ${doiInLink} in item:`, item.textContent.substring(0,100));
            return true; // Found an MDPI DOI link, this item is MDPI.
          } else {
            hasNonMdpiDoiLink = true; // A non-MDPI DOI link is present.
          }
        }
      }
      // Note: hasMdpiDoiLink flag is effectively handled by the immediate return true above.

      // Priority 2: MDPI DOI String in Text Content
      const mdpiDoiTextPattern = new RegExp(currentMdpiDoi.replace(/\./g, '\\.') + "\/[^\\s\"'<>&]+", "i");
      if (mdpiDoiTextPattern.test(textContent)) {
        // console.log(`[MDPI Filter ItemChecker] Priority 2: Found MDPI DOI in text in item:`, item.textContent.substring(0,100));
        return true;
      }

      // Priority 3: Link to MDPI Domain (general check)
      for (const link of allLinksInItem) {
        if (link.href && typeof link.href === 'string') {
            try {
                const linkHostname = new URL(link.href).hostname;
                if (linkHostname.endsWith(currentMdpiDomain)) {
                    // console.log(`[MDPI Filter ItemChecker] Priority 3: Found link to MDPI domain: ${link.href} in item:`, item.textContent.substring(0,100));
                    return true;
                }
            } catch (e) {
                // Invalid URL, ignore
            }
        }
      }

      // Priority 4: PMID/PMCID to DOI Conversion Check (via runCache)
      // This relies on runCache being populated by prior NCBI API calls
      let pmcIdStrings = new Set();
      let pmidStrings = new Set();
      console.log("[MDPI Filter ItemChecker] PRIO 4: Starting NCBI ID extraction for item. Text (first 100):", item.textContent.substring(0, 100)); // Added log
      for (const link of allLinksInItem) {
        if (link.href) {
          console.log("[MDPI Filter ItemChecker] PRIO 4: Checking link for NCBI ID:", link.href); // Added log
          const pmcMatch = link.href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i); // Simpler PMC match
          if (pmcMatch && pmcMatch[1]) {
            console.log("[MDPI Filter ItemChecker] PRIO 4: Found PMCID:", pmcMatch[1], "in link:", link.href); // Added log
            pmcIdStrings.add(pmcMatch[1].toUpperCase()); // Normalize
          } else {
            // Extract PMID if link matches PubMed abstract pattern
            const pmidMatch = link.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
            if (pmidMatch && pmidMatch[1]) {
              console.log("[MDPI Filter ItemChecker] PRIO 4: Found PMID:", pmidMatch[1], "in link:", link.href); // Added log
              pmidStrings.add(pmidMatch[1]);
            }
          }
        }
      }
      console.log("[MDPI Filter ItemChecker] PRIO 4: Extracted PMIDs for item:", Array.from(pmidStrings)); // Added log
      console.log("[MDPI Filter ItemChecker] PRIO 4: Extracted PMCIDs for item:", Array.from(pmcIdStrings)); // Added log

      const allItemNcbiIds = [...pmidStrings, ...pmcIdStrings];
      let itemHasNcbiIds = allItemNcbiIds.length > 0;
      let allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = itemHasNcbiIds; // Assume true if IDs exist, falsify if not all are non-MDPI

      if (itemHasNcbiIds) {
        console.log("[MDPI Filter ItemChecker] PRIO 4: Item has NCBI IDs, checking runCache for:", allItemNcbiIds); // Added log
        for (const id of allItemNcbiIds) {
          if (runCache.has(id)) {
            const cacheEntry = runCache.get(id);
            console.log("[MDPI Filter ItemChecker] PRIO 4: runCache HIT for ID:", id, "Value:", cacheEntry); // Added log
            if ((typeof cacheEntry === 'object' && cacheEntry.isMdpi === true) || cacheEntry === true) {
              // console.log(`[MDPI Filter ItemChecker] Priority 4: Found MDPI via NCBI ID ${id} from cache in item:`, item.textContent.substring(0,100));
              return true;
            }
            if (!((typeof cacheEntry === 'object' && cacheEntry.isMdpi === false) || cacheEntry === false)) {
              // If cache entry is not explicitly false (e.g. undefined, or an object without isMdpi:false)
              allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
            }
          } else {
            console.log("[MDPI Filter ItemChecker] PRIO 4: runCache MISS for ID:", id); // Added log
            allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false; // Not in cache, cannot confirm non-MDPI status for all
          }
        }
      } else {
        allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false; // No NCBI IDs, so this check is not applicable for determining non-MDPI
      }

      // Priority 5: Journal Name Check (using internal M_JOURNALS lists)
      // Use innerHTML for these checks as journal names might be part of markup not reflected in textContent (e.g. <em>Int J Mol Sci</em>)
      const strongJournalRegex = new RegExp(`\\b(${M_JOURNALS_STRONG.map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
      if (strongJournalRegex.test(innerHTML)) {
        // console.log(`[MDPI Filter ItemChecker] Priority 5: Found strong MDPI journal name in item:`, item.textContent.substring(0,100));
        return true;
      }

      const weakJournalRegex = new RegExp(`\\b(${M_JOURNALS_WEAK.map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
      if (weakJournalRegex.test(innerHTML)) {
        // console.log(`[MDPI Filter ItemChecker] Priority 5: Found weak MDPI journal name in item:`, item.textContent.substring(0,100));
        return true;
      }

      // FINAL DECISION POINT:
      // If we've reached here, no definitive MDPI indicator was found by priorities 1-5.
      // Now, consider if a non-MDPI DOI link was present (from Priority 1).
      if (hasNonMdpiDoiLink) {
        // console.log(`[MDPI Filter ItemChecker] Final: Non-MDPI due to hasNonMdpiDoiLink for item:`, item.textContent.substring(0,100));
        return false;
      }
      
      // Or, if all NCBI IDs found were cached and confirmed non-MDPI.
      if (itemHasNcbiIds && allCheckedIdsWereInCacheAndDefinitivelyNonMdpi) {
        // console.log(`[MDPI Filter ItemChecker] Final: Non-MDPI due to all NCBI IDs cached as non-MDPI for item:`, item.textContent.substring(0,100));
        return false;
      }

      // console.log(`[MDPI Filter ItemChecker] Final: Default non-MDPI for item:`, item.textContent.substring(0,100));
      return false; // Default: No MDPI criteria met, and no specific non-MDPI DOI link found.
    }

    return {
      checkItemContent: checkItemContent
    };
  })();
}