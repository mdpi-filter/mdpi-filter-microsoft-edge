// Handles the styling of inline footnote/citation markers.
(function() {
  // Helper function to style sup/a elements for inline citations.
  // This function was originally styleSup in content_script.js.
  // It now specifically targets an anchor element and its parent sup.
  const styleInlineMarker = (anchorElement, color) => {
    if (!anchorElement || anchorElement.tagName.toLowerCase() !== 'a') {
      // console.warn("[MDPI Filter Styler] styleInlineMarker called with non-anchor element:", anchorElement);
      return;
    }

    const markerColor = color || '#E2211C'; // Default to MDPI Red if no color is provided

    // Style the anchor element itself
    anchorElement.style.color      = markerColor;
    anchorElement.style.fontWeight = 'bold';

    // Specifically target known text-holding spans within the anchor for robust styling.
    // This helps ensure the visible text color changes even if site CSS is very specific.

    // For ScienceDirect: <a ...><span class="anchor-text-container"><span class="anchor-text">TEXT</span></span></a>
    const scienceDirectTextSpan = anchorElement.querySelector('span.anchor-text');
    if (scienceDirectTextSpan) {
        scienceDirectTextSpan.style.color = markerColor;
        scienceDirectTextSpan.style.fontWeight = 'bold';
    }

    // For EuropePMC: <a ...><span class="hyperlink-content">TEXT</span></a>
    const europePMCTextSpan = anchorElement.querySelector('span.hyperlink-content');
    if (europePMCTextSpan) {
        europePMCTextSpan.style.color = markerColor;
        europePMCTextSpan.style.fontWeight = 'bold';
    }

    // Add other specific selectors if needed, e.g.:
    // const wileyTextSpan = anchorElement.querySelector('span.some-wiley-class');
    // if (wileyTextSpan) { ... }

    // General fallback: If the anchor has direct child spans and no specific span was styled above,
    // and the anchor itself doesn't seem to have direct text nodes, style its direct child spans.
    // This is a heuristic to catch cases where text is wrapped in a simple, non-specific span.
    if (!scienceDirectTextSpan && !europePMCTextSpan) {
        let hasDirectText = false;
        anchorElement.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                hasDirectText = true;
            }
        });

        if (!hasDirectText) {
            const directChildSpans = Array.from(anchorElement.children).filter(child => child.tagName.toLowerCase() === 'span');
            directChildSpans.forEach(span => {
                // Only style if this span is likely a leaf text container
                if (span.querySelectorAll('span').length === 0) {
                    span.style.color = markerColor;
                    span.style.fontWeight = 'bold';
                }
            });
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

    const styledElements = new Set(); // Keep track of elements (<a> or <sup>) already styled to avoid redundant operations

    // Create a Set of MDPI reference IDs for quick lookup
    const mdpiReferenceIds = new Set(collectedMdpiReferences.map(refData => refData.listItemDomId));

    collectedMdpiReferences.forEach(refData => {
      // refData.listItemDomId is the ID of the reference list item (e.g., from item.id or item.dataset.bibId)
      // This ID is used to generate selectors for corresponding inline citations.
      if (!refData || !refData.listItemDomId || typeof refData.listItemDomId !== 'string' || refData.listItemDomId.trim() === "") {
        // console.warn("[MDPI Filter] Skipping inline styling for refData with missing or invalid listItemDomId:", refData);
        return;
      }
      const currentListItemDomId = refData.listItemDomId; // This ID belongs to an MDPI reference

      const allSelectorsString = window.MDPIFilterUtils.generateInlineFootnoteSelectors(currentListItemDomId);

      if (!allSelectorsString) {
        // console.log(`[MDPI Filter CS] No selectors generated for listItemDomId '${currentListItemDomId}'.`);
        return;
      }
      // console.log(`[MDPI Filter CS] Querying inline for listItemDomId '${currentListItemDomId}' with: ${allSelectorsString}`);

      try {
        document.querySelectorAll(allSelectorsString).forEach(matchedElement => {
          // Additional verification: ensure the matched element actually links to an MDPI reference
          if (styledElements.has(matchedElement)) {
            return; // Already styled
          }

          // Extract the reference ID from the matched element's href or other attributes
          let targetRefId = null;

          // Check href attribute for reference ID
          if (matchedElement.href) {
            const hrefMatch = matchedElement.href.match(/#(.+)$/);
            if (hrefMatch) {
              targetRefId = hrefMatch[1];
            }
          }

          // Check data attributes for reference ID
          if (!targetRefId && matchedElement.dataset) {
            targetRefId = matchedElement.dataset.rid ||
                         matchedElement.dataset.brisRid ||
                         matchedElement.dataset.dbTargetFor || // ADDED for Cell.com data-db-target-for
                         matchedElement.getAttribute('rid') ||
                         matchedElement.getAttribute('aria-controls');
          }

          // Only style if we can confirm this element points to an MDPI reference
          if (targetRefId && mdpiReferenceIds.has(targetRefId)) {
            if (matchedElement.tagName.toLowerCase() === 'a') {
              styleInlineMarker(matchedElement, mdpiColor);
              styledElements.add(matchedElement);

              // Also style parent sup if it exists
              const parentSup = matchedElement.closest('sup');
              if (parentSup && !styledElements.has(parentSup)) {
                styledElements.add(parentSup);
              }
            } else if (matchedElement.tagName.toLowerCase() === 'sup') {
              const anchorInSup = matchedElement.querySelector('a');
              if (anchorInSup) {
                styleInlineMarker(anchorInSup, mdpiColor);
              }
              styledElements.add(matchedElement);
            }
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