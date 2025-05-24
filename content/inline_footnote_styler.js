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
          let anchorToStyle = null;

          if (matchedElement.tagName.toLowerCase() === 'a') {
            anchorToStyle = matchedElement;
          } else if (matchedElement.tagName.toLowerCase() === 'sup') {
            // The <sup> itself was matched (e.g., by a selector like sup[id="..."]).
            // This <sup> is associated with an MDPI reference (currentListItemDomId).
            // We need to find the specific child <a> element(s) within this <sup>
            // that link to currentListItemDomId.
            // Note: querySelectorAll uses the current `matchedElement` (the sup) as the base.
            const specificAnchorsInSup = matchedElement.querySelectorAll(
              `a[href="#${currentListItemDomId}"], a[href$="#${currentListItemDomId}"],` +
              `a[href="#cite_note-${currentListItemDomId.replace(/^cite_note-/i, '')}"],` +
              `a[href="#ref-${currentListItemDomId.replace(/^ref-/i, '')}"],` +
              `a[href="#reference-${currentListItemDomId.replace(/^reference-/i, '')}"],` +
              `a[href="#B${currentListItemDomId.replace(/^B/i, '')}"],` +
              `a[href="#CR${currentListItemDomId.replace(/^CR/i, '')}"],` +
              `a[data-rid="${currentListItemDomId}"], a[rid="${currentListItemDomId}"],` +
              `a[data-test="citation-ref"][href$="#ref-${currentListItemDomId.replace(/^ref-/i, '')}"]` // Nature specific inside sup
            );

            if (specificAnchorsInSup.length > 0) {
              // Style all such specific anchors found within the sup
              specificAnchorsInSup.forEach(specificAnchor => {
                if (!styledElements.has(specificAnchor)) {
                  styleInlineMarker(specificAnchor, mdpiColor);
                  styledElements.add(specificAnchor);
                  // Add parent sup to styledElements for tracking, not for styling it directly.
                  if (specificAnchor.parentElement && specificAnchor.parentElement.tagName.toLowerCase() === 'sup') {
                    styledElements.add(specificAnchor.parentElement);
                  }
                }
              });
            } else {
                // If the sup was matched, but no specific anchor inside it matches currentListItemDomId via these selectors,
                // it's possible the sup itself is the intended target (e.g. a sup with an ID but no internal links, though rare for citations).
                // Or, the sup contains the link but our specific selectors above missed it.
                // As a fallback, if the sup itself was matched by allSelectorsString, do not style it directly.
                // Instead, try to style its first anchor child if it exists and links to the MDPI ref.
                if (!styledElements.has(matchedElement)) { 
                    styledElements.add(matchedElement); // Mark sup as processed
                    // Try to style the first <a> child if it links to the current MDPI ref
                    const firstAnchorInSup = matchedElement.querySelector('a');
                    if (firstAnchorInSup && !styledElements.has(firstAnchorInSup)) {
                        const href = firstAnchorInSup.getAttribute('href');
                        const idSuffix = `#${currentListItemDomId}`;
                        const refIdSuffix = `#ref-${currentListItemDomId}`; // For Nature
                        if (href && (href.endsWith(idSuffix) || href.endsWith(refIdSuffix))) {
                            styleInlineMarker(firstAnchorInSup, mdpiColor);
                            styledElements.add(firstAnchorInSup);
                        }
                    }
                }
            }
            return; // Finished processing this matched <sup> and its children
          }

          if (anchorToStyle && !styledElements.has(anchorToStyle)) {
            styleInlineMarker(anchorToStyle, mdpiColor);
            styledElements.add(anchorToStyle);
            // Add parent sup to styledElements for tracking if the anchor was styled.
            const parentSup = anchorToStyle.parentElement;
            if (parentSup && parentSup.tagName.toLowerCase() === 'sup') {
              styledElements.add(parentSup);
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