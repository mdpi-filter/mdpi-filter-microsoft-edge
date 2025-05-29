// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const radios = document.querySelectorAll('input[name="mode"]');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');
  const reportBtn = document.getElementById('reportIssue');
  const referencesList = document.getElementById('referencesList');
  const referencesPlaceholder = document.getElementById('referencesPlaceholder');
  const referencesCountSpan = document.getElementById('referencesCount');

  // New elements for potential MDPI highlighting settings
  const highlightPotentialMdpiCheckbox = document.getElementById('highlightPotentialMdpi');
  const potentialMdpiColorInput = document.getElementById('potentialMdpiColor');
  const loggingEnabledCheckbox   = document.getElementById('loggingEnabled');

  // --- Settings Panel Toggle ---
  const settingsIcon = document.getElementById('settingsIcon');
  const settingsPanel = document.getElementById('settingsPanel');

  settingsIcon.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
  });

  // Optionally, close settings panel when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (
      settingsPanel.classList.contains('open') &&
      !settingsPanel.contains(e.target) &&
      e.target !== settingsIcon &&
      !settingsIcon.contains(e.target)
    ) {
      settingsPanel.classList.remove('open');
    }
  });

  // --- Load Mode Setting ---
  chrome.storage.sync.get({
    mode: 'highlight',
    highlightPotentialMdpiSites: false,
    potentialMdpiHighlightColor: '#FFFF99',
    loggingEnabled: false
  }, (settings) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading settings:", chrome.runtime.lastError);
      return;
    }
    radios.forEach(r => r.checked = (r.value === settings.mode));
    if (highlightPotentialMdpiCheckbox) {
      highlightPotentialMdpiCheckbox.checked = settings.highlightPotentialMdpiSites;
    }
    if (potentialMdpiColorInput) {
      potentialMdpiColorInput.value = settings.potentialMdpiHighlightColor;
    }
    if (loggingEnabledCheckbox) {
      loggingEnabledCheckbox.checked = settings.loggingEnabled;
    }
  });

  // --- Save Mode Setting ---
  saveBtn.addEventListener('click', () => {
    const selectedMode = Array.from(radios).find(r => r.checked).value;
    const highlightPotential = highlightPotentialMdpiCheckbox ? highlightPotentialMdpiCheckbox.checked : false;
    const potentialColor = potentialMdpiColorInput ? potentialMdpiColorInput.value : '#FFFF99';
    const loggingEnabled = loggingEnabledCheckbox   ? loggingEnabledCheckbox.checked : false;

    chrome.storage.sync.set({
      mode: selectedMode,
      highlightPotentialMdpiSites: highlightPotential,
      potentialMdpiHighlightColor: potentialColor,
      loggingEnabled
    }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Error saving settings.';
        console.error("Error saving settings:", chrome.runtime.lastError);
      } else {
        status.textContent = `Settings saved. Mode: "${selectedMode}". Potential highlighting: ${highlightPotential ? `ON (${potentialColor})` : 'OFF'}. Logging: ${loggingEnabled ? 'ON' : 'OFF'}.`;
      }
      setTimeout(() => status.textContent = '', 3500); // Increased timeout
    });
  });

  // --- Report Issue Button ---
  reportBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        const currentTabUrl = tabs[0].url;
        const githubRepo = 'mdpi-filter/mdpi-filter-chrome';
        const currentMode = Array.from(radios).find(r => r.checked)?.value || 'N/A';
        const manifest = chrome.runtime.getManifest();
        const extensionName = manifest.name;
        const extensionVersion = manifest.version;

        const issueTitle = encodeURIComponent(`Filter Issue on: ${currentTabUrl}`);
        const issueBody = encodeURIComponent(
`**Report a filter issue**

Report filter issues with specific websites to the ${githubRepo} issue tracker. Requires a GitHub account.

To avoid burdening volunteers with duplicate reports, please verify that the issue has not already been reported by searching the existing issues:
https://github.com/${githubRepo}/issues

*Note: clicking the button will cause the page's origin to be sent to GitHub.*

---

**Address of the webpage:**

${currentTabUrl}

**Describe the filter issue:**

[Please describe the problem you encountered. Was an MDPI result missed? Was a non-MDPI result incorrectly flagged? Provide details.]

---
**Troubleshooting Information:**

*   **Extension Name:** ${extensionName}
*   **Extension Version:** ${extensionVersion}
*   **Current Filter Mode:** ${currentMode}
*   **Browser:** [Please fill in - e.g., Chrome 123.0.6312.122]
*   **Operating System:** [Please fill in - e.g., Windows 11 / macOS Sonoma]

**Screenshots (Optional but helpful):**

[If applicable, drag and drop screenshots here to help explain the problem.]

**Additional context (Optional):**

[Add any other context about the problem here, e.g., specific search query used.]
`);
        const githubIssueUrl = `https://github.com/${githubRepo}/issues/new?title=${issueTitle}&body=${issueBody}`;
        chrome.tabs.create({ url: githubIssueUrl });
      } else {
        status.textContent = 'Could not get current tab URL.';
        setTimeout(() => status.textContent = '', 3000);
      }
    });
  });

  // --- Load and Display References ---
  function displayReferences(referencesArray, isLoading = false) {
    console.log('[MDPI Filter Popup] displayReferences called. Received:', referencesArray);
    // --- DEDUPLICATE REFERENCES ---
    // Use DOI if available, else fallback to sanitized text as key
    const seen = new Set();
    const dedupedReferences = [];
    if (Array.isArray(referencesArray)) {
      for (const ref of referencesArray) {
        // Try to use DOI as a unique key if present
        let key = '';
        if (ref.doi) {
          key = ref.doi.trim().toLowerCase();
        } else if (ref.text) {
          key = ref.text.replace(/\s+/g, ' ').trim().toLowerCase();
        } else if (typeof ref === 'string') {
          key = ref.replace(/\s+/g, ' ').trim().toLowerCase();
        }
        if (key && !seen.has(key)) {
          seen.add(key);
          dedupedReferences.push(ref);
        }
      }
    }
    const validReferences = dedupedReferences;
    const count = validReferences.length;

    // Update count or status text
    if (isLoading) {
      referencesCountSpan.textContent = 'Loading';
    } else if (count === 0) {
      referencesCountSpan.textContent = 'No';
    } else {
      referencesCountSpan.textContent = count;
    }

    // Clear only dynamically added <li> items, keeping the static placeholder structure
    Array.from(referencesList.querySelectorAll('li:not(#referencesPlaceholder)'))
         .forEach(li => li.remove());

    if (isLoading) {
      referencesPlaceholder.textContent = 'Loading references...';
      referencesPlaceholder.classList.remove('error');
      referencesPlaceholder.style.display = 'block';
      return;
    }

    if (count === 0) {
      // Only show "No references" if not loading and not in error state
      if (!referencesPlaceholder.classList.contains('error') && referencesPlaceholder.textContent !== 'Loading references...') {
        referencesPlaceholder.textContent = 'No MDPI references detected on this page.';
      }
      referencesPlaceholder.style.display = 'block';
    } else { // count > 0
      referencesPlaceholder.style.display = 'none'; // Hide static placeholder

      validReferences.forEach(ref => {
        // Defensive check for ref structure
        if (typeof ref !== 'object' || ref === null || typeof ref.id !== 'string' || typeof ref.text !== 'string') {
          console.warn('[MDPI Filter Popup] Skipping invalid reference object:', ref);
          return; // Skip this malformed reference
        }

        const li = document.createElement('li');
        li.dataset.refId = ref.id;
        li.title = "Click to scroll to reference";

        if (ref.number) {
          const refNumberSpan = document.createElement('span');
          refNumberSpan.className = 'ref-number';
          refNumberSpan.textContent = escapeHtml(String(ref.number)) + '. ';
          li.appendChild(refNumberSpan);
        }

        const refTextSpan = document.createElement('span');
        refTextSpan.className = 'ref-text';
        refTextSpan.textContent = escapeHtml(ref.text);
        li.appendChild(refTextSpan);

        referencesList.appendChild(li); // Add new items after the placeholder (which is now hidden)
      });
    }
  }

  // --- Add Click Listener for Scrolling ---
  referencesList.addEventListener('click', (event) => {
    const clickedLi = event.target.closest('li[data-ref-id]');
    if (clickedLi) {
      const refId = clickedLi.dataset.refId;
      console.log('[MDPI Filter Popup] User clicked reference with refId:', refId);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          const tabId = tabs[0].id;
          // First, check if the element exists
          chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            func: (id) => {
              const element = document.querySelector(`[data-mdpi-filter-ref-id="${id}"]`);
              // This log helps confirm the element is found by the selector
              console.log(`[MDPI Filter DEBUG] Existence check for refId: ${id}`, element ? 'Found' : 'Not Found', element ? element.outerHTML.substring(0, 200) : null);
              return !!element;
            },
            args: [refId]
          }, (existenceResults) => {
            if (chrome.runtime.lastError) {
              console.error('[MDPI Filter Popup] Error checking element existence:', chrome.runtime.lastError.message);
              return;
            }

            // Check if any frame reported the element exists
            const elementExistsInAnyFrame = existenceResults && existenceResults.some(frameResult => frameResult && frameResult.result === true);

            if (elementExistsInAnyFrame) {
              console.log(`[MDPI Filter Popup] Element with refId ${refId} EXISTS in at least one frame. Proceeding to scroll.`);
              
              chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                func: (id) => {
                  const elementToScroll = document.querySelector(`[data-mdpi-filter-ref-id="${id}"]`);
                  if (elementToScroll) {
                    const rect = elementToScroll.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(elementToScroll);
                    
                    let logMessage = `[MDPI Filter DEBUG] Attempting to scroll to element for ${id}: ${elementToScroll.tagName}#${elementToScroll.id}.${elementToScroll.className}\n`;
                    logMessage += `  OffsetParent: ${elementToScroll.offsetParent ? elementToScroll.offsetParent.tagName : 'null'}\n`;
                    logMessage += `  BoundingClientRect: { top: ${rect.top}, left: ${rect.left}, width: ${rect.width}, height: ${rect.height} }\n`;
                    logMessage += `  ComputedStyle: { display: ${computedStyle.display}, visibility: ${computedStyle.visibility}, opacity: ${computedStyle.opacity}, position: ${computedStyle.position} }\n`;
                    logMessage += `  ScrollValues: { scrollWidth: ${elementToScroll.scrollWidth}, scrollHeight: ${elementToScroll.scrollHeight}, clientWidth: ${elementToScroll.clientWidth}, clientHeight: ${elementToScroll.clientHeight} }\n`;
                    
                    let current = elementToScroll;
                    const ancestorPath = [];
                    let depth = 0;
                    while(current && current !== document.body && depth < 10) { // Limit depth to avoid excessive logging
                      const style = window.getComputedStyle(current);
                      const currentRect = current.getBoundingClientRect();
                      ancestorPath.push({
                        tagName: current.tagName,
                        id: current.id,
                        class: current.className,
                        display: style.display,
                        visibility: style.visibility,
                        opacity: style.opacity,
                        position: style.position,
                        width: currentRect.width, 
                        height: currentRect.height,
                        offsetWidth: current.offsetWidth,
                        offsetHeight: current.offsetHeight,
                        offsetParent: current.offsetParent ? current.offsetParent.tagName : 'null'
                      });
                      if (style.display === 'none' || style.visibility === 'hidden' || currentRect.width === 0 || currentRect.height === 0) {
                        logMessage += `  WARNING: Ancestor ${current.tagName}${current.id ? '#'+current.id : ''} might be hiding the element. Display: ${style.display}, Visibility: ${style.visibility}, Width: ${currentRect.width}, Height: ${currentRect.height}\n`;
                      }
                      current = current.parentElement;
                      depth++;
                    }
                    logMessage += `  Ancestor Path (first ${ancestorPath.length}): ${JSON.stringify(ancestorPath, null, 1)}\n`;
                    console.log(logMessage);

                    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || rect.width === 0 || rect.height === 0 || computedStyle.opacity === '0') {
                      console.warn(`[MDPI Filter DEBUG] Element ${id} may not be effectively visible or has no dimensions. Scroll might fail or not be noticeable. Display: ${computedStyle.display}, Visibility: ${computedStyle.visibility}, Opacity: ${computedStyle.opacity}, Width: ${rect.width}, Height: ${rect.height}`);
                    }

                    elementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    elementToScroll.classList.add('mdpi-ref-scroll-highlight');
                    elementToScroll.style.outline = '3px solid orange'; 
                    
                    setTimeout(() => {
                      elementToScroll.classList.remove('mdpi-ref-scroll-highlight');
                      elementToScroll.style.outline = ''; 
                    }, 2500); 
                    return true; 
                  }
                  // This console.log will execute in the content script context if the element is not found in a particular frame
                  console.log(`[MDPI Filter DEBUG] Element with ID ${id} not found during scroll attempt in this frame.`);
                  return false;
                },
                args: [refId]
              }, (scrollResults) => {
                if (chrome.runtime.lastError) {
                  console.error('[MDPI Filter Popup] Error during scroll execution:', chrome.runtime.lastError.message);
                } else if (scrollResults && scrollResults.some(frameResult => frameResult && frameResult.result === true)) {
                  console.log(`[MDPI Filter Popup] Successfully initiated scroll for element with refId ${refId} in at least one frame.`);
                } else {
                  console.warn(`[MDPI Filter Popup] Could not scroll to element with refId ${refId}. Element might not be visible, scrollable, or found in any frame during the scroll attempt itself. See content script logs for details from specific frames.`);
                }
              });
            } else {
              console.warn(`[MDPI Filter Popup] Element with refId ${refId} DOES NOT EXIST or not found in any frame during pre-scroll check. See content script logs for details from specific frames.`);
            }
          });
        } else {
          console.error("[MDPI Filter Popup] Could not get active tab ID.");
        }
      });
    }
  });

  // Helper to escape HTML
  function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === 'undefined') return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  // --- Robust Reference Loader with Retry ---
  function loadReferencesWithRetry(retries = 3, delayMs = 300, allowForceResend = true) {
    let loading = true;
    displayReferences([], true); // Show "Loading" in count and placeholder

    function tryLoad(attempt) {
      chrome.runtime.sendMessage({ type: 'getMdpiReferences' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error getting references:", chrome.runtime.lastError.message);
          referencesPlaceholder.textContent = 'Error loading references.';
          referencesPlaceholder.classList.add('error');
          displayReferences([]);
          loading = false;
        } else if (response && response.references && Array.isArray(response.references)) {
          if (response.references.length === 0 && attempt < retries) {
            setTimeout(() => tryLoad(attempt + 1), delayMs);
          } else if (response.references.length === 0 && allowForceResend) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs.length > 0 && tabs[0].id != null) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'forceResendMdpiReferences' }, () => {
                  setTimeout(() => loadReferencesWithRetry(1, 300, false), 350);
                });
              } else {
                displayReferences([]);
                loading = false;
              }
            });
          } else {
            loading = false;
            displayReferences(response.references);
          }
        } else {
          referencesPlaceholder.textContent = 'Could not load references from page.';
          referencesPlaceholder.classList.add('error');
          displayReferences([]);
          loading = false;
        }
      });
    }

    tryLoad(0);
  }

  // --- Call the robust loader on popup open ---
  loadReferencesWithRetry();
});
