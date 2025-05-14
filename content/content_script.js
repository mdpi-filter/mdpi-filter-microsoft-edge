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
  if (!window.MDPIFilterDomainUtils || typeof window.MDPIFilterDomainUtils.getActiveSearchConfig !== 'function') {
    missingDependencies.push("MDPIFilterDomainUtils.getActiveSearchConfig (from domains.js)");
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
  if (typeof window.MDPIFilterCaches === 'undefined' || typeof window.MDPIFilterCaches.ncbiApiCache === 'undefined' || typeof window.MDPIFilterCaches.citationProcessCache === 'undefined') {
    missingDependencies.push("MDPIFilterCaches (from cache_manager.js)");
    dependenciesMet = false;
  }
  // Add dependency check for the new item content checker
  if (typeof window.MDPIFilterItemContentChecker === 'undefined' || typeof window.MDPIFilterItemContentChecker.checkItemContent !== 'function') {
    missingDependencies.push("MDPIFilterItemContentChecker (from item_content_checker.js)");
    dependenciesMet = false;
  }
  if (typeof window.MDPIFilterReferenceIdExtractor === 'undefined' || typeof window.MDPIFilterReferenceIdExtractor.extractInternalScrollId !== 'function') {
    missingDependencies.push("MDPIFilterReferenceIdExtractor (from reference_id_extractor.js)");
    dependenciesMet = false;
  }
  if (typeof window.MDPIFilterNcbiApiHandler === 'undefined' || typeof window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi !== 'function') {
    missingDependencies.push("MDPIFilterNcbiApiHandler (from ncbi_api_handler.js)");
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
    const referenceListSelectors = window.MDPIFilterReferenceSelectors; // Defined by reference_selectors.js
    if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
      console.error("[MDPI Filter CS] CRITICAL: referenceListSelectors is undefined or empty after assignment from window.MDPIFilterReferenceSelectors. Value:", referenceListSelectors, "Window object value:", window.MDPIFilterReferenceSelectors);
    } else {
      // console.log("[MDPI Filter CS] referenceListSelectors initialized successfully:", referenceListSelectors.substring(0, 100) + "..."); // Log part of it
    }
    const uniqueMdpiReferences = new Set();
    let collectedMdpiReferences = []; // Array to store detailed reference info
    let refIdCounter = 0; // Counter for unique reference IDs

    // Declare mainObserverInstance in a scope accessible by runAll and setupMainObserver
    let mainObserverInstance = null;

    // ---

    if (chrome.runtime && chrome.runtime.id) {
      chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
        // Check for errors after the async storage operation
        if (chrome.runtime.lastError) {
          console.error(`[MDPI Filter CS] Error accessing storage: ${chrome.runtime.lastError.message}. Halting script initialization for this frame.`);
          return; // Abort if storage access failed
        }

        // Re-check runtime context after the async operation, as it might have been invalidated
        if (!(chrome.runtime && chrome.runtime.id)) {
          console.warn("[MDPI Filter CS] Extension context became invalidated after storage.sync.get. Halting script initialization for this frame.");
          return; // Abort if context is now invalid
        }

        console.log('%c MDPI FILTER EXTENSION SCRIPT LOADED AND CONTEXT SELECTED! CHECK HERE! ', 'background: yellow; color: black; font-size: 16px; font-weight: bold;');
        // console.log("[MDPI Filter] Mode:", mode);

        // --- Use Caches from Global Scope ---
        const { ncbiApiCache, citationProcessCache } = window.MDPIFilterCaches;
        // ---

        const mdpiColor = '#E2211C'; // Default MDPI Red, can be adjusted based on mode if needed

        let isProcessing = false;
        // --- Helper Function Definitions ---

        // The isSearchEnginePage function is now replaced by MDPIFilterDomainUtils.getActiveSearchConfig

        function clearPreviousHighlights() {
          document.querySelectorAll('.mdpi-highlighted-reference, .mdpi-hidden-reference, .mdpi-search-result-highlight, .mdpi-search-result-hidden').forEach(el => {
            el.classList.remove('mdpi-highlighted-reference', 'mdpi-hidden-reference', 'mdpi-search-result-highlight', 'mdpi-search-result-hidden');
            el.style.backgroundColor = '';
            el.style.border = '';
            el.style.padding = '';
            el.style.display = '';
            el.style.outline = ''; 
          });
          document.querySelectorAll('[data-mdpi-filter-inline-styled]').forEach(el => {
            el.style.color = '';
            el.style.fontWeight = '';
            el.removeAttribute('data-mdpi-filter-inline-styled');
            if (el.tagName.toLowerCase() === 'sup') {
              const anchorElement = el.querySelector('a');
              if (anchorElement) {
                anchorElement.style.color = '';
                anchorElement.style.fontWeight = '';
                Array.from(anchorElement.childNodes).forEach(child => {
                  if (child.nodeType === Node.ELEMENT_NODE) {
                    child.style.color = '';
                    child.style.fontWeight = '';
                  }
                });
                const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
                bracketSpans.forEach(span => {
                  span.style.color = '';
                });
              }
            }
          });
        }

        function styleRef(item, refId) {
          if (!item || typeof item.setAttribute !== 'function') {
            console.warn('[MDPI Filter CS] styleRef: Invalid item provided.', item);
            return;
          }
          item.setAttribute('data-mdpi-filter-ref-id', refId);
          if (mode === 'hide') {
            item.classList.add('mdpi-hidden-reference');
            item.style.display = 'none';
          } else {
            item.classList.add('mdpi-highlighted-reference');
            item.style.backgroundColor = 'rgba(255, 224, 224, 0.7)';
            item.style.border = `1px solid ${mdpiColor}`;
            item.style.padding = '2px';
          }
        }
        
        // Wrapper for the globally available item content checker
        const isMdpiItemByContent = (item, runCache) => {
          if (!item) return false;
          // MDPI_DOI and MDPI_DOMAIN are accessible from the outer scope here
          return window.MDPIFilterItemContentChecker.checkItemContent(item, runCache, MDPI_DOI, MDPI_DOMAIN);
        };
        
        function updateBadgeAndReferences() {
          const badgeCount = collectedMdpiReferences.length;
          const text = badgeCount > 0 ? String(badgeCount) : '';
        
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
              action: 'mdpiUpdate',
              data: {
                badgeCount: badgeCount,
                references: collectedMdpiReferences
              }
            }).catch(error => {
              if (error.message.includes("Receiving end does not exist") || error.message.includes("context invalidated")) {
                // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Could not send message to background, context likely invalidated.");
              } else {
                // console.error("[MDPI Filter CS] updateBadgeAndReferences: Error sending message:", error);
              }
            });
          } else {
            // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Extension context invalidated, cannot send message.");
          }
          if (collectedMdpiReferences.length === 0 && !window.MDPIFilterDomainUtils.getActiveSearchConfig(window.location.hostname, window.location.pathname, domains)) { 
            // console.log("[MDPI Filter CS] updateBadgeAndReferences: No references to send to popup for this page.");
          }
        }

        const extractReferenceData = (item) => {
          // The item.id or a generated one if item.id is not present.
          // For Wiley, item.dataset.bibId is often the most stable identifier for the reference list item.
          // MDPIFilterReferenceIdExtractor.extractInternalScrollId handles getting or generating an ID
          // and also sets 'data-mdpi-filter-ref-id' which is used for scrolling.
          const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(item, refIdCounter);
          refIdCounter = updatedRefIdCounter; 

          const textContent = item.textContent || '';
          const primaryLink = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, window.MDPIFilterLinkExtractionSelectors);

          // The listItemDomId is crucial for linking inline citations back to this reference item.
          // It should be the actual DOM ID of the list item if available, or the data-bib-id for Wiley,
          // or the generated mdpi-filter-ref-id as a fallback.
          // The `extractedId` from `extractInternalScrollId` is suitable for the `id` field for popup interaction.
          // For `listItemDomId` (used by inline styler), we prefer item.id or item.dataset.bibId if they exist and are robust.
          // If not, `extractedId` (which is `data-mdpi-filter-ref-id`) can be a fallback.
          let listItemDomIdForInlineLinking = item.id || item.dataset.bibId || extractedId;


          return {
            id: extractedId, // This is data-mdpi-filter-ref-id, used for scrolling from popup
            text: sanitize(textContent.substring(0, 250) + (textContent.length > 250 ? '...' : '')),
            fullText: textContent, 
            link: primaryLink,
            listItemDomId: listItemDomIdForInlineLinking // ID used by inline_footnote_styler to find corresponding markers
          };
        };

        // --- Main Processing Functions ---

        async function processSearchEngineResults(config) {
          isProcessing = true;
          // console.log("[MDPI Filter CS] Processing search engine results with config:", config);
          if (!config) {
            // console.log("[MDPI Filter CS] No search config provided to processSearchEngineResults. Aborting.");
            isProcessing = false;
            return;
          }

          const items = document.querySelectorAll(config.itemSelector || config.container); 
          console.log(`[MDPI Filter CS] Found ${items.length} items using selector: ${config.itemSelector || config.container}`);

          items.forEach(item => {
            let isMdpiResult = false;
            // Check based on linkSelector (preferred for MDPI links)
            if (config.linkSelector) {
                const mdpiLink = item.querySelector(config.linkSelector);
                if (mdpiLink && mdpiLink.href && (mdpiLink.href.includes(MDPI_DOMAIN) || MDPI_DOI_REGEX.test(mdpiLink.href))) {
                    isMdpiResult = true;
                }
            }
            // Check based on DOI pattern in text content
            if (!isMdpiResult && config.doiPattern && item.textContent && item.textContent.includes(config.doiPattern)) {
              isMdpiResult = true;
            }
            // Check based on HTML contains (e.g., "<b>MDPI</b>")
            if (!isMdpiResult && config.htmlContains && item.innerHTML && item.innerHTML.includes(config.htmlContains)) {
              isMdpiResult = true;
            }
            // Fallback: General MDPI DOI regex check on item's text content if no specific patterns matched
            if (!isMdpiResult && MDPI_DOI_REGEX.test(item.textContent || '')) {
                isMdpiResult = true;
            }
            // Fallback: General MDPI domain check in any link within the item
            if (!isMdpiResult) {
                const anyLink = item.querySelector('a[href*="mdpi.com"], a[href*="10.3390"]');
                if (anyLink) {
                    isMdpiResult = true;
                }
            }


            if (isMdpiResult) {
              if (mode === 'hide') {
                item.classList.add('mdpi-search-result-hidden');
                item.style.display = 'none';
              } else { 
                item.classList.add('mdpi-search-result-highlight');
                item.style.border = `2px dotted ${mdpiColor}`; 
                item.style.padding = '3px';
                item.style.backgroundColor = 'rgba(255, 230, 230, 0.5)'; 
              }
            }
          });
          console.log(`[MDPI Filter CS] Processed search results. Found and styled MDPI results.`);
          
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
              action: 'mdpiUpdate',
              data: {
                badgeCount: items.length, 
                references: [] 
              }
            }).catch(e => {
              if (e.message.includes("Receiving end does not exist") || e.message.includes("context invalidated")) {
                // console.warn("[MDPI Filter CS] Error sending search result badge update (context likely invalidated):", e.message)
              } else {
                // console.warn("[MDPI Filter CS] Error sending search result badge update:", e.message)
              }
            });
          }
          isProcessing = false;
        }

        async function processAllReferences(runCache) {
          console.log("[MDPI Filter CS] Starting processAllReferences. Initial runCache size:", runCache.size);
          isProcessing = true;
          clearPreviousHighlights();
        
          collectedMdpiReferences = []; // Reset for this run
          const uniqueMdpiRefsForThisRun = new Map();
        
          if (window.MDPIFilterLinkExtractor && typeof window.MDPIFilterLinkExtractor.resetExpansionFlags === 'function') {
            window.MDPIFilterLinkExtractor.resetExpansionFlags();
          }
        
          const referenceItems = document.querySelectorAll(referenceListSelectors);
          console.log(`[MDPI Filter CS] Found ${referenceItems.length} potential reference items using selectors: ${referenceListSelectors.substring(0,100)}...`);
        
          if (referenceItems.length === 0) {
            console.log("[MDPI Filter CS] No reference items found. Updating badge and references.");
            updateBadgeAndReferences();
            isProcessing = false;
            return;
          }
        
          // --- Step 1: Pre-collect all potential NCBI IDs from all items for batch API call ---
          const allNcbiIdsToPreFetch = { pmid: new Set(), pmcid: new Set(), doi: new Set() };
          referenceItems.forEach(itemElement => {
            const itemText = itemElement.textContent || "";
            const links = Array.from(itemElement.querySelectorAll('a[href]'));
        
            const pmidTextMatch = itemText.match(/\bPMID:\s*(\d+)\b/gi);
            if (pmidTextMatch) pmidTextMatch.forEach(m => allNcbiIdsToPreFetch.pmid.add(m.match(/\d+/)[0]));
            const pmcidTextMatch = itemText.match(/\b(PMC\d+)\b/gi);
            if (pmcidTextMatch) pmcidTextMatch.forEach(m => allNcbiIdsToPreFetch.pmcid.add(m));
        
            links.forEach(link => {
              if (link.href) {
                const pmidLinkMatch = link.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
                if (pmidLinkMatch && pmidLinkMatch[1]) allNcbiIdsToPreFetch.pmid.add(pmidLinkMatch[1]);
                const pmcidLinkMatch = link.href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
                if (pmcidLinkMatch && pmcidLinkMatch[1]) allNcbiIdsToPreFetch.pmcid.add(pmcidLinkMatch[1]);
                
                const doiInLink = window.MDPIFilterItemContentChecker.extractDoiFromLinkInternal ? window.MDPIFilterItemContentChecker.extractDoiFromLinkInternal(link.href) : null;
                if (doiInLink && !doiInLink.startsWith(MDPI_DOI)) {
                    allNcbiIdsToPreFetch.doi.add(doiInLink);
                }
              }
            });
            const doiTextPattern = /\b(10\.\d{4,9}\/[^"\s'&<>]+)\b/gi;
            let doiMatch;
            while((doiMatch = doiTextPattern.exec(itemText)) !== null) {
                if (doiMatch[1] && !doiMatch[1].startsWith(MDPI_DOI)) {
                    allNcbiIdsToPreFetch.doi.add(doiMatch[1]);
                }
            }
          });
        
          console.log(`[MDPI Filter CS] Pre-collected PMIDs: ${allNcbiIdsToPreFetch.pmid.size}, PMCIDs: ${allNcbiIdsToPreFetch.pmcid.size}, DOIs for NCBI: ${allNcbiIdsToPreFetch.doi.size}`);
        
          // --- Step 2: Populate runCache using global ncbiApiCache and then NCBI API ---
          const idsForAPICall = { pmid: [], pmcid: [], doi: [] };
        
          allNcbiIdsToPreFetch.pmid.forEach(id => {
            if (ncbiApiCache.has(id)) runCache.set(id, ncbiApiCache.get(id)); else idsForAPICall.pmid.push(id);
          });
          allNcbiIdsToPreFetch.pmcid.forEach(id => {
            if (ncbiApiCache.has(id)) runCache.set(id, ncbiApiCache.get(id)); else idsForAPICall.pmcid.push(id);
          });
          allNcbiIdsToPreFetch.doi.forEach(id => {
             if (ncbiApiCache.has(id)) runCache.set(id, ncbiApiCache.get(id)); else idsForAPICall.doi.push(id);
          });
        
          if (idsForAPICall.pmid.length > 0) {
            console.log(`[MDPI Filter CS] Querying NCBI for ${idsForAPICall.pmid.length} PMIDs.`);
            await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForAPICall.pmid, 'pmid', runCache, ncbiApiCache);
          }
          if (idsForAPICall.pmcid.length > 0) {
            console.log(`[MDPI Filter CS] Querying NCBI for ${idsForAPICall.pmcid.length} PMCIDs.`);
            await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForAPICall.pmcid, 'pmcid', runCache, ncbiApiCache);
          }
          if (idsForAPICall.doi.length > 0) {
            console.log(`[MDPI Filter CS] Querying NCBI for ${idsForAPICall.doi.length} non-MDPI DOIs.`);
            await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForAPICall.doi, 'doi', runCache, ncbiApiCache);
          }
          console.log("[MDPI Filter CS] NCBI ID check phase complete. runCache size:", runCache.size);
          // For debugging, log a snippet of the runCache if it's small, or just its keys
          if (runCache.size > 0 && runCache.size < 20) {
            console.log("[MDPI Filter CS] Current runCache contents:", JSON.parse(JSON.stringify(Array.from(runCache.entries()))));
          } else if (runCache.size > 0) {
            console.log("[MDPI Filter CS] Current runCache keys:", JSON.parse(JSON.stringify(Array.from(runCache.keys()))));
          }
        
          // --- Step 3: Process each reference item using the populated runCache ---
          let localRefIdCounter = refIdCounter; 
        
          for (const itemElement of referenceItems) {
            const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(itemElement, localRefIdCounter);
            localRefIdCounter = updatedRefIdCounter;
        
            // Log the specific item being processed before calling isMdpiItemByContent
            const itemPreviewText = (itemElement.textContent || "").substring(0, 70).trim().replace(/\s+/g, ' ');
            console.log(`[MDPI Filter CS] Processing item for MDPI status: ID '${extractedId}', Preview: "${itemPreviewText}..."`);

            const isMdpi = isMdpiItemByContent(itemElement, runCache);
            citationProcessCache.set(itemElement, isMdpi); 
        
            if (isMdpi) {
              console.log(`[MDPI Filter CS] ITEM FLAGGED AS MDPI: ID '${extractedId}', Preview: "${itemPreviewText}...". Adding to collected references.`);
              styleRef(itemElement, extractedId);
              const refData = extractReferenceData(itemElement); // extractReferenceData now uses the updated localRefIdCounter via global refIdCounter
              if (refData && !uniqueMdpiRefsForThisRun.has(refData.id)) {
                uniqueMdpiRefsForThisRun.set(refData.id, refData);
              }
              // Inline footnote styling
              let idForFootnoteLinking = itemElement.id;
              if (!idForFootnoteLinking || !/^[a-zA-Z0-9-_:.]+$/.test(idForFootnoteLinking) || idForFootnoteLinking.length >= 100) {
                idForFootnoteLinking = extractedId;
              }
              const footnoteSelectors = window.MDPIFilterUtils.generateInlineFootnoteSelectors(idForFootnoteLinking);
              if (footnoteSelectors) {
                try {
                  const footnotes = document.querySelectorAll(footnoteSelectors);
                  footnotes.forEach(footnote => {
                    window.MDPIFilterUtils.styleInlineFootnotes(footnote, extractedId, itemElement, mode);
                  });
                } catch (e) {
                  console.warn(`[MDPI Filter CS] Error selecting/styling footnotes for ${idForFootnoteLinking} with selectors "${footnoteSelectors}":`, e);
                }
              }
            } else {
              // Ensure styling is removed if not MDPI (e.g. if it was MDPI on a previous run)
              itemElement.classList.remove('mdpi-highlighted-reference', 'mdpi-hidden-reference');
              itemElement.style.backgroundColor = '';
              itemElement.style.border = '';
              itemElement.style.padding = '';
              itemElement.style.display = ''; 
            }
          }
          refIdCounter = localRefIdCounter; 
        
          collectedMdpiReferences = Array.from(uniqueMdpiRefsForThisRun.values());
          console.log(`[MDPI Filter CS] processAllReferences FINISHED. Collected MDPI references count: ${collectedMdpiReferences.length}`);
          if (collectedMdpiReferences.length > 0) {
            console.log("[MDPI Filter CS] Collected MDPI Reference IDs for this run:", collectedMdpiReferences.map(r => r.id));
          }
          updateBadgeAndReferences();
          isProcessing = false;
        }

        const debouncedRunAll = window.debounce(() => {
          runAll();
        }, 250);

        async function runAll() {
          if (isProcessing) {
            // console.log("[MDPI Filter CS] Processing already in progress. Skipping runAll.");
            return;
          }
          // console.log("[MDPI Filter CS] runAll triggered.");

          const currentHostname = window.location.hostname;
          const currentPathname = window.location.pathname;

          const searchConfig = window.MDPIFilterDomainUtils.getActiveSearchConfig(currentHostname, currentPathname, domains);

          if (searchConfig) {
            // console.log("[MDPI Filter CS] Search engine page detected. Config:", searchConfig);
            await processSearchEngineResults(searchConfig); // Pass the config
          } else {
            // console.log("[MDPI Filter CS] Not a search engine page or no specific config. Processing all references.");
            await processAllReferences(new Map()); // Pass a new Map instance
          }
        }

        function initializeOrReRun() {
          console.log("[MDPI Filter CS] >>> initializeOrReRun function entered."); 
          if (!chrome.runtime?.id) {
            console.warn('[MDPI Filter CS] initializeOrReRun: Extension context invalidated. Aborting.');
            return;
          }

          const currentHostname = window.location.hostname;
          const currentPathname = window.location.pathname;

          const searchConfig = window.MDPIFilterDomainUtils.getActiveSearchConfig(currentHostname, currentPathname, domains);

          if (!searchConfig && (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '')) {
            console.error("[MDPI Filter CS] initializeOrReRun: Skipping runAll because referenceListSelectors are missing/empty.");
            collectedMdpiReferences = []; 
            uniqueMdpiReferences.clear();
            updateBadgeAndReferences(); 
            return;
          }

          runAll(); // Initial processing
          
          if (mainObserverInstance) {
            mainObserverInstance.disconnect(); 
          }
          mainObserverInstance = new MutationObserver((mutationsList, observer) => {
            if (!(chrome.runtime && chrome.runtime.id)) {
              console.warn('[MDPI Filter] Main observer: Extension context invalidated. Skipping debouncedRunAll.');
              if(mainObserverInstance) mainObserverInstance.disconnect(); // Stop observing if context is lost
              return;
            }
            debouncedRunAll();
          });

          mainObserverInstance.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
        }

        // --- Message Listener for Scrolling ---
        if (chrome.runtime && chrome.runtime.onMessage) {
          chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type === 'scrollToRefOnPage' && msg.refId) {
              console.log(`[MDPI Filter CS] Received scrollToRefOnPage for refId: ${msg.refId}`);
              const selector = `[data-mdpi-filter-ref-id="${msg.refId}"]`;
              const elementToScrollTo = document.querySelector(selector);

              if (elementToScrollTo) {
                elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Optional: Add a temporary visual cue
                elementToScrollTo.style.outline = `2px dashed ${mdpiColor}`;
                setTimeout(() => {
                  elementToScrollTo.style.outline = '';
                }, 2000);
                console.log(`[MDPI Filter CS] Scrolled to element with ${selector}`);
                sendResponse({ status: 'success', message: `Scrolled to ${msg.refId}` });
              } else {
                console.warn(`[MDPI Filter CS] Element with ${selector} not found.`);
                sendResponse({ status: 'error', message: `Element with refId ${msg.refId} not found.` });
              }
              return true; 
            }
            return false; 
          });
        } else {
            console.warn("[MDPI Filter CS] chrome.runtime.onMessage not available. Scrolling from popup will not work.");
        }

        // --- Initial Execution ---
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            if (!chrome.runtime?.id) {
              console.warn('[MDPI Filter CS] DOMContentLoaded: Extension context invalidated. Skipping initial run.');
              return;
            }
            initializeOrReRun();
          });
        } else {
          if (!chrome.runtime?.id) {
            console.warn('[MDPI Filter CS] Document ready: Extension context invalidated. Skipping initial run.');
          } else {
            initializeOrReRun();
          }
        }
      });
    } else {
      console.warn("[MDPI Filter CS] Extension context invalidated before storage access. Main script logic will not execute for this frame.");
    }
  } 
}
