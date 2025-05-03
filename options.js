const radios = document.querySelectorAll('input[name="mode"]');
const saveBtn = document.getElementById('save');

function loadOptions() {
  chrome.storage.sync.get({ mode: 'hide' }, ({ mode }) => {
    radios.forEach(r => r.checked = (r.value === mode));
  });
}

function saveOptions() {
  const selected = Array.from(radios).find(r => r.checked).value;
  chrome.storage.sync.set({ mode: selected }, () => {
    alert('Options saved.');
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveBtn.addEventListener('click', saveOptions);
