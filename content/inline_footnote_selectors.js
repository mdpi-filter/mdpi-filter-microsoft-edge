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
      return "";
    }

    // Use listItemDomId as the base refId for generating selectors
    const refId = listItemDomId;

    const commonSelectors = [
      `a[href="#${refId}"]`,
      `a[href$="#${refId}"]`, // Ends with
      // Handle cases where refId might be "cite_note-B1" and link is "#cite_note-B1" or "B1"
      `a[href="#cite_note-${refId.replace(/^cite_note-/i, '')}"]`,
      `a[href="#ref-${refId.replace(/^ref-/i, '')}"]`,                   // Common ref prefix
      `a[href="#reference-${refId.replace(/^reference-/i, '')}"]`,             // Common reference prefix
      // Handle cases where refId might be "B1" and link is "#B1" or refId is "1" and link is "#B1"
      `a[href="#B${refId.replace(/^B/i, '')}"]`,   // NCBI Bxx style
      `a[href="#CR${refId.replace(/^CR/i, '')}"]`, // Springer style
      `a[href="#en${refId.replace(/^en/i, '')}"]`, // For ods.od.nih.gov style IDs like "en14"
      // ADDED FOR TANDFONLINE and similar sites using data-rid or data-bris-rid
      `a[data-rid="${refId}"]`,
      `a[data-bris-rid="${refId}"]`,
      `a[rid="${refId}"]`, // ADDED for EuropePMC and similar sites using plain rid
      // ADDED FOR NATURE (data-test="citation-ref" and href ending with #ref-CR<ID>)
      `a[data-test="citation-ref"][href$="#ref-${refId}"]`,
      // ADDED FOR CELL.COM and similar sites
      `a[id="body-ref-${refId}"]`, // Matches <a id="body-ref-sref6"> for listItemDomId "sref6"
      `a[aria-controls="${refId}"]`,  // Matches <a aria-controls="sref6"> for listItemDomId "sref6"
      `a[data-db-target-for="${refId}"]`, // ADDED for Cell.com specific attribute
      // ADDED FOR OXFORD UNIVERSITY PRESS (academic.oup.com)
      `a.link-ref.xref-bibr[reveal-id="${refId}"]`,
      `a.link-ref.xref-bibr[data-open="${refId}"]`,
      // ADDED for ScienceDirect style IDs like "ref-id-bb0105" or "ref-id-bbb0105"
      // where inline links might be href="#bb0105" or href="#bbb0105"
      `a[href="#${refId.replace(/^ref-id-/i, '')}"]`,
      // --- Added for Sagepub ---
      `a[role="doc-biblioref"][href="#${refId}"]`,
      // --- Added for Medicine (LWW) ---
      `a.ejp-citation-link[data-reference-links="${refId}"]`
    ];

    // ScienceDirect specific handling for "ref-id-b..." type IDs
    // where inline href might be #bb... or #bbb...
    if (refId.startsWith("ref-id-b")) {
      const baseSciDirectId = refId.substring("ref-id-".length); // e.g., "bbb0105" or "bb0105"
      commonSelectors.push(`a[href="#${baseSciDirectId}"]`); // e.g., a[href="#bbb0105"]
      commonSelectors.push(`a.anchor[href="#${baseSciDirectId}"]`);
      commonSelectors.push(`a.anchor-primary[href="#${baseSciDirectId}"]`);
      if (baseSciDirectId.startsWith("b") && baseSciDirectId.length > 1) {
        const shorterSciDirectId = baseSciDirectId.substring(1); // e.g., "bb0105" from "bbb0105", or "b0105" from "bb0105"
        commonSelectors.push(`a[href="#${shorterSciDirectId}"]`); // e.g., a[href="#bb0105"]
        commonSelectors.push(`a.anchor[href="#${shorterSciDirectId}"]`);
        commonSelectors.push(`a.anchor-primary[href="#${shorterSciDirectId}"]`);
      }
    }


    const numericRefIdPart = refId.replace(/\D/g, ''); // e.g., "35" from "CR35" or "ref-CR35"
    if (numericRefIdPart) {
        commonSelectors.push(`a[href="#${numericRefIdPart}"]`);
        commonSelectors.push(`a[href$="#${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#cite_note-${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#ref-${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#reference-${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#B${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#CR${numericRefIdPart}"]`);
        commonSelectors.push(`a[href="#en${numericRefIdPart}"]`); // For ods.od.nih.gov style IDs with numeric part
        // Potentially add `a[data-rid="${numericRefIdPart}"]` if some sites use numeric data-rid
        // ADDED FOR NATURE (data-test="citation-ref" and href ending with #ref-CR<numericID>)
        commonSelectors.push(`a[data-test="citation-ref"][href$="#ref-CR${numericRefIdPart}"]`);
    }

    const supParentSelectors = [
      `sup a[href="#${refId}"]`,
      `sup a[href$="#${refId}"]`, // Ends with
      `sup a[href="#cite_note-${refId.replace(/^cite_note-/i, '')}"]`,
      `sup a[href="#ref-${refId.replace(/^ref-/i, '')}"]`,
      `sup a[href="#reference-${refId.replace(/^reference-/i, '')}"]`,
      `sup a[href="#B${refId.replace(/^B/i, '')}"]`,
      `sup a[href="#CR${refId.replace(/^CR/i, '')}"]`,
      `sup a[href="#en${refId.replace(/^en/i, '')}"]`, // For ods.od.nih.gov style IDs like "en14"
      `sup[id="ref${refId}"]`, // Note: This selector might be too broad if refId is purely numeric.
                               // Consider if `sup[id="ref-${refId}"]` or similar is more specific.
      `sup a[data-rid="${refId}"]`,
      `sup a[data-bris-rid="${refId}"]`,
      `sup a[rid="${refId}"]`, // ADDED for EuropePMC and similar sites using plain rid
      // ADDED FOR NATURE (data-test="citation-ref" and href ending with #ref-CR<ID> within a sup)
      `sup a[data-test="citation-ref"][href$="#ref-${refId}"]`,
      // ADDED FOR CELL.COM and similar sites (for cases where sup might be the target with these attributes)
      `sup a[id="body-ref-${refId}"]`,
      `sup a[aria-controls="${refId}"]`,
      `sup a[data-db-target-for="${refId}"]`, // ADDED for Cell.com specific attribute
      // ADDED FOR OXFORD UNIVERSITY PRESS (academic.oup.com) - if they ever appear in sup
      `sup a.link-ref.xref-bibr[reveal-id="${refId}"]`,
      `sup a.link-ref.xref-bibr[data-open="${refId}"]`,
     // ADDED for ScienceDirect style IDs
      `sup a[href="#${refId.replace(/^ref-id-/i, '')}"]`,
      // --- Added for Sagepub ---
      `sup a[role="doc-biblioref"][href="#${refId}"]`,
      // --- Added for Medicine (LWW) ---
      `sup a.ejp-citation-link[data-reference-links="${refId}"]`
    ];

    if (refId.startsWith("ref-id-b")) {
      const baseSciDirectId = refId.substring("ref-id-".length);
      supParentSelectors.push(`sup a[href="#${baseSciDirectId}"]`);
      supParentSelectors.push(`sup a.anchor[href="#${baseSciDirectId}"]`);
      supParentSelectors.push(`sup a.anchor-primary[href="#${baseSciDirectId}"]`);
      if (baseSciDirectId.startsWith("b") && baseSciDirectId.length > 1) {
        const shorterSciDirectId = baseSciDirectId.substring(1);
        supParentSelectors.push(`sup a[href="#${shorterSciDirectId}"]`);
        supParentSelectors.push(`sup a.anchor[href="#${shorterSciDirectId}"]`);
        supParentSelectors.push(`sup a.anchor-primary[href="#${shorterSciDirectId}"]`);
      }
    }

     if (numericRefIdPart) {
        supParentSelectors.push(`sup a[href="#${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href$="#${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#cite_note-${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#ref-${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#reference-${numericRefIdPart}"]`);
        supParentSelectors.push(`sup a[href="#B${numericRefIdPart}"]`); // Added for consistency
        supParentSelectors.push(`sup a[href="#CR${numericRefIdPart}"]`); // Added for consistency
        supParentSelectors.push(`sup a[href="#en${numericRefIdPart}"]`); // For ods.od.nih.gov style IDs with numeric part
        supParentSelectors.push(`sup[id="ref-${numericRefIdPart}"]`); // More specific for numeric parts
        // ADDED FOR NATURE (data-test="citation-ref" and href ending with #ref-CR<numericID> within a sup)
        supParentSelectors.push(`sup a[data-test="citation-ref"][href$="#ref-CR${numericRefIdPart}"]`);
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
    } else {
      // --- Wiley fallback: If the selector is a data-bib-id (no id), still add selectors for it ---
      // This covers the case where the reference <li> has only data-bib-id, and inline <a> uses href="#data-bib-id"
      // Try to find an element with data-bib-id === listItemDomId
      const bibIdElement = document.querySelector(`[data-bib-id="${CSS.escape(listItemDomId)}"]`);
      if (bibIdElement) {
        // Add selectors for a[href="#<data-bib-id>"] and sup a[href="#<data-bib-id>"]
        commonSelectors.push(`a[href="#${listItemDomId}"]`);
        supParentSelectors.push(`sup a[href="#${listItemDomId}"]`);
      }
    }
    // --- End Wiley Specific Check Integration ---

    return [...new Set([...commonSelectors, ...supParentSelectors])].join(', ');
  }

  window.MDPIFilterUtils.generateInlineFootnoteSelectors = generateInlineFootnoteSelectors;
})();