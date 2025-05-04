// content/domains.js
window.MDPIFilterDomains = {
  googleWeb: {
    host: 'www.google.com',
    path: /^\/search/,
    container: 'div.g',
    linkSelector: 'a[href*="mdpi.com"]'
  },
  scholar: {
    host: 'scholar.google.com',
    container: 'div.gs_r',
    linkSelector: 'a[href*="mdpi.com"]'
  },
  pubmed: {
    host: 'pubmed.ncbi.nlm.nih.gov',
    itemSelector: 'article.full-docsum',
    doiPattern: '10.3390'
  },
  europepmc: {
    hostRegex: /europepmc\.org$/,
    itemSelector: 'li.separated-list-item',
    htmlContains: '<b>MDPI</b>'
  }
};
