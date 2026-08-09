'use strict';

;(function initializeIntegrityScanner() {
  if (window.mdpiIntegrityScannerInjected) return;
  window.mdpiIntegrityScannerInjected = true;

  const MAX_REFERENCES = 250;
  const MAX_TEXT_LENGTH = 500;
  const DOI_PATTERN = /\b10\.\d{4,9}\/[A-Z0-9._;()/:+-]+/gi;
  let scanTimer = null;
  let observer = null;
  let lastFingerprint = '';

  function normalizeDoi(value) {
    if (typeof value !== 'string') return null;
    let normalized = value.trim();
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Keep malformed percent-encoded input unchanged.
    }
    normalized = normalized
      .replace(/^doi\s*:\s*/i, '')
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/[\s\u00A0]+/g, '')
      .replace(/[),.;:\]}>'"`]+$/g, '')
      .toLowerCase();
    return /^10\.\d{4,9}\/[\w.()/:;+-]+$/i.test(normalized) ? normalized : null;
  }

  function doisFromValue(value) {
    const dois = [];
    const seen = new Set();
    for (const found of String(value || '').matchAll(DOI_PATTERN)) {
      const doi = normalizeDoi(found[0]);
      if (doi && !seen.has(doi)) {
        seen.add(doi);
        dois.push(doi);
      }
    }
    return dois;
  }

  function extractDoiFromElement(element) {
    const candidates = [];
    for (const attribute of ['data-doi', 'data-article-doi', 'data-reference-doi']) {
      const value = element.getAttribute?.(attribute);
      if (value) candidates.push(value);
    }
    for (const link of element.querySelectorAll?.('a[href]') || []) {
      const href = link.getAttribute('href') || '';
      if (/doi\.org\//i.test(href) || /10\.\d{4,9}\//i.test(href)) candidates.push(href);
    }
    candidates.push(element.textContent || '');
    for (const candidate of candidates) {
      const doi = doisFromValue(candidate)[0];
      if (doi) return doi;
    }
    return null;
  }

  function extractCurrentArticleDoi() {
    const selectors = [
      'meta[name="citation_doi"]',
      'meta[name="dc.identifier"]',
      'meta[name="DC.Identifier"]',
      'meta[name="doi"]',
      'meta[property="citation_doi"]'
    ];
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.getAttribute('content') || '';
      const doi = normalizeDoi(value) || doisFromValue(value)[0];
      if (doi) return doi;
    }
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    return doisFromValue(`${canonical} ${document.location.href}`)[0] || null;
  }

  function referenceNodes() {
    const configured = window.MDPIFilterReferenceSelectors;
    if (typeof configured === 'string' && configured.trim()) {
      try {
        return Array.from(document.querySelectorAll(configured));
      } catch {
        // Fall through to conservative generic selectors.
      }
    }
    return Array.from(document.querySelectorAll(
      'ol.references > li, ul.references > li, .reference-list li, #references li, [role="doc-bibliography"] li'
    ));
  }

  function referenceIdentifier(element, index) {
    const existing =
      element.dataset?.mdpiFilterRefId ||
      element.id ||
      element.getAttribute?.('data-bib-id') ||
      element.getAttribute?.('data-reference-id');
    const normalized = String(existing || '').trim();
    if (/^[A-Za-z0-9_.:-]{1,256}$/.test(normalized)) return normalized;
    const generated = `integrity-ref-${index + 1}`;
    element.setAttribute('data-mdpi-filter-ref-id', generated);
    return generated;
  }

  function scanDocument() {
    chrome.storage.sync.get({ integrityLookupsEnabled: true }, settings => {
      if (chrome.runtime.lastError) return;
      if (settings.integrityLookupsEnabled === false) {
        chrome.runtime.sendMessage({ type: 'integrityScanDisabled' }, () => void chrome.runtime.lastError);
        return;
      }

      const references = [];
      const seenDois = new Set();
      const nodes = referenceNodes().slice(0, MAX_REFERENCES);
      for (let index = 0; index < nodes.length; index += 1) {
        const element = nodes[index];
        const doi = extractDoiFromElement(element);
        if (!doi || seenDois.has(doi)) continue;
        seenDois.add(doi);
        references.push({
          id: referenceIdentifier(element, index),
          number: index + 1,
          doi,
          text: String(element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH)
        });
      }

      const pageDoi = extractCurrentArticleDoi();
      const fingerprint = JSON.stringify([pageDoi, references.map(reference => reference.doi)]);
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;

      chrome.runtime.sendMessage({
        type: 'integrityScan',
        data: { pageDoi, references }
      }, () => void chrome.runtime.lastError);
    });
  }

  function scheduleScan(delay = 400) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanDocument, delay);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'forceIntegrityRescan') {
      lastFingerprint = '';
      scheduleScan(0);
    }
  });

  chrome.storage.onChanged.addListener(changes => {
    if (changes.integrityLookupsEnabled) {
      lastFingerprint = '';
      scheduleScan(0);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleScan(0), { once: true });
  } else {
    scheduleScan(0);
  }

  observer = new MutationObserver(() => scheduleScan(1200));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => scheduleScan(0), 2500);
})();
