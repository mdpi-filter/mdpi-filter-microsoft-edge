# Research integrity layer: architecture

This document defines the migration path from a single-publisher filter to an explainable research-integrity layer shared by the Chrome, Edge, and Zotero products.

## Product invariant

The software must present evidence and provenance, not issue an unsupported universal verdict about a work, journal, or publisher. A missing signal means only that no signal was found in the checked sources.

## Two independent layers

### Work-level status

Work-level records describe formal post-publication events:

- retraction or partial retraction
- expression of concern
- correction, corrigendum, or erratum
- reinstatement or retraction reversal
- withdrawal or removal
- duplicate-publication findings

Work-level signals are matched by DOI whenever possible. The first production provider is Crossref, including Retraction Watch assertions exposed in Crossref's production REST API.

### Venue-level context

Venue-level records describe evidence about journals and publishers. These are not interchangeable with work-level statuses. The model supports journal-level, publisher-level, claim-level, historical, and identity-conflict scopes.

Potential sources include Wikipedia CiteWatch, DOAJ, the Norwegian Register, Finnish JUFO, Crossref metadata, and licensed commercial sources. Every imported assessment must retain its source, retrieval date, revision or record identifier, applicable date range, and exceptions.

## Matching priority

1. DOI
2. ISSN or ISSN-L
3. verified canonical domain
4. exact normalized journal identity
5. publisher-level fallback

Title-only matching must never produce a high-confidence warning without corroborating identity data because legitimate and questionable venues frequently share names.

## Browser flow

1. The content script extracts DOI identifiers locally from the current article and bibliography.
2. Only DOI identifiers are sent to the extension service worker.
3. The service worker checks Crossref with credentials omitted and no referrer.
4. Results are normalized into a stable internal taxonomy.
5. The popup displays coverage, event timelines, source provenance, and accessible color/icon indicators.
6. The toolbar badge shows the number of affected works, not the number of individual notices.

The initial implementation caps remote checks at 50 DOI identifiers per page and exposes deferred and failed counts instead of silently marking unchecked references as clear.

## Privacy invariant

Article text, page text, search queries, and full browsing history are not sent to the integrity provider. Only DOI identifiers are transmitted when integrity lookups are enabled. Lookups can be disabled by the user.

## Shared-data direction

The long-term design should use a separately versioned, signed evidence bundle consumed by all clients. The JSON Schema in `data/integrity-record.schema.json` is the initial contract. Automated imports must never overwrite manual exclusions or historical date ranges without review.

## Rebranding boundary

The user-facing name, organization name, extension IDs, store listings, and repository names should change only after name and trademark clearance. The current implementation is deliberately described as a research-integrity preview while preserving update identities.
