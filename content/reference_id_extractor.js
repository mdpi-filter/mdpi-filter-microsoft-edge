(function() {
  'use strict';

  if (window.MDPIFilterReferenceIdExtractor) {
    return; // Avoid re-injecting the script
  }

  /**
   * Extracts or generates an internal scroll ID for a reference item.
   * It also sets the 'data-mdpi-filter-ref-id' attribute on the item.
   * @param {HTMLElement} itemElement - The DOM element representing the reference item.
   * @param {number} currentRefIdCounter - The current counter value for generating new IDs.
   * @returns {{extractedId: string, updatedRefIdCounter: number}} An object containing the extracted/generated ID and the updated counter.
   */
  function extractInternalScrollId(itemElement, currentRefIdCounter) {
    let idToUse = itemElement.dataset.mdpiFilterRefId;
    let nextRefIdCounter = currentRefIdCounter;

    if (!idToUse) {
      idToUse = `mdpi-ref-${nextRefIdCounter++}`;
      itemElement.dataset.mdpiFilterRefId = idToUse; // Set the attribute on the item
      console.log(`[MDPI Filter RefIdExtractor] Assigned NEW data-mdpi-filter-ref-id='${idToUse}' to:`, itemElement);
    } else {
      console.log(`[MDPI Filter RefIdExtractor] Reused EXISTING data-mdpi-filter-ref-id='${idToUse}' for:`, itemElement);
    }

    return {
      extractedId: idToUse,
      updatedRefIdCounter: nextRefIdCounter
    };
  }

  window.MDPIFilterReferenceIdExtractor = {
    extractInternalScrollId: extractInternalScrollId
  };

})();