// content/domains.js
// Define the four search‐site configurations
window.MDPIFilterDomains = {

  // Search Engine Domains:
  // Domains listed here will cause `isSearchEnginePage()` to return true in content_script.js.
  // On such pages, `processAllReferences` (which collects references for the popup) will be skipped.
  // Instead, `processSearchEngineResults` will run, using the specific configs below
  // to style or hide search results.
  searchEngineDomains: [
    "www.google.com",         // For Google Web search
    "scholar.google.com",     // For Google Scholar
    "pubmed.ncbi.nlm.nih.gov",// For PubMed search results
    "europepmc.org",          // For EuropePMC search results (matches subdomains like www.europepmc.org via .includes())
    // You can add other general search engines here, e.g.:
    // "www.bing.com",
    // "duckduckgo.com"
  ],

  // Google Web
  googleWeb: {
    host: 'www.google.com', // Should match an entry or be covered by an entry in searchEngineDomains
    path: /^\/search/,
    container: 'div.g',
    linkSelector: 'a[href*="mdpi.com"]'
  },

  // Google Scholar
  scholar: {
    host: 'scholar.google.com', // Should match an entry or be covered by an entry in searchEngineDomains
    container: 'div.gs_r',
    linkSelector: 'a[href*="mdpi.com"]'
  },

  // PubMed (no outbound links, only DOI in text)
  pubmed: {
    host: 'pubmed.ncbi.nlm.nih.gov', // Should match an entry or be covered by an entry in searchEngineDomains
    // Match both article and li elements with the full-docsum class
    itemSelector: 'article.full-docsum, li.full-docsum',
    doiPattern: '10.3390'
  },

  // Europe PMC (matches any subdomain of europepmc.org)
  europepmc: {
    hostRegex: /europepmc\.org$/, // Used by processSearchEngineResults
                                 // 'europepmc.org' in searchEngineDomains will cover pages on this domain.
    itemSelector: 'li.separated-list-item',
    htmlContains: '<b>MDPI</b>'
  }
};
