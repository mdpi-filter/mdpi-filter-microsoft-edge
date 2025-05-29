if (typeof window.MDPIFilterItemContentChecker === 'undefined') {
  window.MDPIFilterItemContentChecker = (() => {
    const M_JOURNALS_STRONG = ['Int J Mol Sci', 'IJMS', 'International Journal of Molecular Sciences'];
    const M_JOURNALS_WEAK = ['Nutrients', 'Molecules', 'Toxins']; // This array includes the "WEAK" selection context

    const extractDoiFromLinkInternal = (hrefAttribute) => {
      if (!hrefAttribute) return null;
      let targetUrlStr = hrefAttribute; 

      try {
        // Resolve relative URLs using window.location.origin if in a browser context
        const base = hrefAttribute.startsWith('/') ? (typeof window !== 'undefined' ? window.location.origin : undefined) : undefined;
        const urlObj = new URL(hrefAttribute, base);

        // Wiley specific: prioritize 'refDoi' or 'key' parameter in /servlet/linkout
        if (urlObj.pathname.includes('/servlet/linkout')) {
            let doiFromParam = null;
            if (urlObj.searchParams.has('refDoi')) {
                doiFromParam = urlObj.searchParams.get('refDoi');
            } else if (urlObj.searchParams.has('key')) {
                doiFromParam = urlObj.searchParams.get('key');
            }

            if (doiFromParam) {
                // The param value might itself be a DOI or contain it.
                // Validate/extract clean DOI from it.
                const doiMatchInParam = String(doiFromParam).match(/\b(10\.\d{4,9}\/[^#?\s'&<>]+)\b/i);
                if (doiMatchInParam && doiMatchInParam[1]) {
                    // console.log(`[MDPI Filter ItemChecker] Extracted DOI '${doiMatchInParam[1]}' from Wiley link param.`);
                    return doiMatchInParam[1]; // Return the DOI from 'refDoi' or 'key'
                }
            }
        }

        // Generic extraction from 'url' or 'dest' parameters if the above didn't return
        if (urlObj.searchParams.has('url')) {
          targetUrlStr = urlObj.searchParams.get('url');
        } else if (urlObj.pathname.includes('/linkout/') && urlObj.searchParams.has('dest')) { // Generic linkout (might be redundant if Wiley specific is comprehensive)
          targetUrlStr = urlObj.searchParams.get('dest');
        }
        // It's generally safer to decode the targetUrlStr if it might contain encoded DOIs
        targetUrlStr = decodeURIComponent(targetUrlStr);

      } catch (e) {
        // console.warn('[MDPI Filter ItemChecker] Error parsing URL in extractDoiFromLink:', hrefAttribute, e);
        try {
          targetUrlStr = decodeURIComponent(hrefAttribute); // Fallback to decoding the original href
        } catch (decodeError) {
          // console.warn('[MDPI Filter ItemChecker] Error decoding hrefAttribute:', hrefAttribute, decodeError);
          // If all decoding fails, targetUrlStr remains the original hrefAttribute
        }
      }
      
      // General DOI regex match on the processed targetUrlStr
      // Ensure targetUrlStr is a string before calling match
      const doiMatch = String(targetUrlStr).match(/\b(10\.\d{4,9}\/(?:[^"\s'&<>]+))\b/i);
      return doiMatch ? doiMatch[1] : null;
    };

    // Escape user-controlled patterns for safe RegExp
    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Main function to check item content for MDPI indicators
    // It takes the DOM item, a runCache (Map), and the current MDPI_DOI and MDPI_DOMAIN strings
    // And optionally, the primary DOI and URL extracted by link_extractor.js, and an idExtractorInstance
    function checkItemContent(item, runCache, currentMdpiDoi, currentMdpiDomain, primaryLinkDoi, primaryLinkUrl, idExtractorInstance) {
      // --- REMOVED: Skip all logic if on Google search results ---
      // (No early return for Google search pages)

      if (!item) return false; // Should not happen if called correctly
      const itemIdentifier = item.id || item.dataset.mdpiFilterRefId || item.textContent.substring(0, 50);
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] --- Checking item ---`, item.textContent.substring(0, 200));

      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

      const isMdpiDoi = (doi) => doi && doi.startsWith(currentMdpiDoi);

      // Priority 0: Check DOI from primary link extractor (passed as argument)
      if (primaryLinkDoi && isMdpiDoi(primaryLinkDoi)) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P0: Returning TRUE (MDPI DOI from primaryLinkExtractor: ${primaryLinkDoi}).`);
        return true;
      }

      // Priority 1: MDPI DOI Check (from links)
      let hasMdpiDoiLink = false;
      for (const link of allLinksInItem) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const doi = extractDoiFromLinkInternal(href);
        if (doi && isMdpiDoi(doi)) {
          hasMdpiDoiLink = true;
          break;
        }
      }

      if (hasMdpiDoiLink) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: MDPI DOI link found. Returning TRUE.`);
        return true;
      }

      // Priority 2: MDPI DOI String in Text Content
      const mdpiDoiTextPattern = new RegExp(escapeRegex(currentMdpiDoi) + "\\/[^\\s\"'<>&]+", "i");
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
          } catch (e) { /* ignore invalid URLs */ }
        }
      }

      // Priority 4: Check runCache for IDs found in the item (PMID, PMCID, non-MDPI DOI)
      // This step assumes runCache has been populated by prior API calls.
      // It uses idExtractorInstance (e.g., GoogleContentChecker) for consistent ID extraction.
      if (idExtractorInstance && typeof idExtractorInstance.extractPmidFromUrl === 'function') {
        const idsToCheckInCache = new Set();

        allLinksInItem.forEach(link => {
          const href = link.getAttribute('href');
          if (!href) return;

          const pmidFromLink = idExtractorInstance.extractPmidFromUrl(href);
          if (pmidFromLink) idsToCheckInCache.add(pmidFromLink);

          const pmcidFromLink = idExtractorInstance.extractPmcidFromUrl(href);
          if (pmcidFromLink) idsToCheckInCache.add(pmcidFromLink);
          
          const doiFromLink = extractDoiFromLinkInternal(href); // Use own internal for consistency here
          if (doiFromLink && !isMdpiDoi(doiFromLink)) {
              idsToCheckInCache.add(doiFromLink);
          }
        });

        (idExtractorInstance.extractPmidsFromText(textContent) || []).forEach(id => idsToCheckInCache.add(id));
        (idExtractorInstance.extractPmcidsFromText(textContent) || []).forEach(id => idsToCheckInCache.add(id));
        (idExtractorInstance.extractDoisFromText(textContent) || []).forEach(doi => {
            if (!isMdpiDoi(doi)) idsToCheckInCache.add(doi);
        });

        if (idsToCheckInCache.size > 0) {
          let anIdInCacheIsMdpi = false;
          let allFoundIdsWereInCacheAndFalse = true; // Assume true until an ID is missing or true
          let atLeastOneIdFoundAndInCache = false;

          for (const id of idsToCheckInCache) {
            if (runCache.has(id)) {
              atLeastOneIdFoundAndInCache = true;
              if (runCache.get(id) === true) {
                anIdInCacheIsMdpi = true;
                allFoundIdsWereInCacheAndFalse = false; 
                break; 
              } else {
                // runCache.get(id) is false, continue
              }
            } else {
              // This ID was found in the item but not in the runCache.
              // This means we can't confirm all IDs are non-MDPI.
              allFoundIdsWereInCacheAndFalse = false;
              // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: ID '${id}' found in item but not in runCache.`);
            }
          }

          if (anIdInCacheIsMdpi) {
            console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Returning TRUE (found MDPI ID in runCache).`);
            return true;
          }
          // If we found at least one ID, and all of them that were in the cache were 'false',
          // and no ID was found to be 'true'.
          if (atLeastOneIdFoundAndInCache && allFoundIdsWereInCacheAndFalse) {
               console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: Returning FALSE (all found NCBI/DOI IDs that were in runCache are non-MDPI).`);
               return false; // Definitively not MDPI based on these IDs
          }
          // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: No conclusive MDPI status from runCache for IDs. Proceeding. allFoundIdsWereInCacheAndFalse=${allFoundIdsWereInCacheAndFalse}, atLeastOneIdFoundAndInCache=${atLeastOneIdFoundAndInCache}`);
        }
      } else {
        // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: idExtractorInstance not available. Skipping cache check for NCBI IDs.`);
      }


      // Priority 5: Journal Name Check (if not returned false by P4's cache check)
      // Consider using textContent if journal names are expected in plain text.
      // Using innerHTML is acceptable if patterns might be within HTML tags/attributes.
      const contentToCheckForJournals = textContent; // Or stick with innerHTML if necessary

      const strongJournalRegex = new RegExp(
        `\\b(${M_JOURNALS_STRONG
          .map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|')})\\b`,
        'i'
      );
      if (strongJournalRegex.test(contentToCheckForJournals)) { // Use contentToCheckForJournals
        const matchedJournal = contentToCheckForJournals.match(strongJournalRegex); // Use contentToCheckForJournals
        console.log(
          `[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P5: Strong MDPI journal name FOUND: '${matchedJournal ? matchedJournal[0] : 'N/A'}'. Returning TRUE.`
        );
        return true;
      }

      const weakJournalRegex = new RegExp(
        `\\b(${M_JOURNALS_WEAK
          .map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|')})\\b`,
        'i'
      );
      if (weakJournalRegex.test(contentToCheckForJournals)) { // Use contentToCheckForJournals
        const matchedJournal = contentToCheckForJournals.match(weakJournalRegex); // Use contentToCheckForJournals
        console.log(
          `[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P5: Weak MDPI journal name FOUND: '${matchedJournal ? matchedJournal[0] : 'N/A'}'. Returning TRUE.`
        );
        return true;
      }

      // Final fallback
      console.log(
        `[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] Final Fallback: No definitive MDPI indicators found. Returning FALSE.`
      );
      return false;

    } // end of checkItemContent

    return {
      checkItemContent: checkItemContent,
      extractDoiFromLinkInternal: extractDoiFromLinkInternal
    };
  })();
}