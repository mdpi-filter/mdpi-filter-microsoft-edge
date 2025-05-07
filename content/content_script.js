// content/content_script.js

if (!window.mdpiFilterInjected) {
  window.mdpiFilterInjected = true;
  // console.log("[MDPI Filter] Content script executing (mdpiFilterInjected set).");

  // --- Dependencies Check ---
  if (typeof window.MDPIFilterDomains === 'undefined') {
    console.error("[MDPI Filter] CRITICAL: window.MDPIFilterDomains is undefined. domains.js might not have loaded correctly.");
  }
  if (typeof window.sanitize === 'undefined') {
    console.error("[MDPI Filter] CRITICAL: window.sanitize is undefined. sanitizer.js might not have loaded correctly.");
  }
  // Add debounce dependency check if utils.js is separate
  if (typeof window.debounce === 'undefined') {
    // Basic debounce implementation if utils.js isn't guaranteed
    window.debounce = (fn, ms = 200) => {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    };
    console.warn("[MDPI Filter] Basic debounce function created as window.debounce was undefined.");
  }
  // ---

  // --- Constants, Selectors, State ---
  const MDPI_DOMAIN = 'mdpi.com';
  const MDPI_DOI    = '10.3390';
  const domains     = window.MDPIFilterDomains || {};
  const sanitize    = window.sanitize || (html => html);
  const uniqueMdpiReferences = new Set();
  let collectedMdpiReferences = []; // Array to store detailed reference info
  let refIdCounter = 0; // Counter for unique reference IDs

  const referenceListSelectors = [
    'li.c-article-references__item',
    'div.References p.ReferencesCopy1',
    'li.html-x',
    'li.html-xx',
    'div.citation',
    'div.reference',
    'li.separated-list-item',
    'li[id^="CR"]', // Springer
    'li[id^="ref-"]', // Generic
    'li[id^="reference-"]', // Generic
    'li[id^="B"]', // NCBI/PMC specific Bxx-journal-id format
    'li:has(> span > a[id^="ref-id-"])', // Some other format
    'li:has(a[name^="bbib"])', // Another format
    'li[data-bib-id]', // Wiley
    'span[aria-owns^="pdfjs_internal_id_"]', // PDF.js rendered spans
    'li[id^="cite_note-"]', // Wikipedia reference list items
    'div.refbegin li', // Wikipedia "Sources" or "Further reading" list items
    'li.scroll-mt-28' // Examine.com reference list items
  ].join(',');
  // ---

  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    // console.log("[MDPI Filter] Mode:", mode);

    // --- Styling Functions ---
    const highlightStyle = '2px solid red';

    const styleSearch = el => {
      if (!el) return;
      if (mode === 'hide') el.style.display = 'none';
      else {
        el.style.border  = highlightStyle;
        el.style.padding = '5px';
      }
    };

    const styleSup = supOrA => {
      if (!supOrA) return;

      // Style the main element (sup or a)
      supOrA.style.color      = '#E2211C'; // MDPI Red
      supOrA.style.fontWeight = 'bold';

      // If supOrA is a sup element, specifically style any anchor tag and its content within it
      if (supOrA.tagName.toLowerCase() === 'sup') {
        const anchorElement = supOrA.querySelector('a');
        if (anchorElement) {
          anchorElement.style.color = '#E2211C'; // Ensure link text is red
          anchorElement.style.fontWeight = 'bold'; // Ensure link text is bold

          // Wikipedia uses spans for brackets, ensure they are also red
          const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
          bracketSpans.forEach(span => {
            span.style.color = '#E2211C';
            // fontWeight will be inherited from the anchor or sup
          });
        }
      }
      // If supOrA is an anchor itself that contains a sup (less common for this specific issue)
      else if (supOrA.tagName.toLowerCase() === 'a') {
        const supElementInside = supOrA.querySelector('sup');
        if (supElementInside) {
            supElementInside.style.color = '#E2211C';
            supElementInside.style.fontWeight = 'bold';
        }
      }
    };

    const styleRef = (item, refId) => { // Accept refId
      item.style.color = '#E2211C';
      // Assign the unique ID as a data attribute
      item.dataset.mdpiFilterRefId = refId;

      let currentSibling = item.previousElementSibling;
      const referenceStartRegex = /^\s*\d+\.\s*/;

      while (currentSibling) {
        if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
          break;
        }

        if (currentSibling.matches('span')) {
          // Also assign the ID to preceding spans for potential targeting
          currentSibling.dataset.mdpiFilterRefId = refId;
          if (referenceStartRegex.test(currentSibling.textContent || '')) {
            currentSibling.style.color = '#E2211C';
            break;
          } else {
            currentSibling.style.color = '#E2211C';
          }
        } else if (currentSibling.tagName !== 'BR') {
          break;
        }
        currentSibling = currentSibling.previousElementSibling;
      }
    };

    const styleDirectLink = link => {
      const titleElement = link.querySelector('h3');
      const targetElement = titleElement || link;
      targetElement.style.color = '#E2211C';
      targetElement.style.borderBottom = '1px dotted #E2211C';
      if (targetElement !== link) {
        link.style.textDecoration = 'none';
      }
      if (window.getComputedStyle(targetElement).display === 'inline') {
        targetElement.style.display = 'inline-block';
      }
    };

    const styleLinkElement = link => {
      if (!link) return;
      link.style.color = '#E2211C';
      link.style.borderBottom = '1px dotted #E2211C';
      link.style.textDecoration = 'none';
      if (window.getComputedStyle(link).display === 'inline') {
        link.style.display = 'inline-block';
      }
    };
    // ---

    // --- Core Logic Functions ---

    // New helper: Just checks content, no side effects on datasets or global lists.
    const isMdpiItemByContent = async (item) => { // Made async
      if (!item) return false;
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';

      // MDPI_DOMAIN and MDPI_DOI are defined in the outer scope

      // Helper function to check a given ID (PMID or PMCID) via NCBI API
      async function checkNcbiIdForMdpi(id, idType) {
        if (!id || !idType) return false;
        // Use generic tool/email as per NCBI's request for programmatic use
        const toolName = 'MDPIFilterChromeExtension';
        const maintainerEmail = 'filter-dev@example.com'; // Replace if you have a specific contact
        const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${encodeURIComponent(id)}&idtype=${encodeURIComponent(idType)}&format=json&versions=no&tool=${toolName}&email=${maintainerEmail}`;

        try {
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.json();
            if (data.records && data.records.length > 0 && data.records[0].doi) {
              const doi = data.records[0].doi;
              if (doi.startsWith(MDPI_DOI)) {
                // console.log(`[MDPI Filter] NCBI API: Found MDPI DOI ${doi} for ${idType.toUpperCase()} ${id}`);
                return true; // MDPI article found via NCBI API
              }
            }
          } else {
            // console.warn(`[MDPI Filter] NCBI API request failed for ${idType.toUpperCase()} ${id}: ${response.status}`);
          }
        } catch (error) {
          // console.error(`[MDPI Filter] Error fetching from NCBI API for ${idType.toUpperCase()} ${id}:`, error);
        }
        return false;
      }

      // Priority 1: Check for direct MDPI links
      if (item.querySelector(`a[href*="${MDPI_DOMAIN}"]`)) {
        return true;
      }

      const mdpiDoiPatternInLink = new RegExp(`${MDPI_DOI.replace(/\./g, '\\.')}/|doi\\.org/${MDPI_DOI.replace(/\./g, '\\.')}/|dx\\.doi\\.org/${MDPI_DOI.replace(/\./g, '\\.')}/`);
      const allLinksInItem = Array.from(item.querySelectorAll('a[href], a[data-track-item_id]'));

      // Priority 2: Check links for MDPI DOI patterns or resolve NCBI links via API
      for (const link of allLinksInItem) {
        const href = link.href; // Use link.href for resolved URL
        const dataTrackId = link.getAttribute('data-track-item_id');

        if ((href && mdpiDoiPatternInLink.test(href)) ||
            (dataTrackId && dataTrackId.includes(`${MDPI_DOI}/`))) {
          return true;
        }

        if (href) {
          const pmcMatch = href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+(\.\d+)?)/i);
          if (pmcMatch && pmcMatch[1]) {
            if (await checkNcbiIdForMdpi(pmcMatch[1], 'pmcid')) return true;
          } else {
            const pmidMatch = href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
            if (pmidMatch && pmidMatch[1]) {
              if (await checkNcbiIdForMdpi(pmidMatch[1], 'pmid')) return true;
            }
          }
        }
      }

      // Priority 3: Check for MDPI DOI string in text content
      if (textContent.includes(`${MDPI_DOI}/`)) {
        let hasConflictingNonMdpiDoiLink = false;
        for (const link of allLinksInItem) {
          const href = link.href;
          if (!href) continue;
          const isDoiResolverLinkConflicting = href.includes('doi.org/') || href.includes('dx.doi.org/');
          const containsDoiPatternConflicting = /\b10\.\d{4,9}\/[^?\s#]+/.test(href);
          if ((isDoiResolverLinkConflicting || containsDoiPatternConflicting) && !mdpiDoiPatternInLink.test(href)) {
            hasConflictingNonMdpiDoiLink = true;
            break;
          }
        }
        if (!hasConflictingNonMdpiDoiLink) {
          return true;
        }
      }

      // Priority 4: If a definitive non-MDPI DOI link exists, this item is NOT MDPI.
      let hasDefinitiveNonMdpiDoiLink = false;
      for (const link of allLinksInItem) {
        const href = link.href;
        if (!href) continue;

        const isDoiResolverLink = href.includes('doi.org/') || href.includes('dx.doi.org/');
        const containsGeneralDoiPattern = /\b10\.\d{4,9}\/[^?\s#]+/.test(href);

        if (isDoiResolverLink || containsGeneralDoiPattern) {
          if (!mdpiDoiPatternInLink.test(href)) {
            hasDefinitiveNonMdpiDoiLink = true;
            break;
          }
        }
      }
      if (hasDefinitiveNonMdpiDoiLink) {
        return false;
      }

      // Priority 5: Journal name check (last resort)
      const M_JOURNALS_STRONG = ['Int J Mol Sci', 'IJMS'];
      const M_JOURNALS_WEAK = ['Nutrients', 'Molecules'];

      const strongJournalRegex = new RegExp(`\\b(${M_JOURNALS_STRONG.join('|')})\\b`, 'i');
      if (strongJournalRegex.test(innerHTML)) {
        return true;
      }

      const weakJournalRegex = new RegExp(`\\b(${M_JOURNALS_WEAK.join('|')})\\b`, 'i');
      if (weakJournalRegex.test(innerHTML)) {
        let hasStrongNonMdpiEvidenceFromOtherLinks = false;
        for (const linkEl of allLinksInItem) {
          const href = linkEl.href;
          if (!href) continue;

          const isClearlyMdpiLinkByPatternOrDomain = mdpiDoiPatternInLink.test(href) || href.includes(MDPI_DOMAIN);
          const isNcbiLink = href.includes("ncbi.nlm.nih.gov/");

          if (!isClearlyMdpiLinkByPatternOrDomain && !isNcbiLink) {
            hasStrongNonMdpiEvidenceFromOtherLinks = true;
            break;
          }
        }

        if (hasStrongNonMdpiEvidenceFromOtherLinks) {
          return false;
        }
        return true;
      }

      return false;
    };

    const extractReferenceData = (item) => {
      let refId = item.dataset.mdpiFilterRefId;
      // Ensure refId is assigned if not already present
      if (!refId) {
        // refIdCounter is defined in the outer scope
        refId = `mdpi-ref-${refIdCounter++}`;
        item.dataset.mdpiFilterRefId = refId;
      }

      let number = null;
      let text = '';
      let link = null;
      const localSanitize = window.sanitize || (htmlInput => htmlInput.replace(/<[^>]+>/g, ''));

      // 1. Try data-counter attribute (e.g., BMC "data-counter='1'")
      if (item.dataset.counter) {
        const parsedCounter = parseInt(item.dataset.counter, 10);
        if (!isNaN(parsedCounter)) {
          number = parsedCounter;
        }
      }

      // 2. Try to parse from ID of the item or its relevant parent (e.g., ref-CR1, B1, r1)
      if (number === null) {
        let idSource = item;
        // For PNAS, the ID like "r1" might be on the parent of div.citation
        if (item.matches && item.matches('div.citation, div.citation-content') && item.parentElement && item.parentElement.id) {
            idSource = item.parentElement;
        } else if (!item.id && item.closest && item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"]')) {
            idSource = item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"]');
        }

        if (idSource && idSource.id) {
            const idMatch = idSource.id.match(/(?:CR|B|ref-|reference-|cite_note-|r)(\d+)/i);
            if (idMatch && idMatch[1]) {
                const parsedIdNum = parseInt(idMatch[1], 10);
                if (!isNaN(parsedIdNum)) {
                    number = parsedIdNum;
                }
            }
        }
      }


      // 3. Try specific label elements for numbers
      if (number === null) {
        let labelTextContent = null;
        const labelSelectors = '.reference-label, .ref-count, .c-article-references__counter, .refnumber, .citation-number, .label, .ref-label, .ref-num, .ref-number';

        // First, try finding a label within the current item
        let labelElement = item.querySelector(labelSelectors);
        if (labelElement && labelElement.textContent) {
          labelTextContent = labelElement.textContent;
        }

        // If not found, and item might be nested (e.g., PNAS div.citation), try finding label in closest list item ancestor
        if (!labelTextContent) {
          // Common list item selectors including PNAS specific div[role="listitem"]
          const commonListItemSelectors = 'li, div[role="listitem"], tr';
          const closestListItem = item.closest(commonListItemSelectors);
          if (closestListItem) {
            labelElement = closestListItem.querySelector(labelSelectors);
            if (labelElement && labelElement.textContent) {
              labelTextContent = labelElement.textContent;
            }
          }
        }
        
        // If still not found, check immediate previous sibling of the item or its citation container
        if(!labelTextContent) {
            let targetPreviousSiblingOf = item;
            // If item is citation content, check sibling of its container
            if (item.matches && item.matches('div.citation-content, div.csl-entry') && item.parentElement) {
                targetPreviousSiblingOf = item.parentElement;
            }
            if (targetPreviousSiblingOf.previousElementSibling) {
                const prevSibling = targetPreviousSiblingOf.previousElementSibling;
                // Check if the previous sibling itself is a label-like element
                if (prevSibling.matches && prevSibling.matches(labelSelectors.split(',').map(s => s.trim() + ':not(a)').join(','))) { // Avoid matching if it's an anchor
                    if (prevSibling.textContent) {
                        labelTextContent = prevSibling.textContent;
                    }
                }
            }
        }

        if (labelTextContent) {
          // Extract leading digits, remove trailing non-digits (like dots, brackets).
          // Handles "1.", "[1]", "1. Author", "1"
          const cleanedText = labelTextContent.trim().replace(/[\[\]]/g, ''); // Remove brackets first
          const numMatch = cleanedText.match(/^(\d+)/); // Match leading digits
          if (numMatch && numMatch[1]) {
            number = parseInt(numMatch[1], 10);
          }
        }
      }
      
      const referenceStartRegex = /^\s*\[?(\d+)\]?\s*\.?\s*/; // For matching numbers like "1. ", "[1]", "1 "

      // 4. Extract raw text content for number parsing and final text
      let rawTextContent = '';
      const specificTextElement = item.querySelector(
        // Prioritize specific text container elements
        'p.c-article-references__text, div.reference-content, div.citation-text, span.reference-text, div.citation__summary, li > p, .c-bibliographic-information__title, .hlFld-Title'
      );

      if (specificTextElement) {
        rawTextContent = specificTextElement.textContent || '';
      } else {
        // Fallback: Clone item, remove known non-content children, then get textContent
        const clone = item.cloneNode(true);
        const selectorsToRemove = [
            '.c-article-references__links', '.reference-links', '.ref-label', 
            '.reference-label', '.ref-count', '.c-article-references__counter', 
            '.refnumber', '.citation-number', '.label', 'ul.c-article-references__links',
            '.c-article-references__links-list', '.access-options', '.icon-file-pdf', '.extra-links'
        ];
        clone.querySelectorAll(selectorsToRemove.join(', ')).forEach(el => el.remove());
        rawTextContent = clone.textContent || '';
      }
      rawTextContent = rawTextContent.trim();

      // 5. Try to extract number from the start of the rawTextContent if not found yet
      if (number === null) {
        const textNumMatch = rawTextContent.match(referenceStartRegex);
        if (textNumMatch && textNumMatch[1]) {
          const parsedTextNum = parseInt(textNumMatch[1], 10);
          if (!isNaN(parsedTextNum)) {
            number = parsedTextNum;
          }
        }
      }

      // 6. Prepare the final display text: remove the number prefix if we successfully extracted it
      text = rawTextContent;
      if (number !== null) {
        // More robustly remove the prefix, considering variations
        const prefixRegex = new RegExp(`^\\s*\\[?${number}\\]?\\s*\\.?\\s*`);
        text = text.replace(prefixRegex, '');
      }
      text = localSanitize(text); // Sanitize after potential number removal

      // 7. Extract link
      const linkSelectors = [
        'a[data-doi]', // Specific data-doi attribute
        'a[href*="doi.org"]', // Links containing doi.org
        'a[href*="/10."]', // Links that look like DOIs, e.g. /10.xxxx/yyyy
        'a.c-bibliographic-information__link[href*="springer.com"]', // Springer article links
        'a.article-link', // Common class for article links
        'a[data-track-action="article reference"]', // Tracking attributes
        'div.citation-content > a[href]', // First link in citation content
        'p > a[href]', // First link in a paragraph (generic)
        'a[href^="http"]:not([href*="#"])', // Any http link not an anchor
        '.c-article-references__text a[href]', // Link within reference text (e.g. Wiley)
        '.citation__title a[href]', // Link on citation title
        '.hlFld-Fulltext > a[href]', // e.g. Taylor & Francis
      ];
      
      for (const selector of linkSelectors) {
        const linkElement = item.querySelector(selector);
        if (linkElement && linkElement.href && !linkElement.href.startsWith('javascript:')) {
          // Prioritize DOI links or links that seem like primary article links
          if (linkElement.href.includes('doi.org') || (link === null || !link.includes('doi.org'))) {
            link = linkElement.href;
            if (link.includes('doi.org')) break; // Found a DOI link, prefer this.
          }
        }
      }
      
      // For Wikipedia, the main link might be inside the text.
      // This is often the first link if not a citation link (e.g. #cite_note-X)
      if (!link && item.closest && item.closest('li[id^="cite_note-"]')) {
        const wikiLink = item.querySelector('.reference-text > a:not([href^="#"])');
        if (wikiLink && wikiLink.href) {
            link = wikiLink.href;
        }
      }
      // If no link found yet, take the first valid HTTP link within the item
      if (!link) {
          const genericLink = item.querySelector('a[href^="http"]:not([href*="#"])');
          if (genericLink && genericLink.href && !genericLink.href.startsWith('javascript:')) {
              link = genericLink.href;
          }
      }

      // 8. Generate fingerprint
      // Use a combination of the beginning of the text and the link for uniqueness.
      // Normalize text by removing extra whitespace and taking a substring.
      const normalizedTextForFingerprint = (text || '').replace(/\s+/g, ' ').trim().substring(0, 100);
      const fingerprint = `${normalizedTextForFingerprint}|${link || ''}`;
      // console.log(`[MDPI Filter] extractReferenceData - Generated fingerprint: "${fingerprint}" for item ID: ${refId}, Number: ${number}, Text (start): "${text.substring(0,50)}..."`);

      return { id: refId, number, text, link, rawHTML: sanitize(item.innerHTML), fingerprint };
    };

    const isSearchSite = () => {
      if (!window.MDPIFilterDomains) {
        // console.warn("[MDPI Filter] isSearchSite check skipped: domains not loaded.");
        return false;
      }
      const host = location.hostname;
      const path = location.pathname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(path);
        if (matchHost && matchPath) {
          // console.log(`[MDPI Filter] isSearchSite: Matched ${cfg.host || cfg.hostRegex}`);
          return true;
        }
      }
      // console.log("[MDPI Filter] isSearchSite: No match");
      return false;
    };

    const updateBadgeAndReferences = () => {
      // console.log("[MDPI Filter - Top Frame] Processing updateBadgeAndReferences.");
      if (isSearchSite()) {
        // console.log("[MDPI Filter - Top Frame] On search site. Badge update handled by processSearchSites.");
        return; 
      }

      // console.log("[MDPI Filter - Top Frame] Not on search site. Processing collected references.");
      // Sort collectedMdpiReferences by number, then by original discovery order (using refId as a proxy)
      const sortedReferences = [...collectedMdpiReferences].sort((a, b) => {
        // Prioritize items with numbers
        if (a.number !== null && b.number === null) return -1;
        if (a.number === null && b.number !== null) return 1;
        
        // If both have numbers, sort by number
        if (a.number !== null && b.number !== null) {
          if (a.number !== b.number) {
            return a.number - b.number;
          }
        }
        // If numbers are the same, or both are null, sort by refId (discovery order)
        // refId is "mdpi-ref-X", extract X for numeric sort
        const numA = parseInt(a.id.split('-').pop(), 10);
        const numB = parseInt(b.id.split('-').pop(), 10);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        } else if (!isNaN(numA)) {
            return -1; 
        } else if (!isNaN(numB)) {
            return 1;  
        }
        return a.id.localeCompare(b.id); // Fallback to string compare of ID if parsing fails
      });

      // console.log(`[MDPI Filter - Top Frame] Sending message type: mdpiUpdate, count: ${uniqueMdpiReferences.size}, refs: ${sortedReferences.length}`);
      chrome.runtime.sendMessage({
        type: 'mdpiUpdate',
        count: uniqueMdpiReferences.size, 
        references: sortedReferences     
      });
    };

    function processSearchSites() {
      if (!window.MDPIFilterDomains) {
        console.warn("[MDPI Filter] processSearchSites skipped: domains not loaded.");
        return;
      }
      const host = location.hostname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(location.pathname);
        if (!matchHost || !matchPath) continue;

        if (cfg.itemSelector && cfg.doiPattern) {
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.textContent.includes(cfg.doiPattern)) {
              styleSearch(item);
            }
          });

        } else if (cfg.itemSelector && cfg.htmlContains) {
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.innerHTML.includes(cfg.htmlContains)) {
              styleSearch(item);
            }
          });

        } else if (cfg.container) {
          document.querySelectorAll(cfg.container).forEach(row => {
            const rowText = row.textContent || '';
            const hasMdpiDoiText = rowText.includes(MDPI_DOI);
            const mdpiLink = row.querySelector(cfg.linkSelector);
            const hasLinkWithMdpiDoi = row.querySelector(`a[href*="${MDPI_DOI}"], a[data-doi*="${MDPI_DOI}"], a[data-article-id*="${MDPI_DOI}"]`);

            if (hasMdpiDoiText || mdpiLink || hasLinkWithMdpiDoi) {
              styleSearch(row);

              let titleContainer = null;
              const isScholar = cfg.host === 'scholar.google.com';

              if (isScholar) {
                titleContainer = row.querySelector('h3.gs_rt');
              } else {
                titleContainer = row.querySelector('.yuRUbf h3');
              }

              if (titleContainer) {
                titleContainer.querySelectorAll('a').forEach(styleLinkElement);
              } else if (!isScholar) {
                const primaryLink = row.querySelector('a[jsname="UWckNb"]') || row.querySelector('.yuRUbf a');
                styleLinkElement(primaryLink);
              }

              if (mdpiLink && (!titleContainer || !titleContainer.contains(mdpiLink))) {
                styleLinkElement(mdpiLink);
              }
            }
          });
        }
      }
    }

    const debouncedProcessCitedByEntries = window.debounce(() => {
      // console.log("[MDPI Filter] Debounced processCitedByEntries running.");
      document.querySelectorAll('li.citedByEntry').forEach(item => {
        if (item.dataset.mdpiCitedByProcessed) return;

        if (item.textContent?.includes(MDPI_DOI)) {
          // console.log("[MDPI Filter] Found MDPI citedBy entry:", item);
          styleSearch(item);
          const viewLink = item.querySelector('.extra-links a.getFTR__btn');
          if (viewLink) {
            styleLinkElement(viewLink);
          }
          item.dataset.mdpiCitedByProcessed = 'true';
        }
      });
    }, 300);

    function processCitedByEntries() {
      // console.log("[MDPI Filter] Initial processCitedByEntries running.");
      document.querySelectorAll('li.citedByEntry').forEach(item => {
        if (item.dataset.mdpiCitedByProcessed) return;

        if (item.textContent?.includes(MDPI_DOI)) {
          // console.log("[MDPI Filter] Found MDPI citedBy entry (initial):", item);
          styleSearch(item);
          const viewLink = item.querySelector('.extra-links a.getFTR__btn');
          if (viewLink) {
            styleLinkElement(viewLink);
          }
          item.dataset.mdpiCitedByProcessed = 'true';
        }
      });
    }

    function styleInlineFootnotes() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        const rid = a.dataset.xmlRid; // xml:id from some JATS XML, often used for <ref>
        let targetEl = null;
        let frag = null;

        if (rid) {
          try {
            targetEl = document.getElementById(rid);
          } catch (e) {
            console.warn(`[MDPI Filter] Error finding element by rid "${rid}":`, e);
          }
        }

        if (!targetEl && href && href.includes('#')) {
          const hashIndex = href.lastIndexOf('#');
          if (hashIndex !== -1 && hashIndex < href.length - 1) {
            frag = href.slice(hashIndex + 1);
            if (frag) {
              try {
                if (!targetEl) {
                  targetEl = document.getElementById(frag);
                }
                if (!targetEl) {
                  const namedElements = document.getElementsByName(frag);
                  if (namedElements.length > 0) {
                    targetEl = namedElements[0];
                  }
                }
                // Ensure CSS.escape is available or polyfilled if targeting older environments
                // For modern extensions, it should be fine.
                const escapedFrag = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(frag) : frag.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');

                if (!targetEl) {
                  targetEl = document.querySelector(`a[id$="-${escapedFrag}"]`);
                }
                if (!targetEl && frag.startsWith('core-')) {
                  const potentialId = frag.substring(5);
                  if (potentialId) {
                    targetEl = document.getElementById(potentialId);
                  }
                }
                if (!targetEl) {
                  targetEl = document.querySelector(`li[data-bib-id="${escapedFrag}"]`);
                }
              } catch (e) {
                console.warn(`[MDPI Filter] DOMException while finding target for fragment "${frag}" (href: "${href}"):`, e);
                return; 
              }
            }
          }
        }

        if (!targetEl) {
          return; 
        }

        let listItem = null;
        try {
          if (targetEl.matches(referenceListSelectors)) {
            listItem = targetEl;
          } else {
            // Attempt to find a specific reference element within targetEl,
            // e.g., if targetEl is a wrapper like <div id="r23"> containing <div class="citation">
            // Query for a descendant that matches one of the reference selectors.
            const innerRefElement = targetEl.querySelector(referenceListSelectors);
            if (innerRefElement) {
              listItem = innerRefElement;
            } else {
              // Fallback: targetEl might be inside a reference item, so find closest ancestor
              listItem = targetEl.closest(referenceListSelectors);
            }
          }
        } catch (e) {
          console.warn(`[MDPI Filter] DOMException with matches/closest for targetEl (href: "${href}", frag: "${frag}"):`, targetEl, e);
          return; 
        }

        // Check if this listItem was identified as MDPI by processAllReferences
        // by looking for the mdpiFilterRefId dataset attribute.
        if (listItem && listItem.dataset.mdpiFilterRefId) {
          const supElement = a.closest('sup'); 
          if (supElement) {
            styleSup(supElement);
          } else { 
            // If no <sup> parent, try to style <sup> child or the <a> tag itself.
            const supInsideA = a.querySelector('sup');
            styleSup(supInsideA || a); // styleSup can handle 'a' tag directly
          }
        }
      });
    }

    async function processAllReferences() { // Made async
      const referenceItems = document.querySelectorAll(referenceListSelectors);
      for (const item of referenceItems) { // Use for...of for await in loop
        let currentAncestor = item.parentElement;
        let skipItemDueToProcessedAncestor = false;
        while (currentAncestor && currentAncestor !== document.body) {
          if (currentAncestor.matches(referenceListSelectors)) {
            const ancestorRefId = currentAncestor.dataset.mdpiFilterRefId;
            if (ancestorRefId && currentAncestor.dataset.mdpiFingerprint && uniqueMdpiReferences.has(currentAncestor.dataset.mdpiFingerprint)) {
              skipItemDueToProcessedAncestor = true;
              break;
            }
          }
          currentAncestor = currentAncestor.parentElement;
        }

        if (skipItemDueToProcessedAncestor) {
          continue; 
        }

        if (item.dataset.mdpiProcessedInThisRun) {
            continue;
        }
        item.dataset.mdpiProcessedInThisRun = 'true';

        if (await isMdpiItemByContent(item)) { // Await the async call
          const refData = extractReferenceData(item); 
          item.dataset.mdpiResult = 'mdpi'; 
          item.dataset.mdpiFingerprint = refData.fingerprint;

          if (!uniqueMdpiReferences.has(refData.fingerprint)) {
            uniqueMdpiReferences.add(refData.fingerprint);
            collectedMdpiReferences.push(refData); 

            if (mode === 'highlight') {
              styleRef(item, refData.id); 
            } else if (mode === 'hide') {
              item.style.display = 'none';
              const parentListItem = item.closest('li, div.citation, div.reference'); 
              if (parentListItem && parentListItem !== item && item.matches(referenceListSelectors)) {
                // Future: Consider hiding parent if it only contains this item and becomes empty.
              }
            }
          } else {
            if (mode === 'highlight') {
              styleRef(item, refData.id); 
            } else if (mode === 'hide') {
              item.style.display = 'none';
            }
          }
        } else {
          item.dataset.mdpiResult = 'not-mdpi';
          delete item.dataset.mdpiFingerprint;
          if (item.dataset.mdpiFilterRefId) { 
             item.style.color = '';
             item.style.border = '';
             item.style.padding = '';
             if (item.style.display === 'none' && mode === 'hide') { 
                // Only unhide if it was hidden by 'hide' mode and is no longer MDPI.
                // If mode is 'highlight', display should not have been 'none' from us.
             } else if (item.style.display === 'none' && mode === 'highlight' && item.dataset.mdpiPreviouslyHiddenByFilter === 'true') {
                // If mode changed from hide to highlight and this item was hidden
                item.style.display = '';
                delete item.dataset.mdpiPreviouslyHiddenByFilter;
             }
          }
        }
      }
      // updateBadgeAndReferences is called at the end of runAll
    }

    function processDirectMdpiLinks() {
      const mdpiArticleRegex = /^https?:\/\/www\.mdpi\.com\/\d{4}-\d{4}\/\d+\/\d+\/\d+(\/.*)?$/;
      document.querySelectorAll(`a[href^="https://www.mdpi.com/"]`).forEach(a => {
        const href = a.getAttribute('href');
        if (href && mdpiArticleRegex.test(href) && !a.closest(referenceListSelectors.split(',').map(s => s.trim() + '[style*="border"]').join(','))) {
          styleDirectLink(a);
        }
      });
    }

    const highlightElementTemporarily = (element) => {
      if (!element) return;
      element.style.outline = '3px solid #FFD700';
      element.style.transition = 'outline 0.1s ease-in-out';

      const refId = element.dataset.mdpiFilterRefId;
      if (refId) {
        document.querySelectorAll(`[data-mdpi-filter-ref-id="${refId}"]`).forEach(el => {
          el.style.outline = '3px solid #FFD700';
          el.style.transition = 'outline 0.1s ease-in-out';
        });
      }

      setTimeout(() => {
        element.style.outline = '';
        if (refId) {
          document.querySelectorAll(`[data-mdpi-filter-ref-id="${refId}"]`).forEach(el => {
            el.style.outline = '';
          });
        }
      }, 2000);
    };

    async function runAll(source = "initial") { // Made async
      // console.log(`[MDPI Filter] runAll triggered by: ${source}`);
      refIdCounter = 0; 

      document.querySelectorAll('[data-mdpi-processed-in-this-run], [data-mdpi-result], [data-mdpi-filter-ref-id], [data-mdpi-fingerprint], [data-mdpi-checked], [data-mdpi-cited-by-processed]').forEach(el => {
        // Store if element was hidden by 'hide' mode before clearing styles
        if (el.style.display === 'none' && el.dataset.mdpiFilterRefId) {
            el.dataset.mdpiPreviouslyHiddenByFilter = 'true';
        } else {
            delete el.dataset.mdpiPreviouslyHiddenByFilter;
        }

        el.style.color = '';
        el.style.fontWeight = '';
        el.style.border = '';
        el.style.padding = '';
        // Don't reset display here if mode is 'hide', allow 'hide' to take effect.
        // Reset display only if it's not going to be hidden again by 'hide' mode.
        if (mode !== 'hide' && el.style.display === 'none' && el.dataset.mdpiPreviouslyHiddenByFilter === 'true') {
           el.style.display = '';
        } else if (mode === 'hide' && el.style.display === 'none' && !el.dataset.mdpiPreviouslyHiddenByFilter) {
           // If mode is hide, and it's already hidden but not by us, leave it.
           // If it was hidden by us, processAllReferences will re-hide if still MDPI.
        } else if (mode !== 'hide') {
            el.style.display = ''; // General reset for highlight mode
        }


        el.style.outline = ''; 

        delete el.dataset.mdpiProcessedInThisRun;
        delete el.dataset.mdpiResult;
        delete el.dataset.mdpiFilterRefId;
        delete el.dataset.mdpiFingerprint; 
        delete el.dataset.mdpiChecked;
        delete el.dataset.mdpiCitedByProcessed;
      });
      document.querySelectorAll('[style*="color: rgb(226, 33, 28)"]').forEach(el => {
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.borderBottom = '';
        el.style.textDecoration = '';
      });

      uniqueMdpiReferences.clear();
      collectedMdpiReferences = []; 

      try {
        if (!window.MDPIFilterDomains || !window.sanitize) {
          console.error("[MDPI Filter] runAll aborted: Dependencies (domains/sanitizer) not loaded.");
          return;
        }
        processSearchSites();       
        processCitedByEntries();    
        await processAllReferences(); 
        styleInlineFootnotes();     
        processDirectMdpiLinks();   
        updateBadgeAndReferences(); 
      } catch (error) {
        console.error(`[MDPI Filter] Error during runAll (source: ${source}):`, error);
      } finally {
        // console.log(`[MDPI Filter] runAll finished (source: ${source}). Unique MDPI refs (for badge): ${uniqueMdpiReferences.size}, Collected for popup: ${collectedMdpiReferences.length}`);
      }
    }

    const debouncedRunAll = window.debounce(runAll, 500);

    function setupMainObserver() {
      const targetNode = document.body;
      if (!targetNode) {
        console.error("[MDPI Filter] Cannot find document.body to observe.");
        return;
      }

      // console.log("[MDPI Filter] Setting up Main observer for document.body");

      const observerConfig = {
        childList: true,
        subtree: true
      };

      const observer = new MutationObserver((mutationsList, observer) => {
        let nodesAdded = false;
        for (const mutation of mutationsList) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            nodesAdded = true;
            break;
          }
        }

        if (nodesAdded) {
          // console.log("[MDPI Filter] Main observer detected added nodes. Triggering debounced runAll.");
          debouncedRunAll("main observer");
        }
      });

      observer.observe(targetNode, observerConfig);
      // console.log("[MDPI Filter] Main observer started.");
    }

    function setupCitedByObserver() {
      const targetNode = document.getElementById('cited-by__content');
      if (!targetNode) {
        // console.log("[MDPI Filter] Cited By observer target '#cited-by__content' not found.");
        return;
      }

      // console.log("[MDPI Filter] Setting up Cited By observer for:", targetNode);

      const observerConfig = {
        childList: true,
        subtree: true
      };

      const observer = new MutationObserver((mutationsList, observer) => {
        // console.log("[MDPI Filter] Cited By observer detected mutations.");
        debouncedProcessCitedByEntries();
      });

      observer.observe(targetNode, observerConfig);
      // console.log("[MDPI Filter] Cited By observer started.");
    }

    if (window.MDPIFilterDomains && window.sanitize) {
      // console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll and setting up observers.");
      requestAnimationFrame(async () => { // Make callback async
        // console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
        await runAll("initial load"); // Await runAll
        setupCitedByObserver();
        setupMainObserver();
      });
    } else {
      console.error("[MDPI Filter] Initial run/observer setup skipped: Dependencies not loaded.");
    }

    window.addEventListener('hashchange', () => {
      // console.log("[MDPI Filter] hashchange detected. Requesting runAll.");
      requestAnimationFrame(async () => { // Make callback async
        // console.log("[MDPI Filter] Running runAll via requestAnimationFrame after hashchange.");
        await runAll("hashchange"); // Await runAll
      });
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'scrollToRef' && msg.refId) {
        // console.log(`[MDPI Filter] Received scrollToRef request for ID: ${msg.refId}`);
        const targetElement = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightElementTemporarily(targetElement);
          sendResponse({ status: "scrolled" });
        } else {
          // console.warn(`[MDPI Filter] Element with ID ${msg.refId} not found.`);
          sendResponse({ status: "not_found" });
        }
        return true;
      }
      return false;
    });

    // console.log("[MDPI Filter] Initial setup complete, listeners/observers added.");

  });

} else {
  // console.log("[MDPI Filter] Injection prevented, mdpiFilterInjected was already true.");
}
