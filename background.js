// background.js
async function injectModules(tabId) {
  const files = [
    'content/utils.js',
    'content/domains.js',
    'content/sanitizer.js',
    'content/content_script.js'
  ];
  for (const file of files) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file]
    });
  }
}

chrome.webNavigation.onCompleted.addListener(
  details => injectModules(details.tabId),
  { url: [{ schemes: ['http','https'] }] }
);

chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => injectModules(details.tabId),
  { url: [{ schemes: ['http','https'] }] }
);
