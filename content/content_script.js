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

    // Helper function to determine if the current page is a search engine results page
    const isSearchEnginePage = () => {
      const hostname = window.location.hostname;
      return domains && domains.searchEngineDomains && Array.isArray(domains.searchEngineDomains) &&
             domains.searchEngineDomains.some(domain => hostname.includes(domain));
    };

    // Check if the runtime and its ID are available before trying to access storage
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

        let isProcessing = false; // Declare isProcessing here, inside the callback

        function clearPreviousHighlights() {
          document.querySelectorAll('.mdpi-highlighted-reference, .mdpi-hidden-reference, .mdpi-search-result-highlight, .mdpi-search-result-hidden').forEach(el => {
            el.classList.remove('mdpi-highlighted-reference', 'mdpi-hidden-reference', 'mdpi-search-result-highlight', 'mdpi-search-result-hidden');
            el.style.backgroundColor = '';
            el.style.border = '';
            el.style.padding = '';
            el.style.display = '';
            el.style.outline = ''; // Also clear outline if used
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
        
        function processSearchEngineResults() {
          console.log("[MDPI Filter CS] >>> processSearchEngineResults function entered.");
          clearPreviousHighlights(); // Clear previous styling

          const hostname = window.location.hostname;
          const path = window.location.pathname;
          let config = null;
          let foundMdpiResultsCount = 0;

          if (domains.googleWeb && hostname.includes(domains.googleWeb.host) && domains.googleWeb.path.test(path)) {
            config = domains.googleWeb;
          } else if (domains.scholar && hostname.includes(domains.scholar.host)) {
            config = domains.scholar;
          } else if (domains.pubmed && hostname.includes(domains.pubmed.host)) {
            config = domains.pubmed;
          } else if (domains.europepmc && domains.europepmc.hostRegex && domains.europepmc.hostRegex.test(hostname)) {
            config = domains.europepmc;
          }

          if (!config) {
            console.log("[MDPI Filter CS] No specific search engine config found for:", hostname + path);
            return;
          }
          console.log("[MDPI Filter CS] Using config for:", config.host || config.hostRegex);

          const items = document.querySelectorAll(config.itemSelector || config.container); // Prefer itemSelector
          console.log(`[MDPI Filter CS] Found ${items.length} items using selector: ${config.itemSelector || config.container}`);

          items.forEach(item => {
            let isMdpiResult = false;
            if (config.linkSelector && item.querySelector(config.linkSelector)) {
              isMdpiResult = true;
            } else if (config.doiPattern && item.textContent && item.textContent.includes(config.doiPattern)) {
              isMdpiResult = true;
            } else if (config.htmlContains && item.innerHTML && item.innerHTML.includes(config.htmlContains)) {
              isMdpiResult = true;
            }

            if (isMdpiResult) {
              foundMdpiResultsCount++;
              if (mode === 'hide') {
                item.classList.add('mdpi-search-result-hidden');
                item.style.display = 'none';
              } else { // 'highlight'
                item.classList.add('mdpi-search-result-highlight');
                item.style.border = `2px dotted ${mdpiColor}`; // Dotted border for search results
                item.style.padding = '3px';
                item.style.backgroundColor = 'rgba(255, 230, 230, 0.5)'; // Slightly different highlight
              }
            }
          });
          console.log(`[MDPI Filter CS] Processed search results. Found and styled ${foundMdpiResultsCount} MDPI results.`);
          // For search pages, we typically don't populate collectedMdpiReferences for the popup.
          // The badge can reflect the count of styled search results if desired.
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
              action: 'mdpiUpdate',
              data: {
                badgeCount: foundMdpiResultsCount, // Send count of found search results
                references: [] // No detailed references for popup from search pages
              }
            }).catch(e => console.warn("[MDPI Filter CS] Error sending search result badge update:", e.message));
          }
        }


        function isMdpiItemByContent(item, runCache) {
          if (!item) return false;
          return window.MDPIFilterItemContentChecker.checkItemContent(item, runCache, MDPI_DOI, MDPI_DOMAIN);
        }
        
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
              if (error.message.includes("Receiving end does not exist")) {
                // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Could not send message to background, context likely invalidated.");
              } else {
                // console.error("[MDPI Filter CS] updateBadgeAndReferences: Error sending message:", error);
              }
            });
          } else {
            // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Extension context invalidated, cannot send message.");
          }
          if (collectedMdpiReferences.length === 0 && !isSearchEnginePage()) { // Only log "no references" for non-search pages
            // console.log("[MDPI Filter CS] updateBadgeAndReferences: No references to send to popup for this page.");
          }
        }


        const extractReferenceData = (item) => {
          const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(item, refIdCounter);
          refIdCounter = updatedRefIdCounter; 

          const textContent = item.textContent || '';
          const primaryLink = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, window.MDPIFilterLinkExtractionSelectors);

          return {
            id: extractedId, 
            text: sanitize(textContent.substring(0, 250) + (textContent.length > 250 ? '...' : '')),
            fullText: textContent, 
            link: primaryLink,
          };
        };

        async function processAllReferences(runCache) { 
          console.log("[MDPI Filter CS] >>> processAllReferences function entered."); 

          if (isProcessing) {
            return;
          }
          isProcessing = true;
          console.log("[MDPI Filter CS] processAllReferences STARTING. Initial runCache size:", runCache.size);

          clearPreviousHighlights();
          uniqueMdpiReferences.clear();
          collectedMdpiReferences = [];
          
          let referenceItems = [];
          try {
            if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
              console.error("[MDPI Filter CS] processAllReferences: referenceListSelectors is undefined or empty before querySelectorAll. Value:", referenceListSelectors);
              isProcessing = false;
              return;
            }
            referenceItems = Array.from(document.querySelectorAll(referenceListSelectors));
          } catch (e) {
            console.error("[MDPI Filter CS] Error during document.querySelectorAll with referenceListSelectors:", e);
            console.error("[MDPI Filter CS] Selectors used:", referenceListSelectors);
            isProcessing = false; 
            return; 
          }

          console.log(`[MDPI Filter CS] Found ${referenceItems.length} potential reference items using current selectors.`);

          const pmidsToLookup = new Set();
          const pmcidsToLookup = new Set();

          referenceItems.forEach(item => {
            const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));
            for (const link of allLinksInItem) {
              if (link.href) {
                const pmcMatch = link.href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
                if (pmcMatch && pmcMatch[1]) {
                  pmcidsToLookup.add(pmcMatch[1].toUpperCase()); 
                } else {
                  const pmidMatch = link.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
                  if (pmidMatch && pmidMatch[1]) {
                    pmidsToLookup.add(pmidMatch[1]); 
                  }
                }
              }
            }
          });

          console.log(`[MDPI Filter CS] Collected unique NCBI IDs for potential API lookup. PMIDs: ${pmidsToLookup.size}, PMCIDs: ${pmcidsToLookup.size}`);
          if (pmidsToLookup.size > 0) console.log("[MDPI Filter CS] PMIDs to check:", Array.from(pmidsToLookup));
          if (pmcidsToLookup.size > 0) console.log("[MDPI Filter CS] PMCIDs to check:", Array.from(pmcidsToLookup));

          let ncbiApiPotentiallyCalled = false;
          if (pmidsToLookup.size > 0) {
            console.log(`[MDPI Filter CS] Calling checkNcbiIdsForMdpi for ${pmidsToLookup.size} PMIDs.`);
            await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(Array.from(pmidsToLookup), 'pmid', runCache, ncbiApiCache);
            ncbiApiPotentiallyCalled = true;
          }
          if (pmcidsToLookup.size > 0) {
            console.log(`[MDPI Filter CS] Calling checkNcbiIdsForMdpi for ${pmcidsToLookup.size} PMCIDs.`);
            await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(Array.from(pmcidsToLookup), 'pmcid', runCache, ncbiApiCache);
            ncbiApiPotentiallyCalled = true;
          }

          if (ncbiApiPotentiallyCalled) {
            console.log("[MDPI Filter CS] NCBI ID processing completed. runCache should now be updated from ncbiApiCache and/or API calls. runCache size:", runCache.size);
          } else {
            console.log("[MDPI Filter CS] No NCBI IDs found on page to send to API handler.");
          }

          referenceItems.forEach((item, index) => {
            if (item.id === 'utcdate' || item.closest('#utcdate') || item.id === 'pt-utcdate' || item.closest('#pt-utcdate')) {
              return;
            }

            const hasWileyAttribute = item.hasAttribute('data-bib-id');
            const isMdpi = isMdpiItemByContent(item, runCache);

            if (isMdpi) {
              const referenceData = extractReferenceData(item); 
              collectedMdpiReferences.push(referenceData);
              styleRef(item, referenceData.id); 
            }
          });
          isProcessing = false;

          if (window.MDPIFilterUtils && window.MDPIFilterUtils.styleInlineFootnotes) {
            window.MDPIFilterUtils.styleInlineFootnotes(collectedMdpiReferences, mdpiColor);
          }
          updateBadgeAndReferences();
        }

        const debouncedRunAll = window.debounce(() => {
          runAll();
        }, 250);

        async function runAll() {
          if (!chrome.runtime?.id) {
            console.warn('[MDPI Filter] runAll: Extension context invalidated. Aborting.');
            return;
          }

          if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
            updateBadgeAndReferences(); 
            return;
          }
          refIdCounter = 0; 

          const runCache = new Map();
          await processAllReferences(runCache);
          updateBadgeAndReferences();
        }

        function initializeOrReRun() {
          if (!chrome.runtime?.id) {
            console.warn('[MDPI Filter CS] initializeOrReRun: Extension context invalidated. Aborting.');
            return;
          }

          if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
            updateBadgeAndReferences(); 
            return;
          }

          runAll(); 
          if (mainObserverInstance) {
            mainObserverInstance.disconnect(); 
          }
          mainObserverInstance = new MutationObserver((mutationsList, observer) => {
            if (!(chrome.runtime && chrome.runtime.id)) {
              return;
            }
            debouncedRunAll();
          });

          mainObserverInstance.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            if (!chrome.runtime?.id) {
              return;
            }
            if (typeof referenceListSelectors !== 'undefined' && referenceListSelectors !== null && referenceListSelectors.trim() !== '') {
              initializeOrReRun();
            } else {
              updateBadgeAndReferences();
            }
          });
        } else {
          if (!chrome.runtime?.id) {
          } else {
            if (typeof referenceListSelectors !== 'undefined' && referenceListSelectors !== null && referenceListSelectors.trim() !== '') {
              initializeOrReRun();
            } else {
              updateBadgeAndReferences();
            }
          }
        }
      });
    } else {
      console.warn("[MDPI Filter CS] Extension context invalidated before storage access. Main script logic will not execute for this frame.");
    }
  } 
} 
