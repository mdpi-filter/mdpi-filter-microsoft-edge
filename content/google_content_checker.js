class GoogleContentChecker {
  constructor() {
    this.potentialMdpiKeywords = [
      'mdpi',
      'multidisciplinary digital publishing institute',
      'doi: 10.3390', // This keyword can appear in text
      'pmid:',
      'pmc article',
      'free pmc article'
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
    // Regex to extract DOI: 10. followed by 4 or more digits, a slash, and then any characters except whitespace or common delimiters
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

    // --- CONFIRMED MDPI CHECKS (Link-based ONLY) ---

    // 1. Direct MDPI Domain Links
    for (const link of allLinksInItem) {
      const href = link.href;
      if (href && (href.includes(`.${mdpiDomain}`) || href.includes(`//${mdpiDomain}`))) { // More robust check for mdpi.com
        return {
          isMdpi: true,
          isPotential: false,
          source: 'direct-mdpi-link',
          details: `Direct link to ${mdpiDomain}: ${href}`
        };
      }
    }

    // 2. MDPI DOI in Links
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

    // 3. NCBI API Check for PMIDs/PMCIDs (extracted from links)
    if (activeConfig.useNcbiApi && window.MDPIFilterNcbiApiHandler) {
      const pmidStrings = new Set();
      const pmcIdStrings = new Set();

      for (const link of allLinksInItem) {
        const href = link.href;
        const pmid = this.extractPmidFromUrl(href);
        const pmcid = this.extractPmcidFromUrl(href);
        if (pmid) pmidStrings.add(pmid);
        if (pmcid) pmcIdStrings.add(pmcid);
      }

      if (pmidStrings.size > 0) {
        try {
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
        } catch (error) {
          console.warn(`[MDPI Filter GoogleChecker] NCBI API (PMID) error for ${itemIdentifier}:`, error);
        }
      }

      if (pmcIdStrings.size > 0) {
        try {
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
        } catch (error) {
          console.warn(`[MDPI Filter GoogleChecker] NCBI API (PMCID) error for ${itemIdentifier}:`, error);
        }
      }
    }

    // --- POTENTIAL MDPI CHECK (Text-based ONLY) ---
    // This runs only if no confirmed MDPI was found above.
    if (currentSettings.highlightPotentialMdpiSites) {
      if (this.checkForPotentialMdpiKeywordsInText(item)) {
        return {
          isMdpi: false, // Not confirmed MDPI
          isPotential: true,
          source: 'text-keywords',
          details: 'Text content matches MDPI-related keywords'
        };
      }
    }

    return { isMdpi: false, isPotential: false, source: 'no-match', details: 'No MDPI indicators found by GoogleChecker' };
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
    // Ensure keywords are distinct from link-based checks for "confirmed"
    return this.potentialMdpiKeywords.some(keyword =>
      textContent.includes(keyword.toLowerCase())
    );
  }

  /**
   * Applies the visual styling for confirmed MDPI sites on Google.
   * @param {HTMLElement} element The DOM element to highlight.
   * @param {object} settings Extension settings with color preferences.
   */
  highlightConfirmedMdpiSite(element, settings) {
    element.classList.add('mdpi-search-result-highlight'); // Standard class for confirmed
    element.style.backgroundColor = settings.mdpiHighlightColor || 'rgba(255, 182, 193, 0.3)';
    element.style.border = `1px solid ${settings.mdpiBorderColor || '#E2211C'}`;
    element.style.borderRadius = '3px';
    element.style.padding = '1px 3px';
    element.title = 'Confirmed MDPI Content (Google-specific check): Direct MDPI link or NCBI API confirmation from link.';
  }

  /**
   * Applies the visual styling for "potential" MDPI sites.
   * @param {HTMLElement} element The DOM element to highlight.
   * @param {string} color The background color for the highlight.
   */
  highlightPotentialMdpiSite(element, color) {
    element.classList.add('potential-mdpi-site-highlight');
    element.style.backgroundColor = color || 'rgba(255, 255, 153, 0.3)'; // Default light yellow
    element.style.border = '1px dashed #FFCC00'; // Distinct dashed border
    element.style.borderRadius = '3px';
    element.style.padding = '1px 3px';
    element.title = 'This Google result may contain text matching MDPI-related keywords. This is a broader, potential match.';
  }

  /**
   * Hides an MDPI element on Google.
   * @param {HTMLElement} element The DOM element to hide.
   */
  hideMdpiSite(element) {
    element.classList.add('mdpi-search-result-hidden'); // Standard class for hiding
    element.style.display = 'none';
  }
}

// Export for use in content script
if (typeof window.GoogleContentChecker === 'undefined') {
  window.GoogleContentChecker = GoogleContentChecker;
}