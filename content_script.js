// content_script.js

// Patterns to detect MDPI content
const MDPI_DOMAIN = 'mdpi.com';
const MDPI_DOI_PREFIX = '10.3390/';

// Site definitions for Google & Scholar
const SITE_SELECTORS = [
  { match: /www\.google\.com/, container: '.g' },
  { match: /scholar\.google\.com/, container: '.gs_r' }
];

// Load user preference, defaulting to "highlight"
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  /**
   * Hide or highlight any result elements containing a link to mdpi.com
   * on Google or Google Scholar.
   */
  function processGoogleLike() {
    const hostname = window.location.hostname;
    const site = SITE_SELECTORS.find(s => s.match.test(hostname));
    if (!site) return;

    document.querySelectorAll(`${site.container} a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => {
        const resultEl = link.closest(site.container);
        if (!resultEl) return;

        if (mode === 'hide') {
          resultEl.style.display = 'none';
        } else {
          resultEl.style.border = highlightStyle;
          resultEl.style.padding = '5px';
        }
      });
  }

  /**
   * Hide or highlight any PubMed results whose
   * DOI begins with 10.3390/ (all MDPI DOIs).
   */
  function processPubmed() {
    document.querySelectorAll('article.full-docsum').forEach(item => {
      const citation = item.querySelector('.docsum-journal-citation.full-journal-citation');
      if (!citation) return;

      if (citation.textContent.includes(MDPI_DOI_PREFIX)) {
        if (mode === 'hide') {
          item.style.display = 'none';
        } else {
          item.style.border = highlightStyle;
          item.style.padding = '5px';
        }
      }
    });
  }

  /**
   * Dispatch to the correct processor based on which site we're on.
   */
  function processResults() {
    if (/pubmed\.ncbi\.nlm\.nih\.gov/.test(location.hostname)) {
      processPubmed();
    } else {
      processGoogleLike();
    }
  }

  // Initial run
  processResults();

  // Re-run on dynamic updates (infinite scroll, AJAX, etc.)
  new MutationObserver(processResults)
    .observe(document.body, { childList: true, subtree: true });
});
