(function() {
  if (!window.MDPIFilterSimilarArticles) {
    window.MDPIFilterSimilarArticles = {};
  }
  if (!window.MDPIFilterSimilarArticles.Processor) {
    window.MDPIFilterSimilarArticles.Processor = {};
  }

  const DEBOUNCE_TIME = 300;

  async function processSimilarArticleEntries(runCache, settings) {
    if (!window.MDPIFilterSimilarArticles.Selectors || !window.MDPIFilterSimilarArticles.Styler || !window.MDPIFilterItemContentChecker) {
      console.warn('[MDPI Filter SimilarProcessor] Missing dependencies.');
      return;
    }

    const { mode, mdpiDomain, mdpiDoiPrefix } = settings;
    const containerSelectors = window.MDPIFilterSimilarArticles.Selectors.CONTAINER_SELECTORS;
    const itemSelectors = window.MDPIFilterSimilarArticles.Selectors.ITEM_SELECTORS;

    const similarArticleContainers = document.querySelectorAll(containerSelectors);
    if (similarArticleContainers.length === 0) return;

    for (const container of similarArticleContainers) {
      const items = container.querySelectorAll(itemSelectors);
      for (const item of items) {
        if (item.dataset.mdpiFilterSimilarProcessed === 'true' && item.dataset.mdpiFilterMode === mode) continue;
        item.dataset.mdpiFilterSimilarProcessed = 'true';
        item.dataset.mdpiFilterMode = mode;

        // For "Similar Articles" on EuropePMC, the item is the <li>.
        // The content to check (which contains links, DOIs, etc.) is inside a child <div class="citation">
        const contentHolder = item.querySelector('div.citation') || item; // Fallback to item if no div.citation

        const isMdpi = window.MDPIFilterItemContentChecker.checkItemContent(contentHolder, runCache, mdpiDoiPrefix, mdpiDomain);
        window.MDPIFilterSimilarArticles.Styler.styleItem(item, isMdpi, mode); // Style the <li> item
      }
    }
  }

  const debouncedProcessSimilarArticleEntries = window.debounce(processSimilarArticleEntries, DEBOUNCE_TIME);

  window.MDPIFilterSimilarArticles.Processor.processEntries = processSimilarArticleEntries;
  window.MDPIFilterSimilarArticles.Processor.debouncedProcessEntries = debouncedProcessSimilarArticleEntries;

})();