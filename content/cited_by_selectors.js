// Defines selectors for "Cited By" sections and items.
(function() {
  if (!window.MDPIFilterCitedBy) {
    window.MDPIFilterCitedBy = {};
  }
  if (!window.MDPIFilterCitedBy.Selectors) {
    window.MDPIFilterCitedBy.Selectors = {};
  }

  // Selectors for main containers that might hold "Cited By" lists.
  // This can help confirm an item is truly in a "Cited By" context.
  window.MDPIFilterCitedBy.Selectors.CONTAINER_SELECTORS = [
    '#section-cited-by',    // ScienceDirect
    '#cited-by__content',   // Common ID for "Cited By" content
    'div.citedBySection',   // Generic class name
    'section[aria-labelledby="citedby-label"]', // Accessibility pattern
    'div#impact', // EuropePMC "Citations & impact" section container
    'div#article-citations', // EuropePMC article citations
    // PubMed specific containers for "Cited By" sections
    'div.cited-by-articles', // PubMed "Cited By" section container
    'section.cited-by', // Generic "Cited By" section
    'div[data-cy="cited-by"]', // Data attribute for "Cited By" sections
    'div.citedby-articles', // Alternative PubMed container
    'section.citedby', // Alternative PubMed section
    'div.article-details-cited-by', // Another potential PubMed container
    'main', // Fallback for PubMed pages where "Cited By" items appear in main content
    'body', // Ultimate fallback for PubMed if no specific container is found
    // Add other container selectors as identified across different sites
  ].join(',');

  // Selectors for individual items within a "Cited By" list.
  window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS = [
    'li.ListArticleItem',       // ScienceDirect "Cited By" items
    'li.citedByEntry',          // A general pattern for "Cited By" list items
    'div.citation-item.cited-by', // Another pattern observed
    'article.citation-item',    // Generic article item that might be in a "Cited By" list
    'div#impact div#article-citations li.separated-list-item', // EuropePMC items within "Citations & impact" -> "Article citations" list
    'div#article-citations li.separated-list-item', // EuropePMC article citations
    // PubMed specific selectors for "Cited By" items
    'li.full-docsum:has(a[ref*="citedby_articles_link"])', // PubMed "Cited By" items (specific)
    'li.full-docsum', // PubMed items (generic fallback, will be filtered by container)
    // Add other item-specific selectors as identified
  ].join(',');

})();