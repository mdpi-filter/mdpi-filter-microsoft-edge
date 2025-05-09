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
      if (!ids || ids.length === 0) {
        return false;
      }

      // Filter out IDs that are already in the runCache
      const idsToQueryInitially = ids.filter(id => !runCache.has(id));

      if (idsToQueryInitially.length === 0) { // All IDs were already in cache
        // Check if any of the original IDs (including those initially in cache) are MDPI
        return ids.some(id => runCache.get(id) === true);
      }

      const BATCH_SIZE = 20; // Max IDs per NCBI API request (REDUCED FURTHER for testing URL length)
      let overallFoundMdpiInBatches = false;

      for (let i = 0; i < idsToQueryInitially.length; i += BATCH_SIZE) {
        const batchIdsToQuery = idsToQueryInitially.slice(i, i + BATCH_SIZE);
        if (batchIdsToQuery.length === 0) {
          continue;
        }

        const idsString = batchIdsToQuery.join(','); // Commas should be literal in the query
        const encodedIdType = encodeURIComponent(idType);
        const toolName = 'MDPIFilterChromeExtension'; 
        const maintainerEmail = 'dicing_nastily314@aleeas.com'; 
        const encodedToolName = encodeURIComponent(toolName);
        const encodedMaintainerEmail = encodeURIComponent(maintainerEmail);

        // Restored tool and email parameters
        const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${idsString}&idtype=${encodedIdType}&format=json&versions=no&tool=${encodedToolName}&email=${encodedMaintainerEmail}`;
        
        // console.log(`[MDPI Filter API] Fetching batch for ${idType.toUpperCase()}s. Batch size: ${batchIdsToQuery.length}. URL: ${apiUrl}`);

        try {
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.json();
            let foundMdpiInThisBatch = false;
            if (data.records && data.records.length > 0) {
              data.records.forEach(record => {
                const idThisRecordIsFor = record.requested_id;
                let isMdpiFromApi = false; // Default to not MDPI for this record

                if (idThisRecordIsFor && batchIdsToQuery.includes(idThisRecordIsFor)) {
                  // Primary check: DOI
                  if (record.doi) {
                    if (record.doi.startsWith(MDPI_DOI)) {
                      isMdpiFromApi = true;
                      // console.log(`%c[MDPI Filter API] Marked as MDPI (DOI): ${idType.toUpperCase()} ${idThisRecordIsFor} (DOI: ${record.doi})`, 'color: blue');
                    } else {
                      isMdpiFromApi = false; // Non-MDPI DOI explicitly means not MDPI by this check
                      // console.log(`%c[MDPI Filter API] Marked as NOT MDPI (Non-MDPI DOI): ${idType.toUpperCase()} ${idThisRecordIsFor} (DOI: ${record.doi})`, 'color: red');
                    }
                  } else {
                    // Secondary checks if no DOI is present in the record - Journal name check is last resort here
                    // Define the short list of journals for API check (as per user request)
                    const API_MDPI_JOURNALS_REGEX = /\b(Int J Mol Sci|IJMS|Nutrients|Molecules)\b/i;

                    if (
                      (record.publisher_name && record.publisher_name.toLowerCase().includes('mdpi')) ||
                      (record.copyright && record.copyright.toLowerCase().includes('mdpi')) ||
                      (record.journal_title && API_MDPI_JOURNALS_REGEX.test(record.journal_title))
                    ) {
                      isMdpiFromApi = true;
                      // console.log(`%c[MDPI Filter API] Marked as MDPI (Other - No DOI in record): ${idType.toUpperCase()} ${idThisRecordIsFor} (Journal: ${record.journal_title}, Publisher: ${record.publisher_name})`, 'color: blue');
                    } else {
                      isMdpiFromApi = false;
                    }
                  }
                  runCache.set(idThisRecordIsFor, isMdpiFromApi);
                  if (isMdpiFromApi) {
                    foundMdpiInThisBatch = true;
                  }
                }
              });
            }
            // Ensure all IDs *queried in this specific batch* get an entry in the cache,
            // even if they weren't in the API response (e.g. invalid IDs).
            batchIdsToQuery.forEach(id => {
              if (!runCache.has(id)) {
                runCache.set(id, false);
              }
            });

            if (foundMdpiInThisBatch) {
              overallFoundMdpiInBatches = true;
            }
          } else {
            console.warn(`[MDPI Filter API] NCBI API request failed for batch ${idType.toUpperCase()}s (starting with ${batchIdsToQuery[0]}): ${response.status} - URL: ${apiUrl}`);
            // Cache all IDs in this failed batch as false
            batchIdsToQuery.forEach(id => runCache.set(id, false));
          }
        } catch (error) {
          console.error(`[MDPI Filter API] Error fetching batch from NCBI API for ${idType.toUpperCase()}s (starting with ${batchIdsToQuery[0]}):`, error, `URL: ${apiUrl}`);
          // Cache all IDs in this failed batch as false
          batchIdsToQuery.forEach(id => runCache.set(id, false));
        }
      }

      // The function should return true if any MDPI ID was found in the processed batches
      // OR if any of the original input 'ids' are now marked as true in the cache
      // (this covers cases where some IDs might have been in cache before the call).
      return overallFoundMdpiInBatches || ids.some(id => runCache.get(id) === true);
    }

    const isMdpiItemByContent = (item, runCache) => {
      if (!item) return false;
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

      const isMdpiDoi = (doi) => doi && doi.startsWith(MDPI_DOI);
      const extractDoiFromLink = (href) => {
        if (!href) return null;
        const doiMatch = href.match(/\b(10\.\d{4,9}\/[^"\s'&<>]+)\b/i); // Avoid matching HTML entities in DOIs
        return doiMatch ? doiMatch[1] : null;
      };

      // Priority 1: DOI Check (from links)
      let hasNonMdpiDoiLink = false;
      let hasMdpiDoiLink = false;

      for (const link of allLinksInItem) {
        const doiInLink = extractDoiFromLink(link.href);
        if (doiInLink) {
          if (isMdpiDoi(doiInLink)) {
            hasMdpiDoiLink = true;
            break; 
          } else {
            hasNonMdpiDoiLink = true; 
          }
        }
      }

      if (hasMdpiDoiLink) {
        // console.log('[MDPI Filter] Decision: MDPI (Priority 1: MDPI DOI in link)');
        return true;
      }
      if (hasNonMdpiDoiLink) { // No MDPI DOI link found, but at least one non-MDPI DOI link was found
        // console.log('[MDPI Filter] Decision: NOT MDPI (Priority 1: Non-MDPI DOI in link, no MDPI DOI link)');
        return false;
      }
      // If we reach here, no DOI links of any kind were found in the item.

      // Priority 2: MDPI DOI String in Text Content
      const mdpiDoiTextPattern = new RegExp(MDPI_DOI.replace(/\./g, '\\.') + "\/[^\\s\"'<>&]+", "i");
      if (mdpiDoiTextPattern.test(textContent)) {
        // console.log('[MDPI Filter] Decision: MDPI (Priority 2: MDPI DOI string in text)');
        return true;
      }

      // Priority 3: Direct MDPI Domain Link Check
      for (const link of allLinksInItem) {
        if (link.href && link.href.includes(MDPI_DOMAIN)) {
          // console.log('[MDPI Filter] Decision: MDPI (Priority 3: Direct MDPI domain link)');
          return true;
        }
      }

      // Priority 4: PMID/PMCID to DOI Conversion Check (via runCache)
      let pmcIdStrings = new Set();
      let pmidStrings = new Set();
      for (const link of allLinksInItem) {
        if (link.href) {
          const pmcMatch = link.href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+(\.\d+)?)/i);
          if (pmcMatch && pmcMatch[1]) {
            pmcIdStrings.add(pmcMatch[1].replace(/\.\d+$/, ''));
          } else {
            const pmidMatch = link.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
            if (pmidMatch && pmidMatch[1]) {
              pmidStrings.add(pmidMatch[1]);
            }
          }
        }
      }

      const allItemNcbiIds = [...pmidStrings, ...pmcIdStrings];
      let itemHasNcbiIds = allItemNcbiIds.length > 0;
      let allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = true;
      let atLeastOneIdNotInCacheOrFailed = false;

      if (itemHasNcbiIds) {
        for (const id of allItemNcbiIds) {
          if (runCache.has(id)) {
            if (runCache.get(id) === true) { // API indicated MDPI
              // console.log('[MDPI Filter] Decision: MDPI (Priority 4: PMID/PMCID resolved to MDPI via API cache)');
              return true;
            } else {
              // runCache.get(id) is false, API indicated NOT MDPI for this ID.
              // This specific ID does not make the item MDPI.
            }
          } else {
            // This ID was not in the cache. API service might have failed for it or it wasn't processed.
            atLeastOneIdNotInCacheOrFailed = true;
            allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false;
          }
        }
        // If loop completes, no ID was cached as MDPI.
        // Now check if all IDs were definitively non-MDPI.
        if (allCheckedIdsWereInCacheAndDefinitivelyNonMdpi) {
          // console.log('[MDPI Filter] Decision: NOT MDPI (Priority 4: All PMIDs/PMCIDs in item resolved to non-MDPI via API cache)');
          return false;
        }
        // If atLeastOneIdNotInCacheOrFailed is true, it means API results were inconclusive for some IDs. Fall through.
      }
      // Fall through if no NCBI IDs in item, or if API results were inconclusive for some IDs.

      // Priority 5: Journal Name Check (Last Resort)
      // Using existing M_JOURNALS_STRONG and M_JOURNALS_WEAK logic from your code.
      // The user requested this to be the last resort and decisive if reached.
      const M_JOURNALS_STRONG = ['Int J Mol Sci', 'IJMS'];
      const M_JOURNALS_WEAK = ['Nutrients', 'Molecules'];


      const strongJournalRegex = new RegExp(`\\b(${M_JOURNALS_STRONG.map(j => j.replace('.', '\\.')).join('|')})\\b`, 'i');
      if (strongJournalRegex.test(innerHTML)) {
        // console.log('[MDPI Filter] Decision: MDPI (Priority 5: Strong MDPI journal name)');
        return true;
      }

      const weakJournalRegex = new RegExp(`\\b(${M_JOURNALS_WEAK.map(j => j.replace('.', '\\.')).join('|')})\\b`, 'i');
      if (weakJournalRegex.test(innerHTML)) {
        // console.log('[MDPI Filter] Decision: MDPI (Priority 5: Weak MDPI journal name - now considered MDPI)');
        return true;
      }

      // console.log('[MDPI Filter] Decision: NOT MDPI (Fell through all checks)');
      return false;
    };

    const extractReferenceData = (item) => {
      let internalScrollId = item.dataset.mdpiFilterRefId; // Renamed from refId for clarity
      if (!internalScrollId) {
        internalScrollId = `mdpi-ref-${refIdCounter++}`;
        item.dataset.mdpiFilterRefId = internalScrollId;
      }
      
      const listItemDomId = item.id; // Capture the actual DOM ID of the list item, e.g., "CR35"

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

      // 2. Try to parse from ID (listItemDomId or parent's ID)
      if (number === null) {
        let idSourceElement = item; 
        if (item.matches && item.matches('div.citation, div.citation-content') && item.parentElement && item.parentElement.id) {
            idSourceElement = item.parentElement;
        } else if (!item.id && item.closest) { 
            const closestWithRefId = item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"], [id^="CR"], [id^="B"]');
            if (closestWithRefId) {
                idSourceElement = closestWithRefId;
            }
        }
        
        // Use idSourceElement.id, which could be listItemDomId if item has an ID, or an ancestor's ID
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
      
      console.log(`%c[extractReferenceData - ${internalScrollId}] DOM ID: ${listItemDomId || 'N/A'}, FP: ${fingerprint.substring(0,50)}... Num: ${number} (Source: ${numberSource}), Text: "${text.substring(0, 30)}..."`, 'color: green;');
      return { 
        id: internalScrollId, // Internal ID like "mdpi-ref-0"
        listItemDomId: listItemDomId, // Actual DOM ID like "CR35"
        number, 
        text, 
        link, 
        rawHTML: sanitize(item.innerHTML), 
        fingerprint, 
        numberSource 
      };
    };

    // This is the definition of processAllReferences that should be kept
    function processAllReferences(runCache) {
      // console.log("[MDPI Filter] processAllReferences STARTING");
      const items = document.querySelectorAll(referenceListSelectors);
      // console.log(`[MDPI Filter] Found ${items.length} potential reference items.`);

      items.forEach(item => {
        // Prevent processing known dynamic elements like MediaWiki's UTCLiveClock
        // Common IDs for UTCLiveClock are 'utcdate' or 'pt-utcdate' (often within an <li>)
        if (item.id === 'utcdate' || item.closest('#utcdate') || item.id === 'pt-utcdate' || item.closest('#pt-utcdate')) {
          // console.log("[MDPI Filter] Skipping UTCLiveClock-related element to prevent interference:", item);
          return; // Skip this item
        }

        if (isMdpiItemByContent(item, runCache)) {
          const refId = `mdpi-ref-${refIdCounter++}`;
          collectedMdpiReferences.push(extractReferenceData(item)); // Store data before styling
          styleRef(item, refId); // Style the reference item itself
          // No need to call styleSearch here as it's for search result pages, not reference lists.
        }
      });
      // console.log("[MDPI Filter] processAllReferences FINISHED");
    }

    const updateBadgeAndReferences = () => {
      // Create a unique set of references based on fingerprint for the popup list
      const uniqueFingerprints = new Set();
      const uniqueDisplayReferences = [];
      collectedMdpiReferences.forEach(ref => {
        if (ref && ref.fingerprint && !uniqueFingerprints.has(ref.fingerprint)) {
          uniqueFingerprints.add(ref.fingerprint);
          uniqueDisplayReferences.push(ref);
        } else if (!ref || !ref.fingerprint) {
          // console.warn('[MDPI Filter CS] Skipping ref in updateBadgeAndReferences due to missing fingerprint:', ref);
        }
      });

      const sortedReferences = uniqueDisplayReferences.sort((a, b) => { // Sort the unique ones
        if (a.number !== null && b.number === null) return -1;
        if (a.number === null && b.number !== null) return 1;
        if (a.number !== null && b.number !== null) {
          if (a.number !== b.number) {
            return a.number - b.number;
          }
        }
        const numA = parseInt(a.id.split('-').pop(), 10);
        const numB = parseInt(b.id.split('-').pop(), 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.id.localeCompare(b.id);
      });
      
      const badgeCount = sortedReferences.length; 

      console.log(`%c[MDPI Filter CS] Preparing to send mdpiUpdate. BadgeCount: ${badgeCount}, SortedReferences length: ${sortedReferences.length}`, 'color: green; font-weight: bold;', sortedReferences.slice(0, 5)); // Log first 5
      
      chrome.runtime.sendMessage({
        type: 'mdpiUpdate',
        count: badgeCount,
        references: sortedReferences     
      }, response => {
        if (chrome.runtime.lastError) {
          console.error('[MDPI Filter CS] Error sending mdpiUpdate message:', chrome.runtime.lastError.message);
        } else {
          // console.log('[MDPI Filter CS] mdpiUpdate message sent, response:', response);
        }
      });
    };

    // Debounced version for progressive updates
    const debouncedUpdateBadgeAndReferences = debounce(updateBadgeAndReferences, 300);


    async function runAll(source = "initial") {
      const startTime = new Date();
      // ... (rest of runAll initialization) ...
      // console.log(`[MDPI Filter] runAll STARTING... Source: ${source}, Time: ${startTime.toISOString()}`);

      if (isProcessing && source !== "initial_force") {
        // console.log('[MDPI Filter] Already processing, skipping runAll for source:', source);
        return;
      }
      isProcessing = true;

      if (source === "initial load" || source === "main observer" || source === "initial_force") {
        // console.log(`[MDPI Filter] Clearing all references and resetting counter for full re-scan due to source: ${source}`);
        collectedMdpiReferences = [];
        mdpiRefCounter = 0; // Reset the global counter for mdpi-ref-X IDs
        // Clear existing highlights/modifications if doing a full rescan
        clearPreviousHighlights();
      }
      
      const runCache = new Map();

      // --- Step 1: Pre-fetch all NCBI IDs ---
      const allPotentialItemsForNcbiScan = document.querySelectorAll(referenceListSelectors);
      let allPmcidsToFetch = new Set();
      let allPmidsToFetch = new Set();

      allPotentialItemsForNcbiScan.forEach(item => {
        // ... (ID extraction logic as before) ...
      });

      // console.log("[MDPI Filter] NCBI Pre-scan - PMIDs to fetch:", Array.from(allPmidsToFetch));
      // console.log("[MDPI Filter] NCBI Pre-scan - PMCIDs to fetch:", Array.from(allPmcidsToFetch));

      // Perform NCBI checks if any IDs were found
      const pmidArray = Array.from(allPmidsToFetch);
      const pmcidArray = Array.from(allPmcidsToFetch);

      // Batch API calls
      const pmidCheckPromise = pmidArray.length > 0 ? checkNcbiIdsForMdpi(pmidArray, 'pmid', runCache) : Promise.resolve(false);
      const pmcidCheckPromise = pmcidArray.length > 0 ? checkNcbiIdsForMdpi(pmcidArray, 'pmcid', runCache) : Promise.resolve(false);
      
      try {
        await Promise.all([pmidCheckPromise, pmcidCheckPromise]);
        // console.log('[MDPI Filter] NCBI ID checks completed. RunCache populated:', runCache.size > 0 ? Object.fromEntries(runCache) : 'empty');

        // --- Step 2: Process and style references ---
        processAllReferences(runCache); // This will now call debouncedUpdateBadgeAndReferences internally

        // --- Step 3: Process direct MDPI links on the page ---
        processDirectMdpiLinks();

        // --- Step 4: Style inline footnotes ---
        styleInlineFootnotes(collectedMdpiReferences); // Pass collected references

        // --- Step 5: Final update to badge and references ---
        // This ensures that even if processAllReferences found nothing (so debounced didn't fire),
        // or if there are pending debounced calls, a final accurate state is sent.
        updateBadgeAndReferences(); // Final call

      } catch (error) {
        console.error('[MDPI Filter] Error in runAll main processing:', error);
      } finally {
        isProcessing = false;
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        // The 'unique' here refers to a different set, let's clarify or remove if not used for badge
        console.log(`[MDPI Filter] runAll FINISHED. Source: ${source}, collected (raw): ${collectedMdpiReferences.length}, Time: ${endTime.toISOString()}, Duration: ${duration.toFixed(2)}s`);
      }
    }

    function processAllReferences(runCache) {
      // console.log("[MDPI Filter] processAllReferences STARTING");
      const items = document.querySelectorAll(referenceListSelectors);
      // console.log(`[MDPI Filter] Found ${items.length} potential reference items using selectors: ${referenceListSelectors}`);
      let foundInLoop = 0;
      items.forEach(item => {
        if (item.id === 'utcdate' || item.closest('#utcdate') || item.id === 'pt-utcdate' || item.closest('#pt-utcdate')) {
          return;
        }
        if (isMdpiItemByContent(item, runCache)) {
          const referenceData = extractReferenceData(item);
          if (referenceData) { // Ensure data was extracted
            collectedMdpiReferences.push(referenceData); // Add to global list
            styleRef(item, referenceData.id);
            foundInLoop++;
            debouncedUpdateBadgeAndReferences(); // Progressive update
          }
        }
      });
      // console.log(`[MDPI Filter] processAllReferences FINISHED. Found and styled ${foundInLoop} items in this pass.`);
    }

    const updateBadgeAndReferencesOld = () => {
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
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
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
      // console.log('[MDPI Filter CS] Styling inline footnotes. Collected MDPI refs:', collectedMdpiReferences.length);
      if (collectedMdpiReferences.length === 0) return;

      const styledInlineRefs = new Set(); // Prevent styling the same inline ref multiple times

      collectedMdpiReferences.forEach(refData => {
        // Use listItemDomId for matching against page elements' attributes like href, data-rid.
        // This ID comes directly from the reference list item (e.g., "CR35").
        if (!refData || !refData.listItemDomId || refData.listItemDomId.trim() === "") {
          // console.warn("[MDPI Filter CS] Skipping inline style: Invalid refData or missing/empty listItemDomId.", refData);
          return;
        }
        const refId = refData.listItemDomId; // Changed from idToMatch to refId
        // console.log(`[MDPI Filter CS] Processing inline footnotes for listItemDomId: ${refId} (Internal scroll ID: ${refData.id})`);

        // Selectors for common inline citation patterns
        const commonSelectors = [
          `a[href="#${refId}"]`,                        // Standard anchor link
          // Handling for Wikipedia: refId might be "Foo_Bar_2023" or "1"
          // If refId is purely numeric, cite_note-X is common.
          // If refId is complex, direct href match is more likely.
          `a[href="#cite_note-${refId}"]`,
          // Try to get base part for wiki links, e.g. "Foo_Bar_2023" from "cite_note-Foo_Bar_2023-1"
          // or "1" from "cite_note-1"
          `a[href="#cite_note-${refId.replace(/^cite_note-/i, '').split(/[^a-zA-Z0-9_.:-]+/)[0]}"]`,
          `a[href="#ref-${refId}"]`,                   // Common ref prefix
          `a[href="#reference-${refId}"]`,             // Common reference prefix
          // Handle cases where refId might be "B1" and link is "#B1" or refId is "1" and link is "#B1"
          `a[href="#B${refId.replace(/^B/i, '')}"]`,   // NCBI Bxx style
          `a[href="#CR${refId.replace(/^CR/i, '')}"]`, // Springer style
          // ADDED FOR TANDFONLINE and similar sites using data-rid or data-bris-rid
          `a[data-rid="${refId}"]`,
          `a[data-bris-rid="${refId}"]`
        ];

        const numericRefIdPart = refId.replace(/\D/g, ''); // e.g., "35" from "CR35"
        if (numericRefIdPart) {
            commonSelectors.push(`a[href="#cite_note-${numericRefIdPart}"]`);
            commonSelectors.push(`a[href="#ref-${numericRefIdPart}"]`);
            commonSelectors.push(`a[href="#reference-${numericRefIdPart}"]`);
            commonSelectors.push(`a[href="#B${numericRefIdPart}"]`);
            commonSelectors.push(`a[href="#CR${numericRefIdPart}"]`);
            // Potentially add `a[data-rid="${numericRefIdPart}"]` if some sites use numeric data-rid
        }

        const supParentSelectors = [
          `sup a[href="#${refId}"]`,
          `sup a[href="#cite_note-${refId}"]`,
          `sup a[href="#cite_note-${refId.replace(/^cite_note-/i, '').split(/[^a-zA-Z0-9_.:-]+/)[0]}"]`,
          `sup a[href="#ref-${refId}"]`,
          `sup a[href="#reference-${refId}"]`,
          `sup a[href="#B${refId.replace(/^B/i, '')}"]`,
          `sup a[href="#CR${refId.replace(/^CR/i, '')}"]`,
          `sup[id="ref${refId}"]`,
          `sup a[data-rid="${refId}"]`,
          `sup a[data-bris-rid="${refId}"]`
        ];
         if (numericRefIdPart) {
            supParentSelectors.push(`sup a[href="#cite_note-${numericRefIdPart}"]`);
            supParentSelectors.push(`sup a[href="#ref-${numericRefIdPart}"]`);
            supParentSelectors.push(`sup a[href="#reference-${numericRefIdPart}"]`);
            supParentSelectors.push(`sup a[href="#B${numericRefIdPart}"]`);
            supParentSelectors.push(`sup a[href="#CR${numericRefIdPart}"]`);
            supParentSelectors.push(`sup[id="ref-${numericRefIdPart}"]`);
        }

        const allSelectorsString = [...new Set([...commonSelectors, ...supParentSelectors])].join(', ');
        // console.log(`[MDPI Filter CS] Querying inline for listItemDomId '${refId}' (numeric: '${numericRefIdPart}') with: ${allSelectorsString}`);

        try {
          document.querySelectorAll(allSelectorsString).forEach(el => {
            let targetElementToStyle = el; 

            if (el.tagName.toLowerCase() === 'sup') {
              targetElementToStyle = el;
            } else if (el.tagName.toLowerCase() === 'a') {
              const directSupParent = el.parentElement;
              if (directSupParent && directSupParent.tagName.toLowerCase() === 'sup') {
                targetElementToStyle = directSupParent;
              } else {
                targetElementToStyle = el; 
              }
            }

            if (targetElementToStyle && !styledInlineRefs.has(targetElementToStyle)) {
              // console.log(`[MDPI Filter CS] Styling inline for ${refId}:`, targetElementToStyle);
              styleSup(targetElementToStyle); 
              styledInlineRefs.add(targetElementToStyle);
            } else if (targetElementToStyle && styledInlineRefs.has(targetElementToStyle)) {
              // console.log(`[MDPI Filter CS] Already styled inline element for ref ${refId}:`, targetElementToStyle);
            }
          });
        } catch (error) {
          // console.error(`[MDPI Filter CS] Error querying/styling inline footnotes for listItemDomId ${refId} ('${allSelectorsString}'):`, error);
        }
      });
      // console.log('[MDPI Filter CS] Finished styling inline footnotes.');
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
            // const innerHTML = item.innerHTML || ''; // innerHTML not directly used for ID extraction here

            // --- Extract PMIDs and PMCIDs from links (more robust, prioritized) ---
            item.querySelectorAll('a[href]').forEach(link => {
                const href = link.href;

                // PubMed links for PMIDs
                const pmidLinkMatch = href.match(/pubmed\/(\d{7,8})/);
                if (pmidLinkMatch && pmidLinkMatch[1]) {
                    const numericId = parseInt(pmidLinkMatch[1], 10);
                    if (!isNaN(numericId) && numericId > 0) {
                        allPmidsToFetch.add(numericId.toString()); // Add normalized ID
                    }
                }

                // PMC links for PMCIDs
                const pmcLinkMatch = href.match(/pmc\/articles\/PMC(\d{7,})/i); // Added 'i' for case-insensitivity
                if (pmcLinkMatch && pmcLinkMatch[1]) {
                    const pmcIdOnly = pmcLinkMatch[1];
                    if (/^\d+$/.test(pmcIdOnly)) { // Basic validation (digits only)
                        allPmcidsToFetch.add(pmcIdOnly); // PMC IDs are typically stored as is after "PMC"
                    }
                }
            });

            // --- Extract PMIDs and PMCIDs from text content (fallback/complementary) ---

            // PMCIDs from text (e.g., "PMC1234567")
            const pmcMatchesText = textContent.match(/PMC\d{7,}/gi); // Added 'i' for case-insensitivity
            if (pmcMatchesText) {
                pmcMatchesText.forEach(pmcString => {
                    const pmcIdOnly = pmcString.substring(3);
                    if (/^\d+$/.test(pmcIdOnly)) {
                        allPmcidsToFetch.add(pmcIdOnly);
                    }
                });
            }

            // PMIDs from text (with improved regex and normalization)
            // Looks for 7 or 8 digit numbers not immediately part of a DOI-like structure or other numbers.
            const pmidTextRegex = /(?<![\d./-])\b(\d{7,8})\b(?![\d.-])/g;
            let pmidTextMatch;
            while ((pmidTextMatch = pmidTextRegex.exec(textContent)) !== null) {
                const capturedId = pmidTextMatch[1];
                const numericId = parseInt(capturedId, 10);
                if (!isNaN(numericId) && numericId > 0) {
                    // Avoid adding if it's likely part of a DOI found in text,
                    // though the regex itself should largely prevent this.
                    // For simplicity, we'll rely on the regex and normalization for now.
                    allPmidsToFetch.add(numericId.toString());
                }
            }
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
