# Uploading & Indexing ICAO Documents

How the portal turns a PDF in Drive into searchable, cited provisions.

## Overview of the pipeline

1. **Register** a catalogue entry (title, number, volume/part, edition).
   Annex 14 (Vol I & II) and Doc 9157 Parts 1–6 are seeded by `setup()`.
2. **Link** a Drive PDF to the entry.
3. **Index**: the PDF is converted to a temporary Google Doc **with OCR**
   (`Drive.Files.insert`, `ocr:true`), text is extracted page-by-page, the
   `StructureParser` detects chapters / paragraph numbers / provision types,
   and `Sections` + `Search_Index` rows are written in **time-bounded batches**.
4. On completion, cross-references and glossary terms are generated and the
   temporary OCR Doc is deleted.

## Step-by-step (administrator)

1. Open the app → **Administration**.
2. **Auto-link Drive PDFs** — matches each seeded catalogue entry to a file in
   the configured library folder by filename hint. (Or use **Link PDF** per row
   to pick/paste a Drive file id.)
3. Click **Index** (or **Re-index**) on a document row.
   - A progress bar shows sections processed. The client advances batches
     automatically until the status becomes **Complete** or **Partial**.
   - **Partial** means some sections were low extraction quality (likely OCR)
     and are flagged for verification — the document is still searchable.
4. For very large PDFs, click **Enable auto-indexing** once. A time-driven
   trigger (`indexingTick`, every 5 min) advances any document left in the
   *Processing* state, so you can close the tab and let it finish.

## Resumability & limits

- Each batch stops after ~280 s or 120 sections (whichever first) to stay under
  the Apps Script 6-minute execution limit, saves progress to Script
  Properties, and resumes on the next batch/trigger tick.
- Parsed sections are stored in chunked Script Properties during processing.
- **Re-index** purges the document's existing `Sections`, `Search_Index`,
  `Cross_References` and `Glossary` rows first, so it is safe to re-run.

## What is and isn't reliable

- **Reliable:** native-text PDFs → accurate text, headings, paragraph numbers,
  Standard/Recommended-Practice classification (from "shall"/"should" wording).
- **Approximate:** PDF→Doc conversion yields a continuous stream, so exact
  **page breaks are approximated**; printed page numbers are detected
  heuristically. Section view and the Contents list give precise navigation;
  the embedded PDF viewer cannot jump to an exact paragraph.
- **Needs verification:** scanned pages, complex tables and technical drawings.
  Low-quality extractions are marked `OCR (verify)` and shown with an OCR badge
  and a warning banner. The app never reconstructs numeric values from uncertain
  text — it tells the user to consult the original PDF.

## Adding a new document later

1. **Administration → Register document** (title, number, volume/part, edition,
   amendment, description).
2. **Link PDF** → **Index**.
3. If it is a newer edition of an existing document, index it, then use
   **Version Comparison → Supersede** (or the admin status control) to mark the
   old edition *Superseded*. Old editions are retained for historical reference
   and every search result shows which edition it came from.
