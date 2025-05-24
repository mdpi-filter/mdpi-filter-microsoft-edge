(function() {
  'use strict';

  if (window.MDPIFilterReferenceIdExtractor) {
    return; // Avoid re-injecting the script
  }

  /**
   * Extracts or generates an internal scroll ID for a reference item.
   * It also sets the 'data-mdpi-filter-ref-id' attribute on the item.
   * The returned 'extractedId' is the best guess for an ID that can be used
   * to link to inline citations.
   * @param {HTMLElement} itemElement - The DOM element representing the reference item.
   * @param {number} currentRefIdCounter - The current counter value for generating new IDs.
   * @returns {{extractedId: string, updatedRefIdCounter: number}} An object containing the extracted/generated ID and the updated counter.
   */
  function extractInternalScrollId(itemElement, currentRefIdCounter) {
    let idToUse = null;
    let idSourceForLog = "unknown";
    let nextRefIdCounter = currentRefIdCounter;

    // Priority 1: Frontiers-specific anchor name attribute (for <a name="B1" id="B1">)
    const frontiersAnchor = itemElement.querySelector('a[name][id]');
    if (frontiersAnchor && frontiersAnchor.name && frontiersAnchor.id) {
      // Prefer the name attribute as it's more commonly used in inline citations
      idToUse = frontiersAnchor.name;
      idSourceForLog = "Frontiers anchor name attribute";
    }

    // Priority 2: Nature-specific ID from child <p class="c-article-references__text" id="ref-CR...">
    if (!idToUse) {
      const naturePElement = itemElement.querySelector('p.c-article-references__text[id^="ref-CR"]');
      if (naturePElement && naturePElement.id) {
        idToUse = naturePElement.id;
        idSourceForLog = "Nature child p.id";
      }
    }

    // Priority 3: Oxford University Press popup reference data-id
    if (!idToUse && itemElement.dataset && itemElement.dataset.id) {
      idToUse = itemElement.dataset.id;
      idSourceForLog = "item.dataset.id (OUP popup)";
    }

    // Priority 4: ScienceDirect specific ID from child <a id="ref-id-b...">
    if (!idToUse) {
      const sciDirectAnchor = itemElement.querySelector('span.label a.anchor[id^="ref-id-b"]');
      if (sciDirectAnchor && sciDirectAnchor.id) {
        idToUse = sciDirectAnchor.id;
        idSourceForLog = "ScienceDirect child a.anchor.id";
      }
    }

    // Priority 5: ScienceDirect specific ID from child <span class="reference" id="rf...">
    // This is a fallback if the anchor ID isn't found, though less ideal for inline linking.
    if (!idToUse) {
      const sciDirectRefSpan = itemElement.querySelector('span.reference[id^="rf"]');
      if (sciDirectRefSpan && sciDirectRefSpan.id) {
        idToUse = sciDirectRefSpan.id;
        idSourceForLog = "ScienceDirect child span.reference.id";
      }
    }

    // Priority 6: Standard item.id attribute
    if (!idToUse && itemElement.id) {
      idToUse = itemElement.id;
      idSourceForLog = "item.id";
    }

    // Priority 7: 'content-id' attribute (common in OUP - academic.oup.com)
    if (!idToUse) {
      const oupContentId = itemElement.getAttribute('content-id');
      if (oupContentId) {
        idToUse = oupContentId;
        idSourceForLog = "attribute 'content-id'";
      }
    }
    
    // Priority 8: 'data-legacy-id' attribute (common in OUP)
    if (!idToUse) {
      const oupLegacyId = itemElement.getAttribute('data-legacy-id');
      if (oupLegacyId) {
        idToUse = oupLegacyId;
        idSourceForLog = "attribute 'data-legacy-id'";
      }
    }

    // Priority 9: 'data-bib-id' attribute (common in Wiley)
    if (!idToUse && itemElement.dataset && itemElement.dataset.bibId) {
        idToUse = itemElement.dataset.bibId;
        idSourceForLog = "item.dataset.bibId";
    }

    // Priority 10: If no specific linkable ID found yet, check existing 'data-mdpi-filter-ref-id'
    // This handles cases where the script might re-process an element that already has an ID (possibly generated).
    if (!idToUse && itemElement.dataset.mdpiFilterRefId) {
      idToUse = itemElement.dataset.mdpiFilterRefId;
      idSourceForLog = "existing data-mdpi-filter-ref-id";
    }

    // If still no ID after all checks, generate a new one.
    if (!idToUse) {
      idToUse = `mdpi-ref-${nextRefIdCounter++}`;
      itemElement.dataset.mdpiFilterRefId = idToUse; // Set attribute for newly generated
      idSourceForLog = "generated mdpi-ref-X";
      console.log(`[MDPI Filter RefIdExtractor] Generated and set data-mdpi-filter-ref-id='${idToUse}' for:`, itemElement);
    } else {
      // An ID was found (either specific, existing, or from attributes).
      // Ensure 'data-mdpi-filter-ref-id' is consistent with this found ID.
      if (itemElement.dataset.mdpiFilterRefId !== idToUse) {
        itemElement.dataset.mdpiFilterRefId = idToUse;
        // Log adoption if the source wasn't "existing..." (which implies it was already the value)
        // or "generated..." (which has its own log).
        console.log(`[MDPI Filter RefIdExtractor] Adopted ID from ${idSourceForLog} ('${idToUse}') and set data-mdpi-filter-ref-id for:`, itemElement);
      } else {
        // The attribute already matched idToUse.
        // Log confirmation, unless it was a generated ID (already logged).
         if (idSourceForLog !== "generated mdpi-ref-X") {
            console.log(`[MDPI Filter RefIdExtractor] Using ID '${idToUse}' (source: ${idSourceForLog}). data-mdpi-filter-ref-id confirmed. Item:`, itemElement);
        }
      }
    }

    return {
      extractedId: idToUse, // This is the ID to be used by generateInlineFootnoteSelectors
      updatedRefIdCounter: nextRefIdCounter
    };
  }

  window.MDPIFilterReferenceIdExtractor = {
    extractInternalScrollId: extractInternalScrollId
  };

})();