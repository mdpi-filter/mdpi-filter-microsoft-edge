// background.js

// --- Robust Per-Tab Debounce ---
const historyUpdateDebounceTimeouts = new Map();
const backgroundDebouncePerTab = (func, wait) => {
  return (tabId, ...args) => {
    const existingTimeout = historyUpdateDebounceTimeouts.get(tabId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      // console.log(`[MDPI Filter BG] Debounce cleared existing timeout for tab ${tabId}.`);
    }
    // console.log(`[MDPI Filter BG] Debounce setting new timeout for tab ${tabId} (${wait}ms).`);
    historyUpdateDebounceTimeouts.set(tabId, setTimeout(() => {
      historyUpdateDebounceTimeouts.delete(tabId); // Clean up map
      debugLog(`[MDPI Filter BG] Debounce executing injectModules for tab ${tabId} after ${wait}ms.`);
      func.apply(this, [tabId, ...args]);
    }, wait));
  };
};

// Debounced version of injectModules for history updates
// const debouncedInjectForHistory = backgroundDebouncePerTab(injectModules, 300); // 300ms delay

// --- Data Store for References ---
const tabReferenceData = {}; // { tabId: [references] }

// --- Helper: Deduplicate references by DOI or sanitized text ---
function deduplicateReferences(referencesArray) {
  const seen = new Set();
  const deduped = [];
  for (const ref of referencesArray) {
    let key = '';
    if (ref.doi) {
      key = ref.doi.trim().toLowerCase();
    } else if (ref.text) {
      key = ref.text.replace(/\s+/g, ' ').trim().toLowerCase();
    }
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(ref);
    }
  }
  return deduped;
}

async function injectModules(tabId, triggerSource = "unknown") {
  console.log(`[MDPI Filter BG] injectModules called for tab ${tabId} by ${triggerSource}`);
  // --- Ensure the guard variable is reset ---
  try {
    await chrome.scripting.executeScript({
        target: { tabId, allFrames: true }, // Target all frames for reset
        func: () => {
            if (typeof window !== 'undefined') {
                delete window.mdpiFilterInjected;
                // console.log('[MDPI Filter BG Pre-Inject] Attempted reset window.mdpiFilterInjected');
            }
        },
        world: "MAIN" // Try resetting in MAIN world too, although content scripts are isolated
    });
     await chrome.scripting.executeScript({
        target: { tabId, allFrames: true }, // Target all frames for reset
        func: () => {
            if (typeof window !== 'undefined') {
                delete window.mdpiFilterInjected;
                // console.log('[MDPI Filter BG Pre-Inject] Attempted reset window.mdpiFilterInjected (ISOLATED)');
            }
        }
        // Default is ISOLATED world
    });
  } catch(e) {
      // console.warn('[MDPI Filter BG Pre-Inject] Failed to reset guard:', e.message);
  }
  // ---

  const modules = [
    'content/domains.js',
    'content/sanitizer.js',
    'content/utils.js',
    'content/cache_manager.js',
    'content/google_content_checker.js', // Ensure this is present
    'content/reference_selectors.js',
    'content/inline_footnote_selectors.js',
    'content/inline_footnote_styler.js',
    'content/cited_by_selectors.js',
    'content/cited_by_styler.js',
    'content/similar_articles_selectors.js', // New
    'content/similar_articles_styler.js',   // New
    'content/link_extraction_selectors.js',
    'content/link_extractor.js',
    'content/item_content_checker.js',
    'content/reference_id_extractor.js',
    'content/ncbi_api_handler.js',
    'content/cited_by_processor.js',
    'content/similar_articles_processor.js', // New
    'content/content_script.js'
  ];
  try {
    // Inject sequentially into the main frame only initially? Let's stick to allFrames for now.
    for (const file of modules) {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true }, // Inject into all frames
            files: [file]
        });
    }
    debugLog(`[MDPI Filter BG] Successfully injected modules sequentially into tab ${tabId} (Trigger: ${triggerSource})`);
  } catch (error) {
     // Ignore common errors during navigation/injection races
     if (!(error.message.includes('Cannot access') ||
           error.message.includes('Receiving end does not exist') ||
           error.message.includes('context invalidated') ||
           error.message.includes('Could not establish connection') ||
           error.message.includes('No tab with id'))) {
        console.warn(`[MDPI Filter BG] Failed to inject modules into tab ${tabId} (Trigger: ${triggerSource}):`, error);
     }
  }
}

// --- Simplified Event Listeners ---

// 1) Clear badge AND reference data when the main URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if status is loading AND a URL is provided in changeInfo
  if (changeInfo.status === 'loading' && changeInfo.url) {
    try {
      // Compare the new URL (without hash) to the existing tab URL (without hash)
      const newUrl = new URL(changeInfo.url);
      if (tab.url) { // Check if tab.url is defined and not empty
        const oldUrl = new URL(tab.url); // Get current URL from tab object

        // Clear badge and references only if the origin or pathname has changed
        if (newUrl.origin !== oldUrl.origin || newUrl.pathname !== oldUrl.pathname) {
          chrome.action.setBadgeText({ text: '', tabId });
          delete tabReferenceData[tabId]; // Clear stored references for the tab
          debugLog(`[MDPI Filter BG] Cleared badge and references for loading tab ${tabId} (URL changed)`);
        } else {
          // console.log(`[MDPI Filter BG] Tab ${tabId} loading, but URL path/origin unchanged (likely hash change). Badge not cleared.`);
        }
      } else {
        // console.log(`[MDPI Filter BG] Tab ${tabId} loading, but tab.url is not yet available. Badge not cleared.`);
        // Potentially clear badge here if changeInfo.url indicates a new navigation
        // and oldUrl is not available to compare. This might be too aggressive.
        // For now, if oldUrl can't be determined, we don't clear.
      }
    } catch (e) {
       // Ignore errors (e.g., invalid URLs, tab closed)
       // console.log(`[MDPI Filter BG] Error during tabs.onUpdated check for tab ${tabId}: ${e.message}`);
    }
  }
});

// 2) Inject on every full load (main frame ONLY)
chrome.webNavigation.onCompleted.addListener(
  details => {
    if (details.frameId === 0) {
      debugLog(`[MDPI Filter BG] webNavigation.onCompleted: Tab ${details.tabId} main frame completed loading.`);
      // Assuming manifest.json handles all script injections now.
      // If issues persist with scripts not loading, this might need to be revisited,
      // but for now, rely on manifest to avoid double injection or conflicts.
      // injectModules(details.tabId, "webNavigation.onCompleted"); // Commented out
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 3) Message listener for updates, popup requests, AND scroll requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  // Message from Content Script with count and references
  // Make it robust: check for msg.type === 'mdpiUpdate' OR msg.action === 'mdpiUpdate'
  const isMdpiUpdateMessage = (msg.type === 'mdpiUpdate' || msg.action === 'mdpiUpdate');

  if (isMdpiUpdateMessage && sender.tab?.id) {
    const tabId = sender.tab.id;
    const data = msg.data || {};
    // --- Deduplicate references before storing and counting ---
    const references = Array.isArray(data.references) ? deduplicateReferences(data.references) : [];
    const count = references.length;
    // Update badge
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#E2211C', tabId: tabId });
    // Store deduplicated references
    tabReferenceData[tabId] = references;
    // console.log(`[MDPI Filter BG] Updated references for tab ${tabId}. Count: ${count}. Refs:`, references);
    // console.log(`[MDPI Filter BG] tabReferenceData for tab ${tabId} after update:`, tabReferenceData[tabId]);

    sendResponse({ status: "success", message: "MDPI update processed by background." });
    // No need to return true here as sendResponse is called synchronously for this message type.
  } else if (msg.type === 'getMdpiReferences') {
    const queryOptions = { active: true, currentWindow: true };
    chrome.tabs.query(queryOptions, (tabs) => {
      if (chrome.runtime.lastError) {
        debugErr("[MDPI Filter BG] Error querying active tab for getMdpiReferences:", chrome.runtime.lastError.message);
        sendResponse({ error: "Could not get active tab", references: [] });
        return;
      }
      if (tabs && tabs.length > 0) {
        const activeTabId = tabs[0].id;
        const refsForTab = tabReferenceData[activeTabId] || [];
        // console.log(`[MDPI Filter BG] Popup requested references for tab ${activeTabId}. Sending ${refsForTab.length} refs:`, refsForTab);
        sendResponse({ references: deduplicateReferences(refsForTab) });
      } else {
        // console.warn("[MDPI Filter BG] getMdpiReferences: No active tab found or tabs array empty.");
        sendResponse({ error: "No active tab found", references: [] });
      }
    });
    return true; // Indicates sendResponse will be called asynchronously
  } else if (msg.type === 'scrollToRef' && msg.refId) {
    const tabIdToScroll = msg.tabId || sender.tab?.id;
    if (tabIdToScroll) {
      chrome.tabs.sendMessage(tabIdToScroll, { type: 'scrollToRefOnPage', refId: msg.refId }, response => {
        if (chrome.runtime.lastError) {
          // console.warn(`[MDPI Filter BG] Error sending scrollToRefOnPage to tab ${tabIdToScroll}: ${chrome.runtime.lastError.message}`);
          sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
        } else {
          // console.log(`[MDPI Filter BG] scrollToRefOnPage response from content script:`, response);
          sendResponse(response || { status: 'success', message: 'Scroll message sent.' });
        }
      });
    } else {
      // console.warn("[MDPI Filter BG] scrollToRef: No tab ID available to send scroll message.");
      sendResponse({ status: 'error', message: 'No tab ID for scrolling.' });
    }
    return true; // Indicates sendResponse will be called asynchronously
  }
  // If other message types are added and are async, they also need to return true.
});

// Clean up references when a tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  delete tabReferenceData[tabId];
  debugLog(`[MDPI Filter BG] Cleared references for closed tab ${tabId}.`);
});

// --- Logging Configuration (injected) ---
let loggingEnabled = false;
chrome.storage.sync.get('loggingEnabled', res => {
  if (typeof res.loggingEnabled === 'boolean') {
    loggingEnabled = res.loggingEnabled;
  }
});
chrome.storage.onChanged.addListener(changes => {
  if (changes.loggingEnabled) {
    loggingEnabled = changes.loggingEnabled.newValue;
  }
});
function debugLog(...args)  { if (loggingEnabled) console.log(...args); }
function debugWarn(...args) { if (loggingEnabled) console.warn(...args); }
function debugErr(...args)  { console.error(...args); /* always show errors */ }
