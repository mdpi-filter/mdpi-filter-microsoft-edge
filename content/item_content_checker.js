if (typeof window.MDPIFilterItemContentChecker === 'undefined') {
  window.MDPIFilterItemContentChecker = (() => {
    const M_JOURNALS_STRONG = ['Int J Mol Sci', 'IJMS'];
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

      // Priority 1: DOI Check (from links)
      let hasNonMdpiDoiLink = false;
      let hasMdpiDoiLink = false;
      for (const link of allLinksInItem) {
        const doiInLink = extractDoiFromLinkInternal(link.href);
        if (doiInLink) {
          if (isMdpiDoi(doiInLink)) {
            hasMdpiDoiLink = true;
            break; // Found an MDPI DOI link, no need to check further links for this priority
          } else {
            hasNonMdpiDoiLink = true;
          }
        }
      }

      if (hasMdpiDoiLink) return true;
      // If a non-MDPI DOI link was found and no MDPI DOI link, consider it non-MDPI to avoid ambiguity.
      if (hasNonMdpiDoiLink) return false;

      // Priority 2: MDPI DOI String in Text Content
      // Escape dots in MDPI_DOI for regex and look for the pattern
      const mdpiDoiTextPattern = new RegExp(currentMdpiDoi.replace(/\./g, '\\.') + "\/[^\\s\"'<>&]+", "i");
      if (mdpiDoiTextPattern.test(textContent)) return true;

      // Priority 3: Link to MDPI Domain (general check)
      for (const link of allLinksInItem) {
        if (link.href && typeof link.href === 'string' && link.href.includes(currentMdpiDomain)) return true;
      }

      // Priority 4: PMID/PMCID to DOI Conversion Check (via runCache)
      // This relies on runCache being populated by prior NCBI API calls
      let pmcIdStrings = new Set();
      let pmidStrings = new Set();
      for (const link of allLinksInItem) {
        if (link.href) {
          // Extract PMCID if link matches NCBI PMC article pattern
          const pmcMatch = link.href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+(\.\d+)?)/i);
          if (pmcMatch && pmcMatch[1]) {
            pmcIdStrings.add(pmcMatch[1].replace(/\.\d+$/, '')); // Remove version part if present
          } else {
            // Extract PMID if link matches PubMed abstract pattern
            const pmidMatch = link.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
            if (pmidMatch && pmidMatch[1]) {
              pmidStrings.add(pmidMatch[1]);
            }
          }
        }
      }

      const allItemNcbiIds = [...pmidStrings, ...pmcIdStrings];
      let itemHasNcbiIds = allItemNcbiIds.length > 0;
      // Assume all NCBI IDs found were cached and definitively non-MDPI, until proven otherwise
      let allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = true;

      if (itemHasNcbiIds) {
        for (const id of allItemNcbiIds) {
          if (runCache.has(id)) {
            if (runCache.get(id) === true) return true; // API lookup indicated MDPI
            // If runCache.get(id) is false, it's non-MDPI, continue checking.
          } else {
            // If an ID isn't in the cache, we can't be sure all are non-MDPI.
            allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
          }
        }
        // If all NCBI IDs present were resolved from cache as non-MDPI, then this item is non-MDPI.
        if (allCheckedIdsWereInCacheAndDefinitivelyNonMdpi) return false;
      }

      // Priority 5: Journal Name Check (using internal M_JOURNALS lists)
      const strongJournalRegex = new RegExp(`\\b(${M_JOURNALS_STRONG.map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
      if (strongJournalRegex.test(innerHTML)) return true;

      const weakJournalRegex = new RegExp(`\\b(${M_JOURNALS_WEAK.map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
      if (weakJournalRegex.test(innerHTML)) return true;

      return false; // Default: No MDPI criteria met
    }

    return {
      checkItemContent: checkItemContent
    };
  })();
}