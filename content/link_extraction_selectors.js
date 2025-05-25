// Defines the CSS selectors used to find the primary link within a reference item.
(function() {
  // Expose the array on the window object so it can be accessed by other scripts.
  window.MDPIFilterLinkExtractionSelectors = [
    { selector: 'a[data-doi]', type: 'doi' },
    { selector: 'a[href*="doi.org"]', type: 'doi' },
    { selector: 'a[href*="/10."]', type: 'doi' },
    
    // --- START Healthline Specific Selectors ---
    // These should be relatively early as they are quite specific.
    { selector: 'hl-trusted-source > a.content-link[href]', type: 'generic' }, // For <hl-trusted-source> elements
    { selector: 'li.css-1ti7iub cite a[href]', type: 'generic' },             // For <li class="css-1ti7iub"> elements in "Sources"
    // --- END Healthline Specific Selectors ---
    
    { selector: 'a.c-bibliographic-information__link[href*="springer.com"]', type: 'generic' }, // Springer article links
    // --- START Oxford University Press (academic.oup.com) Specific Selector ---
    { selector: 'div.mixed-citation a.link.link-uri[href*="doi.org"]', type: 'doi' }, // OUP DOI link
    // --- END Oxford University Press Specific Selector ---
    // --- START ScienceDirect Specific Selector for DOI link ---
    { selector: 'div.ReferenceLinks a.anchor[href*="doi.org"]', type: 'doi' }, // ScienceDirect DOI link
    { selector: 'div.ReferenceLinks a[href*="doi.org/10."]', type: 'doi' }, // Broader ScienceDirect DOI link
    // --- END ScienceDirect Specific Selector ---
    // --- START Sagepub Specific Selector for DOI link ---
    { selector: 'div.external-links div.core-xlink-crossref > a[href*="doi.org"]', type: 'doi' }, // Sagepub DOI link
    // --- END Sagepub Specific Selector ---
    { selector: 'a.article-link', type: 'generic' }, // Common class for article links
    { selector: 'a[data-track-action="article reference"]', type: 'generic' }, // Tracking attributes
    { selector: 'div.citation-content > a[href]', type: 'generic' }, // First link in citation content
    { selector: 'p > a[href]', type: 'generic' }, // First link in a paragraph (generic)
    // 'a[href^="http"]:not([href*="#"])', // This is very generic, used as a fallback in link_extractor.js
                                        // Keep it commented out here to avoid it being preferred too early.
    { selector: '.c-article-references__text a[href]', type: 'generic' }, // Link within reference text (e.g. Wiley)
    { selector: '.citation__title a[href]', type: 'generic' }, // Link on citation title
    { selector: '.hlFld-Fulltext > a[href]', type: 'generic' } // e.g. Taylor & Francis
    // Add more as needed
  ];
})();