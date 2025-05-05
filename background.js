// background.js

const loadingTabs = new Set(); // Track tabs currently loading

// Simplified Debounce function for background script
let historyUpdateTimeout;
const backgroundDebounceSimple = (func, wait) => {
  return (tabId, ...args) => {
    console.log(`[MDPI Filter BG] Debounce triggered for tab ${tabId}. Clearing previous timeout.`);
    clearTimeout(historyUpdateTimeout);
    historyUpdateTimeout = setTimeout(() => {
      // Check if tab is still loading before executing
      if (loadingTabs.has(tabId)) {
          console.log(`[MDPI Filter BG] Debounce skipped for tab ${tabId} because it's still loading.`);
          return;
      }
      console.log(`[MDPI Filter BG] Debounce executing injectModules for tab ${tabId} after ${wait}ms.`);
      func.apply(this, [tabId, ...args]);
    }, wait);
  };
};

const debouncedInjectForHistory = backgroundDebounceSimple(injectModules, 250);

async function injectModules(tabId) {
  // --- Ensure the guard variable is reset ---
  try {
    await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
            if (typeof window !== 'undefined') {
                delete window.mdpiFilterInjected;
                console.log('[MDPI Filter BG Pre-Inject] Reset window.mdpiFilterInjected');
            }
        }
    });
  } catch(e) { /* Ignore */ }
  // ---

  const modules = [
    'content/domains.js',
    'content/sanitizer.js',
    'content/content_script.js'
  ];
  try {
    for (const file of modules) {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: [file]
        });
    }
    console.log(`[MDPI Filter BG] Successfully injected modules sequentially into tab ${tabId}`);
  } catch (error) {
     if (error.message.includes('Cannot access') || error.message.includes('Receiving end does not exist') || error.message.includes('context invalidated')) {
        // console.log(`[MDPI Filter BG] Injection error (likely navigation/timing): ${error.message}`);
     } else {
        console.warn(`[MDPI Filter BG] Failed to inject modules into tab ${tabId}:`, error);
     }
  }
}

// --- Listener Order Matters ---

// 1. Track tab loading status and clear badge on new load start
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
         console.log(`[MDPI Filter BG] onUpdated status 'loading' for tab ${tabId}. Adding to loadingTabs and clearing badge.`);
         loadingTabs.add(tabId); // Add tab to loading set
         try {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
         } catch (error) { /* Ignore */ }
    } else if (changeInfo.status === 'complete') {
        // Remove tab from loading set when loading is complete
        console.log(`[MDPI Filter BG] onUpdated status 'complete' for tab ${tabId}. Removing from loadingTabs.`);
        loadingTabs.delete(tabId);
    }
});

// 2. Inject on initial completion
chrome.webNavigation.onCompleted.addListener(
  details => {
    // Inject only into the main frame after it's fully loaded
    if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] onCompleted triggered for tab ${details.tabId}. Removing from loadingTabs and injecting.`);
      // Ensure tab is removed from loading set before injecting
      loadingTabs.delete(details.tabId);
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 3. Inject on history updates (debounced and only if not loading)
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => {
     if (details.frameId === 0) {
        // Only queue injection if the tab is NOT currently in the loading set
        if (!loadingTabs.has(details.tabId)) {
            console.log(`[MDPI Filter BG] onHistoryStateUpdated triggered for tab ${details.tabId} (not loading), queueing debounced injection.`);
            debouncedInjectForHistory(details.tabId);
        } else {
            console.log(`[MDPI Filter BG] onHistoryStateUpdated triggered for tab ${details.tabId}, but skipped injection (still loading).`);
        }
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 4. Listen for messages (no change needed here)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'mdpiCount' && sender.tab?.id) {
    const count = message.count;
    const text = count > 0 ? count.toString() : '';
    try {
        // Check if tab is still loading before setting badge (belt-and-suspenders)
        if (!loadingTabs.has(sender.tab.id)) {
            chrome.action.setBadgeText({ text: text, tabId: sender.tab.id });
            if (count > 0) {
                chrome.action.setBadgeBackgroundColor({ color: '#E2211C', tabId: sender.tab.id });
            }
            console.log(`[MDPI Filter BG] Set badge text '${text}' for tab ${sender.tab.id}`);
        } else {
             console.log(`[MDPI Filter BG] Received count ${count} for tab ${sender.tab.id}, but badge update skipped (still loading).`);
        }
    } catch (error) { /* Ignore */ }
  }
});

// Optional: Clean up loadingTabs if a tab is closed while loading
chrome.tabs.onRemoved.addListener((tabId) => {
    if (loadingTabs.has(tabId)) {
        console.log(`[MDPI Filter BG] Tab ${tabId} closed while loading, removing from loadingTabs.`);
        loadingTabs.delete(tabId);
    }
});
