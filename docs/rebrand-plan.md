# Rebrand and repository consolidation plan

## Why rebrand

`MDPI Filter` is too narrow for a multi-source integrity product and `filter` implies automatic rejection. The generalized product should be positioned as an evidence layer, not as an adversarial blacklist.

## Changes that must remain reversible until clearance

- organization name
- repository names
- store listing names
- logos and iconography
- public website and domains
- Zotero add-on ID
- browser extension store identities

Changing the add-on or extension identifier can strand existing users on the old product. Preserve current update identities unless a store or platform requires a new listing.

## Name selection gate

A final name must pass:

1. GitHub organization and repository availability.
2. Chrome, Edge, Firefox, and Zotero ecosystem searches.
3. Domain and major social-handle availability.
4. EUIPO, WIPO, and relevant national trademark searches.
5. General web search for confusingly similar research products.

Names already found in active use and therefore unsuitable include SourceSignal, JournalLens, ScholarSignal, and Cite Lens.

## Codebase consolidation

Chrome and Edge are currently duplicate codebases. The target architecture is one browser-extension source repository with deterministic Chrome and Edge build outputs. Until that migration is complete, foundational changes must be applied identically and verified in both repositories.

The Zotero plugin remains a separate client but should consume the same normalized status taxonomy and evidence bundle.

## Release sequence

1. Ship the integrity preview under the current identity.
2. Validate Crossref event handling and accessibility with public fixtures.
3. Build the venue-evidence import pipeline and signed bundle.
4. Select and clear the final brand.
5. Consolidate the browser repositories.
6. Migrate user-facing names while preserving extension update identities.
7. Launch coordinated Chrome, Edge, Firefox, and Zotero releases.
8. Announce through Zotero Forums and submit to the official directory when it becomes available.
