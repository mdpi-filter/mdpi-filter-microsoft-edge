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
    "www.bing.com",         // <-- added Bing
    // "duckduckgo.com"
  ],

  // Google Web
  googleWeb: {
    // host: 'www.google.com', // Old: Too restrictive
    hostRegex: /^www\.google\.[a-z.]+$/i, // Matches www.google.com, www.google.de, www.google.co.uk, etc.
    isGoogleWeb: true, // Specific identifier for Google Web search
    path: /^\/search/,
    // itemSelector targets:
    // 1. Standard result blocks (div.MjjYud) that DO NOT contain an image carousel (div#iur).
    // 2. Individual image items (div[jsname="qQjpJ"]) within an image carousel (div#iur).
    itemSelector: 'div.MjjYud:not(:has(div#iur)), div#iur div[jsname="qQjpJ"]',
    // General link selector to find MDPI links within the item.
    linkSelector: 'a[href*="mdpi.com"]', // Used by GoogleContentChecker if needed, but its primary checks are more robust
    useNcbiApi: true, // Enable NCBI API checks within GoogleContentChecker
    // highlightTargetSelector for standard results (within div.MjjYud).
    // For image items (div[jsname="qQjpJ"]), these selectors are not expected to match,
    // causing the item itself to become the highlightTarget, which is correct.
    highlightTargetSelector: 'div.N54PNb, div.AP7Wnd, div.VTuCfe, div.VwiC3b, div.maxWxw, div.ULSxyf div.N54PNb'
  },

  // Google Scholar
  scholar: {
    host: 'scholar.google.com', // Should match an entry or be covered by an entry in searchEngineDomains
    itemSelector: 'div.gs_r', // Changed 'container' to 'itemSelector' and confirmed selector
    // broadened to include PMC/NCBI and EuropePMC links so Scholar items with pmcid/pmid aren’t skipped
    linkSelector: 'a[href*="mdpi.com"]',
    useNcbiApi: true // Enable NCBI API checks for Google Scholar
    // Consider adding useNcbiApi: true if NCBI checks are desired for Scholar in the future,
    // though MDPIFilterItemContentChecker would need access to PMID/PMCID extraction utilities or
    // the main content_script loop would need to handle it.
  },

  // Bing Web
  bing: {
    hostRegex: /^www\.bing\.com$/i,
    isBingWeb: true,
    path: /^\/search/,
    // Bing “standard” results, carousel cards AND slide-only cards
    // (includes both div.b_cards2.slide and div.slide[role="listitem"])
    itemSelector: 'li.b_algo, div.b_cards2.slide, div.slide[role="listitem"]',
    // MDPI domain links inside results
    linkSelector: 'a[href*="mdpi.com"]',
    useNcbiApi: true,
    // full-item highlighting
    highlightTargetSelector: null
  },

  // PubMed (no outbound links, only DOI in text)
  pubmed: {
    host: 'pubmed.ncbi.nlm.nih.gov', // Should match an entry or be covered by an entry in searchEngineDomains
    // Updated path regex to be more comprehensive for PubMed search pages
    // Matches URLs with query parameters (?) OR specific search/collection paths
    path: /(?:\?|^\/(?:search|collections)\/)/i,
    // Match both article and li elements with the full-docsum class on search result pages
    itemSelector: 'article.full-docsum, li.full-docsum',
    doiPattern: '10.3390', // Used for simple DOI check on search results if API fails or is not used
    useNcbiApi: true // Enable NCBI API checks for better DOI resolution
  },

  // Europe PMC (matches any subdomain of europepmc.org)
  europepmc: {
    hostRegex: /europepmc\.org$/, // Used by getActiveSearchConfig
                                 // 'europepmc.org' in searchEngineDomains will cover pages on this domain.
    path: /^\/search/, // Ensures itemSelector and htmlContains apply only to search result pages
    itemSelector: 'li.separated-list-item', // Specific to search results
    useNcbiApi: true // Enable NCBI API checks for EuropePMC domain
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
    allDomainConfigs.bing,       // <-- include Bing
    allDomainConfigs.pubmed,
    allDomainConfigs.europepmc
    // Add other specific search engine config objects here if defined directly in MDPIFilterDomains
  ];

  for (const config of configsToConsider) {
    if (!config) continue;
    let hostMatch = false;
    if (config.host) {
      hostMatch = (currentHostname === config.host);
    } else if (config.hostRegex) {
      hostMatch = config.hostRegex.test(currentHostname);
    }

    if (hostMatch) {
      // Enhanced path matching logic
      let pathMatch = true; // Default to true if no path constraint
      
      if (config.path) {
        // Special handling for PubMed: check both pathname and search params
        if (config.host === 'pubmed.ncbi.nlm.nih.gov') {
          const fullUrl = currentPathname + window.location.search;
          pathMatch = config.path.test(fullUrl);
        } else {
          // Standard path matching for other domains
          pathMatch = config.path.test(currentPathname);
        }
      }

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
