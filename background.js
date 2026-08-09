import {
  STATUS_DEFINITIONS,
  badgeForSummary,
  derivePrimaryStatus,
  normalizeCrossrefEvents,
  normalizeDOI,
  summarizeIntegrityRecords
} from './shared/integrity.mjs';

'use strict';

const tabData = new Map();
const legacyBadgeData = new Map();
const integrityTabData = new Map();
const integrityCache = new Map();
const activeIntegrityScans = new Map();

const MAX_REFERENCES_PER_TAB = 500;
const MAX_REFERENCE_TEXT_LENGTH = 1000;
const MAX_INTEGRITY_REFERENCES = 250;
const MAX_INTEGRITY_LOOKUPS_PER_SCAN = 50;
const CROSSREF_CONCURRENCY = 2;
const CROSSREF_TIMEOUT_MS = 10000;
const CROSSREF_CACHE_MS = 24 * 60 * 60 * 1000;
const SAFE_REFERENCE_ID = /^[A-Za-z0-9_.:-]{1,256}$/;
const SAFE_COLOR = /^#[0-9A-F]{6}$/i;

function normalizeReference(reference) {
  if (!reference || typeof reference !== 'object') return null;
  if (typeof reference.id !== 'string' || !SAFE_REFERENCE_ID.test(reference.id)) return null;
  if (typeof reference.text !== 'string') return null;

  const normalized = {
    id: reference.id,
    text: reference.text.slice(0, MAX_REFERENCE_TEXT_LENGTH)
  };
  if (Number.isFinite(reference.number)) normalized.number = reference.number;
  const doi = normalizeDOI(reference.doi || '');
  if (doi) normalized.doi = doi;
  if (typeof reference.listItemDomId === 'string' && SAFE_REFERENCE_ID.test(reference.listItemDomId)) {
    normalized.listItemDomId = reference.listItemDomId;
  }
  return normalized;
}

function normalizeReferences(references) {
  if (!Array.isArray(references)) return [];
  const unique = new Map();
  for (const reference of references.slice(0, MAX_REFERENCES_PER_TAB)) {
    const normalized = normalizeReference(reference);
    if (!normalized) continue;
    const key = `${normalized.id}\u0000${normalized.text}`;
    if (!unique.has(key)) unique.set(key, normalized);
  }
  return Array.from(unique.values());
}

function normalizeIntegrityInput(data) {
  const unique = new Map();
  const pageDoi = normalizeDOI(data?.pageDoi || '');
  if (pageDoi) {
    unique.set(pageDoi, {
      id: 'current-article',
      kind: 'current-article',
      number: null,
      doi: pageDoi,
      text: 'Current article'
    });
  }

  const references = Array.isArray(data?.references) ? data.references : [];
  for (const reference of references.slice(0, MAX_INTEGRITY_REFERENCES)) {
    if (!reference || typeof reference !== 'object') continue;
    const doi = normalizeDOI(reference.doi || '');
    if (!doi || unique.has(doi)) continue;
    const id = typeof reference.id === 'string' && SAFE_REFERENCE_ID.test(reference.id)
      ? reference.id
      : `integrity-ref-${unique.size + 1}`;
    unique.set(doi, {
      id,
      kind: 'reference',
      number: Number.isFinite(reference.number) ? Math.max(1, Math.trunc(reference.number)) : null,
      doi,
      text: String(reference.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_REFERENCE_TEXT_LENGTH)
    });
  }
  return Array.from(unique.values());
}

function setBadge(tabId, count, color = '#E2211C', title = 'MDPI Filter') {
  if (!Number.isInteger(tabId)) return;
  const numericCount = Number.isFinite(count) ? Math.max(0, Math.min(999, Math.trunc(count))) : 0;
  const safeColor = typeof color === 'string' && SAFE_COLOR.test(color) ? color : '#E2211C';
  chrome.action.setBadgeText({ tabId, text: numericCount ? String(numericCount) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: safeColor });
  chrome.action.setTitle({ tabId, title: String(title || 'MDPI Filter').slice(0, 200) });
}

function refreshBadge(tabId) {
  if (!Number.isInteger(tabId)) return;
  const integrity = integrityTabData.get(tabId);
  if (integrity?.summary?.affected > 0) {
    const badge = badgeForSummary(integrity.summary);
    setBadge(tabId, badge.count, badge.color, badge.title);
    return;
  }
  const legacy = legacyBadgeData.get(tabId);
  setBadge(tabId, legacy?.count || 0, legacy?.color || '#E2211C', 'MDPI Filter');
}

function clearTabData(tabId) {
  tabData.delete(tabId);
  legacyBadgeData.delete(tabId);
  integrityTabData.delete(tabId);
  activeIntegrityScans.delete(tabId);
  setBadge(tabId, 0);
}

function storeTabReferences(tabId, references, requestedCount, color) {
  if (!Number.isInteger(tabId)) return [];
  const normalized = normalizeReferences(references);
  tabData.set(tabId, normalized);
  legacyBadgeData.set(tabId, {
    count: Number.isFinite(requestedCount) ? Math.max(0, Math.trunc(requestedCount)) : normalized.length,
    color: typeof color === 'string' && SAFE_COLOR.test(color) ? color : '#E2211C'
  });
  refreshBadge(tabId);
  return normalized;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function fetchCrossrefRecord(doi) {
  const cached = integrityCache.get(doi);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CROSSREF_TIMEOUT_MS);
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (response.status === 404) {
      const value = { lookupStatus: 'not-found', events: [] };
      integrityCache.set(doi, { expiresAt: Date.now() + CROSSREF_CACHE_MS, value });
      return value;
    }
    if (!response.ok) throw new Error(`Crossref returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('Crossref returned a non-JSON response');
    }
    const payload = await response.json();
    const events = normalizeCrossrefEvents(payload?.message);
    const value = { lookupStatus: 'checked', events };
    integrityCache.set(doi, { expiresAt: Date.now() + CROSSREF_CACHE_MS, value });
    return value;
  } catch (error) {
    return {
      lookupStatus: 'failed',
      events: [],
      error: error instanceof Error ? error.message.slice(0, 160) : 'Crossref lookup failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(values, concurrency, worker) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

function emptySummary(total = 0) {
  return summarizeIntegrityRecords([], total);
}

async function processIntegrityScan(tabId, data) {
  if (!Number.isInteger(tabId)) return;
  const input = normalizeIntegrityInput(data);
  const scanToken = Symbol('integrity-scan');
  activeIntegrityScans.set(tabId, scanToken);

  const attempted = input.slice(0, MAX_INTEGRITY_LOOKUPS_PER_SCAN);
  integrityTabData.set(tabId, {
    state: input.length ? 'loading' : 'ready',
    provider: 'Crossref + Retraction Watch',
    totalDiscovered: input.length,
    attempted: attempted.length,
    notChecked: Math.max(0, input.length - attempted.length),
    records: attempted.map(record => ({ ...record, lookupStatus: 'pending', events: [], primaryStatus: null })),
    summary: emptySummary(input.length),
    updatedAt: new Date().toISOString()
  });
  refreshBadge(tabId);

  if (!attempted.length) {
    chrome.runtime.sendMessage({ type: 'integrityReportUpdated', tabId }, () => void chrome.runtime.lastError);
    return;
  }

  const records = await mapWithConcurrency(attempted, CROSSREF_CONCURRENCY, async record => {
    const lookup = await fetchCrossrefRecord(record.doi);
    const events = Array.isArray(lookup.events) ? lookup.events : [];
    return {
      ...record,
      lookupStatus: lookup.lookupStatus,
      error: lookup.error,
      events,
      primaryStatus: derivePrimaryStatus(events)
    };
  });

  if (activeIntegrityScans.get(tabId) !== scanToken) return;
  const summary = summarizeIntegrityRecords(records, input.length);
  integrityTabData.set(tabId, {
    state: 'ready',
    provider: 'Crossref + Retraction Watch',
    totalDiscovered: input.length,
    attempted: attempted.length,
    notChecked: Math.max(0, input.length - attempted.length),
    records,
    summary,
    updatedAt: new Date().toISOString()
  });
  refreshBadge(tabId);
  chrome.runtime.sendMessage({ type: 'integrityReportUpdated', tabId }, () => void chrome.runtime.lastError);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return false;

  if (message.type === 'mdpiUpdate') {
    const tabId = sender.tab?.id;
    const data = message.data || {};
    const references = Array.isArray(data.references) ? data.references : [];
    const count = Number.isFinite(data.badgeCount) ? data.badgeCount : references.length;
    storeTabReferences(tabId, references, count, data.color);
    sendResponse({ success: Number.isInteger(tabId) });
    return false;
  }

  if (message.action === 'updateBadge') {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId)) {
      legacyBadgeData.set(tabId, { count: Number(message.count) || 0, color: message.color });
      refreshBadge(tabId);
    }
    sendResponse({ success: Number.isInteger(tabId) });
    return false;
  }

  if (message.action === 'updateReferences') {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId)) {
      const normalized = storeTabReferences(tabId, message.references, message.references?.length, message.color);
      sendResponse({ success: true, count: normalized.length });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  if (message.type === 'integrityScan') {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId)) void processIntegrityScan(tabId, message.data || {});
    sendResponse({ success: Number.isInteger(tabId) });
    return false;
  }

  if (message.type === 'integrityScanDisabled') {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId)) {
      activeIntegrityScans.delete(tabId);
      integrityTabData.delete(tabId);
      refreshBadge(tabId);
    }
    sendResponse({ success: Number.isInteger(tabId) });
    return false;
  }

  if (message.type === 'getMdpiReferences') {
    getActiveTab()
      .then(tab => sendResponse({ references: Number.isInteger(tab?.id) ? (tabData.get(tab.id) || []) : [] }))
      .catch(() => sendResponse({ references: [] }));
    return true;
  }

  if (message.type === 'getIntegrityReport') {
    getActiveTab()
      .then(tab => {
        const report = Number.isInteger(tab?.id) ? integrityTabData.get(tab.id) : null;
        sendResponse({ report: report || null, statuses: STATUS_DEFINITIONS });
      })
      .catch(() => sendResponse({ report: null, statuses: STATUS_DEFINITIONS }));
    return true;
  }

  if (message.type === 'scrollToRef') {
    if (typeof message.refId !== 'string' || !SAFE_REFERENCE_ID.test(message.refId)) {
      sendResponse({ success: false, error: 'invalid-reference-id' });
      return false;
    }

    getActiveTab()
      .then(tab => {
        if (!Number.isInteger(tab?.id)) {
          sendResponse({ success: false, error: 'no-active-tab' });
          return;
        }
        chrome.tabs.sendMessage(tab.id, {
          type: 'scrollToRefOnPage',
          refId: message.refId
        }, response => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: 'content-script-unavailable' });
          } else {
            const status = response?.status;
            sendResponse({ success: status === 'scrolled' || status === 'expanded-and-scrolled' });
          }
        });
      })
      .catch(() => sendResponse({ success: false, error: 'tab-query-failed' }));
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') clearTabData(tabId);
});

chrome.tabs.onRemoved.addListener(tabId => {
  clearTabData(tabId);
});
