// Handles styling of MDPI "Cited By" items.
(function() {
  if (!window.MDPIFilterCitedBy) {
    window.MDPIFilterCitedBy = {};
  }
  if (!window.MDPIFilterCitedBy.Styler) {
    window.MDPIFilterCitedBy.Styler = {};
  }

  const MDPI_RED = '#E2211C';
  // Consistent with general reference highlight styling from content_script.js
  const CITED_BY_HIGHLIGHT_BORDER = `3px solid ${MDPI_RED}`;
  const CITED_BY_HIGHLIGHT_PADDING = '5px';
  const CITED_BY_HIGHLIGHT_BG_COLOR = 'rgba(226, 33, 28, 0.05)';
  const CITED_BY_TEXT_COLOR = MDPI_RED; // For inner text elements if desired

  /**
   * Styles an individual "Cited By" list item based on whether it's MDPI and the current mode.
   * @param {HTMLElement} item - The "Cited By" list item (e.g., an LI or DIV element).
   * @param {boolean} isMdpi - Whether the item has been determined to be MDPI.
   * @param {string} mode - The current operating mode ('highlight' or 'hide').
   */
  function styleCitedByItem(item, isMdpi, mode) {
    if (!item) return;

    // Clear previous MDPI-specific styling first
    item.style.borderLeft = '';
    item.style.paddingLeft = '';
    item.style.backgroundColor = '';
    item.style.display = ''; // Reset display
    item.style.marginLeft = ''; // Reset if previously set by older versions
    item.style.marginBottom = ''; // Reset if previously set by older versions
    // TODO: Consider a more robust way to clear inner text styling if it becomes complex,
    // e.g., by adding/removing a specific class to inner styled elements.
    // For now, this focuses on the container styling.

    delete item.dataset.mdpiFilterCitedByStyled;
    delete item.dataset.mdpiFilterMode;

    if (isMdpi) {
      item.dataset.mdpiFilterCitedByStyled = "true";
      item.dataset.mdpiFilterMode = mode;

      if (mode === 'highlight') {
        item.style.borderLeft = CITED_BY_HIGHLIGHT_BORDER;
        item.style.paddingLeft = CITED_BY_HIGHLIGHT_PADDING;
        item.style.backgroundColor = CITED_BY_HIGHLIGHT_BG_COLOR;
        item.style.display = ''; // Ensure visible

        // Optional: Apply styling to inner text elements for highlighted MDPI items
        // This can be adapted from your existing logic or made more specific.
        // Example for EuropePMC `li.separated-list-item` containing `div.citation > h4.citation-title a`
        if (item.matches && item.matches('li.separated-list-item')) {
          const titleLink = item.querySelector('div.citation h4.citation-title a');
          if (titleLink) {
            // titleLink.style.color = CITED_BY_TEXT_COLOR; // Uncomment if desired
          }
        }
        // Add other specific selectors if needed, similar to your original styler:
        // else if (item.matches && item.matches('li.ListArticleItem')) { ... }
        // else if (item.matches && item.matches('li.citedByEntry')) { ... }

      } else if (mode === 'hide') {
        item.style.display = 'none';
      }
    }
    // If not MDPI, all relevant styles were cleared at the beginning.
  }

  window.MDPIFilterCitedBy.Styler.styleItem = styleCitedByItem;
})();