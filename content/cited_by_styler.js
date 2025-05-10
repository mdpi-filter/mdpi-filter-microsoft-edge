// Handles styling of MDPI "Cited By" items.
(function() {
  if (!window.MDPIFilterCitedBy) {
    window.MDPIFilterCitedBy = {};
  }
  if (!window.MDPIFilterCitedBy.Styler) {
    window.MDPIFilterCitedBy.Styler = {};
  }

  const MDPI_RED = '#E2211C';
  const CITED_BY_BORDER_STYLE = `3px solid ${MDPI_RED}`;
  const CITED_BY_TEXT_COLOR = MDPI_RED;

  /**
   * Styles an individual MDPI "Cited By" list item.
   * This function assumes the item has already been determined to be MDPI.
   * @param {HTMLElement} item - The "Cited By" list item (e.g., an LI or DIV element).
   */
  function styleCitedByItem(item) {
    if (!item) return;

    // Apply a distinct visual style to the "Cited By" item container
    item.style.borderLeft = CITED_BY_BORDER_STYLE;
    item.style.paddingLeft = '8px'; // Increased padding for better visual separation
    item.style.marginLeft = '2px'; // Slight indent if needed
    item.style.marginBottom = '4px'; // Spacing between items

    // Attempt to style prominent text elements within the item
    // Example for ScienceDirect "Cited By" items:
    if (item.matches && item.matches('li.ListArticleItem')) {
      const titleH3 = item.querySelector('h3.u-font-serif');
      if (titleH3) {
        titleH3.style.color = CITED_BY_TEXT_COLOR;
        const linkInH3 = titleH3.querySelector('a.anchor-primary');
        if (linkInH3) {
          const anchorTextSpan = linkInH3.querySelector('.anchor-text');
          const linkTextTarget = anchorTextSpan || linkInH3; // Style span or link itself
          linkTextTarget.style.color = CITED_BY_TEXT_COLOR;
        }
      }
      // You might also want to style other parts like author lists or journal info if they exist
      const authors = item.querySelector('.author-list');
      if (authors) {
        // authors.style.fontStyle = 'italic'; // Example
      }
    }
    // Example for generic "Cited By" entries:
    else if (item.matches && item.matches('li.citedByEntry')) {
      const titleElement = item.querySelector('.title, .article-title, h4, h5, strong'); // Common title/emphasis selectors
      if (titleElement) {
        titleElement.style.color = CITED_BY_TEXT_COLOR;
      }
      const seriesTitleSpan = item.querySelector('span.seriesTitle'); // e.g., Journal name
      if (seriesTitleSpan) {
        seriesTitleSpan.style.color = CITED_BY_TEXT_COLOR;
        seriesTitleSpan.style.fontWeight = 'bold';
      }
    }
    // Fallback: If no specific inner elements are matched, try to color the first link found.
    else {
      const primaryLink = item.querySelector('a[href]');
      if (primaryLink) {
        primaryLink.style.color = CITED_BY_TEXT_COLOR;
        // Avoid coloring the entire item.textContent if a link is found and styled.
      } else {
         // As a last resort, color the item's text directly, but be cautious.
         // This might be too broad. Consider if this is desired.
         // item.style.color = CITED_BY_TEXT_COLOR;
      }
    }
    // Mark that this item has been styled by the "Cited By" styler
    item.dataset.mdpiFilterCitedByStyled = "true";
  }

  window.MDPIFilterCitedBy.Styler.styleItem = styleCitedByItem;
})();