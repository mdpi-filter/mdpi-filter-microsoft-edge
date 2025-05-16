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
    // Add other container selectors as identified across different sites
  ].join(',');

  // Selectors for individual items within a "Cited By" list.
  window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS = [
    'li.ListArticleItem',       // ScienceDirect "Cited By" items
    'li.citedByEntry',          // A general pattern for "Cited By" list items
    'div.citation-item.cited-by', // Another pattern observed
    'article.citation-item',    // Generic article item that might be in a "Cited By" list
    'div#impact div#article-citations li.separated-list-item', // EuropePMC items within "Citations & impact" -> "Article citations" list
    // Add other item-specific selectors as identified
  ].join(',');

})();