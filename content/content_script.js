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

        // New function to send updates to the background script
        function sendUpdateToBackground() {
          console.log(`[MDPI Filter CS] Attempting to send 'mdpiUpdate' to background. Number of references: ${collectedMdpiReferences.length}`);

          if (!chrome.runtime || !chrome.runtime.id) {
            console.error('[MDPI Filter CS] CRITICAL: chrome.runtime.id is not available. Cannot send message to background. Content script might be in an invalid context or the extension was reloaded/updated.');
            return;
          }

          const dataToSend = {
            badgeCount: collectedMdpiReferences.length,
            references: collectedMdpiReferences.map(ref => ({
              id: ref.id,
              text: ref.text,
              number: ref.number,
              listItemDomId: ref.listItemDomId
            }))
          };

          try {
            console.log('[MDPI Filter CS] Data prepared for background:', JSON.parse(JSON.stringify(dataToSend)));
          } catch (e) {
            console.warn('[MDPI Filter CS] Could not stringify dataToSend for logging:', e, dataToSend);
          }

          chrome.runtime.sendMessage({
            type: 'mdpiUpdate',
            data: dataToSend
          }, response => {
            if (chrome.runtime.lastError) {
              console.error('[MDPI Filter CS] Error sending mdpiUpdate to background:', chrome.runtime.lastError.message);
            } else {
              console.log('[MDPI Filter CS] mdpiUpdate successfully sent to background. Response from background:', response);
            }
          });
        }

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

        // Update styleRef to accept config and use highlightTargetSelector if present
        function styleRef(item, refId, config) {
          if (!item || typeof item.setAttribute !== 'function') {
            // console.warn("[MDPI Filter CS] styleRef: Invalid item provided or item lacks setAttribute.", item);
            return;
          }
          // Use highlightTargetSelector if present in config
          let highlightTarget = item;
          if (config && config.highlightTargetSelector) {
            const targetElement = item.querySelector(config.highlightTargetSelector);
            if (targetElement) {
              highlightTarget = targetElement;
            } else {
              // console.warn(`[MDPI Filter CS] styleRef: highlightTargetSelector "${config.highlightTargetSelector}" not found within item. Defaulting to item itself.`);
            }
          }
          highlightTarget.setAttribute('data-mdpi-filter-ref-id', refId);

          if (mode === 'hide') {
            item.classList.add('mdpi-hidden-reference');
            item.style.display = 'none'; // Ensure it's hidden
            // console.log(`[MDPI Filter CS] Hiding item with refId ${refId}:`, item);
          } else { // 'highlight' or default
            item.classList.add('mdpi-highlighted-reference');
            // Apply specific styling for Google search results
            if (config && (config.host === 'www.google.com' || config.host === 'scholar.google.com')) {
              highlightTarget.classList.add('mdpi-search-result-highlight'); // Add class to the target
              // Unified styling for Google (previously light mode style)
              highlightTarget.style.backgroundColor = 'rgba(255, 182, 193, 0.3)'; // Light pink, less aggressive
              highlightTarget.style.border = `1px solid ${mdpiColor}`;
              highlightTarget.style.borderRadius = '3px';
              highlightTarget.style.padding = '1px 3px';
              highlightTarget.style.boxShadow = ''; // Ensure no box shadow from previous dark mode style
            } else {
              // General reference styling (non-Google search or if config not matched)
              highlightTarget.style.borderLeft = `3px solid ${mdpiColor}`;
              highlightTarget.style.paddingLeft = '5px';
              highlightTarget.style.backgroundColor = 'rgba(226, 33, 28, 0.05)'; // Very subtle background
            }
            // console.log(`[MDPI Filter CS] Highlighting item with refId ${refId}:`, item);
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
            chrome.runtime.sendMessage({ action: 'updateBadge', text: text, count: badgeCount, color: mdpiColor }).catch(e => {
              if (!e.message.includes("Receiving end does not exist")) {
                // console.warn("[MDPI Filter CS] Error sending updateBadge message:", e.message);
              }
            });
            // Send message to popup if it's open
            chrome.runtime.sendMessage({ action: 'updateReferences', references: collectedMdpiReferences }).catch(e => {
              if (!e.message.includes("Receiving end does not exist") && !e.message.includes("The message port closed before a response was received.")) {
                // console.warn("[MDPI Filter CS] Error sending updateReferences message to popup:", e.message);
              }
            });
          } else {
            // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Extension context invalidated. Cannot send message.");
          }
          // Call the function to style inline footnotes and other UI updates
          if (typeof window.MDPIFilterUtils !== 'undefined' && typeof window.MDPIFilterUtils.styleInlineFootnotes === 'function') {
            window.MDPIFilterUtils.styleInlineFootnotes(collectedMdpiReferences, mdpiColor);
          }
          // If there are no MDPI references on a non-search page, ensure the "no references found" message is potentially shown.
          if (collectedMdpiReferences.length === 0 && !window.MDPIFilterDomainUtils.getActiveSearchConfig(window.location.hostname, window.location.pathname, domains)) {
            // console.log("[MDPI Filter CS] No MDPI references found on a non-search page. Popup might show 'No MDPI references found'.");
          }
        }

        const extractReferenceData = (item) => {
          // Use MDPIFilterReferenceIdExtractor to get/generate an internal ID (e.g., "mdpi-ref-X")
          // This also sets 'data-mdpi-filter-ref-id' on the item.
          const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(item, refIdCounter);
          refIdCounter = updatedRefIdCounter;
          const textContent = item.textContent || '';
          const primaryLink = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, window.MDPIFilterLinkExtractionSelectors);

          // Determine the ID to be used for linking inline footnotes.
          // Prefer item.id, then data-bib-id, then fallback to extractedId.
          const actualListItemDomId = item.id || item.getAttribute('data-bib-id') || extractedId;
          return {
            id: extractedId,
            text: sanitize(textContent.substring(0, 250) + (textContent.length > 250 ? '...' : '')),
            fullText: textContent,
            primaryLink: primaryLink,
            listItemDomId: actualListItemDomId
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
          console.log(`[MDPI Filter CS] Found ${items.length} items for search processing using selector: ${config.itemSelector || config.container}`);
        
          let mdpiResultsCount = 0; 
          const runCache = new Map(); 
        
          for (const item of items) { 
            let isMdpiResult = false;
            const itemPreviewText = (item.textContent || "").substring(0, 70).trim().replace(/\s+/g, ' ');
            // console.log(`[MDPI Filter CS Search] Processing item: "${itemPreviewText}..."`);
        
            // 1. Direct MDPI link check (using config.linkSelector for MDPI domains/DOIs)
            if (config.linkSelector) {
              const mdpiLinkElement = item.querySelector(config.linkSelector);
              if (mdpiLinkElement && mdpiLinkElement.href) {
                // For current googleWeb, config.linkSelector is 'a[href*="mdpi.com"]'.
                // This check ensures the link actually matches MDPI_DOMAIN or MDPI_DOI_REGEX.
                if (mdpiLinkElement.href.includes(MDPI_DOMAIN) || MDPI_DOI_REGEX.test(mdpiLinkElement.href)) {
                  isMdpiResult = true;
                  // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (direct MDPI link via config.linkSelector).`);
                }
              }
            }
        
            // 2. NCBI API Check (if useNcbiApi is true and not already identified as MDPI)
            if (!isMdpiResult && config.useNcbiApi) {
              // Try to find the primary link of the search result item.
              // Common Google search result link structure:
              let mainLinkElement = item.querySelector('div.yuRUbf > a[href]');
              if (!mainLinkElement) {
                // Fallback for other structures or if yuRUbf is not present (e.g., image items might not have it)
                // or for other search engines where yuRUbf doesn't apply.
                mainLinkElement = item.querySelector('a[href]');
              }

              if (mainLinkElement && mainLinkElement.href) {
                const mainLinkHref = mainLinkElement.href;
                let idToCheck = null;
                let idType = null;
        
                // Extract PMID from pubmed.ncbi.nlm.nih.gov links
                const pmidMatch = mainLinkHref.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
                if (pmidMatch && pmidMatch[1]) {
                  idToCheck = pmidMatch[1];
                  idType = 'pmid';
                }
        
                // Extract PMCID from ncbi.nlm.nih.gov/pmc/articles/ links
                if (!idToCheck) {
                  const pmcidMatch = mainLinkHref.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
                  if (pmcidMatch && pmcidMatch[1]) {
                    idToCheck = pmcidMatch[1];
                    idType = 'pmcid';
                  }
                }

                // Extract PMCID from europepmc.org links (e.g., /articles/PMC..., /article/PMC/PMC...)
                if (!idToCheck) {
                  const europePmcPmcidMatch = mainLinkHref.match(/europepmc\.org\/(?:articles|article\/PMC)\/(PMC\d+)/i);
                  if (europePmcPmcidMatch && europePmcPmcidMatch[1]) {
                    idToCheck = europePmcPmcidMatch[1];
                    idType = 'pmcid';
                    // console.log(`[MDPI Filter CS Search] Extracted EuropePMC PMCID: ${idToCheck} from ${mainLinkHref}`);
                  }
                }

                // Extract PMID from europepmc.org links (e.g., /articles/123..., /abstract/MED/123..., /article/med/123...)
                // Ensure it's purely numeric to treat as potential PMID
                if (!idToCheck) {
                  const europePmcPmidMatch = mainLinkHref.match(/europepmc\.org\/(?:articles|abstract\/MED|article\/med)\/(\d+)(?:\/?$|\?|#)/i);
                  if (europePmcPmidMatch && europePmcPmidMatch[1] && /^\d+$/.test(europePmcPmidMatch[1])) {
                    idToCheck = europePmcPmidMatch[1];
                    idType = 'pmid';
                    // console.log(`[MDPI Filter CS Search] Extracted EuropePMC PMID: ${idToCheck} from ${mainLinkHref}`);
                  }
                }
        
                // Extract DOI if the link is a DOI link (e.g. doi.org)
                // Only check non-MDPI DOIs via API, as MDPI DOIs would be caught by direct checks.
                if (!idToCheck && typeof window.MDPIFilterItemContentChecker?.extractDoiFromLinkInternal === 'function') {
                    const doiInLink = window.MDPIFilterItemContentChecker.extractDoiFromLinkInternal(mainLinkHref);
                    if (doiInLink && !doiInLink.startsWith(MDPI_DOI)) { 
                        idToCheck = doiInLink;
                        idType = 'doi';
                    }
                }
        
                if (idToCheck && idType) {
                  // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." requires NCBI check for ${idType}: ${idToCheck} from link ${mainLinkHref}.`);
                  isMdpiResult = await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi([idToCheck], idType, runCache, ncbiApiCache);
                  if (isMdpiResult) {
                    // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (NCBI API).`);
                  } else {
                    // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is NOT MDPI (NCBI API).`);
                  }
                }
              }
            }
        
            // 3. Fallback checks (if not already identified as MDPI)
            // These checks apply to the item's general content.
            if (!isMdpiResult && config.doiPattern && item.textContent && item.textContent.includes(config.doiPattern)) {
              isMdpiResult = true;
              // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (DOI pattern in text).`);
            }
            if (!isMdpiResult && config.htmlContains && item.innerHTML && item.innerHTML.includes(config.htmlContains)) {
              isMdpiResult = true;
              // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (HTML contains).`);
            }
            // Check for MDPI DOI regex in the item's text content
            if (!isMdpiResult && MDPI_DOI_REGEX.test(item.textContent || '')) {
              isMdpiResult = true;
              // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (MDPI DOI regex in text).`);
            }
            // Final fallback: check if any link within the item (not just the primary one identified by config.linkSelector) points to MDPI.
            if (!isMdpiResult) {
              // Check for any link containing MDPI domain or the MDPI DOI prefix.
              const anyMdpiLinkInItem = item.querySelector(`a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"]`);
              if (anyMdpiLinkInItem) {
                isMdpiResult = true;
                // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (fallback general MDPI link in item).`);
              }
            }
        
            if (isMdpiResult) {
              // Pass config to styleRef
              styleRef(item, `mdpi-search-${mdpiResultsCount + 1}`, config);
              mdpiResultsCount++;
            } else {
              // Remove highlight if previously set
              let highlightTarget = item;
              if (config && config.highlightTargetSelector) {
                const found = item.querySelector(config.highlightTargetSelector);
                if (found) highlightTarget = found;
              }
              highlightTarget.classList.remove('mdpi-highlighted-reference', 'mdpi-search-result-highlight', 'mdpi-hidden-reference', 'mdpi-search-result-hidden');
              highlightTarget.style.backgroundColor = '';
              highlightTarget.style.border = '';
              highlightTarget.style.padding = '';
              highlightTarget.style.display = '';
              highlightTarget.style.outline = '';
            }
          }
          // console.log(`[MDPI Filter CS] Processed search results. Found and styled ${mdpiResultsCount} MDPI results.`);
        
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
              type: 'mdpiUpdate', 
              data: {
                badgeCount: mdpiResultsCount, 
                references: [] 
              }
            }, response => { 
              if (chrome.runtime.lastError) {
                // console.warn("[MDPI Filter CS] Error sending search result badge update:", chrome.runtime.lastError.message);
              } else {
                // console.log("[MDPI Filter CS] Search result badge update sent. Response:", response);
              }
            });
          }
          isProcessing = false;
        }

        async function processAllReferences(runCache, settings) {
          // console.log("[MDPI Filter CS] processAllReferences called.");
          const collectedMdpiReferences = [];
          let mdpiFoundInRefs = false;
          const uniqueMdpiRefsForThisRun = new Map(); // Tracks unique MDPI refs by their generated ID for this run
        
          const referenceListSelectors = window.MDPIFilterReferenceSelectors;
          if (!referenceListSelectors) {
            // console.warn("[MDPI Filter CS] Reference selectors not found.");
            return { collectedMdpiReferences, mdpiFoundInRefs };
          }
          // console.log("[MDPI Filter CS] Using reference selectors:", referenceListSelectors);
        
          let allPotentialReferenceItems = Array.from(document.querySelectorAll(referenceListSelectors));
          // console.log(`[MDPI Filter CS] Found ${allPotentialReferenceItems.length} potential reference items initially.`);
        
          // --- Filter out items from "Similar Articles" and "Cited By/Impact" sections on EuropePMC article pages ---
          if (window.location.hostname.includes('europepmc.org') &&
              (window.location.pathname.includes('/article/') || window.location.pathname.match(/^\/(med|pmc)\//i)) && // Check for article-specific paths
              !window.location.pathname.startsWith('/search')) {
        
            // console.log("[MDPI Filter CS] On EuropePMC article page, filtering reference items.");
            allPotentialReferenceItems = allPotentialReferenceItems.filter(item => {
              const inSimilarArticles = item.closest('div#similar-articles');
              const inImpactSection = item.closest('div#impact'); // This section contains "Article citations"
        
              if (inSimilarArticles) {
                // console.log('[MDPI Filter CS] Filtering out item from EuropePMC "Similar Articles" section:', item.textContent.substring(0,100));
                return false;
              }
              if (inImpactSection) {
                // console.log('[MDPI Filter CS] Filtering out item from EuropePMC "Impact/Citations" section:', item.textContent.substring(0,100));
                return false;
              }
              return true;
            });
            // console.log(`[MDPI Filter CS] Found ${allPotentialReferenceItems.length} reference items after EuropePMC article page filtering.`);
          }
          // --- End of EuropePMC specific filtering ---
        
          const referenceItems = allPotentialReferenceItems; // Use the filtered list
        
          if (referenceItems.length === 0) {
            // console.log("[MDPI Filter CS] No reference items found after filtering (or initially).");
            updatePopupData([], 0); // Ensure popup is cleared if no refs
            return { collectedMdpiReferences, mdpiFoundInRefs };
          }
        
          // Reset expansion flags in link_extractor before processing items,
          // in case the page structure changed or accordions were closed.
          if (window.MDPIFilterLinkExtractor && typeof window.MDPIFilterLinkExtractor.resetExpansionFlags === 'function') {
            window.MDPIFilterLinkExtractor.resetExpansionFlags();
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
          sendUpdateToBackground(); // Call the new function after processing references
          isProcessing = false;
        }

        const debouncedRunAll = window.debounce(() => {
          runAll(); // This will now call the async runAll
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
            await processSearchEngineResults(searchConfig); // Pass the config and await
          } else {
            // console.log("[MDPI Filter CS] Not a search engine page or no specific config. Processing all references.");
            await processAllReferences(new Map()); // Pass a new Map instance and await
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

          // Wiley: If accordion is present and closed, click and wait for <ul>
          if (currentHostname.includes('onlinelibrary.wiley.com')) {
            const accordionControl = document.querySelector('div.article-accordion .accordion__control[aria-expanded="false"]');
            if (accordionControl) {
              accordionControl.click();
              // Wait for <ul> to appear (max 2s)
              let waited = 0;
              const interval = setInterval(() => {
                const ul = document.querySelector('div.article-accordion ul.rlist.separator');
                if (ul || waited > 2000) {
                  clearInterval(interval);
                  runAll();
                  setupMainObserver();
                }
                waited += 100;
              }, 100);
              return;
            }
          }

          runAll();
          setupMainObserver();

          function setupMainObserver() {
            if (mainObserverInstance) mainObserverInstance.disconnect();
            mainObserverInstance = new MutationObserver((mutationsList, observer) => {
              if (!(chrome.runtime && chrome.runtime.id)) {
                console.warn('[MDPI Filter] Main observer: Extension context invalidated. Skipping debouncedRunAll.');
                if(mainObserverInstance) mainObserverInstance.disconnect();
                return;
              }
              debouncedRunAll();
            });
            mainObserverInstance.observe(document.documentElement, {
              childList: true,
              subtree: true
            });
          }
        }

        // --- Message Listener for Scrolling ---
        if (chrome.runtime && chrome.runtime.onMessage) {
          chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            // Accept both scrollToRef and scrollToRefOnPage for compatibility
            if ((msg.type === 'scrollToRefOnPage' || msg.type === 'scrollToRef') && msg.refId) {
              // --- Wiley: Expand References Accordion if Needed ---
              if (window.location.hostname.includes('onlinelibrary.wiley.com')) {
                // Find the accordion control for "References"
                const accordionControls = document.querySelectorAll('div.article-accordion .accordion__control[aria-expanded="false"]');
                for (const control of accordionControls) {
                  const titleElement = control.querySelector('.section__title');
                  if (titleElement && titleElement.textContent.trim().toLowerCase() === 'references') {
                    control.click();
                    // Wait for the accordion to expand before scrolling
                    setTimeout(() => {
                      const refElem = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);
                      if (refElem) {
                        refElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        refElem.classList.add('mdpi-ref-scroll-highlight');
                        setTimeout(() => refElem.classList.remove('mdpi-ref-scroll-highlight'), 1500);
                      }
                    }, 400); // 400ms should be enough for the animation
                    sendResponse({ status: 'expanded-and-scrolled' });
                    return true;
                  }
                }
              }
              // --- Default: Just Scroll ---
              const refElem = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);
              if (refElem) {
                refElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                refElem.classList.add('mdpi-ref-scroll-highlight');
                setTimeout(() => refElem.classList.remove('mdpi-ref-scroll-highlight'), 1500);
                sendResponse({ status: 'scrolled' });
              } else {
                sendResponse({ status: 'not-found' });
              }
              return true;
            }
            return false; 
          });
        } else {
          console.warn("[MDPI Filter CS] chrome.runtime.onMessage not available. Scrolling from popup will not work.");
        }

        // --- Add highlight style for scroll feedback ---
        (function addMdpiScrollHighlightStyle() {
          if (!document.getElementById('mdpi-ref-scroll-highlight-style')) {
            const style = document.createElement('style');
            style.id = 'mdpi-ref-scroll-highlight-style';
            style.textContent = `
              .mdpi-ref-scroll-highlight {
                outline: 3px solid #E2211C !important;
                background: #ffe0e0 !important;
                transition: outline 0.2s, background 0.2s;
              }
            `;
            document.head.appendChild(style);
          }
        })();

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

        // Listen for force resend request from popup
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          if (msg && msg.type === 'forceResendMdpiReferences') {
            if (typeof sendUpdateToBackground === 'function') {
              sendUpdateToBackground();
              sendResponse({ status: 'resent' });
            } else {
              sendResponse({ status: 'no-func' });
            }
            return true;
          }
          // ...other listeners if any...
        });
      });
    } else {
      console.warn("[MDPI Filter CS] Extension context invalidated before storage access. Main script logic will not execute for this frame.");
    }
  } 
}
