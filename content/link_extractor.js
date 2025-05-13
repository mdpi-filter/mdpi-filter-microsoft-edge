(function() {
  'use strict';

  if (window.MDPIFilterLinkExtractor) {
    return; // Avoid re-injecting
  }

  // Flags to ensure Wiley/Healthline accordion/button is clicked only once per page scan/load
  let wileyReferencesExpanded = false;
  let healthlineSourcesExpanded = false;

  /**
   * Extracts the primary link (DOI or other) from a reference item element.
   * It also handles expanding accordions on Wiley and Healthline if necessary.
   * @param {HTMLElement} itemElement - The DOM element representing the reference item.
   * @param {Array<Object>} linkSelectors - An array of selector configurations.
   *        Each object should have:
   *        - `selector`: CSS selector for the link element.
   *        - `type`: 'doi', 'pubmed', 'pmc', 'arxiv', 'generic', 'text'.
   *        - `attribute`: (Optional) The attribute to get the URL from (e.g., 'href', 'data-doi'). Defaults to 'href'.
   *        - `textPattern`: (Optional) Regex to extract DOI/ID from link's text content if attribute is not 'href'.
   * @returns {string|null} The extracted primary link URL, or null if not found.
   */
  function extractPrimaryLink(itemElement, linkSelectors) {
    // --- Wiley Online Library: Expand "References" accordion if hidden ---
    if (window.location.hostname.includes('onlinelibrary.wiley.com') && !wileyReferencesExpanded) {
      const accordionControls = document.querySelectorAll('div.article-accordion .accordion__control[aria-expanded="false"]');
      accordionControls.forEach(control => {
        const titleElement = control.querySelector('.section__title');
        // Check if the title specifically indicates "References"
        if (titleElement && titleElement.textContent.trim().toLowerCase() === 'references') {
          // console.log('[MDPI Filter LE] Wiley: Found closed "References" accordion, attempting to click.');
          control.click();
          wileyReferencesExpanded = true; // Set flag after attempting click
        }
      });
    }

    // --- Healthline: Expand "Sources" button if present and not already expanded ---
    if (window.location.hostname.includes('healthline.com') && !healthlineSourcesExpanded) {
      const sourcesButtons = document.querySelectorAll('button.css-5sudr5'); // Selector for the button
      sourcesButtons.forEach(button => {
        // Verify it's the "Sources" button by checking its text content.
        // Healthline structure: button > div > span (icon) + span (text)
        const textSpan = button.querySelector('div.css-rre5oz > span:last-child'); // More robustly get the text span
        if (textSpan && textSpan.textContent.trim().toLowerCase() === 'sources') {
          // console.log('[MDPI Filter LE] Healthline: Found "Sources" button, attempting to click.');
          button.click();
          healthlineSourcesExpanded = true; // Set flag after attempting click
        }
      });
    }

    // Iterate through the provided link selectors
    for (const selectorConfig of linkSelectors) {
      const linkElement = itemElement.querySelector(selectorConfig.selector);

      if (linkElement) {
        let url = '';
        const attribute = selectorConfig.attribute || 'href'; // Default to 'href'

        if (attribute === 'text') {
          const textContent = linkElement.textContent || '';
          if (selectorConfig.textPattern) {
            const match = textContent.match(selectorConfig.textPattern);
            if (match && match[0]) {
              url = match[0];
            }
          } else {
            url = textContent.trim(); // Fallback to full text if no pattern
          }
        } else if (attribute === 'data-doi' && linkElement.dataset && linkElement.dataset.doi) {
          url = linkElement.dataset.doi;
        } else if (linkElement.hasAttribute(attribute)) {
          url = linkElement.getAttribute(attribute);
        }


        if (url) {
          url = url.trim();
          // console.log(`[MDPI Filter LE] Raw extracted URL: "${url}" using selector: "${selectorConfig.selector}", attribute: "${attribute}"`);

          if (selectorConfig.type === 'doi') {
            // For DOIs, ensure it's a full URL or prepend resolver
            if (url.startsWith('10.')) { // It's a DOI string
              // console.log(`[MDPI Filter LE] DOI string found: "${url}". Prepending resolver.`);
              return `https://doi.org/${url}`;
            } else if (url.includes('doi.org/')) { // It's already a DOI URL
              // console.log(`[MDPI Filter LE] Full DOI URL found: "${url}".`);
              return url;
            } else if (attribute === 'data-doi' && url) { // Handles cases where data-doi might not start with 10. but is intended as DOI
                // console.log(`[MDPI Filter LE] DOI from data-doi: "${url}". Prepending resolver.`);
                return `https://doi.org/${url}`;
            }
          } else if (selectorConfig.type === 'pubmed' && (url.includes('pubmed.ncbi.nlm.nih.gov') || /^\d+$/.test(url))) {
            if (/^\d+$/.test(url)) { // It's a PubMed ID
              return `https://pubmed.ncbi.nlm.nih.gov/${url}/`;
            }
            return url; // It's a full PubMed URL
          } else if (selectorConfig.type === 'pmc' && (url.includes('ncbi.nlm.nih.gov/pmc/articles/PMC') || /^PMC\d+$/.test(url))) {
             if (/^PMC\d+$/.test(url)) { // It's a PMC ID
              return `https://www.ncbi.nlm.nih.gov/pmc/articles/${url}/`;
            }
            return url; // It's a full PMC URL
          } else if (selectorConfig.type === 'arxiv' && (url.includes('arxiv.org/') || /^\d{4}\.\d{4,5}(v\d+)?$/.test(url) || /^[a-zA-Z-]+(\.[a-zA-Z-]+)?\/\d{7}(v\d+)?$/.test(url))) {
            // Handle various arXiv ID formats and full URLs
            if (!url.includes('arxiv.org/')) {
                return `https://arxiv.org/abs/${url}`;
            }
            return url;
          } else if (selectorConfig.type === 'generic') {
            // For generic links, try to make them absolute if they are relative
            try {
              const absoluteUrl = new URL(url, document.baseURI).href;
              // console.log(`[MDPI Filter LE] Generic URL found: "${url}", resolved to: "${absoluteUrl}"`);
              return absoluteUrl;
            } catch (e) {
              // console.warn(`[MDPI Filter LE] Could not construct absolute URL for generic link: "${url}"`, e);
              return url; // Return as is if URL construction fails
            }
          }
          // If type is not matched or specific conditions not met, but URL was extracted
          // and it's not one of the specific types handled above, return it if it looks like a URL.
          // This can be a fallback for miscategorized or new types of links.
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
             // console.log(`[MDPI Filter LE] Fallback URL (looks like a URL): "${url}"`);
             return url;
          }
        }
      }
    }
    // console.log('[MDPI Filter LE] No primary link found for item:', itemElement.textContent.substring(0, 100) + "...");
    return null; // No primary link found
  }

  /**
   * Resets the expansion flags. This can be called if a full page re-scan is initiated
   * by the content script, in case accordions/buttons might have been closed.
   */
  function resetExpansionFlags() {
    wileyReferencesExpanded = false;
    healthlineSourcesExpanded = false;
    // console.log('[MDPI Filter LE] Expansion flags reset.');
  }

  window.MDPIFilterLinkExtractor = {
    extractPrimaryLink: extractPrimaryLink,
    resetExpansionFlags: resetExpansionFlags // Expose reset function
  };

})();