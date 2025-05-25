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

      if (!item) return false; // Should not happen if called correctly
      const itemIdentifier = item.id || item.dataset.mdpiFilterRefId || item.textContent.substring(0, 50);
      // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] --- Checking item ---`, item.textContent.substring(0, 200));

      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

      const isMdpiDoi = (doi) => doi && doi.startsWith(currentMdpiDoi);

      // Priority 1: MDPI DOI Check (from links)
      // Revised logic: If an MDPI DOI link is found, it's MDPI.
      // If only non-MDPI DOI links are found, it's not MDPI by this check.
      let hasMdpiDoiLink = false;
      let hasOnlyNonMdpiDoiLinks = false; // True if we find DOI links, and ALL of them are non-MDPI
      let foundAnyDoiLink = false;

      for (const link of allLinksInItem) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const doi = extractDoiFromLinkInternal(href);
        if (doi) {
          foundAnyDoiLink = true;
          if (isMdpiDoi(doi)) {
            hasMdpiDoiLink = true;
            break; // Found an MDPI DOI, this item is MDPI by this rule.
          }
        }
      }

      if (hasMdpiDoiLink) {
        // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: MDPI DOI link found. Returning TRUE.`);
        // runCache.set(itemIdentifier, true); // Optional: update runCache if it's used for item's direct MDPI status
        return true;
      }

      // If we didn't find an MDPI DOI link, check if we found *only* non-MDPI DOI links.
      if (foundAnyDoiLink && !hasMdpiDoiLink) { // This means all DOIs found were non-MDPI
        // console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P1: Only non-MDPI DOI link(s) found, and no MDPI DOI link. Returning FALSE.`);
        // runCache.set(itemIdentifier, false); // Optional
        return false;
      }
      // If no DOI links were found at all, or if the situation is mixed (which is complex and less likely for a single ref item's primary DOI),
      // proceed to other checks. The `hasMdpiDoiLink` check above is the most direct.

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
        const href = link.href;
        if (href) {
          let match;
          // PMCID from EuropePMC
          match = href.match(/europepmc\.org\/(?:articles|article\/PMC)\/(PMC\d+)/i);
          if (match && match[1]) pmcIdStrings.add(match[1]);
          // PMCID from NCBI
          match = href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
          if (match && match[1]) pmcIdStrings.add(match[1]);
          // PMID from EuropePMC
          match = href.match(/europepmc\.org\/(?:articles|abstract\/MED|article\/med)\/(\d+)(?:\/?$|\?|#)/i);
          if (match && match[1]) pmidStrings.add(match[1]);
          // PMID from NCBI
          match = href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
          if (match && match[1]) pmidStrings.add(match[1]);
        }
      }

      // Strong indicator: any PMID/PMCID present → MDPI
      const allItemNcbiIds = [...pmidStrings, ...pmcIdStrings];
      if (allItemNcbiIds.length > 0) {
        console.log(`[MDPI Filter ItemChecker DEBUG ${itemIdentifier}] P4: PMID/PMCID found (${allItemNcbiIds.join(',')}). Returning TRUE.`);
        return true;
      }

      // Priority 5: Journal Name Check
      const strongJournalRegex = new RegExp(
        `\\b(${M_JOURNALS_STRONG
          .map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|')})\\b`,
        'i'
      );
      if (strongJournalRegex.test(innerHTML)) {
        const matchedJournal = innerHTML.match(strongJournalRegex);
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
      if (weakJournalRegex.test(innerHTML)) {
        const matchedJournal = innerHTML.match(weakJournalRegex);
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
      extractDoiFromLinkInternal: extractDoiFromLinkInternal // Expose for potential use in content_script for pre-fetching
    };
  })();
}