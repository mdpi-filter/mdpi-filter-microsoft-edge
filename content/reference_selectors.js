// Defines the selectors used to identify reference list items on a page.
window.MDPIFilterReferenceSelectors = [
  'li.c-article-references__item',
  'div.References p.ReferencesCopy1',
  'li.html-x',
  'li.html-xx',
  // Replace generic 'div.citation' with more specific versions
  'li div.citation', // For div.citation directly inside an li
  'div[role="listitem"][data-has="label"] div.citation', // For div.citation inside a div with role="listitem" (e.g., Cell.com), now more specific
  'div.reference',
  'li.separated-list-item:not(:has(div[id^="article--impact--citation-"]))',
  'li[id^="CR"]', // Springer
  'li[id^="cit"]', // TandF and similar (e.g., id="cit0008")
  'li[id^="ref-"]', // Generic
  'li[id^="reference-"]', // Generic
  'li[id^="B"]', // NCBI/PMC specific Bxx-journal-id format for <li> elements
  'div.ref-cit-blk[id^="B"]', // EuropePMC article page references (e.g. id="B5-microorganisms-11-01048")
  'div#references ol.references-list > li', // PubMed article page references
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
  'div.js-splitview-ref-item[content-id^="CIT"]', // Oxford University Press (academic.oup.com)
  'div#revealContent .ref-content[data-id]', // Oxford University Press popup references
].join(',');