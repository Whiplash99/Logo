# Database Schema

The portal stores everything in a single Google Spreadsheet (created by
`setup()`), one sheet per entity. IDs are unique, prefixed strings
(e.g. `DOC-…`, `SEC-…`). Access goes through `Database.gs`, which reads by
header name (never fixed column index), caches reads via `CacheService`, and
serialises writes with `LockService`.

| Sheet | Purpose |
|-------|---------|
| `Documents` | Catalogue of every document/edition and its indexing status. |
| `Sections` | Parsed logical sections (chapter, paragraph, heading, provision type, page span, extracted text, quality, OCR flag). |
| `Search_Index` | One row per searchable text chunk (normalised text, keywords, subject category, metadata). Searched by `SearchService`. |
| `Cross_References` | Direct / related / suggested links between sections, with verification status. |
| `Users` | Email, display name, role (Viewer/Editor/Administrator), access status. |
| `Bookmarks` | Per-user bookmarks grouped into collections. |
| `User_Notes` | Per-user private notes with tags. |
| `Compliance_Register` | Compliance mapping records (ICAO provision ↔ national regulation, status, gaps, actions). |
| `Indexing_Logs` | Per-batch indexing log (status, page range, errors, retries). |
| `Audit_Logs` | Append-only log of administrative/data-changing actions. |
| `Glossary` | Terms + definitions harvested from indexed content, verbatim-flagged. |

Column lists are defined authoritatively in `Database.gs` → `SCHEMA` and mirror
the field lists in the project specification (§18), with a few added display
fields (`Label`, `Description`, `Glossary`).

## Referential integrity

- `Sections.Document_ID`, `Search_Index.Document_ID/Section_ID`,
  `Cross_References.*_Document_ID/*_Section_ID`, `Bookmarks/User_Notes.*_ID`
  and `Compliance_Register.Source_Document_ID` all reference `Documents` /
  `Sections` primary keys.
- Deleting a document (`DocumentService.removeDocument`) purges its `Sections`,
  `Search_Index`, `Cross_References` and `Glossary` rows.

## Migration path (scale)

Google Sheets is suitable for the initial library. If the index grows beyond a
comfortable size, the search layer is isolated in `SearchService.gs` reading
from `Search_Index`; it can be repointed to an external index (e.g. a proper
full-text service) without changing the UI or other services. See the
performance notes in the main README.
