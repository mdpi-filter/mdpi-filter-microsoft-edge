// content/domains.js
// Define the four search‐site configurations
window.MDPIFilterDomains = {

  // Search Engine Domains:
  // Domains listed here are considered search engine pages.
  // The getActiveSearchConfig function will use specific configurations below
  // to determine how to style or hide search results on these pages.
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
    // itemSelector now targets individual image items OR specific standard result content blocks.
    itemSelector: 'div#iur div[jsname="qQjpJ"], div.N54PNb, div.AP7Wnd, div.VTuCfe, div.VwiC3b, div.maxWxw, div.ULSxyf',
    // General link selector to find MDPI links within the item.
    linkSelector: 'a[href*="mdpi.com"]',
    useNcbiApi: true, // Enable NCBI API checks
    // highlightTargetSelector for standard results.
    // For image items (div[jsname="qQjpJ"]), these selectors should not match,
    // causing the item itself to become the highlightTarget.
    // For standard items that are now also the itemSelector (e.g. div.N54PNb),
    // querySelector will find itself or a specific child if applicable (e.g., within div.ULSxyf).
    highlightTargetSelector: 'div.N54PNb, div.AP7Wnd, div.VTuCfe, div.VwiC3b, div.maxWxw, div.ULSxyf div.N54PNb'
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
    hostRegex: /europepmc\.org$/, // Used by getActiveSearchConfig
                                 // 'europepmc.org' in searchEngineDomains will cover pages on this domain.
    itemSelector: 'li.separated-list-item',
    htmlContains: '<b>MDPI</b>'
  }
};

if (typeof window.MDPIFilterDomainUtils === 'undefined') {
  window.MDPIFilterDomainUtils = {};
}

/**
 * Determines if the current page matches a specific search engine configuration
 * and returns that configuration.
 * @param {string} currentHostname - The hostname of the current page.
 * @param {string} currentPathname - The pathname of the current page.
 * @param {object} allDomainConfigs - The global MDPIFilterDomains object.
 * @returns {object|null} The matching domain configuration object, or null if no match.
 */
window.MDPIFilterDomainUtils.getActiveSearchConfig = function(currentHostname, currentPathname, allDomainConfigs) {
  if (!allDomainConfigs) {
    // console.warn("[MDPI Filter DomainUtils] MDPIFilterDomains not provided to getActiveSearchConfig.");
    return null;
  }

  // Order matters for specificity if domains overlap, though current configs are distinct.
  const configsToConsider = [
    allDomainConfigs.googleWeb,
    allDomainConfigs.scholar,
    allDomainConfigs.pubmed,
    allDomainConfigs.europepmc
    // Add other specific search engine config objects here if defined directly in MDPIFilterDomains
  ];

  for (const config of configsToConsider) {
    if (!config) continue; // Skip if a config (e.g., googleWeb) is not defined or missing

    let hostMatch = false;
    if (config.host) { // Primarily uses direct host string match
      hostMatch = (currentHostname === config.host);
    } else if (config.hostRegex) { // Uses regex for host matching (e.g., EuropePMC)
      hostMatch = config.hostRegex.test(currentHostname);
    }

    if (hostMatch) {
      // If path is defined in config, it must match. Otherwise, path match is true.
      const pathMatch = config.path ? config.path.test(currentPathname) : true;

      if (pathMatch) {
        // Special condition for EuropePMC: ensure it's listed in searchEngineDomains
        // This mirrors the original logic's intent for EuropePMC.
        if (config === allDomainConfigs.europepmc) {
          if (allDomainConfigs.searchEngineDomains &&
              allDomainConfigs.searchEngineDomains.some(d => currentHostname.includes(d) && d === "europepmc.org")) {
            return config; // EuropePMC matched and is listed
          }
          // If EuropePMC host/path matches but it's not in searchEngineDomains, skip this config.
          // This ensures the searchEngineDomains list acts as a gatekeeper for EuropePMC.
        } else {
          return config; // Return the matched config for other types
        }
      }
    }
  }
  return null; // No specific search engine configuration matched
};
