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
   * using the provided `checkItemContentFn`, and styles them accordingly.
   * These items are *not* added to the main `collectedMdpiReferences` (for the popup).
   *
   * @param {Function} checkItemContentFn - The function (e.g., MDPIFilterItemContentChecker.checkItemContent)
   *                                        to check if an item's content indicates MDPI.
   * @param {Map} runCache - The cache for NCBI API results for the current run.
   * @param {object} settings - The current run settings (contains mode, mdpiDoiPrefix, mdpiDomain).
   */
  function processEntries(checkItemContentFn, runCache, settings) {
    if (!window.MDPIFilterCitedBy.Selectors || !window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS || !window.MDPIFilterCitedBy.Selectors.CONTAINER_SELECTORS) {
      // console.warn('[MDPI Filter CitedBy Processor] Essential selectors not available.');
      return;
    }
    if (!window.MDPIFilterCitedBy.Styler || !window.MDPIFilterCitedBy.Styler.styleItem) {
      // console.warn('[MDPI Filter CitedBy Processor] Styler function not available.');
      return;
    }
    if (typeof checkItemContentFn !== 'function') {
      // console.warn('[MDPI Filter CitedBy Processor] checkItemContentFn is not a valid function.');
      return;
    }
    if (!settings || typeof settings.mode === 'undefined') {
      // console.warn('[MDPI Filter CitedBy Processor] Settings object with mode is required.');
      return;
    }

    // console.log('[MDPI Filter CitedBy Processor] Starting to process "Cited By" entries...');
    const itemSelectors = window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS;
    const containerSelectors = window.MDPIFilterCitedBy.Selectors.CONTAINER_SELECTORS;
    const citedByItems = document.querySelectorAll(itemSelectors);

    // console.log(`[MDPI Filter CitedBy Processor] Found ${citedByItems.length} potential "Cited By" items using selectors: ${itemSelectors}`);

    citedByItems.forEach(item => {
      // Ensure the item is likely within a "Cited By" section
      if (!item.closest(containerSelectors)) {
        // console.log('[MDPI Filter CitedBy Processor] Skipping item not within a known "Cited By" container:', item);
        return;
      }

      // Avoid re-processing items already handled by the main reference processor
      if (item.dataset.mdpiFilterRefId) {
        return;
      }
      // Avoid re-processing if already styled by this module with the current mode
      if (item.dataset.mdpiFilterCitedByStyled === "true" && item.dataset.mdpiFilterMode === settings.mode) {
        return;
      }

      const isMdpi = checkItemContentFn(item, runCache, settings.mdpiDoiPrefix, settings.mdpiDomain);
      
      // Style item (or reset style if not MDPI) based on isMdpi and settings.mode
      window.MDPIFilterCitedBy.Styler.styleItem(item, isMdpi, settings.mode);
    });
    // console.log('[MDPI Filter CitedBy Processor] Finished processing "Cited By" entries.');
  }

  window.MDPIFilterCitedBy.Processor.processEntries = processEntries;
})();