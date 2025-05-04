// background.js
async function injectModules(tabId) {
  const modules = [
    'content/utils.js',
    'content/domains.js',
    'content/sanitizer.js',
    'content/content_script.js'
  ];
  for (const file of modules) {
    try { // Add try block
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true }, // Consider injecting into all frames if needed, or specify frameIds if known
        files: [file]
      });
    } catch (error) { // Add catch block
      // Log the error or ignore it if the tab/frame was likely closed
      // console.warn(`Failed to inject ${file} into tab ${tabId}: ${error.message}`);
      // Often, these errors mean the tab was closed before injection finished, so ignoring might be okay.
    }
  }
}

// Full page loads
chrome.webNavigation.onCompleted.addListener(
  details => {
    // Inject only into the main frame (frameId 0) on initial load
    if (details.frameId === 0) {
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// SPA / history‐state updates
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => {
    // Inject only into the main frame (frameId 0) on history updates
    if (details.frameId === 0) {
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);
