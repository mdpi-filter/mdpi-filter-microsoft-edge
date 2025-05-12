// Handles the styling of inline footnote/citation markers.
(function() {
  // Helper function to style sup/a elements for inline citations.
  // This function was originally styleSup in content_script.js.
  const styleInlineMarker = (supOrA, color) => {
    if (!supOrA) return;

    const markerColor = color || '#E2211C'; // Default to MDPI Red if no color is provided

    // Style the main element (sup or a)
    supOrA.style.color      = markerColor;
    supOrA.style.fontWeight = 'bold';

    // If supOrA is a sup element, specifically style any anchor tag and its content within it
    if (supOrA.tagName.toLowerCase() === 'sup') {
      const anchorElement = supOrA.querySelector('a');
      if (anchorElement) {
        anchorElement.style.color      = markerColor;
        anchorElement.style.fontWeight = 'bold';
        Array.from(anchorElement.childNodes).forEach(child => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            child.style.color      = markerColor;
            child.style.fontWeight = 'bold';
          }
        });
        const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
        bracketSpans.forEach(span => {
          span.style.color = markerColor;
        });
      }
    }
    // If supOrA is an anchor itself that contains a sup
    else if (supOrA.tagName.toLowerCase() === 'a') {
      const supInsideAnchor = supOrA.querySelector('sup');
      if (supInsideAnchor) {
        supInsideAnchor.style.color      = markerColor;
        supInsideAnchor.style.fontWeight = 'bold';
        const anchorInsideSup = supInsideAnchor.querySelector('a');
        if (anchorInsideSup) {
          const bracketSpans = anchorInsideSup.querySelectorAll('span.cite-bracket');
          bracketSpans.forEach(span => {
              span.style.color = markerColor;
          });
        }
      }
    }
  };

  // Styles inline footnotes based on collected MDPI references.
  // This function was originally styleInlineFootnotes in content_script.js.
  // It now takes collectedMdpiReferences and mdpiColor as arguments.
  const styleInlineFootnotes = (collectedMdpiReferences, mdpiColor) => {
    // Stronger guard: check if it's an array and if it's empty.
    if (!Array.isArray(collectedMdpiReferences) || collectedMdpiReferences.length === 0) {
      // console.log("[MDPI Filter] styleInlineFootnotes: collectedMdpiReferences is not a valid non-empty array.", collectedMdpiReferences);
      return;
    }
    if (!window.MDPIFilterUtils || !window.MDPIFilterUtils.generateInlineFootnoteSelectors) {
      // console.error("[MDPI Filter] generateInlineFootnoteSelectors function is not available.");
      return;
    }

    const styledInlineRefs = new Set();

    collectedMdpiReferences.forEach(refData => {
      // refData.listItemDomId is the ID of the reference list item (e.g., from item.id or item.dataset.bibId)
      // This ID is used to generate selectors for corresponding inline citations.
      if (!refData || !refData.listItemDomId || typeof refData.listItemDomId !== 'string' || refData.listItemDomId.trim() === "") {
        // console.warn("[MDPI Filter] Skipping inline styling for refData with missing or invalid listItemDomId:", refData);
        return;
      }
      const currentListItemDomId = refData.listItemDomId;

      const allSelectorsString = window.MDPIFilterUtils.generateInlineFootnoteSelectors(currentListItemDomId);

      if (!allSelectorsString) {
        // console.log(`[MDPI Filter CS] No selectors generated for listItemDomId '${currentListItemDomId}'.`);
        return;
      }
      // console.log(`[MDPI Filter CS] Querying inline for listItemDomId '${currentListItemDomId}' with: ${allSelectorsString}`);

      try {
        document.querySelectorAll(allSelectorsString).forEach(el => {
          let targetElementToStyle = el;
          if (el.tagName.toLowerCase() === 'sup') {
            targetElementToStyle = el;
          } else if (el.tagName.toLowerCase() === 'a') {
            const directSupParent = el.parentElement;
            if (directSupParent && directSupParent.tagName.toLowerCase() === 'sup') {
              targetElementToStyle = directSupParent;
            } else {
              targetElementToStyle = el;
            }
          }
          if (targetElementToStyle && !styledInlineRefs.has(targetElementToStyle)) {
            styleInlineMarker(targetElementToStyle, mdpiColor); // Pass mdpiColor here
            styledInlineRefs.add(targetElementToStyle);
          }
        });
      } catch (error) {
        // console.error(`[MDPI Filter CS] Error querying/styling inline footnotes for listItemDomId ${currentListItemDomId} ('${allSelectorsString}'):`, error);
      }
    });
  };

  // Export functions to the window object for content_script.js to use
  if (!window.MDPIFilterUtils) {
    window.MDPIFilterUtils = {};
  }
  window.MDPIFilterUtils.styleInlineFootnotes = styleInlineFootnotes;
})();