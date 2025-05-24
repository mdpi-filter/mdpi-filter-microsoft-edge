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
          targetUrl = urlObj.searchParams.get('url');
        } else if (urlObj.pathname.includes('/linkout/') && urlObj.searchParams.has('dest')) {
          targetUrl = urlObj.searchParams.get('dest');
        }
        // It's generally safer to decode the targetUrl if it might contain encoded DOIs
        // especially if the regex relies on specific characters like '/'.
        targetUrl = decodeURIComponent(targetUrl);

      } catch (e) {
        // console.warn('[MDPI Filter ItemChecker] Error parsing URL in extractDoiFromLink:', hrefAttribute, e);
        // If URL parsing fails, try to decode the original hrefAttribute as a fallback,
        // as it might still contain a decodable DOI.
        try {
          targetUrl = decodeURIComponent(hrefAttribute);
        } catch (decodeError) {
          // If decoding also fails, proceed with the original hrefAttribute.
          // console.warn('[MDPI Filter ItemChecker] Error decoding hrefAttribute:', hrefAttribute, decodeError);
        }
      }
      // Regex to extract DOI: 10. followed by 4 or more digits, a slash (or its URL encoding %2F), 
      // and then any characters except whitespace or common delimiters.
      // Now explicitly handles decoded slashes.
      const doiMatch = targetUrl.match(/\b(10\.\d{4,9}\/(?:[^"\s'&<>]+))\b/i);
      return doiMatch ? doiMatch[1] : null;
    };

    // Main function to check item content for MDPI indicators
    // It takes the DOM item, a runCache (Map), and the current MDPI_DOI and MDPI_DOMAIN strings
    function checkItemContent(item, runCache, currentMdpiDoi, currentMdpiDomain) {
      // --- REMOVED: Skip all logic if on Google search results ---
      // (No early return for Google search pages)

      if (!item) return false;
      const itemIdentifier = item.id || item.dataset.mdpiFilterRefId || item.textContent.substring(0, 50);
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] --- Checking item ---`, item.textContent.substring(0, 200));

      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

      const isMdpiDoi = (doi) => doi && doi.startsWith(currentMdpiDoi);

      // Priority 1: MDPI DOI Check (from links)
      let hasNonMdpiDoiLink = false;
      let foundMdpiDoiLink = false; // Added to track if an MDPI DOI link is found

      for (const link of allLinksInItem) {
        const doiInLink = extractDoiFromLinkInternal(link.href);
        if (doiInLink) {
          if (isMdpiDoi(doiInLink)) {
            // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: MDPI DOI link FOUND: '${doiInLink}'. Returning TRUE.`);
            // return true; // Original behavior: return true immediately
            foundMdpiDoiLink = true; // Mark that an MDPI DOI link was found
            // Do not return immediately; continue checking other links for non-MDPI DOIs
            // to correctly set hasNonMdpiDoiLink.
          } else {
            // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: Non-MDPI DOI link FOUND: '${doiInLink}'. Setting hasNonMdpiDoiLink.`);
            hasNonMdpiDoiLink = true;
          }
        }
      }

      // If an MDPI DOI link was found AND no non-MDPI DOI link was found, then it's MDPI.
      if (foundMdpiDoiLink && !hasNonMdpiDoiLink) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: MDPI DOI link found and no overriding non-MDPI DOI link. Returning TRUE.`);
        return true;
      }
      // If a non-MDPI DOI link was found, this item is definitively NOT MDPI,
      // regardless of whether an MDPI DOI link was also found (unlikely but possible with multiple DOI links).
      if (hasNonMdpiDoiLink) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1 Result: Non-MDPI DOI link found. Definitive NON-MDPI. Returning FALSE.`);
        return false;
      }
      // If we reach here, P1 found no DOI links at all, or only MDPI DOI links but also a non-MDPI DOI link (handled above).

      // Priority 2: MDPI DOI String in Text Content (RESTORED)
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
            const url = new URL(link.href); // Handles relative URLs correctly
            if (url.hostname.endsWith(currentMdpiDomain)) {
              console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P3: Link to MDPI domain FOUND: '${link.href}'. Returning TRUE.`);
              return true; // Link to MDPI domain
            }
          } catch (e) {
            // console.warn(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P3: Could not parse URL: ${link.href}`, e);
          }
        }
      }

      // Priority 4: PMID/PMCID to DOI Conversion Check (via runCache)
      let pmcIdStrings = new Set();
      let pmidStrings = new Set();
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Starting NCBI ID extraction from links.`);
      for (const link of allLinksInItem) {
        const href = link.href; // Get the fully resolved URL from the browser
        if (href) {
          let match;

          // PMCID from EuropePMC (e.g., europepmc.org/articles/PMC12345)
          match = href.match(/europepmc\.org\/(?:articles|article\/PMC)\/(PMC\d+)/i);
          if (match && match[1]) {
            pmcIdStrings.add(match[1]);
          }

          // PMCID from NCBI (e.g., ncbi.nlm.nih.gov/pmc/articles/PMC12345)
          match = href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
          if (match && match[1]) {
            pmcIdStrings.add(match[1]);
          }

          // PMID from EuropePMC (e.g., europepmc.org/article/MED/1234567)
          match = href.match(/europepmc\.org\/(?:articles|abstract\/MED|article\/med)\/(\d+)(?:\/?$|\?|#)/i);
          if (match && match[1] && /^\d+$/.test(match[1])) {
            pmidStrings.add(match[1]);
          }

          // PMID from NCBI (e.g., pubmed.ncbi.nlm.nih.gov/1234567)
          match = href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
          if (match && match[1] && /^\d+$/.test(match[1])) {
            pmidStrings.add(match[1]);
          }
        }
      }
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Extracted PMIDs from links:`, Array.from(pmidStrings));
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Extracted PMCIDs from links:`, Array.from(pmcIdStrings));

      const allItemNcbiIds = [...pmidStrings, ...pmcIdStrings];
      let itemHasNcbiIds = allItemNcbiIds.length > 0;
      let allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = itemHasNcbiIds; 

      if (itemHasNcbiIds) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Item has NCBI IDs, checking runCache for:`, allItemNcbiIds);
        for (const id of allItemNcbiIds) {
          if (runCache.has(id)) {
            if (runCache.get(id) === true) { // Explicitly true means MDPI
              console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: NCBI ID '${id}' in runCache IS MDPI. Returning TRUE.`);
              return true; // Found an MDPI ID via NCBI API result in cache
            }
            // If cached as false, it contributes to 'allCheckedIdsWereInCacheAndDefinitivelyNonMdpi'
            if (runCache.get(id) !== false) { // Not definitively non-MDPI (e.g. undefined, null, or error state)
                allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
            }
          } else {
            // ID not in runCache means it wasn't (successfully) checked by API or is pending.
            // Cannot definitively say it's non-MDPI based on cache.
            allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
            console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: NCBI ID '${id}' NOT in runCache. Cannot determine MDPI status from cache alone for this ID.`);
          }
        }
      } else {
        allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false; // No NCBI IDs means this condition isn't met
      }

      // --- NEW DECISION POINT BEFORE WEAKER CHECKS (like P5 Journal Name) ---
      // If a non-MDPI DOI link was found, this item is definitively NOT MDPI.
      if (hasNonMdpiDoiLink) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] Pre-P5 Decision: Non-MDPI due to 'hasNonMdpiDoiLink' being true. Returning FALSE.`);
        return false;
      }
      // If the item has NCBI IDs and ALL of them are cached as definitively non-MDPI, then it's NOT MDPI.
      if (itemHasNcbiIds && allCheckedIdsWereInCacheAndDefinitivelyNonMdpi) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] Pre-P5 Decision: Non-MDPI due to all associated NCBI IDs being cached as non-MDPI. Returning FALSE.`);
        return false;
      }
      // --- END NEW DECISION POINT ---

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

      // FINAL DECISION POINT (Fallback)
      // This log indicates that none of the preceding checks (P1-P5 MDPI true conditions, or overriding non-MDPI conditions) were met.
      console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] Final Fallback: No definitive MDPI indicators found, and no overriding non-MDPI conditions met prior to P5 that were not already handled. Defaulting to non-MDPI. Returning FALSE.`);
      return false;
    }

    return {
      checkItemContent: checkItemContent,
      extractDoiFromLinkInternal: extractDoiFromLinkInternal // Expose for potential use in content_script for pre-fetching
    };
  })();
}