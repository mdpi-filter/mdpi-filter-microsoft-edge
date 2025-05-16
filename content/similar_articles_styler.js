(function() {
  if (!window.MDPIFilterSimilarArticles) {
    window.MDPIFilterSimilarArticles = {};
  }
  if (!window.MDPIFilterSimilarArticles.Styler) {
    window.MDPIFilterSimilarArticles.Styler = {};
  }

  const MDPI_RED = '#E2211C';
  const SIMILAR_ARTICLE_BORDER_STYLE = `3px solid ${MDPI_RED}`;
  const SIMILAR_ARTICLE_BACKGROUND_COLOR = `rgba(226, 33, 28, 0.05)`;

  function styleItem(itemElement, isMdpi, mode) {
    if (!itemElement) return;

    itemElement.style.borderLeft = '';
    itemElement.style.paddingLeft = '';
    itemElement.style.backgroundColor = '';
    itemElement.style.display = '';
    itemElement.classList.remove('mdpi-highlighted-similar-article');

    if (isMdpi) {
      itemElement.classList.add('mdpi-highlighted-similar-article');
      if (mode === 'highlight') {
        itemElement.style.borderLeft = SIMILAR_ARTICLE_BORDER_STYLE;
        itemElement.style.paddingLeft = '5px';
        itemElement.style.backgroundColor = SIMILAR_ARTICLE_BACKGROUND_COLOR;
      } else if (mode === 'hide') {
        itemElement.style.display = 'none';
      }
    }
  }

  window.MDPIFilterSimilarArticles.Styler.styleItem = styleItem;

})();