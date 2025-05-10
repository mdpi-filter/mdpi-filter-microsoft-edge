// content/content_script.js

if (!window.mdpiFilterInjected) {
  // console.log("[MDPI Filter CS] Attempting to inject content script...");

  // --- Comprehensive Dependency Checks ---
  let dependenciesMet = true;
  const missingDependencies = [];

  if (typeof window.MDPIFilterDomains === 'undefined') {
    missingDependencies.push("MDPIFilterDomains (from domains.js)");
    dependenciesMet = false;
  }
  if (typeof window.sanitize === 'undefined') {
    missingDependencies.push("sanitize (from sanitizer.js)");
    dependenciesMet = false;
  }
  if (typeof window.debounce === 'undefined') {
    missingDependencies.push("debounce (from utils.js)");
    dependenciesMet = false;
  }
  if (typeof window.MDPIFilterReferenceSelectors === 'undefined') {
    missingDependencies.push("MDPIFilterReferenceSelectors (from reference_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterUtils || typeof window.MDPIFilterUtils.generateInlineFootnoteSelectors === 'undefined') {
    missingDependencies.push("MDPIFilterUtils.generateInlineFootnoteSelectors (from inline_footnote_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterUtils || typeof window.MDPIFilterUtils.styleInlineFootnotes === 'undefined') {
    missingDependencies.push("MDPIFilterUtils.styleInlineFootnotes (from inline_footnote_styler.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterCitedBy || !window.MDPIFilterCitedBy.Selectors || typeof window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS === 'undefined') {
    missingDependencies.push("MDPIFilterCitedBy.Selectors.ITEM_SELECTORS (from cited_by_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterCitedBy || !window.MDPIFilterCitedBy.Styler || typeof window.MDPIFilterCitedBy.Styler.styleItem === 'undefined') {
    missingDependencies.push("MDPIFilterCitedBy.Styler.styleItem (from cited_by_styler.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterCitedBy || !window.MDPIFilterCitedBy.Processor || typeof window.MDPIFilterCitedBy.Processor.processEntries === 'undefined') {
    missingDependencies.push("MDPIFilterCitedBy.Processor.processEntries (from cited_by_processor.js)");
    dependenciesMet = false;
  }
  // Add check for the new link extraction selectors array
  if (typeof window.MDPIFilterLinkExtractionSelectors === 'undefined' || !Array.isArray(window.MDPIFilterLinkExtractionSelectors)) {
    missingDependencies.push("MDPIFilterLinkExtractionSelectors (from link_extraction_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterLinkExtractor || typeof window.MDPIFilterLinkExtractor.extractPrimaryLink !== 'function') {
    missingDependencies.push("MDPIFilterLinkExtractor.extractPrimaryLink (from link_extractor.js)");
    dependenciesMet = false;
  }

  if (!dependenciesMet) {
    console.error("[MDPI Filter CS] CRITICAL: Halting script. The following dependencies were not met:", missingDependencies.join(', '));
  } else {
    window.mdpiFilterInjected = true;
    // console.log("[MDPI Filter CS] All dependencies met. Content script executing (mdpiFilterInjected set).");

    // --- Constants, Selectors, State ---
    const MDPI_DOMAIN = 'mdpi.com';
    const MDPI_DOI    = '10.3390';
    const MDPI_DOI_REGEX = new RegExp(MDPI_DOI.replace(/\./g, '\\.') + "/[^\\s\"'<>&]+", "i");
    const domains     = window.MDPIFilterDomains || {};
    const sanitize    = window.sanitize || (html => html);
    // Use the selectors from the new file
    const referenceListSelectors = window.MDPIFilterReferenceSelectors; 
    const uniqueMdpiReferences = new Set();
    let collectedMdpiReferences = []; // Array to store detailed reference info
    let refIdCounter = 0; // Counter for unique reference IDs

    // Declare mainObserverInstance in a scope accessible by runAll and setupMainObserver
    let mainObserverInstance = null;

    // ---

    // Helper function to determine if the current page is a search engine results page
    const isSearchEnginePage = () => {
      const hostname = window.location.hostname;
      return domains && domains.searchEngineDomains && Array.isArray(domains.searchEngineDomains) &&
             domains.searchEngineDomains.some(domain => hostname.includes(domain));
    };

    chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
      console.log('%c MDPI FILTER EXTENSION SCRIPT LOADED AND CONTEXT SELECTED! CHECK HERE! ', 'background: yellow; color: black; font-size: 16px; font-weight: bold;');
      // console.log("[MDPI Filter] Mode:", mode);

      // --- Global Persistent Cache for NCBI API responses ---
      const ncbiApiCache = new Map(); // Stores ID (string) -> isMDPI (boolean)
      // --- Cache for processed citation items to avoid re-evaluating their MDPI status ---
      const citationProcessCache = new WeakMap(); // Stores Element -> isMDPI (boolean)
      // ---

      // Helper function to decode URLs within a string
      function decodeUrlsInString(str) {
        if (!str || typeof str !== 'string') return str;
        // Regex to find URLs
        const urlRegex = /(https?:\/\/[^\s"'>]+)/g;
        return str.replace(urlRegex, (url) => {
            try {
                // Decode the matched URL part
                return decodeURIComponent(url);
            } catch (e) {
                // This warning is active from the previous step.
                console.warn(`[MDPI Filter CS] Failed to decode URL part in decodeUrlsInString: ${url}`, e); 
                return url; // Return original URL part if decoding fails
            }
        });
      }

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

      const styleRef = (item, refId) => {
        item.dataset.mdpiFilterRefId = refId; // Assign refId for scrolling to the main item

        let textStylingTarget = item; // Default to styling the item itself

        // Special handling for Cambridge Core structure to style the inner content
        // The 'item' here is div.circle-list__item[id^="r"]
        if (item.matches && item.matches('div.circle-list__item[id^="r"]')) {
          const contentElement = item.querySelector('div.circle-list__item__grouped__content');
          if (contentElement) {
            textStylingTarget = contentElement; // Target the inner div for text color
          }
        }
        
        // Apply color to the determined target for the reference text
        textStylingTarget.style.color = '#E2211C';

        // Existing logic to style a preceding reference number (e.g., a leading span)
        // This part handles cases where the number is a sibling element before the main text.
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

      const styleDirectLink = (elementToStyle) => {
        if (!elementToStyle) return;

        if (elementToStyle && elementToStyle.tagName === 'A') {
          // This is a general MDPI link (not a "Cited by" LI container)
          let textDisplayElement = elementToStyle; 
          let borderTargetElement = elementToStyle; 

          const h3Ancestor = elementToStyle.closest('h3');
          if (h3Ancestor) {
            textDisplayElement = h3Ancestor; // Color the H3
          }

          const anchorTextSpan = elementToStyle.querySelector('.anchor-text, .title, span');
          if (anchorTextSpan) {
            borderTargetElement = anchorTextSpan; // Border the span
          }
          
          textDisplayElement.style.color = '#E2211C';
          if (window.getComputedStyle(textDisplayElement).display === 'inline') {
            textDisplayElement.style.display = 'inline-block';
          }

          borderTargetElement.style.borderBottom = '1px dotted #E2211C';
          if (borderTargetElement !== textDisplayElement) { 
              borderTargetElement.style.color = '#E2211C'; 
          }
          if (window.getComputedStyle(borderTargetElement).display === 'inline') {
            borderTargetElement.style.display = 'inline-block';
          }
        }
        // else: unhandled element type or context, do nothing
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

        const idsToQueryApi = [];
        // First, check the persistent ncbiApiCache
        ids.forEach(id => {
          if (ncbiApiCache.has(id)) {
            runCache.set(id, ncbiApiCache.get(id)); // Populate current runCache from persistent cache
          } else {
            idsToQueryApi.push(id); // This ID needs to be fetched
          }
        });

        if (idsToQueryApi.length === 0) {
          // All IDs were found in the persistent cache.
          // Check if any of the original IDs (now in runCache) are MDPI.
          return ids.some(id => runCache.get(id) === true);
        }

        const BATCH_SIZE = 20;
        let overallFoundMdpiInBatches = false;

        for (let i = 0; i < idsToQueryApi.length; i += BATCH_SIZE) {
          const batchIdsToQuery = idsToQueryApi.slice(i, i + BATCH_SIZE);
          if (batchIdsToQuery.length === 0) {
            continue;
          }

          const idsString = batchIdsToQuery.join(',');
          const encodedIdType = encodeURIComponent(idType);
          const toolName = 'MDPIFilterChromeExtension';
          const maintainerEmail = 'dicing_nastily314@aleeas.com';
          const encodedToolName = encodeURIComponent(toolName);
          const encodedMaintainerEmail = encodeURIComponent(maintainerEmail);
          const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${idsString}&idtype=${encodedIdType}&format=json&versions=no&tool=${encodedToolName}&email=${encodedMaintainerEmail}`;

          try {
            const response = await fetch(apiUrl);
            if (response.ok) {
              const data = await response.json();
              let foundMdpiInThisBatch = false;
              if (data.records && data.records.length > 0) {
                data.records.forEach(record => {
                  const idThisRecordIsFor = record.requested_id;
                  let isMdpiFromApi = false;

                  if (idThisRecordIsFor && batchIdsToQuery.includes(idThisRecordIsFor)) {
                    if (record.doi) {
                      isMdpiFromApi = record.doi.startsWith(MDPI_DOI);
                    } else {
                      const API_MDPI_JOURNALS_REGEX = /\b(Int J Mol Sci|IJMS|Nutrients|Molecules)\b/i;
                      isMdpiFromApi = (
                        (record.publisher_name && record.publisher_name.toLowerCase().includes('mdpi')) ||
                        (record.copyright && record.copyright.toLowerCase().includes('mdpi')) ||
                        (record.journal_title && API_MDPI_JOURNALS_REGEX.test(record.journal_title))
                      );
                    }
                    runCache.set(idThisRecordIsFor, isMdpiFromApi);
                    ncbiApiCache.set(idThisRecordIsFor, isMdpiFromApi); // Store in persistent API cache
                    if (isMdpiFromApi) {
                      foundMdpiInThisBatch = true;
                    }
                  }
                });
              }
              // Ensure all IDs *queried in this specific batch* get an entry in both caches,
              // even if they weren't in the API response (e.g. invalid IDs).
              batchIdsToQuery.forEach(id => {
                if (!runCache.has(id)) { // If an ID in the batch wasn't in the response
                  runCache.set(id, false);
                  ncbiApiCache.set(id, false); // Also update persistent API cache
                }
              });

              if (foundMdpiInThisBatch) {
                overallFoundMdpiInBatches = true;
              }
            } else {
              // console.warn(`[MDPI Filter API] NCBI API request failed for batch ${idType.toUpperCase()}s (starting with ${batchIdsToQuery[0]}): ${response.status}`);
              batchIdsToQuery.forEach(id => {
                runCache.set(id, false);
                ncbiApiCache.set(id, false); // Cache failure as false in persistent API cache
              });
            }
          } catch (error) {
            // console.error(`[MDPI Filter API] Error fetching batch from NCBI API for ${idType.toUpperCase()}s (starting with ${batchIdsToQuery[0]}):`, error);
            batchIdsToQuery.forEach(id => {
              runCache.set(id, false);
              ncbiApiCache.set(id, false); // Cache error as false in persistent API cache
            });
          }
        }
        // After processing API calls, check all original input 'ids' against the now populated runCache.
        return ids.some(id => runCache.get(id) === true);
      }

      // Internal function containing the original logic of isMdpiItemByContent
      const isMdpiItemByContentInternal = (item, runCache) => {
        if (!item) return false;
        const textContent = item.textContent || '';
        const innerHTML = item.innerHTML || '';
        const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));

        const isMdpiDoi = (doi) => doi && doi.startsWith(MDPI_DOI);
        const extractDoiFromLink = (hrefAttribute) => {
          if (!hrefAttribute) return null;
          let targetUrl = hrefAttribute;
          try {
            const base = hrefAttribute.startsWith('/') ? window.location.origin : undefined;
            const urlObj = new URL(hrefAttribute, base);
            if (urlObj.searchParams.has('url')) {
              targetUrl = decodeURIComponent(urlObj.searchParams.get('url'));
            } else if (urlObj.searchParams.has('doi')) {
              const doiParam = decodeURIComponent(urlObj.searchParams.get('doi'));
              if (!doiParam.toLowerCase().startsWith('http') && doiParam.includes('/')) {
                targetUrl = `https://doi.org/${doiParam}`;
              } else {
                targetUrl = doiParam;
              }
            }
          } catch (e) { /* console.warn('[MDPI Filter] Error parsing URL in extractDoiFromLink:', hrefAttribute, e); */ }
          const doiMatch = targetUrl.match(/\b(10\.\d{4,9}\/[^"\s'&<>]+)\b/i);
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

        // Priority 2: MDPI DOI String in Text Content
        if (hasMdpiDoiLink) return true;
        if (hasNonMdpiDoiLink) return false;

        const mdpiDoiTextPattern = new RegExp(MDPI_DOI.replace(/\./g, '\\.') + "\/[^\\s\"'<>&]+", "i");
        if (mdpiDoiTextPattern.test(textContent)) return true;

        for (const link of allLinksInItem) {
          if (link.href && link.href.includes(MDPI_DOMAIN)) return true;
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
        let allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = true; // Assume true until an ID is not 'false' or not in cache

        if (itemHasNcbiIds) {
          for (const id of allItemNcbiIds) {
            if (runCache.has(id)) {
              if (runCache.get(id) === true) return true; // API indicated MDPI
              // If runCache.get(id) is false, it's non-MDPI, continue checking others.
            } else {
              allCheckedIdsWereInCacheAndDefinitivelyNonMdpi = false; // An ID wasn't in cache, so cannot be sure all are non-MDPI
            }
          }
          if (allCheckedIdsWereInCacheAndDefinitivelyNonMdpi) return false; // All NCBI IDs present were resolved to non-MDPI
        }

        const M_JOURNALS_STRONG = ['Int J Mol Sci', 'IJMS'];
        const M_JOURNALS_WEAK = ['Nutrients', 'Molecules'];
        const strongJournalRegex = new RegExp(`\\b(${M_JOURNALS_STRONG.map(j => j.replace('.', '\\.')).join('|')})\\b`, 'i');
        if (strongJournalRegex.test(innerHTML)) return true;
        const weakJournalRegex = new RegExp(`\\b(${M_JOURNALS_WEAK.map(j => j.replace('.', '\\.')).join('|')})\\b`, 'i');
        if (weakJournalRegex.test(innerHTML)) return true;

        return false; // Default if no MDPI criteria met
      };

      // Wrapper function for isMdpiItemByContent that uses the citationProcessCache
      const isMdpiItemByContent = (item, runCache) => {
        if (!item) return false; // Cannot cache null/undefined item

        // Check cache first
        if (citationProcessCache.has(item)) {
          return citationProcessCache.get(item);
        }

        // If not in cache, run the internal logic
        const result = isMdpiItemByContentInternal(item, runCache);

        // Store the result in the cache
        citationProcessCache.set(item, result);
        return result;
      };

      const extractReferenceData = (item) => {
        let internalScrollId = item.dataset.mdpiFilterRefId; // Renamed from refId for clarity
        if (!internalScrollId) {
          internalScrollId = `mdpi-ref-${refIdCounter++}`;
          item.dataset.mdpiFilterRefId = internalScrollId;
        }
        
        // Capture the actual DOM ID of the list item, or use data-bib-id as a fallback for linking,
        // particularly for Wiley sites where inline links use href="#[data-bib-id value]".
        const listItemDomId = item.id || item.dataset.bibId; 

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
              const closestWithRefId = item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"], [id^="CR"], [id^="B"], [id^="cit"]'); // Added cit here for completeness with regex
              if (closestWithRefId) {
                  idSourceElement = closestWithRefId;
              }
          }
          
          // Use idSourceElement.id, which could be listItemDomId if item has an ID, or an ancestor's ID
          if (idSourceElement && idSourceElement.id) {
              const idMatch = idSourceElement.id.match(/(?:CR|B|ref-|reference-|cite_note-|r|cit)(\d+)/i); // Added 'cit'
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
        // This ensures the base text is clean before we potentially prepend our formatted number
        if (number !== null) {
          const prefixRegex = new RegExp(`^\\s*(?:\\[${number}\\]|${number})\\s*[.)]?\\s*`);
          text = text.replace(prefixRegex, '').trim();
        }
        text = localSanitize(text); 

        // Use the globally defined selectors from link_extraction_selectors.js
        const linkSelectorsToUse = window.MDPIFilterLinkExtractionSelectors;
        
        // Call the dedicated link extraction function from link_extractor.js
        link = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, linkSelectorsToUse);

        const textForFingerprint = text; // Use the cleaned text before prepending the number for the fingerprint

        if (number !== null) {
          text = number + ". " + text; // Prepend the number to the text that will be displayed
        }

        const normalizedTextForFingerprint = (textForFingerprint || '').replace(/\s+/g, ' ').trim().substring(0, 100);
        const fingerprint = `${normalizedTextForFingerprint}|${link || ''}`;
        
        console.log(`%c[extractReferenceData - ${internalScrollId}] DOM ID: ${listItemDomId || 'N/A'}, FP: ${fingerprint.substring(0,50)}... Num: ${number} (Source: ${numberSource}), Text (for popup): "${text.substring(0, 30)}..."`, 'color: green;');
        return { 
          id: internalScrollId, 
          listItemDomId: listItemDomId, 
          number, 
          text: text, // This text now includes the prepended number if found
          link: link, 
          rawHTML: sanitize(item.innerHTML), 
          fingerprint, 
          numberSource 
        };
      };

      // This is the definition of processAllReferences that should be kept
      function processAllReferences(runCache) {
        console.log("[MDPI Filter] processAllReferences STARTING. Selectors:", referenceListSelectors);
        const items = document.querySelectorAll(referenceListSelectors);
        console.log(`[MDPI Filter] Found ${items.length} potential reference items using current selectors.`);

        items.forEach((item, index) => {
          // Prevent processing known dynamic elements like MediaWiki's UTCLiveClock
          // Common IDs for UTCLiveClock are 'utcdate' or 'pt-utcdate' (often within an <li>)
          if (item.id === 'utcdate' || item.closest('#utcdate') || item.id === 'pt-utcdate' || item.closest('#pt-utcdate')) {
            // console.log("[MDPI Filter] Skipping UTCLiveClock-related element to prevent interference:", item);
            return;        }

          const hasWileyAttribute = item.hasAttribute('data-bib-id');
          if (hasWileyAttribute) {
            console.log(`[MDPI Filter] Item ${index} has 'data-bib-id':`, item.getAttribute('data-bib-id'), item);
          } else {
            // console.log(`[MDPI Filter] Item ${index} (no data-bib-id):`, item);
          }

          const isMdpi = isMdpiItemByContent(item, runCache);
          if (hasWileyAttribute) {
              console.log(`[MDPI Filter] Wiley item (data-bib-id: ${item.getAttribute('data-bib-id')}) 'isMdpiItemByContent' result: ${isMdpi}`);
          }


          if (isMdpi) {
            console.log(`[MDPI Filter] Item ${index} IS MDPI. Extracting data...`, item);
            const refId = `mdpi-ref-${refIdCounter++}`; // Ensure refIdCounter is properly managed
            const referenceData = extractReferenceData(item);
            console.log(`[MDPI Filter] Item ${index} extracted data:`, referenceData);
            collectedMdpiReferences.push(referenceData);          styleRef(item, refId);          // No need to call styleSearch here as it's for search result pages, not reference lists.
            console.log(`[MDPI Filter] Item ${index} (MDPI) styled and added. Ref ID: ${refId}`);
          } else {
            // console.log(`[MDPI Filter] Item ${index} is NOT MDPI.`, item);
          }
        });
        console.log("[MDPI Filter] processAllReferences FINISHED. Collected MDPI references count:", collectedMdpiReferences.length);
      }

      const updateBadgeAndReferences = () => {
        // Create a unique set of references based on fingerprint for the popup list
        const uniqueFingerprints = new Set();
        const uniqueDisplayReferences = [];
        collectedMdpiReferences.forEach(refObject => { // Renamed to avoid confusion
          if (refObject && refObject.fingerprint && !uniqueFingerprints.has(refObject.fingerprint)) {
            uniqueFingerprints.add(refObject.fingerprint);
            uniqueDisplayReferences.push(refObject);
          } else if (!refObject || !refObject.fingerprint) {
            // console.warn('[MDPI Filter CS] Skipping refObject in updateBadgeAndReferences due to missing fingerprint:', refObject);
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

        // Log the first item from sortedReferences BEFORE the map operation
        if (sortedReferences.length > 0) {
          console.log(`%c[MDPI Filter CS] updateBadgeAndReferences: First item in sortedReferences (BEFORE .map):\n  ref.text="${sortedReferences[0].text}"\n  ref.link="${sortedReferences[0].link}"`, 'color: purple; font-weight: bold;');
        }

        // Transform references for the popup, ensuring URL is decoded and under the 'url' property
        const referencesForPopup = sortedReferences.map((ref, index) => { // Added index for logging
          const popupRef = {
            id: ref.id,
            fingerprint: ref.fingerprint,
            number: ref.number,
            text: ref.text, 
            isMdpi: ref.isMdpi, 
            url: ref.link 
          };
          
          // Log the state of popupRef.text BEFORE attempting to decode it for the first item
          if (index === 0) {
              console.log(`%c[MDPI Filter CS] updateBadgeAndReferences (map): First item's popupRef.text BEFORE decodeUrlsInString: "${popupRef.text}"`, 'color: orange; font-weight: bold;');
          }

          if (popupRef.url && typeof popupRef.url === 'string') {
              try {
                  popupRef.url = decodeURIComponent(popupRef.url);
              } catch (e) {
                  console.warn(`[MDPI Filter CS] Failed to decode URL for popupRef.url: ${popupRef.url}`, e);
              }
          }

          if (popupRef.text && typeof popupRef.text === 'string') {
              popupRef.text = decodeUrlsInString(popupRef.text);
          }

          return popupRef;
        });

        if (referencesForPopup.length > 0) {
          console.log(`%c[MDPI Filter CS] updateBadgeAndReferences: Sending ${referencesForPopup.length} items. First item text after decodeUrlsInString: "${referencesForPopup[0].text}"`, 'color: blue; font-weight: bold;');
          // console.log('%c[MDPI Filter CS] First full reference object for popup:', 'color: blue;', referencesForPopup[0]); // For more detailed inspection if needed
        } else {
          console.log(`%c[MDPI Filter CS] updateBadgeAndReferences: No references to send to popup.`, 'color: blue; font-weight: bold;');
        }
        
        chrome.runtime.sendMessage({
            action: "mdpiUpdate",
            data: {
                badgeCount: badgeCount,
                references: referencesForPopup // Send the transformed array
            }
        }, response => {
            if (chrome.runtime.lastError) {
                // Use console.error for better visibility of errors
                console.error(`[MDPI Filter CS] sendMessage failed for mdpiUpdate: ${chrome.runtime.lastError.message}`);
            } else {
                // console.log("[MDPI Filter CS] mdpiUpdate message sent successfully, response:", response);
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

          // --- Step 3.5 (New): Process "Cited By" Entries ---
          // These are styled but NOT added to collectedMdpiReferences for the popup.
          if (window.MDPIFilterCitedBy && window.MDPIFilterCitedBy.Processor && window.MDPIFilterCitedBy.Processor.processEntries) {
            // console.log('[MDPI Filter CS] Calling CitedBy.Processor.processEntries...');
            window.MDPIFilterCitedBy.Processor.processEntries(isMdpiItemByContent, runCache);
          } else {
            // console.warn('[MDPI Filter CS] MDPIFilterCitedBy.Processor.processEntries function is not available.');
          }

          // --- Step 4: Style inline footnotes ---
          // Call the function from MDPIFilterUtils and pass collectedMdpiReferences
          if (window.MDPIFilterUtils && window.MDPIFilterUtils.styleInlineFootnotes) {
            window.MDPIFilterUtils.styleInlineFootnotes(collectedMdpiReferences);
          }

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

      if (window.MDPIFilterDomains && window.sanitize) {
        // console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll and setting up observers.");
        requestAnimationFrame(async () => { // Make callback async
          // console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
          await runAll("initial load"); // Await runAll
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
  } // End of else (dependenciesMet)
} // End of if (!window.mdpiFilterInjected)
