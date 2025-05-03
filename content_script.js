// Domains to watch
const MDPI_PATTERN = "mdpi.com";

// CSS selectors for result containers on each site
const SITE_SELECTORS = [
  // Google Web Search
  { match: /www\.google\.com/, container: '.g' },
  // Google Scholar
  { match: /scholar\.google\.com/, container: '.gs_r' },
  // PubMed
  { match: /pubmed\.ncbi\.nlm\.nih.gov/, container: 'article.full-docsum' }
];

// Get user preference: "hide" or "highlight"
chrome.storage.sync.get({ mode: 'hide' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  function processResults() {
    const url = window.location.hostname;
    const site = SITE_SELECTORS.find(s => s.match.test(url));
    if (!site) return;

    document.querySelectorAll(`${site.container} a[href*="${MDPI_PATTERN}"]`).forEach(link => {
      const container = link.closest(site.container);
      if (!container) return;

      if (mode === 'hide') {
        container.style.display = 'none';
      } else {  // highlight
        container.style.border = highlightStyle;
        container.style.padding = '5px';
      }
    });
  }

  // Initial run
  processResults();

  // Observe for dynamically loaded results (e.g. infinite scroll)
  const observer = new MutationObserver(() => processResults());
  observer.observe(document.body, { childList: true, subtree: true });
});
