class GoogleContentChecker {
  constructor() {
    this.potentialMdpiKeywords = [
      'mdpi',
      'multidisciplinary digital publishing institute',
      'doi: 10.3390', // Specific MDPI DOI prefix
      'pmid:', // General keyword, can cause FPs if used for definitive match
      'pmc article', // General keyword
      'free pmc article' // General keyword
    ];
  }

  /**
   * Extracts DOI from a link href attribute (similar to item_content_checker.js but simplified for Google)
   * @param {string} hrefAttribute The href attribute value
   * @returns {string|null} The extracted DOI or null
   */
  extractDoiFromLink(hrefAttribute) {
    if (!hrefAttribute) return null;
    let targetUrl = hrefAttribute;
    try {
      const base = hrefAttribute.startsWith('/') ? (typeof window !== 'undefined' ? window.location.origin : undefined) : undefined;
      const urlObj = new URL(hrefAttribute, base);
      if (urlObj.searchParams.has('url')) {
        targetUrl = decodeURIComponent(urlObj.searchParams.get('url'));
      } else if (urlObj.searchParams.has('doi')) {
        const doiParam = decodeURIComponent(urlObj.searchParams.get('doi'));
        if (!doiParam.toLowerCase().startsWith('http') && doiParam.includes('/')) {
          targetUrl = `https://doi.org/${doiParam}`;
        } else {
          targetUrl = doiParam;
        }
      }
    } catch (e) {
      // console.warn('[MDPI Filter GoogleChecker] Error parsing URL:', hrefAttribute, e);
    }
    const doiMatch = targetUrl.match(/\b(10\.\d{4,9}\/[^"\s'&<>]+)\b/i);
    return doiMatch ? doiMatch[1] : null;
  }

  /**
   * Extracts PMID from PubMed-style URLs
   * @param {string} href The URL to check
   * @returns {string|null} The PMID or null
   */
  extractPmidFromUrl(href) {
    if (!href) return null;
    // Match patterns like /pubmed/12345678/ or ?pmid=12345678
    const pmidMatch = href.match(/(?:\/pubmed\/|[?&]pmid=)(\d+)/i);
    return pmidMatch ? pmidMatch[1] : null;
  }

  /**
   * Extracts PMCID from PMC-style URLs
   * @param {string} href The URL to check
   * @returns {string|null} The PMCID or null
   */
  extractPmcidFromUrl(href) {
    if (!href) return null;
    // Match patterns like /pmc/articles/PMC1234567/ or ?pmcid=PMC1234567
    const pmcMatch = href.match(/(?:\/pmc\/articles\/|[?&]pmcid=)(PMC\d+)/i);
    return pmcMatch ? pmcMatch[1] : null;
  }

  /**
   * Main function to check Google search result items for MDPI content
   * This handles both confirmed MDPI (direct links + NCBI API) and potential MDPI (text keywords)
   * @param {HTMLElement} item The search result item element
   * @param {Map} runCache Per-run cache for this execution
   * @param {string} mdpiDoiPrefix The MDPI DOI prefix (e.g., "10.3390")
   * @param {string} mdpiDomain The MDPI domain (e.g., "mdpi.com")
   * @param {object} activeConfig The domain configuration
   * @param {object} currentSettings Extension settings
   * @param {Map} ncbiApiCache Global NCBI API cache
   * @returns {object} Result object with isMdpi, isPotential, source, details
   */
  async checkGoogleItem(item, runCache, mdpiDoiPrefix, mdpiDomain, activeConfig, currentSettings, ncbiApiCache) {
    if (!item) {
      return { isMdpi: false, isPotential: false, source: 'no-item', details: 'No item provided' };
    }

    const itemIdentifier = item.id || item.dataset.mdpiFilterRefId || 'google-item';
    const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

    // PRIORITY 1: Direct MDPI Domain Links (Confirmed)
    for (const link of allLinksInItem) {
      const href = link.href;
      if (href && href.includes(mdpiDomain)) {
        return { 
          isMdpi: true, 
          isPotential: false, 
          source: 'direct-mdpi-link', 
          details: `Direct link to ${mdpiDomain}: ${href}` 
        };
      }
    }

    // PRIORITY 2: MDPI DOI in Links (Confirmed)
    for (const link of allLinksInItem) {
      const href = link.href;
      const doi = this.extractDoiFromLink(href);
      if (doi && doi.startsWith(mdpiDoiPrefix)) {
        return { 
          isMdpi: true, 
          isPotential: false, 
          source: 'mdpi-doi-link', 
          details: `MDPI DOI in link: ${doi}` 
        };
      }
    }

    // PRIORITY 3: NCBI API Check for PMIDs/PMCIDs (Confirmed)
    if (activeConfig.useNcbiApi && window.MDPIFilterNcbiApiHandler) {
      const pmidStrings = new Set();
      const pmcIdStrings = new Set();

      // Extract NCBI IDs from links
      for (const link of allLinksInItem) {
        const href = link.href;
        const pmid = this.extractPmidFromUrl(href);
        const pmcid = this.extractPmcidFromUrl(href);
        if (pmid) pmidStrings.add(pmid);
        if (pmcid) pmcIdStrings.add(pmcid);
      }

      const allNcbiIds = [...pmidStrings, ...pmcIdStrings];
      if (allNcbiIds.length > 0) {
        try {
          // Check PMIDs
          if (pmidStrings.size > 0) {
            const pmidResult = await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(
              Array.from(pmidStrings), 'pmid', runCache, ncbiApiCache
            );
            if (pmidResult) {
              return { 
                isMdpi: true, 
                isPotential: false, 
                source: 'ncbi-pmid', 
                details: `NCBI PMID check confirmed MDPI: ${Array.from(pmidStrings).join(', ')}` 
              };
            }
          }

          // Check PMCIDs
          if (pmcIdStrings.size > 0) {
            const pmcResult = await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(
              Array.from(pmcIdStrings), 'pmc', runCache, ncbiApiCache
            );
            if (pmcResult) {
              return { 
                isMdpi: true, 
                isPotential: false, 
                source: 'ncbi-pmcid', 
                details: `NCBI PMCID check confirmed MDPI: ${Array.from(pmcIdStrings).join(', ')}` 
              };
            }
          }
        } catch (error) {
          console.warn(`[MDPI Filter GoogleChecker] NCBI API error for ${itemIdentifier}:`, error);
        }
      }
    }

    // PRIORITY 4: Text Content Keywords (Potential)
    if (currentSettings.highlightPotentialMdpiSites) {
      if (this.checkForPotentialMdpiKeywordsInText(item)) {
        return { 
          isMdpi: false, 
          isPotential: true, 
          source: 'text-keywords', 
          details: 'Text content matches MDPI-related keywords' 
        };
      }
    }

    return { isMdpi: false, isPotential: false, source: 'no-match', details: 'No MDPI indicators found' };
  }

  /**
   * Checks if the element's text content contains any of the potential keywords.
   * @param {HTMLElement} element The DOM element to check.
   * @returns {boolean} True if a keyword is found, false otherwise.
   */
  checkForPotentialMdpiKeywordsInText(element) {
    if (!element || typeof element.textContent !== 'string') {
      return false;
    }
    const textContent = element.textContent.toLowerCase();
    return this.potentialMdpiKeywords.some(keyword =>
      textContent.includes(keyword.toLowerCase())
    );
  }

  /**
   * Determines if an element should be highlighted as *potentially* related to MDPI.
   * This is for backwards compatibility with the old interface.
   * @param {HTMLElement} element The DOM element to check.
   * @param {object} settings The current extension settings.
   * @returns {boolean} True if it should be highlighted as potential, false otherwise.
   */
  shouldHighlightAsPotentialMdpi(element, settings) {
    if (!settings || !settings.highlightPotentialMdpiSites) {
      return false;
    }

    // Skip if this is already highlighted as confirmed MDPI
    if (element.classList.contains('mdpi-search-result-highlight')) {
      return false;
    }
    // Skip if already hidden by the main logic
    if (element.classList.contains('mdpi-search-result-hidden')) {
      return false;
    }
    // Skip if already highlighted as potential
    if (element.classList.contains('potential-mdpi-site-highlight')) {
      return false;
    }

    return this.checkForPotentialMdpiKeywordsInText(element);
  }

  /**
   * Applies the visual styling for confirmed MDPI sites on Google.
   * @param {HTMLElement} element The DOM element to highlight.
   * @param {object} settings Extension settings with color preferences.
   */
  highlightConfirmedMdpiSite(element, settings) {
    element.classList.add('mdpi-search-result-highlight');
    element.style.backgroundColor = settings.mdpiHighlightColor || 'rgba(255, 182, 193, 0.3)';
    element.style.border = `1px solid ${settings.mdpiBorderColor || '#E2211C'}`;
    element.style.borderRadius = '3px';
    element.style.padding = '1px 3px';
    element.title = 'Confirmed MDPI Content (Google-specific check): Direct MDPI link or NCBI API confirmation.';
  }

  /**
   * Applies the visual styling for "potential" MDPI sites.
   * @param {HTMLElement} element The DOM element to highlight.
   * @param {string} color The background color for the highlight.
   */
  highlightPotentialMdpiSite(element, color) {
    element.classList.add('potential-mdpi-site-highlight');
    element.style.backgroundColor = color || 'rgba(255, 255, 153, 0.3)';
    element.style.border = '1px dashed #FFCC00';
    element.style.borderRadius = '3px';
    element.style.padding = '1px 3px';
    element.title = 'This result may contain text matching MDPI-related keywords (e.g., specific DOI prefixes, publisher names in text). This is a broader, potential match specific to Google Search.';
  }

  /**
   * Hides an MDPI element on Google.
   * @param {HTMLElement} element The DOM element to hide.
   */
  hideMdpiSite(element) {
    element.classList.add('mdpi-search-result-hidden');
    element.style.display = 'none';
  }
}

// Export for use in content script
if (typeof window.GoogleContentChecker === 'undefined') {
  window.GoogleContentChecker = GoogleContentChecker;
}