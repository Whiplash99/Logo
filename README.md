# DoAT Aerodrome Standards & Technical Reference Portal

A Google Apps Script web application that turns the uploaded ICAO aerodrome
publications into one fast, searchable, cross-referenced reference library —
built around **ICAO Annex 14 (Volumes I & II)** and the **Doc 9157 Aerodrome
Design Manual (Parts 1–6)**.

The goal: let an aerodrome operator, inspector, engineer or compliance officer
find any provision, standard, recommended practice or technical specification in
seconds, see its exact source (document, edition, chapter, paragraph, page),
and jump between related guidance across Annex 14 and Doc 9157 — with a premium,
responsive **liquid-glass** interface.

> ⚠️ **Reference tool only.** The original ICAO publications and applicable
> national regulations remain authoritative. Verify the applicable edition and
> amendment before relying on any provision.

---

## What's here

```
src/        Google Apps Script project (push with clasp, or copy into the editor)
  *.gs        Backend services (see architecture below)
  Index.html  App shell
  Styles.html Liquid-glass design system (light + dark)
  Client.js.html  Single-page client (router, views, API bridge)
  appsscript.json Manifest (scopes, Drive advanced service, web app config)
docs/       Deployment, admin, database, indexing and test documentation
Annex and Docs.zip  The source ICAO PDFs provided for the project
```

## Quick start

1. Push `src/` to a new Apps Script web app project (see
   **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**).
2. Run `setup({ libraryFolderId: '…' })` once to build the database and seed the
   catalogue.
3. Deploy as a web app (**execute as the accessing user**).
4. In **Administration**, auto-link the Drive PDFs and run indexing.

Full steps, including the Drive Advanced Service and execute-as implications,
are in the deployment guide.

## Features

- **Global search** across all indexed documents: keywords, `"exact phrases"`,
  paragraph numbers (`3.4.1`), Boolean AND/OR/NOT, abbreviation expansion
  (RESA↔runway end safety area), partial-term matching, filters, sorting,
  pagination, autocomplete, history and `/` · Ctrl/⌘-K focus.
- **Relevance ranking** that prioritises exact paragraph, then phrase, then
  heading, then weighted term matches — snippets highlighted, never fabricated.
- **Document viewer** with contents navigation and embedded Drive PDF preview
  (with an honest "open in Drive" fallback where embedding is blocked).
- **Provision view** with full source text, auto-citation, provision
  classification badge, prev/next, and a cross-reference panel separating
  **Direct**, **Related** and **Suggested** links.
- **Technical Knowledge Library** — subjects (runway strips, RESA, OLS, visual
  aids, RFFS, SMS, pavements…) assembled from indexed content with source links.
- **Ask ICAO Reference** — a strictly source-based assistant: it retrieves and
  cites real passages and says plainly when the material can't answer.
- **Technical glossary** harvested from indexed definitions (verbatim-flagged).
- **Version comparison** between two indexed editions, by paragraph number.
- **Bookmarks & collections**, **private notes**, **compliance mapping**, and
  **CSV / printable exports** — all carrying full citations.
- **Administration** — document registration, Drive linking, resumable
  batch indexing (with a 5-minute background trigger), user & role management,
  usage-tracking toggle, and an audit log.

## Architecture

**Backend (`.gs`)** — modular services, each self-contained and permission-checked:

| Module | Responsibility |
|--------|----------------|
| `Code.gs` | `doGet`, `include`, the single `api(action,payload)` dispatcher, `indexingTick`, `setup`. |
| `Config.gs` | All constants, schema seeds, categories, abbreviations, disclaimer. |
| `Database.gs` | Sheets schema + cache-aware, lock-guarded CRUD. |
| `Auth.gs` | Identity, roles, server-side `requireRole`/`requireAdmin`. |
| `DriveService.gs` | Library folder, PDF listing, preview/open URLs. |
| `PDFProcessor.gs` | PDF→Doc OCR conversion and page extraction. |
| `StructureParser.gs` | Chapters, paragraph numbers, headings, provision classification. |
| `IndexingService.gs` | Resumable, time-bounded indexing + logs. |
| `SubjectClassifier.gs` | Keyword→subject mapping for the knowledge library. |
| `SearchService.gs` | Query parsing, scoring, filtering, suggestions, history. |
| `CrossReferenceService.gs` | Direct/related/suggested reference generation & retrieval. |
| `DocumentService.gs` | Catalogue CRUD, viewer sections, provision detail. |
| `KnowledgeService.gs` | Subject tree and subject pages. |
| `GlossaryService.gs` | Definition harvesting and glossary search. |
| `AskService.gs` | Source-based question answering. |
| `BookmarkService.gs` / `NotesService.gs` | Per-user private workspace. |
| `ComplianceService.gs` | Compliance register + summary. |
| `VersionService.gs` | Edition sets, supersede, comparison. |
| `ExportService.gs` | CSV + printable exports with citations. |
| `AdminService.gs` | Setup, users, system status, triggers. |
| `StatsService.gs` / `Activity.gs` / `AuditService.gs` / `Citation.gs` / `UtilityService.gs` | Stats, recent/frequent, audit, citations, shared helpers. |

**Frontend** — a hash-routed SPA (`Client.js.html`) rendered over a shared
glass design system (`Styles.html`), talking to the backend through the one
`google.script.run.api` dispatcher with success/failure handling, loading,
empty and error states.

## Performance & scale

Search reads the `Search_Index` sheet (cached, server-filtered, paginated)
rather than re-scanning PDFs; indexing is batched and resumable; writes use
`LockService`; reads use `CacheService`. If the library outgrows Sheets, the
search layer is isolated in `SearchService.gs` and can be repointed to a
dedicated full-text index without changing the UI. See `docs/DATABASE.md`.

## Documentation

- [Deployment](docs/DEPLOYMENT.md)
- [Upload & indexing](docs/UPLOAD_AND_INDEX.md)
- [Administrator guide](docs/ADMIN_GUIDE.md)
- [Database schema](docs/DATABASE.md)
- [Test & acceptance checklist](docs/TEST_CHECKLIST.md)
