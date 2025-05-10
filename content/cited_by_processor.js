// Processes "Cited By" sections to identify and style MDPI entries.
(function() {
  if (!window.MDPIFilterCitedBy) {
    window.MDPIFilterCitedBy = {};
  }
  if (!window.MDPIFilterCitedBy.Processor) {
    window.MDPIFilterCitedBy.Processor = {};
  }

  /**
   * Processes "Cited By" entries on the page.
   * It finds potential "Cited By" items using selectors, checks if they are MDPI
   * using the provided `isMdpiItemByContentFn`, and styles them accordingly.
   * These items are *not* added to the main `collectedMdpiReferences` (for the popup).
   *
   * @param {Function} isMdpiItemByContentFn - The function (e.g., from content_script.js)
   *                                           to check if an item's content indicates MDPI.
   * @param {Map} runCache - The cache for NCBI API results for the current run, passed from content_script.js.
   */
  function processEntries(isMdpiItemByContentFn, runCache) {
    if (!window.MDPIFilterCitedBy.Selectors || !window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS || !window.MDPIFilterCitedBy.Selectors.CONTAINER_SELECTORS) {
      // console.warn('[MDPI Filter CitedBy Processor] Essential selectors not available.');
      return;
    }
    if (!window.MDPIFilterCitedBy.Styler || !window.MDPIFilterCitedBy.Styler.styleItem) {
      // console.warn('[MDPI Filter CitedBy Processor] Styler function not available.');
      return;
    }
    if (typeof isMdpiItemByContentFn !== 'function') {
      // console.warn('[MDPI Filter CitedBy Processor] isMdpiItemByContentFn is not a valid function.');
      return;
    }

    // console.log('[MDPI Filter CitedBy Processor] Starting to process "Cited By" entries...');
    const itemSelectors = window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS;
    const containerSelectors = window.MDPIFilterCitedBy.Selectors.CONTAINER_SELECTORS;
    const citedByItems = document.querySelectorAll(itemSelectors);

    // console.log(`[MDPI Filter CitedBy Processor] Found ${citedByItems.length} potential "Cited By" items using selectors: ${itemSelectors}`);

    citedByItems.forEach(item => {
      // Ensure the item is likely within a "Cited By" section to avoid misidentifying
      // elements that coincidentally match ITEM_SELECTORS elsewhere on the page.
      if (!item.closest(containerSelectors)) {
        // console.log('[MDPI Filter CitedBy Processor] Skipping item not within a known "Cited By" container:', item);
        return;
      }

      // Avoid re-processing items already handled by the main reference processor
      // or items already styled by this "Cited By" processor in a previous pass (if applicable).
      if (item.dataset.mdpiFilterRefId || item.dataset.mdpiFilterCitedByStyled) {
        return;
      }

      if (isMdpiItemByContentFn(item, runCache)) {
        // console.log('[MDPI Filter CitedBy Processor] MDPI "Cited By" item identified:', item);
        window.MDPIFilterCitedBy.Styler.styleItem(item);
        // Optionally, mark it as processed by this module if needed for other logic
        // item.dataset.mdpiFilterCitedByProcessed = "true";
      }
    });
    // console.log('[MDPI Filter CitedBy Processor] Finished processing "Cited By" entries.');
  }

  window.MDPIFilterCitedBy.Processor.processEntries = processEntries;
})();