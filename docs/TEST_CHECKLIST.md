# Test & Acceptance Checklist

Run against the actual uploaded ICAO documents after indexing.

## Setup & deployment
- [ ] `setup()` creates the spreadsheet with all 11 sheets and headers.
- [ ] Seed catalogue shows Annex 14 Vol I & II and Doc 9157 Parts 1–6.
- [ ] Web app loads; user is identified; role resolves correctly.
- [ ] Non-configured state shows the setup instructions screen.

## Document management
- [ ] Auto-link matches catalogue entries to the folder's PDFs.
- [ ] Manual link by file id works.
- [ ] Register / edit / archive / delete work (delete requires admin + confirm).
- [ ] Superseded editions are retained and flagged.

## Indexing
- [ ] Indexing starts, shows progress, completes (or Partial with OCR flags).
- [ ] Large document finishes via the 5-minute trigger when auto-indexing on.
- [ ] Re-index purges and rebuilds cleanly.
- [ ] Indexing logs record batches and any errors; retry works.
- [ ] Scanned/low-quality sections are flagged `OCR (verify)`.

## Search
- [ ] Keyword search returns relevant, traceable results.
- [ ] Exact phrase (`"..."`) ranks phrase matches above loose matches.
- [ ] Paragraph search (e.g. `3.4.1`) surfaces the exact provision first.
- [ ] Boolean AND / OR / NOT behave as expected.
- [ ] Abbreviation search (RESA, OLS, PAPI…) matches expanded terms.
- [ ] Filters (document, type, chapter, page range, current-only) apply.
- [ ] Sorting by relevance / document / section / page works.
- [ ] Pagination works; result count and timing shown.
- [ ] No fabricated snippets/citations ever appear.
- [ ] Multi-document search returns results across Annex 14 and Doc 9157.

## Provision view & cross-references
- [ ] Section view shows full text, citation, provision badge, prev/next.
- [ ] Direct vs Related vs Suggested references are visually distinct.
- [ ] "No related reference identified" shown when none exist.
- [ ] Copy citation and print/export produce correct source details.

## Knowledge library & glossary
- [ ] Subject pages list only indexed matches; empty subjects say so.
- [ ] Glossary shows verbatim-flagged definitions linking to source.

## Workspace
- [ ] Bookmarks save/remove, group by collection, export to CSV.
- [ ] Notes save/edit/delete, private to the user.
- [ ] Another user cannot see the first user's notes/bookmarks (server-enforced).

## Compliance
- [ ] Add from a provision and manual entry both work (Editor+).
- [ ] Status is user-set; filters/sort/summary/overdue compute correctly.
- [ ] CSV export includes citations and the authoritative-source notice.

## Version comparison
- [ ] Two indexed editions compare by paragraph; added/removed/modified correct.
- [ ] Each side labels its edition.

## Security & UX
- [ ] Privileged API calls fail for under-privileged users (test server-side).
- [ ] Light/dark theme toggles and persists.
- [ ] Layout works on desktop, tablet and mobile (drawer nav).
- [ ] `/` and Ctrl/⌘-K focus the global search.
- [ ] Toasts, loading states, empty states and errors are graceful.
- [ ] Admin actions appear in the audit log.
