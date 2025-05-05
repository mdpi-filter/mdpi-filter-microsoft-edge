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

// 1) Clear badge ONLY when the main URL changes during loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if status is loading AND a URL is provided in changeInfo
  if (changeInfo.status === 'loading' && changeInfo.url) {
    try {
      // Compare the new URL (without hash) to the existing tab URL (without hash)
      const newUrl = new URL(changeInfo.url);
      const oldUrl = new URL(tab.url); // Get current URL from tab object

      // Clear badge only if the origin or pathname has changed
      if (newUrl.origin !== oldUrl.origin || newUrl.pathname !== oldUrl.pathname) {
        chrome.action.setBadgeText({ text: '', tabId });
        console.log(`[MDPI Filter BG] Cleared badge for loading tab ${tabId} (URL changed)`);
      } else {
        // console.log(`[MDPI Filter BG] Tab ${tabId} loading, but URL path/origin unchanged (likely hash change). Badge not cleared.`);
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
      console.log(`[MDPI Filter BG] Injecting scripts into main frame of tab ${details.tabId}`);
      chrome.scripting.executeScript({
        target: { tabId: details.tabId, allFrames: false },
        files: [
          'content/domains.js',
          'content/sanitizer.js',
          'content/content_script.js'
        ]
      }).catch(e => { /* Ignore common injection errors */ });
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 3) Badge update listener
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'mdpiCount' && sender.tab?.id && typeof msg.count === 'number') {
    const tabId = sender.tab.id;
    const count = msg.count;
    const text = count > 0 ? String(count) : '';
    // console.log(`[MDPI Filter BG] Received count ${count} from tab ${tabId}. Setting badge text to '${text}'.`);
    try {
        chrome.action.setBadgeText({ text, tabId });
        if (count > 0) {
          chrome.action.setBadgeBackgroundColor({ color: '#E2211C', tabId });
        }
    } catch (e) { /* Ignore errors setting badge */ }
  }
});
