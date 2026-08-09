'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const integrityPromise = import('../shared/integrity.mjs');

test('DOIs are normalized without accepting arbitrary URLs', async () => {
  const { normalizeDOI } = await integrityPromise;
  assert.equal(normalizeDOI(' https://doi.org/10.1000/ABC.123. '), '10.1000/abc.123');
  assert.equal(normalizeDOI('doi:10.3390/nu4091171'), '10.3390/nu4091171');
  assert.equal(normalizeDOI('https://example.org/not-a-doi'), null);
  assert.equal(normalizeDOI('10.1/no'), null);
});

test('Crossref and Retraction Watch update labels map to stable statuses', async () => {
  const { normalizeUpdateType } = await integrityPromise;
  assert.equal(normalizeUpdateType('expression_of_concern'), 'expression-of-concern');
  assert.equal(normalizeUpdateType('corrigendum'), 'corrected');
  assert.equal(normalizeUpdateType('', 'Reinstatement'), 'reinstated');
  assert.equal(normalizeUpdateType('', 'Duplicate publication'), 'duplicate-publication');
});

test('Crossref updates preserve source, record id, notice and chronology', async () => {
  const { normalizeCrossrefEvents } = await integrityPromise;
  const events = normalizeCrossrefEvents({
    'updated-by': [
      {
        DOI: '10.1000/notice-2',
        type: 'retraction',
        source: 'retraction-watch',
        'record-id': 42,
        updated: { 'date-time': '2025-02-01T00:00:00Z' }
      },
      {
        DOI: '10.1000/notice-1',
        type: 'expression_of_concern',
        source: 'publisher',
        updated: { timestamp: Date.parse('2024-06-01T00:00:00Z') }
      }
    ]
  });
  assert.deepEqual(events.map(event => event.status), ['expression-of-concern', 'retracted']);
  assert.equal(events[1].recordId, 42);
  assert.equal(events[1].noticeDoi, '10.1000/notice-2');
});



test('an update notice is not misclassified from its update-to relationship', async () => {
  const { normalizeCrossrefEvents } = await integrityPromise;
  const events = normalizeCrossrefEvents({
    DOI: '10.1000/retraction-notice',
    'update-to': [
      {
        DOI: '10.1000/original-paper',
        type: 'retraction',
        updated: { 'date-time': '2025-02-01T00:00:00Z' }
      }
    ]
  });
  assert.deepEqual(events, []);
});

test('reinstatement supersedes an older retraction without deleting history', async () => {
  const { derivePrimaryStatus } = await integrityPromise;
  const events = [
    { status: 'retracted', timestamp: 10 },
    { status: 'reinstated', timestamp: 20 },
    { status: 'corrected', timestamp: 30 }
  ];
  assert.equal(derivePrimaryStatus(events), 'reinstated');
});

test('summary counts affected works once per status and drives badge severity', async () => {
  const { STATUS_DEFINITIONS, badgeForSummary, summarizeIntegrityRecords } = await integrityPromise;
  const records = [
    {
      lookupStatus: 'checked',
      primaryStatus: 'retracted',
      events: [
        { status: 'expression-of-concern' },
        { status: 'retracted' },
        { status: 'retracted' }
      ]
    },
    {
      lookupStatus: 'checked',
      primaryStatus: 'corrected',
      events: [{ status: 'corrected' }]
    },
    { lookupStatus: 'failed', primaryStatus: null, events: [] }
  ];
  const summary = summarizeIntegrityRecords(records, 3);
  assert.equal(summary.checked, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.affected, 2);
  assert.equal(summary.counts.retracted, 1);
  assert.equal(summary.counts['expression-of-concern'], 1);
  assert.equal(summary.primaryStatus, 'retracted');
  assert.deepEqual(badgeForSummary(summary), {
    count: 2,
    color: STATUS_DEFINITIONS.retracted.color,
    title: '2 references with known integrity signals'
  });
});
