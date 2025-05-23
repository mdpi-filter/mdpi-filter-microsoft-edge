class GoogleContentChecker {
  constructor() {
    this.potentialMdpiKeywords = [
      'mdpi',
      'multidisciplinary digital publishing institute',
      'doi: 10.3390',      'pmid:',      'pmc article',      'free pmc article'    ];
  }

  /**
   * Extracts PMID from PubMed-style URLs (from link hrefs).
   * Used for "confirmed" MDPI checks via NCBI API.
   * @param {string} href The URL (from an <a> tag's href) to check.
   * @returns {string|null} The PMID or null.
   */
  extractPmidFromUrl(href) {
    if (!href) return null;
    // Match patterns like /pubmed/12345678/ or ?pmid=12345678
    const pmidMatch = href.match(/(?:\/pubmed\/|[?&]pmid=)(\d+)/i);
    return pmidMatch ? pmidMatch[1] : null;
  }

  /**
   * Extracts PMCID from PMC-style URLs (from link hrefs).
   * Used for "confirmed" MDPI checks via NCBI API.
   * @param {string} href The URL (from an <a> tag's href) to check.
   * @returns {string|null} The PMCID or null.
   */
  extractPmcidFromUrl(href) {
    if (!href) return null;
    // Enhanced regex to match various PMC URL patterns:
    // - https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/
    // - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/
    // - ?pmcid=PMC1234567
    const pmcMatch = href.match(/(?:\/(?:pmc\/)?articles\/|[?&]pmcid=)(PMC\d+)/i);
    return pmcMatch ? pmcMatch[1] : null;
  }

  /**
   * Extracts DOIs from a given text string.
   * @param {string} text The text to search for DOIs.
   * @returns {string[]} An array of found DOI strings.
   */
  extractDoisFromText(text) {
    if (!text) return [];
    const doiRegex = /\b(10\.\d{4,9}\/[^"\s'&<>]+)\b/gi;
    const matches = text.matchAll(doiRegex);
    return Array.from(matches, m => m[1]);
  }

  /**
   * Extracts PMIDs from a given text string.
   * @param {string} text The text to search for PMIDs.
   * @returns {string[]} An array of found PMID strings.
   */
  extractPmidsFromText(text) {
    if (!text) return [];
    const pmidRegex = /\b(?:PMID(?:[:\s])?|pubmed[:\s])(\d+)\b/gi;
    const matches = text.matchAll(pmidRegex);
    return Array.from(matches, m => m[1]);
  }

  /**
   * Extracts PMCIDs from a given text string.
   * @param {string} text The text to search for PMCIDs.
   * @returns {string[]} An array of found PMCID strings.
   */
  extractPmcidsFromText(text) {
    if (!text) return [];
    const pmcidRegex = /\b(PMC\d+)\b/gi;
    const matches = text.matchAll(pmcidRegex);
    return Array.from(matches, m => m[1]);
  }

  /**
   * Main function to check Google search result items for MDPI content.
   * For Google: "Secure" status is via direct MDPI domain link, NCBI API (from link href or text), or MDPI DOI in text.
   * Text content (keywords) is used for "potential" status if not secure.
   * @param {HTMLElement} item The search result item element.
   * @param {Map} runCache Per-run cache for this execution.
   * @param {string} mdpiDoiPrefix The MDPI DOI prefix (e.g., "10.3390").
   * @param {string} mdpiDomain The MDPI domain (e.g., "mdpi.com").
   * @param {object} activeConfig The domain configuration.
   * @param {object} currentSettings Extension settings.
   * @param {Map} ncbiApiCache Global NCBI API cache.
   * @returns {object} Result object with isMdpi, isPotential, source, details.
   */
  async checkGoogleItem(item, runCache, mdpiDoiPrefix, mdpiDomain, activeConfig, currentSettings, ncbiApiCache) {
    if (!item) {
      return { isMdpi: false, isPotential: false, source: 'no-item', details: 'No item provided' };
    }

    const itemIdentifier = item.id || item.dataset.mdpiFilterRefId || 'google-item';
    const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

    console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Starting checkGoogleItem`);

    // --- SECURE MDPI CHECKS (Link-based only: direct MDPI domain) ---

    for (const link of allLinksInItem) {
      const href = link.href;
      if (href) {
        try {
          const url = new URL(href);
          const hostname = url.hostname.toLowerCase();
          if (hostname === mdpiDomain || hostname.endsWith('.' + mdpiDomain)) {
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] SECURE: Direct MDPI link found: ${hostname}`);
            return {
              isMdpi: true,
              isPotential: false,
              source: 'direct-mdpi-link',
              details: `Direct link to ${mdpiDomain}: ${href}`
            };
          }
        } catch (e) {
          if (href.includes(`.${mdpiDomain}/`) || href.includes(`//${mdpiDomain}/`) || href.startsWith(`https://${mdpiDomain}/`)) {
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] SECURE: Direct MDPI link found (fallback): ${href}`);
            return {
              isMdpi: true,
              isPotential: false,
              source: 'direct-mdpi-link-fallback',
              details: `Direct link (fallback match) to ${mdpiDomain}: ${href}`
            };
          }
        }
      }
    }

    console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] No direct MDPI links found. Checking for potential indicators...`);

    // --- POTENTIAL MDPI CHECKS (Text or NCBI-confirmed IDs in links/text) ---
    if (currentSettings.highlightPotentialMdpiSites) {
      const itemTextContent = item.textContent || '';
      let isPotential = false;
      let potentialDetailsArray = [];

      // Check for MDPI DOI in text content
      const doisInText = this.extractDoisFromText(itemTextContent);
      console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] DOIs found in text:`, doisInText);
      for (const doi of doisInText) {
        if (doi.startsWith(mdpiDoiPrefix)) {
          isPotential = true;
          potentialDetailsArray.push(`MDPI DOI ${doi} found in text content`);
          console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] POTENTIAL: MDPI DOI in text: ${doi}`);
          break;
        }
      }

      // Check for NCBI-confirmed PMIDs/PMCIDs in links or text content
      if (activeConfig.useNcbiApi && window.MDPIFilterNcbiApiHandler) {
        console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] NCBI API enabled, checking links and text...`);
        
        // From links
        const pmidStringsFromLinks = new Set();
        const pmcIdStringsFromLinks = new Set();
        for (const link of allLinksInItem) {
          console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Processing link href: ${link.href}`);
          const pmid = this.extractPmidFromUrl(link.href);
          const pmcid = this.extractPmcidFromUrl(link.href);
          if (pmid) {
            pmidStringsFromLinks.add(pmid);
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] PMID extracted from link: ${pmid} (${link.href})`);
          }
          if (pmcid) {
            pmcIdStringsFromLinks.add(pmcid);
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] PMCID extracted from link: ${pmcid} (${link.href})`);
          }
          if (!pmid && !pmcid) {
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] No NCBI IDs extracted from link: ${link.href}`);
          }
        }
        
        if (pmidStringsFromLinks.size > 0) {
          try {
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Checking PMIDs via NCBI API:`, [...pmidStringsFromLinks]);
            if (await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi([...pmidStringsFromLinks], 'pmid', runCache, ncbiApiCache)) {
              isPotential = true;
              potentialDetailsArray.push('NCBI confirmed MDPI from PMID in link');
              console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] POTENTIAL: NCBI confirmed MDPI from PMIDs in links: ${[...pmidStringsFromLinks]}`);
            }
          } catch (error) {
            console.warn(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Error checking PMIDs:`, error);
          }
        }
        if (!isPotential && pmcIdStringsFromLinks.size > 0) {
          try {
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Checking PMCIDs via NCBI API:`, [...pmcIdStringsFromLinks]);
            if (await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi([...pmcIdStringsFromLinks], 'pmcid', runCache, ncbiApiCache)) {
              isPotential = true;
              potentialDetailsArray.push('NCBI confirmed MDPI from PMCID in link');
              console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] POTENTIAL: NCBI confirmed MDPI from PMCIDs in links: ${[...pmcIdStringsFromLinks]}`);
            }
          } catch (error) {
            console.warn(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Error checking PMCIDs:`, error);
          }
        }
        
        // From text
        const pmidsInText = [...new Set(this.extractPmidsFromText(itemTextContent))];
        const pmcidsInText = [...new Set(this.extractPmcidsFromText(itemTextContent))];
        console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] PMIDs found in text:`, pmidsInText);
        console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] PMCIDs found in text:`, pmcidsInText);
        
        if (!isPotential && pmidsInText.length > 0) {
          try {
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Checking PMIDs from text via NCBI API:`, pmidsInText);
            if (await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(pmidsInText, 'pmid', runCache, ncbiApiCache)) {
              isPotential = true;
              potentialDetailsArray.push('NCBI confirmed MDPI from PMID in text content');
              console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] POTENTIAL: NCBI confirmed MDPI from PMIDs in text: ${pmidsInText}`);
            }
          } catch (error) {
            console.warn(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Error checking PMIDs from text:`, error);
          }
        }
        if (!isPotential && pmcidsInText.length > 0) {
          try {
            console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Checking PMCIDs from text via NCBI API:`, pmcidsInText);
            if (await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(pmcidsInText, 'pmcid', runCache, ncbiApiCache)) {
              isPotential = true;
              potentialDetailsArray.push('NCBI confirmed MDPI from PMCID in text content');
              console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] POTENTIAL: NCBI confirmed MDPI from PMCIDs in text: ${pmcidsInText}`);
            }
          } catch (error) {
            console.warn(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Error checking PMCIDs from text:`, error);
          }
        }
      } else {
        console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] NCBI API not enabled or handler not available`);
      }

      // Check general keywords only if not already potential from more specific text indicators above
      if (!isPotential && this.checkForPotentialMdpiKeywordsInText(item)) {
        isPotential = true;
        potentialDetailsArray.push('General potential keywords found in text.');
        console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] POTENTIAL: General keywords found`);
      }

      if (isPotential) {
        console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] FINAL RESULT: POTENTIAL MDPI - ${potentialDetailsArray.join('; ')}`);
        return {
          isMdpi: false,
          isPotential: true,
          source: 'potential-indicator',
          details: potentialDetailsArray.join('; ') || 'Potential MDPI indicators found.'
        };
      }
    } else {
      console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] Potential highlighting disabled in settings`);
    }

    // Default: Not MDPI and not potential
    console.log(`[MDPI Filter GoogleChecker DEBUG ${itemIdentifier}] FINAL RESULT: NOT MDPI`);
    return { 
      isMdpi: false, 
      isPotential: false, 
      source: 'no-indicators', 
      details: `No definitive MDPI indicators found by GoogleContentChecker.`
    };
  }

  /**
   * Checks if the element's general text content contains any of the potential keywords.
   * This is used for "potential" MDPI checks. It does NOT look at link hrefs.
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
   * Applies the visual styling for secure MDPI sites on Google.
   * @param {HTMLElement} element The DOM element to highlight.
   * @param {object} settings Extension settings with color preferences.
   */
  highlightConfirmedMdpiSite(element, settings) {
    element.classList.add('mdpi-search-result-highlight');
    element.style.backgroundColor = settings.mdpiHighlightColor || 'rgba(255, 182, 193, 0.3)';
    element.style.border = `1px solid ${settings.mdpiBorderColor || '#E2211C'}`;
    element.style.borderRadius = '3px';
    element.style.padding = '1px 3px';
    element.title = 'Secure MDPI Content (Google): Direct MDPI link or NCBI API confirmation.';
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
    element.title = 'Potential MDPI Content (Google): Text matches MDPI-related keywords.';
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