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
      console.log(`[MDPI Filter BG] Debounce executing injectModules for tab ${tabId} after ${wait}ms.`);
      func.apply(this, [tabId, ...args]);
    }, wait));
  };
};

// Debounced version of injectModules for history updates
const debouncedInjectForHistory = backgroundDebouncePerTab(injectModules, 300); // 300ms delay

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
    console.log(`[MDPI Filter BG] Successfully injected modules sequentially into tab ${tabId} (Trigger: ${triggerSource})`);
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

// 1. Clear badge on new load start
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only clear badge when the main frame starts loading a new URL
    if (changeInfo.status === 'loading' && changeInfo.url) {
         console.log(`[MDPI Filter BG] tabs.onUpdated status 'loading' for tab ${tabId}. Clearing badge.`);
         try {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
         } catch (error) { /* Ignore error if tab closed */ }
    }
    // REMOVED loadingTabs logic
});

// 2. Inject on initial completion (Primary Trigger for Full Loads)
chrome.webNavigation.onCompleted.addListener(
  details => {
    // Inject only when the main frame finishes loading
    if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] webNavigation.onCompleted triggered for main frame of tab ${details.tabId}.`);
      injectModules(details.tabId, "onCompleted");
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 3. Inject on history updates (Debounced Trigger for Fragment/SPA Nav)
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => {
     // Inject only for main frame history updates
     if (details.frameId === 0) {
        console.log(`[MDPI Filter BG] webNavigation.onHistoryStateUpdated triggered for main frame of tab ${details.tabId}. Queueing debounced injection.`);
        debouncedInjectForHistory(details.tabId, "onHistoryStateUpdated"); // Pass trigger source
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 4. Listen for messages (Badge Update Logic)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'mdpiCount' && sender.tab?.id) {
    const count = message.count;
    const text = count > 0 ? count.toString() : '';
    // REMOVED loadingTabs check - rely on message timing
    try {
        chrome.action.setBadgeText({ text: text, tabId: sender.tab.id });
        if (count > 0) {
            chrome.action.setBadgeBackgroundColor({ color: '#E2211C', tabId: sender.tab.id });
        }
        // console.log(`[MDPI Filter BG] Set badge text '${text}' for tab ${sender.tab.id}`);
    } catch (error) {
        // Ignore errors setting badge if tab is closed etc.
        // console.log(`[MDPI Filter BG] Error setting badge for tab ${sender.tab.id}: ${error.message}`);
    }
  }
  // Indicate async response possibility if needed in the future
  // return true;
});

// Optional: Clean up debounce map if a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    const existingTimeout = historyUpdateDebounceTimeouts.get(tabId);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
        historyUpdateDebounceTimeouts.delete(tabId);
        console.log(`[MDPI Filter BG] Cleared debounce timeout for closed tab ${tabId}.`);
    }
});
