// Responsible for extracting the primary hyperlink from a given reference item.
(function() {
  if (!window.MDPIFilterLinkExtractor) {
    window.MDPIFilterLinkExtractor = {};
  }

  /**
   * Extracts the primary hyperlink from a reference item using a list of selectors and fallback logic.
   * @param {HTMLElement} item - The reference item (e.g., an LI or DIV element).
   * @param {string[]} linkSelectorsArray - An array of CSS selector strings to try.
   * @returns {string|null} The href of the found link, or null if no suitable link is found.
   */
  function extractPrimaryLink(item, linkSelectorsArray) {
    if (!item || !linkSelectorsArray || !Array.isArray(linkSelectorsArray)) {
      return null;
    }

    let link = null;

    // 1. Try selectors from the provided array
    for (const selector of linkSelectorsArray) {
      try {
        const linkElement = item.querySelector(selector);
        if (linkElement && linkElement.href && !linkElement.href.startsWith('javascript:')) {
          // Prioritize DOI links, but take the first good one if no DOI link found yet
          if (linkElement.href.includes('doi.org') || (link === null || !link.includes('doi.org'))) {
            link = linkElement.href;
            if (link.includes('doi.org')) {
              // console.log(`[Link Extractor] Found DOI link via selector '${selector}': ${link}`);
              break; // Found a DOI link, prefer this
            }
            // console.log(`[Link Extractor] Found non-DOI link via selector '${selector}': ${link}`);
          }
        }
      } catch (e) {
        // console.warn(`[Link Extractor] Error with selector '${selector}' on item:`, item, e);
      }
    }

    // 2. Specific fallback for Wikipedia if no link found yet
    if (!link && item.closest && item.closest('li[id^="cite_note-"]')) {
      // console.log("[Link Extractor] Applying Wikipedia fallback for item:", item);
      try {
        const wikiLink = item.querySelector('.reference-text > a:not([href^="#"])');
        if (wikiLink && wikiLink.href && !wikiLink.href.startsWith('javascript:')) {
          link = wikiLink.href;
          // console.log(`[Link Extractor] Found link via Wikipedia fallback: ${link}`);
        }
      } catch(e) {
        // console.warn(`[Link Extractor] Error with Wikipedia fallback on item:`, item, e);
      }
    }

    // 3. Generic fallback if no link found by specific selectors or Wikipedia logic
    if (!link) {
      // console.log("[Link Extractor] Applying generic fallback for item:", item);
      try {
        const genericLink = item.querySelector('a[href^="http"]:not([href*="#"])');
        if (genericLink && genericLink.href && !genericLink.href.startsWith('javascript:')) {
          link = genericLink.href;
          // console.log(`[Link Extractor] Found link via generic fallback: ${link}`);
        }
      } catch(e) {
        // console.warn(`[Link Extractor] Error with generic fallback on item:`, item, e);
      }
    }

    // console.log(`[Link Extractor] Final extracted link for item: ${link}`, item);
    return link;
  }

  window.MDPIFilterLinkExtractor.extractPrimaryLink = extractPrimaryLink;
})();