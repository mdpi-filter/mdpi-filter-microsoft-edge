// Defines the selectors used to identify reference list items on a page.
window.MDPIFilterReferenceSelectors = [
  'li.c-article-references__item',
  'div.References p.ReferencesCopy1',
  'li.html-x',
  'li.html-xx',
  'div.citation',
  'div.reference',
  'li.separated-list-item',
  'li[id^="CR"]', // Springer
  'li[id^="cit"]', // TandF and similar (e.g., id="cit0008")
  'li[id^="ref-"]', // Generic
  'li[id^="reference-"]', // Generic
  'li[id^="B"]', // NCBI/PMC specific Bxx-journal-id format
  'li:has(> span > a[id^="ref-id-"])', // Some other format
  'li:has(a[name^="bbib"])', // Another format
  'li[data-bib-id]', // Wiley
  'span[aria-owns^="pdfjs_internal_id_"]', // PDF.js rendered spans
  'li[id^="cite_note-"]', // Wikipedia reference list items
  'div.refbegin li', // Wikipedia "Sources" or "Further reading" list items
  'li.scroll-mt-28', // Examine.com reference list items
  'li:has(hl-trusted-source a[href])', // Healthline citation list items
  'div.circle-list__item[id^="r"]', // Cambridge Core
  'li:has(> div.cit.ref-cit)' // For BMJ-like structures
].join(',');