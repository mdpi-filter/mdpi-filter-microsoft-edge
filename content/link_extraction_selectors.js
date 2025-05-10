// Defines the CSS selectors used to find the primary link within a reference item.
(function() {
  // Expose the array on the window object so it can be accessed by other scripts.
  window.MDPIFilterLinkExtractionSelectors = [
    'a[data-doi]', // Specific data-doi attribute
    'a[href*="doi.org"]', // Links containing doi.org
    'a[href*="/10."]', // Links that look like DOIs, e.g. /10.xxxx/yyyy
    'a.c-bibliographic-information__link[href*="springer.com"]', // Springer article links
    'a.article-link', // Common class for article links
    'a[data-track-action="article reference"]', // Tracking attributes
    'div.citation-content > a[href]', // First link in citation content
    'p > a[href]', // First link in a paragraph (generic)
    // 'a[href^="http"]:not([href*="#"])', // This is very generic, used as a fallback in link_extractor.js
                                        // Keep it commented out here to avoid it being preferred too early.
    '.c-article-references__text a[href]', // Link within reference text (e.g. Wiley)
    '.citation__title a[href]', // Link on citation title
    '.hlFld-Fulltext > a[href]', // e.g. Taylor & Francis
    // Add more specific selectors as needed, ordered by preference/reliability
  ];
})();