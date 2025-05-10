// Handles the styling of inline footnote/citation markers.
(function() {
  // Helper function to style sup/a elements for inline citations.
  // This function was originally styleSup in content_script.js.
  const styleInlineMarker = supOrA => {
    if (!supOrA) return;

    // Style the main element (sup or a)
    supOrA.style.color      = '#E2211C'; // MDPI Red
    supOrA.style.fontWeight = 'bold';

    // If supOrA is a sup element, specifically style any anchor tag and its content within it
    if (supOrA.tagName.toLowerCase() === 'sup') {
      const anchorElement = supOrA.querySelector('a');
      if (anchorElement) {
        anchorElement.style.color      = '#E2211C';
        anchorElement.style.fontWeight = 'bold';
        Array.from(anchorElement.childNodes).forEach(child => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            child.style.color      = '#E2211C';
            child.style.fontWeight = 'bold';
          }
        });
        const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
        bracketSpans.forEach(span => {
          span.style.color = '#E2211C';
        });
      }
    }
    // If supOrA is an anchor itself that contains a sup
    else if (supOrA.tagName.toLowerCase() === 'a') {
      const supInsideAnchor = supOrA.querySelector('sup');
      if (supInsideAnchor) {
        supInsideAnchor.style.color      = '#E2211C';
        supInsideAnchor.style.fontWeight = 'bold';
        const anchorInsideSup = supInsideAnchor.querySelector('a');
        if (anchorInsideSup) {
          const bracketSpans = anchorInsideSup.querySelectorAll('span.cite-bracket');
          bracketSpans.forEach(span => {
              span.style.color = '#E2211C';
          });
        }
      }
    }
  };

  // Styles inline footnotes based on collected MDPI references.
  // This function was originally styleInlineFootnotes in content_script.js.
  // It now takes collectedMdpiReferences as an argument.
  const styleInlineFootnotes = (collectedMdpiReferences) => {
    if (!collectedMdpiReferences || collectedMdpiReferences.length === 0) return;
    if (!window.MDPIFilterUtils || !window.MDPIFilterUtils.generateInlineFootnoteSelectors) {
      // console.error("[MDPI Filter] generateInlineFootnoteSelectors function is not available.");
      return;
    }

    const styledInlineRefs = new Set();

    collectedMdpiReferences.forEach(refData => {
      // refData.listItemDomId is the ID of the reference list item (e.g., from item.id or item.dataset.bibId)
      // This ID is used to generate selectors for corresponding inline citations.
      if (!refData || !refData.listItemDomId || refData.listItemDomId.trim() === "") {
        // console.warn("[MDPI Filter] Skipping inline styling for refData with missing listItemDomId:", refData);
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
            styleInlineMarker(targetElementToStyle);
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