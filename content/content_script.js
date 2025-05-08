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

  // Declare mainObserverInstance in a scope accessible by runAll and setupMainObserver
  let mainObserverInstance = null;

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
    'li.scroll-mt-28', // Examine.com reference list items
    'li:has(hl-trusted-source a[href])' // Healthline citation list items
  ].join(',');
  // ---

  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    console.log('%c MDPI FILTER EXTENSION SCRIPT LOADED AND CONTEXT SELECTED! CHECK HERE! ', 'background: yellow; color: black; font-size: 16px; font-weight: bold;');
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
          anchorElement.style.color      = '#E2211C';
          anchorElement.style.fontWeight = 'bold';
          // Also style text nodes directly inside the anchor, if any, or its children
          Array.from(anchorElement.childNodes).forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE) {
              child.style.color      = '#E2211C';
              child.style.fontWeight = 'bold';
            }
          });

          // Wikipedia uses spans for brackets, ensure they are also red
          const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
          bracketSpans.forEach(span => {
            span.style.color = '#E2211C';
            // fontWeight will be inherited from the anchor or sup
          });
        }
      }
      // If supOrA is an anchor itself that contains a sup
      else if (supOrA.tagName.toLowerCase() === 'a') {
        const supInsideAnchor = supOrA.querySelector('sup');
        if (supInsideAnchor) {
          supInsideAnchor.style.color      = '#E2211C';
          supInsideAnchor.style.fontWeight = 'bold';

          // Check for Wikipedia brackets if the anchor itself is the primary target
          // and contains a sup with an anchor that has brackets.
          // This case might be less common if styleInlineFootnotes correctly identifies the sup first.
          const anchorInsideSup = supInsideAnchor.querySelector('a');
          if (anchorInsideSup) {
            const bracketSpans = anchorInsideSup.querySelectorAll('span.cite-bracket');
            bracketSpans.forEach(span => {
                span.style.color = '#E2211C';
            });
          }
        }
      }
    };

    const styleRef = (item, refId) => {
      item.style.color = '#E2211C';
      item.dataset.mdpiFilterRefId = refId;

      let currentSibling = item.previousElementSibling;
      // Regex to identify common reference number patterns like "1.", "[1]", "1)"
      const referenceStartRegex = /^\s*(?:\[\s*\d+\s*\]|\d+\s*[.)]?)/;

      while (currentSibling) {
        if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
          break; // Stop if we hit a PDF.js specific container
        }

        if (currentSibling.matches('span')) {
          // If the span contains the reference number, style it and assign the refId
          if (referenceStartRegex.test(currentSibling.textContent || '')) {
            currentSibling.style.color = '#E2211C';
            currentSibling.dataset.mdpiFilterRefId = refId; // Assign refId for scrolling
          }
        } else if (currentSibling.tagName !== 'BR') {
          // Stop if we hit a non-span, non-BR element
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

    async function checkNcbiIdsForMdpi(ids, idType, runCache) { // ids is an array
      // console.log(`[MDPI Filter API] checkNcbiIdsForMdpi called for ${idType.toUpperCase()}s:`, JSON.stringify(ids));
      if (!ids || ids.length === 0) {
        // console.log(`[MDPI Filter API] No IDs provided for ${idType.toUpperCase()}, returning false.`);
        return false;
      }

      const idsToQuery = ids.filter(id => {
        if (runCache.has(id)) {
          // console.log(`[MDPI Filter API Cache] ID ${id} (${idType.toUpperCase()}) found in cache: ${runCache.get(id)}`);
          return false; // Already in cache, don't query
        }
        return true;
      });

      if (idsToQuery.length === 0) { // All IDs were in cache
        // console.log(`[MDPI Filter API] All ${idType.toUpperCase()}s were in cache. Checking if any were MDPI.`);
        return ids.some(id => runCache.get(id) === true);
      }

      // console.log(`[MDPI Filter API] ${idType.toUpperCase()}s to query API:`, JSON.stringify(idsToQuery));
      const idsString = idsToQuery.join(',');
      const toolName = 'MDPIFilterChromeExtension';
      const maintainerEmail = 'filter-dev@example.com'; // Replace if you have a specific contact
      const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${encodeURIComponent(idsString)}&idtype=${encodeURIComponent(idType)}&format=json&versions=no&tool=${toolName}&email=${maintainerEmail}`;
      // console.log(`[MDPI Filter API] Fetching URL for ${idType.toUpperCase()}s: ${apiUrl}`);

      try {
        const response = await fetch(apiUrl);
        // console.log(`[MDPI Filter API] Response for ${idType.toUpperCase()}s ${idsString}: ${response.status}, ok: ${response.ok}`);
        if (response.ok) {
          const data = await response.json();
          // console.log(`[MDPI Filter API] Data for ${idType.toUpperCase()}s ${idsString}:`, data);
          let foundMdpiInBatch = false;
          if (data.records && data.records.length > 0) {
            data.records.forEach(record => {
              const idThisRecordIsFor = record.requested_id;
              // console.log(`[MDPI Filter API] Processing record:`, record);

              if (idThisRecordIsFor && idsToQuery.includes(idThisRecordIsFor)) {
                if (record.doi && record.doi.startsWith(MDPI_DOI)) {
                  // console.log(`[MDPI Filter API Cache SET] ID ${idThisRecordIsFor} (${idType.toUpperCase()}) is MDPI (DOI: ${record.doi}). Caching true.`);
                  runCache.set(idThisRecordIsFor, true);
                  foundMdpiInBatch = true;
                } else {
                  // console.log(`[MDPI Filter API Cache SET] ID ${idThisRecordIsFor} (${idType.toUpperCase()}) is NOT MDPI (DOI: ${record.doi || 'N/A'}). Caching false.`);
                  runCache.set(idThisRecordIsFor, false);
                }
              } else {
                // console.log(`[MDPI Filter API] Record's requested_id "${idThisRecordIsFor}" not in this query batch or missing. Ignoring for cache update based on this record.`);
              }
            });
          } else {
            // console.log(`[MDPI Filter API] No records found in API response for ${idType.toUpperCase()}s ${idsString}.`);
          }
          
          idsToQuery.forEach(id => {
            if (!runCache.has(id)) {
              // console.log(`[MDPI Filter API Cache SET] ID ${id} (${idType.toUpperCase()}) not in API response records. Caching false.`);
              runCache.set(id, false);
            }
          });
          const result = foundMdpiInBatch || ids.some(id => runCache.get(id) === true);
          // console.log(`[MDPI Filter API] Returning ${result} for ${idType.toUpperCase()}s batch (foundMdpiInBatch: ${foundMdpiInBatch}, any cached MDPI: ${ids.some(id => runCache.get(id) === true)})`);
          return result;
        } else {
          // console.warn(`[MDPI Filter API] NCBI API request failed for ${idType.toUpperCase()}s ${idsString}: ${response.status}`);
          idsToQuery.forEach(id => {
            // console.log(`[MDPI Filter API Cache SET] API error for ID ${id} (${idType.toUpperCase()}). Caching false.`);
            runCache.set(id, false);
          });
        }
      } catch (error) {
        // console.error(`[MDPI Filter API] Error fetching from NCBI API for ${idType.toUpperCase()}s ${idsString}:`, error);
        idsToQuery.forEach(id => {
          // console.log(`[MDPI Filter API Cache SET] Fetch exception for ID ${id} (${idType.toUpperCase()}). Caching false.`);
          runCache.set(id, false);
        });
      }
      const fallbackResult = ids.some(id => runCache.get(id) === true);
      // console.log(`[MDPI Filter API] Returning ${fallbackResult} (fallback after error/failure) for ${idType.toUpperCase()}s batch.`);
      return fallbackResult;
    }

    const isMdpiItemByContent = (item, runCache) => { // Removed async
      if (!item) return false;
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';

      // Priority 1: Check for direct MDPI links
      if (item.querySelector(`a[href*="${MDPI_DOMAIN}"]`)) {
        return true;
      }

      const mdpiDoiPatternInLink = new RegExp(`${MDPI_DOI.replace(/\./g, '\\.')}/|doi\\.org/${MDPI_DOI.replace(/\./g, '\\.')}/|dx\\.doi\\.org/${MDPI_DOI.replace(/\./g, '\\.')}/`);
      const allLinksInItem = Array.from(item.querySelectorAll('a[href], a[data-track-item_id]'));

      let pmcIdStrings = new Set(); // PMCIDs found specifically in *this* item
      let pmidStrings = new Set();  // PMIDs found specifically in *this* item

      // Priority 2a: Check links for MDPI DOI patterns (fast check)
      for (const link of allLinksInItem) {
        const href = link.href;
        const dataTrackId = link.getAttribute('data-track-item_id');

        if ((href && mdpiDoiPatternInLink.test(href)) ||
            (dataTrackId && dataTrackId.includes(`${MDPI_DOI}/`))) {
          return true;
        }

        // Collect PMCIDs and PMIDs from *this item* for checking against the global cache
        if (href) {
          const pmcMatch = href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+(\.\d+)?)/i);
          if (pmcMatch && pmcMatch[1]) {
            pmcIdStrings.add(pmcMatch[1]);
          } else {
            const pmidMatch = href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
            if (pmidMatch && pmidMatch[1]) {
              pmidStrings.add(pmidMatch[1]);
            }
          }
        }
      }

      // Priority 2b: Check collected PMCIDs/PMIDs against the pre-populated runCache
      // The runCache should have been populated by global API calls in runAll
      let itemIsMdpiBasedOnNcbiId = false;
      for (const pmcId of pmcIdStrings) {
        if (runCache.get(pmcId) === true) { 
          itemIsMdpiBasedOnNcbiId = true;
          break;
        }
      }
      if (itemIsMdpiBasedOnNcbiId) return true;

      for (const pmid of pmidStrings) {
        if (runCache.get(pmid) === true) {
          itemIsMdpiBasedOnNcbiId = true;
          break;
        }
      }
      if (itemIsMdpiBasedOnNcbiId) return true;
      // No API calls made from here for NCBI IDs anymore.

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
      if (!refId) {
        refId = `mdpi-ref-${refIdCounter++}`;
        item.dataset.mdpiFilterRefId = refId;
      }
      
      let number = null;
      let text = '';
      let link = null;
      const localSanitize = window.sanitize || (htmlInput => htmlInput.replace(/<[^>]+>/g, ''));
      let numberSource = "none"; // To track where the number came from

      // 1. Try data-counter attribute
      if (item.dataset.counter) {
        const parsedCounter = parseInt(item.dataset.counter, 10);
        if (!isNaN(parsedCounter)) {
          number = parsedCounter;
          numberSource = "data-counter";
        }
      }

      // 2. Try to parse from ID
      if (number === null) {
        let idSourceElement = item; // Renamed for clarity
        // Check if the item itself is a content div and its parent has an ID
        if (item.matches && item.matches('div.citation, div.citation-content') && item.parentElement && item.parentElement.id) {
            idSourceElement = item.parentElement;
        } else if (!item.id && item.closest) { // If item has no ID, check closest ancestor
            const closestWithRefId = item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"], [id^="CR"], [id^="B"]');
            if (closestWithRefId) {
                idSourceElement = closestWithRefId;
            }
        }
        // If idSourceElement is still the item, and it has no ID, this block won't run.
        // If idSourceElement was updated or item itself has an ID, this will run.
        if (idSourceElement && idSourceElement.id) {
            const idMatch = idSourceElement.id.match(/(?:CR|B|ref-|reference-|cite_note-|r)(\d+)/i);
            if (idMatch && idMatch[1]) {
                const parsedIdNum = parseInt(idMatch[1], 10);
                if (!isNaN(parsedIdNum)) {
                    number = parsedIdNum;
                    numberSource = `id-attribute ('${idSourceElement.id}')`;
                }
            }
        }
      }

      // 3. Try specific label elements
      if (number === null) {
        let labelTextContent = null;
        const labelSelectors = '.reference-label, .ref-count, .c-article-references__counter, .refnumber, .citation-number, .label, .ref-label, .ref-num, .ref-number';
        let labelElement = item.querySelector(labelSelectors);
        
        if (labelElement && labelElement.textContent) {
          labelTextContent = labelElement.textContent;
        } else { // Try finding in closest list item if item itself is not the LI
            const commonListItemSelectors = 'li, div[role="listitem"], tr';
            const closestListItem = item.closest(commonListItemSelectors);
            if (closestListItem) {
                labelElement = closestListItem.querySelector(labelSelectors);
                if (labelElement && labelElement.textContent) {
                labelTextContent = labelElement.textContent;
                }
            }
        }
        
        if(!labelTextContent) { // Try previous sibling of item or its direct parent
            let targetForPrevSibling = item;
            if (item.matches && item.matches('div.citation-content, div.csl-entry') && item.parentElement) {
                targetForPrevSibling = item.parentElement;
            }
            if (targetForPrevSibling.previousElementSibling) {
                const prevSibling = targetForPrevSibling.previousElementSibling;
                // Ensure previous sibling is not an anchor itself, to avoid grabbing footnote links
                if (prevSibling.matches && prevSibling.matches(labelSelectors.split(',').map(s => s.trim() + ':not(a)').join(','))) {
                    if (prevSibling.textContent) {
                        labelTextContent = prevSibling.textContent;
                    }
                }
            }
        }

        if (labelTextContent) {
          const cleanedText = labelTextContent.trim().replace(/[\[\]().]/g, ''); // More aggressive cleaning for labels
          const numMatch = cleanedText.match(/^(\d+)/);
          if (numMatch && numMatch[1]) {
            number = parseInt(numMatch[1], 10);
            numberSource = `label ('${labelTextContent.trim()}')`;
          }
        }
      }
      
      const referenceStartRegex = /^\s*\[?(\d+)\]?\s*\.?\s*/; 

      let rawTextContent = '';
      // Prioritize specific text containers if they exist
      const specificTextElement = item.querySelector(
        'p.c-article-references__text, div.reference-content, div.citation-text, span.reference-text, div.citation__summary, li > p, .c-bibliographic-information__title, .hlFld-Title, .csl-entry'
      );

      if (specificTextElement) {
        rawTextContent = specificTextElement.textContent || '';
      } else {
        // Fallback: clone the item and remove known non-content elements
        const clone = item.cloneNode(true);
        const selectorsToRemove = [
            '.c-article-references__links', '.reference-links', '.ref-label', 
            '.reference-label', '.ref-count', '.c-article-references__counter', 
            '.refnumber', '.citation-number', '.label', 'ul.c-article-references__links',
            '.c-article-references__links-list', '.access-options', '.icon-file-pdf', '.extra-links',
            'sup', // Remove sup elements which might contain citation numbers
            'span[class*="label"], span[class*="counter"]' // Generic label/counter spans
        ];
        clone.querySelectorAll(selectorsToRemove.join(', ')).forEach(el => el.remove());
        rawTextContent = clone.textContent || '';
      }
      rawTextContent = rawTextContent.trim();

      // 4. Try to extract number from the start of the rawTextContent (was 5)
      if (number === null) {
        const textNumMatch = rawTextContent.match(referenceStartRegex);
        if (textNumMatch && textNumMatch[1]) {
          const parsedTextNum = parseInt(textNumMatch[1], 10);
          if (!isNaN(parsedTextNum)) {
            number = parsedTextNum;
            numberSource = `rawTextContent start ('${rawTextContent.substring(0,20)}...')`;
          }
        }
      }

      // 5. Try to determine number from <ol> parent (was 5b)
      if (number === null && item.tagName === 'LI') {
        const parentOl = item.parentElement;
        if (parentOl && parentOl.tagName === 'OL') {
          const listItems = Array.from(parentOl.children).filter(child => child.tagName === 'LI');
          const indexInList = listItems.indexOf(item);
          if (indexInList !== -1) {
            let startValue = 1;
            if (parentOl.hasAttribute('start')) {
              const parsedStart = parseInt(parentOl.getAttribute('start'), 10);
              if (!isNaN(parsedStart)) {
                startValue = parsedStart;
              }
            }
            number = startValue + indexInList;
            numberSource = `OL (index ${indexInList}, start ${startValue})`;
          }
        }
      }

      text = rawTextContent;
      // Remove the extracted number prefix from the text if a number was found
      if (number !== null) {
        const prefixRegex = new RegExp(`^\\s*\\[?${number}\\]?\\s*\\.?\\s*`);
        text = text.replace(prefixRegex, '').trim();
      }
      text = localSanitize(text); 

      // Link extraction logic (ensure this is comprehensive)
      const linkSelectors = [
        'a[data-doi]', // Specific data-doi attribute 
        'a[href*="doi.org"]', // Links containing doi.org 
        'a[href*="/10."]', // Links that look like DOIs, e.g. /10.xxxx/yyyy
        'a.c-bibliographic-information__link[href*="springer.com"]', // Springer article links 
        'a.article-link', // Common class for article links 
        'a[data-track-action="article reference"]',         // Tracking attributes
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
          // Prioritize DOI links, but take the first good one if no DOI link found yet
          if (linkElement.href.includes('doi.org') || (link === null || !link.includes('doi.org'))) {
            link = linkElement.href;
            if (link.includes('doi.org')) break; // Found a DOI link, prefer this
          }
        }
      }
      
      // For Wikipedia, the main link might be inside the text.
      if (!link && item.closest && item.closest('li[id^="cite_note-"]')) {
        const wikiLink = item.querySelector('.reference-text > a:not([href^="#"])');
        if (wikiLink && wikiLink.href) {
            link = wikiLink.href;
        }
      }
      // Fallback if no link found by specific selectors
      if (!link) {
          const genericLink = item.querySelector('a[href^="http"]:not([href*="#"])');
          if (genericLink && genericLink.href && !genericLink.href.startsWith('javascript:')) {
              link = genericLink.href;
          }
      }

      const normalizedTextForFingerprint = (text || '').replace(/\s+/g, ' ').trim().substring(0, 100);
      const fingerprint = `${normalizedTextForFingerprint}|${link || ''}`;
      
      console.log(`%c[extractReferenceData - ${refId}] FP: ${fingerprint.substring(0,50)}... Num: ${number} (Source: ${numberSource}), Text: "${text.substring(0, 30)}..."`, 'color: green;');
      return { id: refId, number, text, link, rawHTML: sanitize(item.innerHTML), fingerprint, numberSource };
    };

    // This is the definition of processAllReferences that should be kept
    function processAllReferences(runCache) {
      // console.log(`[processAllReferences START] Time: ${new Date().toISOString()}`);
      const referenceItems = document.querySelectorAll(referenceListSelectors);
      // console.log(`[processAllReferences] Found ${referenceItems.length} items with selectors.`);
      let mdpiFoundInThisPass = 0; 
      for (const item of referenceItems) {
        let currentAncestor = item.parentElement;
        let skipItemDueToProcessedAncestor = false; 
        while (currentAncestor && currentAncestor !== document.body) {
          if (currentAncestor.matches(referenceListSelectors)) {
            // If an ancestor is already a processed MDPI reference item, skip this nested one.
            if (currentAncestor.dataset.mdpiFingerprint && uniqueMdpiReferences.has(currentAncestor.dataset.mdpiFingerprint)) {
              skipItemDueToProcessedAncestor = true; 
              break;
            }
          }
          currentAncestor = currentAncestor.parentElement;
        }

        if (skipItemDueToProcessedAncestor) {
          // console.log(`[processAllReferences] Skipping item (child of already processed MDPI ref): ${item.textContent.substring(0,50)}...`);
          continue;
        }

        // Avoid re-processing an item if it was already handled in *this specific runAll execution*
        // (e.g. if it matched multiple times in referenceListSelectors due to broad selectors)
        if (item.dataset.mdpiProcessedInThisRun === 'true') { 
            // console.log(`[processAllReferences] Item already processed in this run: ${item.textContent.substring(0,50)}...`);
            continue;
        }
        item.dataset.mdpiProcessedInThisRun = 'true';

        if (isMdpiItemByContent(item, runCache)) {
          mdpiFoundInThisPass++;
          const refData = extractReferenceData(item); 
          item.dataset.mdpiResult = 'mdpi'; 
          item.dataset.mdpiFingerprint = refData.fingerprint; // Store fingerprint on the element

          console.log(`%c[processAllReferences - MDPI item] FP: ${refData.fingerprint.substring(0,50)}... Num: ${refData.number} (Source: ${refData.numberSource}), Text: "${refData.text.substring(0,30)}..."`, 'color: orange;');

          const existingRefIndex = collectedMdpiReferences.findIndex(r => r.fingerprint === refData.fingerprint);

          if (existingRefIndex === -1) { // New MDPI item based on fingerprint
            uniqueMdpiReferences.add(refData.fingerprint);
            collectedMdpiReferences.push(refData); 
            // console.log(`%c[processAllReferences - ADDED NEW MDPI] FP: ${refData.fingerprint.substring(0,50)}...`, 'color: cyan');
          } else { // Existing MDPI item, update its data
            if (collectedMdpiReferences[existingRefIndex].number !== refData.number || 
                collectedMdpiReferences[existingRefIndex].id !== refData.id ||
                collectedMdpiReferences[existingRefIndex].text !== refData.text) { // Check more fields if necessary
                 console.warn(`%c[processAllReferences - MDPI item UPDATE] FP: ${refData.fingerprint.substring(0,50)}... OLD Num: ${collectedMdpiReferences[existingRefIndex].number}, NEW Num: ${refData.number} (NewSrc: ${refData.numberSource}). OLD ID: ${collectedMdpiReferences[existingRefIndex].id}, NEW ID: ${refData.id}`, 'color: red; font-weight: bold;');
            }
            // Always update with the latest extracted data, as DOM might have changed
            collectedMdpiReferences[existingRefIndex] = refData; 
          }
          
          if (mode === 'highlight') {
            styleRef(item, refData.id); 
          } else if (mode === 'hide') {
            item.style.display = 'none';
            item.dataset.mdpiPreviouslyHiddenByFilter = 'true'; // Mark that we hid it
          }

        } else { 
          item.dataset.mdpiResult = 'not-mdpi';
          // If it was previously an MDPI item (has a fingerprint), remove it from our collections
          if (item.dataset.mdpiFingerprint) {
            // console.log(`%c[processAllReferences - MDPI item NO LONGER MDPI] FP: ${item.dataset.mdpiFingerprint.substring(0,50)}...`, 'color: magenta;');
            uniqueMdpiReferences.delete(item.dataset.mdpiFingerprint);
            collectedMdpiReferences = collectedMdpiReferences.filter(r => r.fingerprint !== item.dataset.mdpiFingerprint);
            delete item.dataset.mdpiFingerprint;
          }
          
          // Reset styles if previously styled by the extension
          if (item.dataset.mdpiFilterRefId) {
             // Reset explicit styles. Be careful if the site uses inline styles for these.
             // A more robust way might be to add/remove a class.
             item.style.color = ''; 
             item.style.border = '';
             item.style.padding = '';
             // If it was hidden by 'hide' mode and now it's not MDPI, or mode changed
             if (item.style.display === 'none' && item.dataset.mdpiPreviouslyHiddenByFilter === 'true') {
                item.style.display = ''; 
                delete item.dataset.mdpiPreviouslyHiddenByFilter;
             }
          }
        }
      }
      // console.log(`[processAllReferences END] MDPI items found in this pass: ${mdpiFoundInThisPass}. Total unique overall: ${uniqueMdpiReferences.size}. Collected overall: ${collectedMdpiReferences.length}. Time: ${new Date().toISOString()}`);
    }

    const updateBadgeAndReferences = () => {
      const sortedReferences = [...collectedMdpiReferences].sort((a, b) => {
        if (a.number !== null && b.number === null) return -1;
        if (a.number === null && b.number !== null) return 1;
        if (a.number !== null && b.number !== null) {
          if (a.number !== b.number) {
            return a.number - b.number;
          }
        }
        // Fallback sort by original discovery order (refId) if numbers are same or both null
        const numA = parseInt(a.id.split('-').pop(), 10);
        const numB = parseInt(b.id.split('-').pop(), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        } else if (!isNaN(numA)) {
            return -1; 
        } else if (!isNaN(numB)) {
            return 1;  
        }
        return a.id.localeCompare(b.id); // Absolute fallback
      });

      console.log(`%c[updateBadgeAndReferences] Sending to popup. Count: ${uniqueMdpiReferences.size}, Refs length: ${sortedReferences.length}`, 'color: purple; font-weight: bold;');
      if (sortedReferences.length > 0) {
        console.log('%cReferences being sent to popup:', 'color: purple;');
        sortedReferences.forEach(r => {
          console.log(`%c  - FP: ${r.fingerprint.substring(0,50)}... Num: ${r.number} (Source: ${r.numberSource || 'N/A'}), Text: "${r.text.substring(0,30)}..." ID: ${r.id}`, 'color: purple;');
        });
      }
      
      chrome.runtime.sendMessage({
        type: 'mdpiUpdate',
        count: uniqueMdpiReferences.size, 
        references: sortedReferences     
      });
    };

    function styleInlineFootnotes() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        const rid = a.dataset.xmlRid;
        let targetEl = null;
        let frag = null;

        if (rid) {
          try {
            targetEl = document.querySelector(`[id="${CSS.escape(rid)}"]`);
          } catch (e) {
            targetEl = null;
          }
        }

        if (!targetEl && href && href.includes('#')) {
          const hashIndex = href.lastIndexOf('#');
          if (hashIndex !== -1 && hashIndex < href.length - 1) {
            frag = href.slice(hashIndex + 1);
            if (frag) {
              try {
                targetEl = document.getElementById(frag);
              } catch (e) {
                targetEl = null;
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
            const innerRefElement = targetEl.querySelector(referenceListSelectors);
            if (innerRefElement) {
              listItem = innerRefElement;
            } else {
              listItem = targetEl.closest(referenceListSelectors);
            }
          }
        } catch (e) {
          // console.warn(`[MDPI Filter] DOMException with matches/closest for targetEl (href: "${href}", frag: "${frag}"):`, targetEl, e);
          return;
        }

        if (listItem && listItem.dataset.mdpiFilterRefId) {
          const supElement = a.closest('sup');
          if (supElement) {
            styleSup(supElement);
          } else {
            const supInsideA = a.querySelector('sup');
            styleSup(supInsideA || a);
          }
        }
      });
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

    async function runAll(source = "initial") {
      // Clear 'processed in this run' flags from all elements that might have it from a previous run.
      // This ensures that processAllReferences correctly re-evaluates items in the current run.
      try {
        document.querySelectorAll('[data-mdpi-processed-in-this-run="true"]').forEach(el => {
          delete el.dataset.mdpiProcessedInThisRun;
        });
      } catch (e) {
        console.warn("[MDPI Filter] Error clearing 'data-mdpi-processed-in-this-run' attributes:", e);
      }

      if (mainObserverInstance) {
        mainObserverInstance.disconnect();
        // console.log('[MDPI Filter] Main observer disconnected for runAll.');
      }
      try {
        console.log(`[MDPI Filter] runAll STARTING... Source: ${source}, Time: ${new Date().toISOString()}`);

        // Clear previous results and reset counter only for sources that imply a full page re-scan.
        // For observer-triggered runs, we want to update the existing collections.
        if (source === "initial load" || source === "hashchange" || source === "message") {
            console.log("[MDPI Filter] Clearing all references and resetting counter for full re-scan due to source:", source);
            uniqueMdpiReferences.clear();
            collectedMdpiReferences = [];
            refIdCounter = 0; // Reset for full scans
        }


        // Determine if we are on a known search site
        const currentDomainConfig = (() => {
          const host = window.location.hostname;
          const path = window.location.pathname;
          for (const key in domains) {
            const domainInfo = domains[key];
            if (domainInfo.host && host === domainInfo.host) {
              if (domainInfo.path) {
                if (domainInfo.path.test(path)) return domainInfo;
              } else {
                return domainInfo; // No path specified, host match is enough
              }
            } else if (domainInfo.hostRegex && domainInfo.hostRegex.test(host)) {
               // For hostRegex, path check is also important if specified
              if (domainInfo.path) {
                if (domainInfo.path.test(path)) return domainInfo;
              } else {
                return domainInfo; // No path specified, hostRegex match is enough
              }
            }
          }
          return null;
        })();

        // Create a cache for this run of NCBI API results to avoid redundant checks for the same ID
        const runCache = new Map(); // Stores pmid/pmcid -> isMdpi (boolean)

        // --- Step 1: Pre-fetch all NCBI IDs if on PubMed or similar ---
        // This is a global pre-fetch for IDs found on the page, to populate runCache
        // This step is now more generalized.
        const allPotentialItemsForNcbiScan = document.querySelectorAll(referenceListSelectors);
        let allPmcidsToFetch = new Set();
        let allPmidsToFetch = new Set();

        allPotentialItemsForNcbiScan.forEach(item => {
            const textContent = item.textContent || '';
            const innerHTML = item.innerHTML || '';

            // Extract PMIDs and PMCIDs from text content
            const pmidMatches = textContent.match(/\b\d{7,8}\b/g); // Basic PMID pattern
            if (pmidMatches) pmidMatches.forEach(id => allPmidsToFetch.add(id));

            const pmcMatchesText = textContent.match(/PMC\d{7,}/g);
            if (pmcMatchesText) pmcMatchesText.forEach(id => allPmcidsToFetch.add(id.substring(3))); // Store without "PMC"

            // Extract PMIDs and PMCIDs from links (more robust)
            item.querySelectorAll('a[href]').forEach(link => {
                const href = link.href;
                const pmidLinkMatch = href.match(/pubmed\/(\d{7,8})/);
                if (pmidLinkMatch) allPmidsToFetch.add(pmidLinkMatch[1]);

                const pmcLinkMatch = href.match(/pmc\/articles\/PMC(\d{7,})/);
                if (pmcLinkMatch) allPmcidsToFetch.add(pmcLinkMatch[1]); // Store without "PMC"
            });
        });
        // console.log("[MDPI Filter] NCBI Pre-scan - PMIDs to fetch:", Array.from(allPmidsToFetch));
        // console.log("[MDPI Filter] NCBI Pre-scan - PMCIDs to fetch:", Array.from(allPmcidsToFetch));

        if (allPmidsToFetch.size > 0) {
            await checkNcbiIdsForMdpi(Array.from(allPmidsToFetch), 'pmid', runCache);
        }
        if (allPmcidsToFetch.size > 0) {
            await checkNcbiIdsForMdpi(Array.from(allPmcidsToFetch), 'pmcid', runCache);
        }
        // console.log("[MDPI Filter] NCBI Pre-scan - runCache populated:", runCache);
        // --- End Step 1 ---


        if (currentDomainConfig) {
          // console.log("[MDPI Filter] Operating on known search site:", currentDomainConfig);
          const { container, linkSelector, itemSelector, doiPattern, htmlContains } = currentDomainConfig;
          let itemsToProcess = [];

          if (itemSelector) {
            itemsToProcess = Array.from(document.querySelectorAll(itemSelector));
          } else if (container) { // Fallback to container if itemSelector is not specific enough
            itemsToProcess = Array.from(document.querySelectorAll(container));
          }
          // console.log(`[MDPI Filter] Found ${itemsToProcess.length} items/containers to process on search site.`);

          itemsToProcess.forEach(item => {
            let isMdpi = false;
            if (linkSelector) {
              if (item.matches(linkSelector) || item.querySelector(linkSelector)) {
                isMdpi = true;
              }
            }
            if (!isMdpi && doiPattern) {
              if ((item.textContent || '').includes(doiPattern)) {
                isMdpi = true;
              }
            }
            if (!isMdpi && htmlContains) {
              if ((item.innerHTML || '').includes(htmlContains)) {
                isMdpi = true;
              }
            }
            // Additional check using isMdpiItemByContent for search results if needed
            if (!isMdpi && isMdpiItemByContent(item, runCache)) {
                isMdpi = true;
            }


            if (isMdpi) {
              const referenceData = extractReferenceData(item);
              if (referenceData.text && !uniqueMdpiReferences.has(referenceData.text.substring(0, 200))) { // Use a substring for uniqueness
                uniqueMdpiReferences.add(referenceData.text.substring(0, 200));
                collectedMdpiReferences.push(referenceData);
                styleSearch(item); // Apply styling/hiding
                // console.log("[MDPI Filter] Search result identified as MDPI and styled/hidden:", item);
              }
            }
          });
        } else {
          // console.log("[MDPI Filter] Not a known search site or no specific config. Processing general references and links.");
          // Process general references if not on a specific search site or if config allows
          processAllReferences(runCache); // Pass runCache here
          // Process inline footnotes/citations
          styleInlineFootnotes(runCache); // Pass runCache here
          // Process direct MDPI links not in reference lists
          processDirectMdpiLinks(runCache); // Pass runCache here
        }

        updateBadgeAndReferences();
        console.log(`[MDPI Filter] runAll FINISHED. Source: ${source}, unique: ${uniqueMdpiReferences.size}, collected: ${collectedMdpiReferences.length}, Time: ${new Date().toISOString()}`);

      } catch (error) {
        console.error("[MDPI Filter] Error in runAll:", error);
      } finally {
        if (mainObserverInstance) {
          mainObserverInstance.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
          // console.log('[MDPI Filter] Main observer reconnected after runAll.');
        }
      }
    }

    const debouncedRunAll = window.debounce(runAll, 250);

    function setupMainObserver() {
      if (mainObserverInstance) {
        mainObserverInstance.disconnect(); // Disconnect previous if any
      }
      mainObserverInstance = new MutationObserver((mutationsList, observer) => {
        // console.log('[MDPI Filter] Main observer detected DOM change.');
        // No need to iterate mutationsList if we're just debouncing a full run
        debouncedRunAll("main observer");
      });

      mainObserverInstance.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      // console.log("[MDPI Filter] Main MutationObserver set up.");
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
        // debouncedProcessCitedByEntries(); // Temporarily commented out as processCitedByEntries is not defined
      });

      observer.observe(targetNode, observerConfig);
      // console.log("[MDPI Filter] Cited By observer started.");
    }

    if (window.MDPIFilterDomains && window.sanitize) {
      // console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll and setting up observers.");
      requestAnimationFrame(async () => { // Make callback async
        // console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
        await runAll("initial load"); // Await runAll
        // setupCitedByObserver(); // Temporarily commented out as its utility is not fully defined
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
          // console.log(`[MDPI Filter] Scrolling to reference ID: ${msg.refId}`);
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightElementTemporarily(targetElement);
        } else {
          console.warn(`[MDPI Filter] Target element for scrollToRef ID: ${msg.refId} not found.`);
        }
      } else if (msg.type === 'mdpiRunNow') {}
    });
  });
}
