# Research integrity data sources

## Production source used by the preview

### Crossref REST API and Retraction Watch

Endpoint pattern:

`https://api.crossref.org/works/{doi}`

The client reads Crossref `update-to` and `updated-by` records and preserves the `source` field, including `publisher` and `retraction-watch`. Supported normalized statuses are retraction, expression of concern, correction, reinstatement, withdrawal/removal, and duplicate-publication labels when exposed by the record.

Crossref documentation:

- https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/
- https://www.crossref.org/documentation/crossmark/participating-in-crossmark/
- https://www.crossref.org/documentation/retrieve-metadata/rest-api/

Retraction Watch's full CSV remains the preferred source for detailed reasons such as duplication and paper-mill involvement. Crossref requests citation of Retraction Watch when its records are used in a published work.

## Planned open sources

### Wikipedia CiteWatch

Use as a community-curated discovery and context source, not as a definitive blacklist. Imports must preserve the exact MediaWiki revision ID, explanatory notes, exclusions, and CC BY-SA attribution. False positives, historical changes, name collisions, and acceptable contextual uses are expected parts of the source.

### DOAJ

Use for journal identity, ISSN, open-access metadata, policy metadata, additions, withdrawals, and false claims of DOAJ indexing. Absence from DOAJ is not evidence that a journal is predatory. DOAJ journal and article metadata are available under CC0.

### Norwegian Register and Finnish JUFO

Use as independent national classification signals. Display the actual level and source; do not translate a non-approved or Level 0 classification into a universal predatory verdict.

### Europe PMC and PubMed

Use for biomedical identifiers, article-status updates, and reference resolution. The clients should deduplicate events that originate from the same publisher notice or Retraction Watch record.

### OpenAlex

Use for work, journal, and publisher identity resolution and citation graph enrichment. Its retraction flag is derived from Retraction Watch and therefore is not independent corroboration.

## Restricted or permission-dependent sources

### PubPeer

A discussion indicator is useful, but comments are allegations or post-publication discussion, not verified findings. Integrate only through an authorized API or partnership; do not scrape.

### Clarivate Journal Citation Reports

Use to verify genuine Journal Impact Factor claims when licensed. Without a license, the extension may link users to the Master Journal List but should not automate prohibited scraping.

### Cabells Predatory Reports and Scite

Both can provide useful enrichment but require commercial terms. Their data must not be redistributed in an open evidence bundle without an explicit license.

## Provenance requirements

Every imported assessment must record:

- source name
- source record, revision, or notice identifier
- retrieval time
- source and archive URLs when allowed
- applicable entity and scope
- effective date range
- confidence
- license or attribution requirement
- manual exclusions and corrections
