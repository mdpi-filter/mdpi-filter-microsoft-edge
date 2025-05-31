const radios = document.querySelectorAll('input[name="mode"]');
const saveBtn = document.getElementById('save');
const status = document.getElementById('status');

// New elements for potential MDPI highlighting settings in options page
const highlightPotentialMdpiCheckboxOptions = document.getElementById('highlightPotentialMdpiOptions');
const potentialMdpiColorInputOptions = document.getElementById('potentialMdpiColorOptions');
const loggingCheckboxOptions = document.getElementById('loggingEnabledOptions');

function loadOptions() {
  chrome.storage.sync.get({
    mode: 'highlight',
    highlightPotentialMdpiSites: false,
    potentialMdpiHighlightColor: '#FFFF99',
    loggingEnabled: false,
    ncbiApiEnabled: true
  }, (settings) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading options:", chrome.runtime.lastError);
      return;
    }
    // populate UI
    Array.from(radios).find(r => r.value === settings.mode).checked = true;
    if (highlightPotentialMdpiCheckboxOptions) highlightPotentialMdpiCheckboxOptions.checked = settings.highlightPotentialMdpiSites;
    if (potentialMdpiColorInputOptions) potentialMdpiColorInputOptions.value = settings.potentialMdpiHighlightColor;
    if (loggingCheckboxOptions) loggingCheckboxOptions.checked = settings.loggingEnabled;
    const ncbiCheckbox = document.getElementById('ncbiApiEnabledOptions');
    if (ncbiCheckbox) ncbiCheckbox.checked = settings.ncbiApiEnabled;
  });
}

function saveOptions() {
  const selectedMode = Array.from(radios).find(r => r.checked).value;
  const highlightPotential = highlightPotentialMdpiCheckboxOptions ? highlightPotentialMdpiCheckboxOptions.checked : false;
  const potentialColor = potentialMdpiColorInputOptions ? potentialMdpiColorInputOptions.value : '#FFFF99';
  const loggingEnabled = loggingCheckboxOptions ? loggingCheckboxOptions.checked : false;
  const ncbiApiEnabled = document.getElementById('ncbiApiEnabledOptions')?.checked ?? true;
  // Confirm if user is disabling NCBI API lookups
  if (!ncbiApiEnabled) {
    const proceed = confirm('Disabling NCBI API lookups will reduce detection accuracy and may miss or mislabel MDPI citations. Continue?');
    if (!proceed) {
      return; // Abort save
    }
  }

  chrome.storage.sync.set({
    mode: selectedMode,
    highlightPotentialMdpiSites: highlightPotential,
    potentialMdpiHighlightColor: potentialColor,
    loggingEnabled,
    ncbiApiEnabled
  }, () => {
    if (chrome.runtime.lastError) {
      status.textContent = 'Error saving options.';
      console.error("Error saving options:", chrome.runtime.lastError);
    } else {
      status.textContent = `Options saved. Mode: "${selectedMode}". Potential highlighting (Google): ${highlightPotential ? `ON (${potentialColor})` : 'OFF'}.`;
    }
    setTimeout(() => status.textContent = '', 3500);
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveBtn.addEventListener('click', saveOptions);
