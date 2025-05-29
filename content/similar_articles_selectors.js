(function() {
  if (!window.MDPIFilterSimilarArticles) {
    window.MDPIFilterSimilarArticles = {};
  }
  if (!window.MDPIFilterSimilarArticles.Selectors) {
    window.MDPIFilterSimilarArticles.Selectors = {};
  }

  // Selectors for the main container of "Similar Articles" sections.
  window.MDPIFilterSimilarArticles.Selectors.CONTAINER_SELECTORS = [
    'div#similar-articles', // EuropePMC "Similar Articles" section container
  ].join(',');

  // Selectors for individual items within a "Similar Articles" list.
  // On EuropePMC, these are li > div.citation, but we target the li for styling.
  window.MDPIFilterSimilarArticles.Selectors.ITEM_SELECTORS = [
    'div#similar-articles div.list ul.separated-list li.separated-list-item',
  ].join(',');

})();