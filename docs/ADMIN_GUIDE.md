# Administrator Guide

## Roles

| Role | Can do |
|------|--------|
| **Viewer** | Search, browse, view provisions, bookmarks, notes, exports, ask assistant. |
| **Editor** | Everything a Viewer can, plus register/link/index documents, manage cross-references, and use the compliance register. |
| **Administrator** | Everything, plus user management, delete documents, enable/disable the indexing trigger, usage-tracking toggle, audit log. |

Roles are enforced **server-side** in every service (`Auth.requireRole`). Hiding
a nav item is only cosmetic.

First administrators come from the `BOOTSTRAP_ADMINS` Script Property (set at
setup). Thereafter use **Administration → Manage users**.

## Common tasks

- **Register / edit a document:** Administration → *Register document* / *Edit*.
- **Link a PDF:** Administration → *Link PDF* (pick from the library folder or
  paste a Drive file id). *Auto-link Drive PDFs* matches seeded entries by name.
- **Index / re-index:** Administration → *Index*. Watch the progress bar. Enable
  *auto-indexing* for large documents to let the background trigger finish.
- **Mark superseded:** set status via *Edit*, or use Version Comparison. Old
  editions are retained and flagged in search results.
- **Delete a document:** Administrator only; confirmation required; purges all
  indexed content for that document.
- **Users:** add by email with a role; change roles inline; suspend/activate.
- **Usage tracking:** off by default. When on, the dashboard's *Frequently Used
  References* is populated from real usage. When off, set a static list via the
  `FREQUENT_STATIC` Script Property (JSON array of `{kind,id,label}`).
- **Audit log:** Administration → *Audit log* (last 80 actions).

## System properties (Project Settings → Script Properties)

| Key | Meaning |
|-----|---------|
| `SPREADSHEET_ID` | Database spreadsheet (set by setup). |
| `LIBRARY_FOLDER_ID` | Drive folder holding the PDFs. |
| `BOOTSTRAP_ADMINS` | Comma-separated admin emails. |
| `USAGE_TRACKING` | `on` / `off`. |
| `FREQUENT_STATIC` | Optional JSON list for the dashboard when tracking is off. |

## Accuracy & governance rules enforced by the app

- No fabricated provisions, paragraph numbers, pages or excerpts — every result
  is built from indexed source text.
- Provision type is only assigned when wording supports it (else *Unclassified*).
- OCR-derived text is flagged for verification.
- Direct (explicit in source) cross-references are kept distinct from
  algorithmic *Suggested* ones.
- Compliance status is set by authorised users, never inferred.
- The authoritative-source disclaimer is shown on dashboard, library, exports
  and the assistant.
