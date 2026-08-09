'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const radios = [...document.querySelectorAll('input[name="mode"]')];
  const el = {
    save: $('save'), status: $('status'), report: $('reportIssue'), settings: $('settingsIcon'), panel: $('settingsPanel'),
    potential: $('highlightPotentialMdpi'), color: $('potentialMdpiColor'), logging: $('loggingEnabled'), ncbi: $('ncbiApiEnabledPopup'), integrity: $('integrityLookupsEnabled'),
    refs: $('referencesList'), refsPlaceholder: $('referencesPlaceholder'), refsCount: $('referencesCount'),
    integrityList: $('integrityList'), integrityPlaceholder: $('integrityPlaceholder'), coverage: $('integrityCoverage'), rescan: $('rescanIntegrity')
  };
  const countIds = {
    retracted: 'countRetracted',
    'expression-of-concern': 'countConcern',
    corrected: 'countCorrected',
    reinstated: 'countReinstated',
    'duplicate-publication': 'countDuplicate',
    withdrawn: 'countWithdrawn'
  };
  const fallbackStatuses = {
    retracted: { label: 'Retracted', icon: '×', color: '#B42318' },
    'expression-of-concern': { label: 'Expression of concern', icon: '!', color: '#B54708' },
    corrected: { label: 'Corrected', icon: '✎', color: '#175CD3' },
    reinstated: { label: 'Reinstated', icon: '↩', color: '#067647' },
    'duplicate-publication': { label: 'Duplicate publication', icon: '≡', color: '#6941C6' },
    withdrawn: { label: 'Withdrawn or removed', icon: '–', color: '#475467' }
  };

  function setStatus(message, timeout = 3500) {
    el.status.textContent = message;
    if (timeout) setTimeout(() => { el.status.textContent = ''; }, timeout);
  }

  el.settings.addEventListener('click', () => {
    const open = el.panel.classList.toggle('open');
    el.settings.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('mousedown', event => {
    if (el.panel.classList.contains('open') && !el.panel.contains(event.target) && !el.settings.contains(event.target)) {
      el.panel.classList.remove('open');
      el.settings.setAttribute('aria-expanded', 'false');
    }
  });

  chrome.storage.sync.get({
    mode: 'highlight', highlightPotentialMdpiSites: false, potentialMdpiHighlightColor: '#FFFF99',
    loggingEnabled: false, ncbiApiEnabled: true, integrityLookupsEnabled: true
  }, settings => {
    if (chrome.runtime.lastError) return setStatus('Error loading settings.');
    radios.forEach(radio => { radio.checked = radio.value === settings.mode; });
    el.potential.checked = Boolean(settings.highlightPotentialMdpiSites);
    el.color.value = settings.potentialMdpiHighlightColor || '#FFFF99';
    el.logging.checked = Boolean(settings.loggingEnabled);
    el.ncbi.checked = settings.ncbiApiEnabled !== false;
    el.integrity.checked = settings.integrityLookupsEnabled !== false;
    if (!el.integrity.checked) renderDisabled();
  });

  function requestRescan() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!Number.isInteger(tabs[0]?.id)) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'forceIntegrityRescan' }, () => {
        void chrome.runtime.lastError;
        setTimeout(loadIntegrity, 300);
      });
    });
  }

  el.save.addEventListener('click', () => {
    if (!el.ncbi.checked && !confirm('Disabling NCBI lookups reduces MDPI detection accuracy. Continue?')) return;
    chrome.storage.sync.set({
      mode: radios.find(r => r.checked)?.value || 'highlight',
      highlightPotentialMdpiSites: el.potential.checked,
      potentialMdpiHighlightColor: el.color.value || '#FFFF99',
      loggingEnabled: el.logging.checked,
      ncbiApiEnabled: el.ncbi.checked,
      integrityLookupsEnabled: el.integrity.checked
    }, () => {
      if (chrome.runtime.lastError) return setStatus('Error saving settings.');
      setStatus('Settings saved.');
      if (el.integrity.checked) requestRescan(); else renderDisabled();
    });
  });
  el.rescan.addEventListener('click', () => {
    if (!el.integrity.checked) return setStatus('Enable integrity lookups in settings first.');
    el.coverage.textContent = 'Rescanning article references…';
    requestRescan();
  });

  function reportIssue() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      try {
        const parsed = new URL(tabs[0]?.url || '');
        if (!/^https?:$/.test(parsed.protocol)) throw new Error();
        const address = `${parsed.origin}${parsed.pathname}`;
        const manifest = chrome.runtime.getManifest();
        const title = encodeURIComponent(`Detection issue on ${parsed.hostname}`);
        const body = encodeURIComponent(`**Report a detection issue**\n\nBefore submitting, remove information you do not want public.\n\n**Webpage address (query and fragment omitted):**\n${address}\n\n**Problem:**\n[Missed, incorrect, or wrong integrity status]\n\n---\n- Extension: ${manifest.name}\n- Version: ${manifest.version}\n- Integrity lookups: ${el.integrity.checked ? 'enabled' : 'disabled'}\n- Browser: ${navigator.userAgent}`);
        chrome.tabs.create({ url: `https://github.com/mdpi-filter/mdpi-filter-microsoft-edge/issues/new?title=${title}&body=${body}` });
      } catch { setStatus('Issue reports are available only for web pages.'); }
    });
  }
  el.report.addEventListener('click', reportIssue);

  function scrollToReference(refId) {
    chrome.runtime.sendMessage({ type: 'scrollToRef', refId }, response => {
      if (chrome.runtime.lastError || !response?.success) setStatus('Could not locate that reference.');
    });
  }
  for (const list of [el.refs, el.integrityList]) {
    list.addEventListener('click', event => {
      const item = event.target.closest('li[data-ref-id]');
      if (item) scrollToReference(item.dataset.refId);
    });
  }
  el.integrityList.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const item = event.target.closest('li[data-ref-id]');
    if (item) { event.preventDefault(); scrollToReference(item.dataset.refId); }
  });

  function renderReferences(references, loading = false, error = '') {
    el.refs.querySelectorAll('li:not(#referencesPlaceholder)').forEach(node => node.remove());
    if (loading || error || !references?.length) {
      el.refsCount.textContent = loading ? 'Loading' : 'No';
      el.refsPlaceholder.textContent = error || (loading ? 'Loading references…' : 'No MDPI references detected.');
      el.refsPlaceholder.style.display = 'block';
      return;
    }
    const unique = new Map();
    for (const ref of references) if (ref?.id && ref?.text) unique.set((ref.doi || ref.text).toLowerCase(), ref);
    el.refsCount.textContent = String(unique.size);
    el.refsPlaceholder.style.display = 'none';
    for (const ref of unique.values()) {
      const item = document.createElement('li'); item.dataset.refId = ref.id;
      const number = document.createElement('span'); number.className = 'ref-number'; number.textContent = ref.number ? `${ref.number}. ` : '';
      const text = document.createElement('span'); text.className = 'ref-text'; text.textContent = ref.text;
      item.append(number, text); el.refs.appendChild(item);
    }
  }

  function loadReferences(attempt = 0) {
    if (!attempt) renderReferences([], true);
    chrome.runtime.sendMessage({ type: 'getMdpiReferences' }, response => {
      if (chrome.runtime.lastError) return renderReferences([], false, 'Error loading references.');
      const references = Array.isArray(response?.references) ? response.references : [];
      if (references.length || attempt >= 3) return renderReferences(references);
      setTimeout(() => loadReferences(attempt + 1), 300);
    });
  }

  function setCounts(counts = {}) {
    for (const [status, id] of Object.entries(countIds)) {
      const value = Number(counts[status]) || 0;
      const node = $(id); node.textContent = String(value);
      const card = node.closest('.status-card'); card.classList.toggle('has-signal', value > 0);
      card.setAttribute('aria-label', `${fallbackStatuses[status].label}: ${value}`);
    }
  }
  function clearIntegrityItems() {
    el.integrityList.querySelectorAll('li:not(#integrityPlaceholder)').forEach(node => node.remove());
  }
  function renderDisabled() {
    setCounts(); clearIntegrityItems();
    el.coverage.textContent = 'Integrity lookups are disabled.';
    el.integrityPlaceholder.textContent = 'Enable lookups in settings to check DOI status metadata.';
    el.integrityPlaceholder.style.display = 'block';
  }
  function chip(event, statuses) {
    const definition = statuses[event.status] || fallbackStatuses[event.status] || {};
    const node = document.createElement('span'); node.className = 'signal-chip';
    node.style.setProperty('--signal-color', definition.color || '#475467');
    node.textContent = `${definition.icon || '•'} ${definition.label || event.status}`;
    node.title = [event.date && `Date: ${event.date.slice(0, 10)}`, event.source && `Source: ${event.source}`, event.noticeDoi && `Notice DOI: ${event.noticeDoi}`].filter(Boolean).join('\n');
    return node;
  }
  function renderIntegrity(report, statuses = fallbackStatuses) {
    clearIntegrityItems();
    if (!report) {
      setCounts(); el.coverage.textContent = 'Waiting for identifiable DOI references…';
      el.integrityPlaceholder.textContent = 'No DOI-bearing article or references detected yet.';
      el.integrityPlaceholder.style.display = 'block'; return;
    }
    setCounts(report.summary?.counts);
    if (report.state === 'loading') {
      el.coverage.textContent = `Checking ${report.attempted || 0} of ${report.totalDiscovered || 0} discovered DOIs…`;
      el.integrityPlaceholder.textContent = 'Looking up post-publication updates…';
      el.integrityPlaceholder.style.display = 'block'; return;
    }
    const summary = report.summary || {};
    const coverage = [`${summary.checked || 0} checked`];
    if (report.notChecked) coverage.push(`${report.notChecked} deferred by page limit`);
    if (summary.failed) coverage.push(`${summary.failed} unresolved`);
    coverage.push(report.provider || 'Crossref'); el.coverage.textContent = coverage.join(' · ');
    const affected = (report.records || []).filter(record => record.primaryStatus);
    if (!affected.length) {
      el.integrityPlaceholder.textContent = 'No known integrity signals were found in checked records.';
      el.integrityPlaceholder.style.display = 'block'; return;
    }
    el.integrityPlaceholder.style.display = 'none';
    for (const record of affected) {
      const item = document.createElement('li'); item.className = 'integrity-item';
      if (record.kind === 'reference' && record.id) { item.dataset.refId = record.id; item.tabIndex = 0; }
      const heading = document.createElement('div'); heading.className = 'integrity-item-heading';
      const label = document.createElement('strong'); label.textContent = record.kind === 'current-article' ? 'Current article' : `Reference ${record.number || ''}`.trim();
      const doi = document.createElement('code'); doi.textContent = record.doi; heading.append(label, doi); item.appendChild(heading);
      if (record.text && record.kind !== 'current-article') { const p = document.createElement('p'); p.textContent = record.text; item.appendChild(p); }
      const chips = document.createElement('div'); chips.className = 'signal-chips';
      for (const event of record.events || []) chips.appendChild(chip(event, statuses));
      item.appendChild(chips); el.integrityList.appendChild(item);
    }
  }
  function loadIntegrity(attempt = 0) {
    chrome.runtime.sendMessage({ type: 'getIntegrityReport' }, response => {
      if (chrome.runtime.lastError) return void (el.coverage.textContent = 'Could not load integrity results.');
      renderIntegrity(response?.report || null, response?.statuses || fallbackStatuses);
      if (response?.report?.state === 'loading' && attempt < 20) setTimeout(() => loadIntegrity(attempt + 1), 500);
    });
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.action === 'updateReferences' && Array.isArray(message.references)) renderReferences(message.references);
    if (message?.type === 'integrityReportUpdated') loadIntegrity();
  });
  loadReferences(); loadIntegrity();
});
