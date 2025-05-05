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

// 1) Clear badge when a tab starts loading a new URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

// 2) Inject on every full load (main frame)
chrome.webNavigation.onCompleted.addListener(
  details => {
    if (details.frameId === 0) {
      chrome.scripting.executeScript({
        target: { tabId: details.tabId, allFrames: true },
        files: [
          'content/domains.js',
          'content/sanitizer.js',
          'content/utils.js',         // if you still need debounce inside content-script
          'content/content_script.js'
        ]
      }).catch(e => {
        // ignore navigation‐race errors
      });
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 3) Badge update listener
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'mdpiCount' && sender.tab?.id) {
    const text = msg.count > 0 ? String(msg.count) : '';
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    if (msg.count > 0) {
      chrome.action.setBadgeBackgroundColor({ color: '#E2211C', tabId: sender.tab.id });
    }
  }
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
