// Generates CSS selectors for finding inline footnote/citation markers.
(function() {
  if (!window.MDPIFilterUtils) {
    window.MDPIFilterUtils = {};
  }

  /**
   * Generates a CSS selector string for finding inline footnotes related to a given reference ID.
   * @param {string} listItemDomId - The DOM ID of the reference list item (e.g., "B1-journal-id", "ref-CR1", or a data-bib-id if item.id was missing).
   * @returns {string} - A comma-separated CSS selector string.
   */
  function generateInlineFootnoteSelectors(listItemDomId) {
    if (!listItemDomId || typeof listItemDomId !== 'string' || listItemDomId.trim() === "") {
      return ""; // Return an empty selector if the ID is invalid
    }

    // Use listItemDomId as the base refId for generating selectors
    const refId = listItemDomId;

    const commonSelectors = [
      `a[href="#${refId}"]`,
      `a[href="#cite_note-${refId}"]`,
      // Handle cases where refId might be "cite_note-B1" and link is "#cite_note-B1" or "B1"
      `a[href="#cite_note-${refId.replace(/^cite_note-/i, '').split(/[^a-zA-Z0-9_.:-]+/)[0]}"]`,
      `a[href="#ref-${refId}"]`,                   // Common ref prefix
      `a[href="#reference-${refId}"]`,             // Common reference prefix
      // Handle cases where refId might be "B1" and link is "#B1" or refId is "1" and link is "#B1"
      `a[href="#B${refId.replace(/^B/i, '')}"]`,   // NCBI Bxx style
      `a[href="#CR${refId.replace(/^CR/i, '')}"]`, // Springer style
      // ADDED FOR TANDFONLINE and similar sites using data-rid or data-bris-rid
      `a[data-rid="${refId}"]`,
      `a[data-bris-rid="${refId}"]`
    ];

    const numericRefIdPart = refId.replace(/\D/g, ''); // e.g., "35" from "CR35"
    if (numericRefIdPart) {
        commonSelectors.push(`a[href="#cite_note-${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#ref-${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#reference-${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#B${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#CR${numericRefIdPart}"]`);
        // Potentially add `a[data-rid="${numericRefIdPart}"]` if some sites use numeric data-rid
    }

    const supParentSelectors = [
      `sup a[href="#${refId}"]`,
      `sup a[href="#cite_note-${refId}"]`,
      `sup a[href="#cite_note-${refId.replace(/^cite_note-/i, '').split(/[^a-zA-Z0-9_.:-]+/)[0]}"]`,
      `sup a[href="#ref-${refId}"]`,
      `sup a[href="#reference-${refId}"]`,
      `sup a[href="#B${refId.replace(/^B/i, '')}"]`,
      `sup a[href="#CR${refId.replace(/^CR/i, '')}"]`,
      `sup[id="ref${refId}"]`, // Note: This selector might be too broad if refId is purely numeric.
                               // Consider if `sup[id="ref-${refId}"]` or similar is more specific.
      `sup a[data-rid="${refId}"]`,
      `sup a[data-bris-rid="${refId}"]`
    ];
     if (numericRefIdPart) {
        supParentSelectors.push(`sup a[href="#cite_note-${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#ref-${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#reference-${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#B${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#CR${numericRefIdPart}"]`);
        supParentSelectors.push(`sup[id="ref-${numericRefIdPart}"]`); // More specific for numeric parts
    }

    // --- Wiley Specific Check Integration ---
    // If the reference list item was identified by its actual DOM ID (listItemDomId = item.id),
    // and it also has a 'data-bib-id' attribute, check if inline links use that 'data-bib-id'.
    // This uses `listItemDomId` which should be the actual ID of the element.
    const listItemElement = document.getElementById(listItemDomId);
    if (listItemElement) {
        const wileyBibId = listItemElement.getAttribute('data-bib-id');
        if (wileyBibId) {
            // Escape special characters for CSS selector.
            const escapedWileyBibId = wileyBibId.replace(/["\\]/g, '\\$&');
            // Add selectors for this wileyBibId only if it's different from listItemDomId itself,
            // to avoid redundancy if listItemDomId is already the data-bib-id (because item.id was missing).
            if (escapedWileyBibId !== listItemDomId) {
                commonSelectors.push(`a[href="#${escapedWileyBibId}"]`);
                supParentSelectors.push(`sup a[href="#${escapedWileyBibId}"]`);
            }
        }
    }
    // --- End Wiley Specific Check Integration ---

    return [...new Set([...commonSelectors, ...supParentSelectors])].join(', ');
  }

  window.MDPIFilterUtils.generateInlineFootnoteSelectors = generateInlineFootnoteSelectors;
})();