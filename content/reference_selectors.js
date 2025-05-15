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
  'li[id^="en"]', // For ods.od.nih.gov style IDs like "en14"
  'li:has(> span > a[id^="ref-id-"])', // Some other format
  'li:has(a[name^="bbib"])', // Another format
  'li[data-bib-id]', // Wiley
  'span[aria-owns^="pdfjs_internal_id_"]', // PDF.js rendered spans
  'li[id^="cite_note-"]', // Wikipedia reference list items
  'div.refbegin li', // Wikipedia "Sources" or "Further reading" list items
  'li.scroll-mt-28', // Examine.com reference list items
  'hl-trusted-source:has(a[href])', // Healthline: standalone trusted source elements with a link
  'li.css-1ti7iub:has(cite a[href])', // Healthline: list items in "Sources" section with a citation link
  'div.circle-list__item[id^="r"]', // Cambridge Core
  'li:has(> div.cit.ref-cit)', // For BMJ-like structures
  'li[id^="R"]', // PMC-style references like <li id="R4">
  // --- Added for PMC/NCBI style: IDs ending with 'r' followed by digits (e.g., zoi220196r19) ---
  'li[id$="r"]', // Matches IDs ending with 'r' (will filter in code for digits after 'r')
  'li[id*="r"][id]', // Fallback: any li with 'r' in id (will filter in code)
].join(',');