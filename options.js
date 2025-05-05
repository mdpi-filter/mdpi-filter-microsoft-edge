const radios = document.querySelectorAll('input[name="mode"]');
const saveBtn = document.getElementById('save');
const status = document.getElementById('status'); // Get the status div

function loadOptions() {
  // Load current setting (keeping 'highlight' as default for consistency with popup)
  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    radios.forEach(r => r.checked = (r.value === mode));
  });
}

function saveOptions() {
  const selected = Array.from(radios).find(r => r.checked).value;
  chrome.storage.sync.set({ mode: selected }, () => {
    // Use the status div for feedback instead of alert
    status.textContent = `Options saved. Mode set to "${selected}".`;
    setTimeout(() => status.textContent = '', 3000); // Clear after 3 seconds
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveBtn.addEventListener('click', saveOptions);
