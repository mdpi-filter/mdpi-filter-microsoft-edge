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
   * This is called ONLY for Google search results and if the primary check didn't flag it.
   * @param {HTMLElement} element The DOM element to check.
   * @param {object} settings The current extension settings.
   * @returns {boolean} True if it should be highlighted as potential, false otherwise.
   */
  shouldHighlightAsPotentialMdpi(element, settings) {
    if (!settings || !settings.highlightPotentialMdpiSites) {
      return false;
    }

    // Skip if this is already highlighted as confirmed MDPI (by the main logic)
    if (element.classList.contains('mdpi-search-result-highlight')) {
      return false;
    }
    // Skip if already hidden by the main logic
    if (element.classList.contains('mdpi-search-result-hidden')) {
      return false;
    }
    // Skip if already highlighted as potential (to avoid re-applying styles or redundant checks)
    if (element.classList.contains('potential-mdpi-site-highlight')) {
      return false;
    }

    return this.checkForPotentialMdpiKeywordsInText(element);
  }

  /**
   * Applies the visual styling for "potential" MDPI sites.
   * @param {HTMLElement} element The DOM element to highlight.
   * @param {string} color The background color for the highlight.
   */
  highlightPotentialMdpiSite(element, color) {
    element.classList.add('potential-mdpi-site-highlight');
    element.style.backgroundColor = color || 'rgba(255, 255, 153, 0.3)'; // Default to light yellow with alpha
    element.style.border = '1px dashed #FFCC00'; // A distinct dashed border
    element.style.borderRadius = '3px';
    element.style.padding = '1px 3px'; // Consistent with other highlights
    element.title = 'This result may contain text matching MDPI-related keywords (e.g., specific DOI prefixes, publisher names in text). This is a broader, potential match specific to Google Search.';
  }
}

// Export for use in content script
if (typeof window.GoogleContentChecker === 'undefined') {
  window.GoogleContentChecker = GoogleContentChecker;
}