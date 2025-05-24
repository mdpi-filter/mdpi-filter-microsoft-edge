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
    let idSourceForLog = "existing data-mdpi-filter-ref-id";

    if (!idToUse) {
      idToUse = itemElement.id; // Check standard id attribute
      if (idToUse) {
        idSourceForLog = "item.id";
      }
    }

    if (!idToUse) {
      // Check for 'content-id' attribute, common in OUP (academic.oup.com)
      idToUse = itemElement.getAttribute('content-id');
      if (idToUse) {
        idSourceForLog = "attribute 'content-id'";
      }
    }
    
    if (!idToUse) {
      // Fallback to 'data-legacy-id' if 'content-id' is not present (also seen in OUP)
      idToUse = itemElement.getAttribute('data-legacy-id');
      if (idToUse) {
        idSourceForLog = "attribute 'data-legacy-id'";
      }
    }

    if (!idToUse) {
      idToUse = `mdpi-ref-${nextRefIdCounter++}`;
      itemElement.dataset.mdpiFilterRefId = idToUse; // Set the attribute on the item
      console.log(`[MDPI Filter RefIdExtractor] Generated and set data-mdpi-filter-ref-id='${idToUse}' for:`, itemElement);
    } else {
      // If idToUse was found from item.id, content-id, or data-legacy-id,
      // and it's not already set as data-mdpi-filter-ref-id, set it for consistency.
      if (itemElement.dataset.mdpiFilterRefId !== idToUse) {
        itemElement.dataset.mdpiFilterRefId = idToUse;
        console.log(`[MDPI Filter RefIdExtractor] Adopted ID from ${idSourceForLog} and set data-mdpi-filter-ref-id='${idToUse}' for:`, itemElement);
      } else {
        // This means idToUse came from itemElement.dataset.mdpiFilterRefId initially
        console.log(`[MDPI Filter RefIdExtractor] Reused existing data-mdpi-filter-ref-id='${idToUse}' for:`, itemElement);
      }
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