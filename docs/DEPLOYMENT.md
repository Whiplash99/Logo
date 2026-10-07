# Deployment Guide — DoAT Aerodrome Standards Portal

This is a **Google Apps Script (GAS) web application**. It uses Google Sheets
as its database and Google Drive for document storage. There is no external
server, build step or third-party dependency.

---

## 1. Prerequisites

- A Google Workspace account (recommended) or a personal Google account.
- A Google Drive folder containing the ICAO PDFs (Annex 14, Doc 9157 parts).
  The folder shared for this project is:
  `https://drive.google.com/drive/folders/1i-4baTTlAZRlOKCoavnZ7NImJ6ELa50F`
  (You need edit/view access to it, or your own copy of the PDFs.)

You can deploy either with the **web editor** (copy/paste) or with **clasp**
(recommended, keeps the repo in sync).

---

## 2A. Deploy with clasp (recommended)

```bash
npm install -g @google/clasp
clasp login

# From the repository root:
cd src
clasp create --type webapp --title "DoAT Aerodrome Standards Portal"
# This writes a .clasp.json with the new scriptId. Then push:
clasp push
```

`clasp` reads `appsscript.json` and pushes every `.gs` and `.html` file in
`src/`. The `Client.js.html` and `Styles.html` files are served to the browser
via the `include()` helper in `Code.gs`.

> A `.clasp.json.example` is provided. Copy it to `.clasp.json` and fill in your
> `scriptId` if you created the project in the Apps Script UI instead.

## 2B. Deploy with the Apps Script editor (copy/paste)

1. Go to <https://script.google.com> → **New project**.
2. Create one script file per `.gs` file in `src/` (same names, without the
   `.gs` extension — the editor adds it) and paste the contents.
3. Create one HTML file per `.html` file (`Index`, `Styles`, `Client.js`). In
   the editor, **File → New → HTML file**, name it exactly `Client.js` (no extra
   extension) and paste the contents of `Client.js.html`. Likewise `Styles`.
4. Open **Project Settings → Show "appsscript.json"** and paste the manifest
   from `src/appsscript.json`.

---

## 3. Enable the Advanced Drive Service

The indexer uses the Drive Advanced Service for OCR/PDF→Doc conversion.

- **clasp**: already declared in `appsscript.json` (`enabledAdvancedServices`),
  pushed automatically.
- **Editor**: **Services (＋)** → add **Drive API** → identifier `Drive`,
  version `v2`.

Also ensure the Drive API is enabled in the linked Google Cloud project
(Apps Script → Project Settings → Google Cloud Platform project; the Drive API
is enabled by default for the default GCP project).

---

## 4. One-time setup

Run the `setup()` function **once** from the editor to create the database and
seed the catalogue.

1. In the editor, open `Code.gs` and select the `setup` function in the toolbar.
2. Click **Run**. On first run you will be asked to authorise the scopes in
   `appsscript.json` — review and allow.
3. Pass your Drive folder id. The easiest path:
   - Edit `setupWithLibraryFolder()` in `Code.gs`, replacing
     `REPLACE_WITH_DRIVE_FOLDER_ID` with `1i-4baTTlAZRlOKCoavnZ7NImJ6ELa50F`,
     then run `setupWithLibraryFolder`.
   - **or** open the editor's console and run:
     ```js
     setup({ libraryFolderId: '1i-4baTTlAZRlOKCoavnZ7NImJ6ELa50F' })
     ```

What setup does:
- Creates a new Google Sheet **"…— Database"** (or reuses one you pass as
  `spreadsheetId`) and stores its id in Script Properties.
- Builds all 11 sheets with headers (see `docs/DATABASE.md`).
- Stores the library folder id.
- Records the running user as a **bootstrap administrator**.
- Seeds the document catalogue with Annex 14 (Vol I & II) and Doc 9157
  Parts 1–6 as **catalogue entries** (not yet indexed).

The return value (shown in the execution log) includes the new spreadsheet URL.

### Adding more administrators

Set the `BOOTSTRAP_ADMINS` Script Property (Project Settings → Script
Properties) to a comma-separated list of emails, **or** add them later in the
app under **Administration → Manage users**.

---

## 5. Deploy the web app

1. **Deploy → New deployment → Web app.**
2. **Execute as:** *User accessing the web app* (so each user is identified for
   private notes/bookmarks and role checks). This matches
   `executeAs: USER_DEPLOYING` → change to *User accessing* in the dialog.
3. **Who has access:** your Workspace domain (recommended) or *Anyone with
   Google account*. Do **not** choose *Anyone* (anonymous) — the app relies on
   a signed-in identity for access control.
4. Copy the web-app URL and share it with users.

> **Execute-as implications.** Running *as the accessing user* means each person
> authenticates with their own Google account; their email identifies them for
> roles, notes and bookmarks, and Drive files are seen with their own
> permissions. Running *as the deploying owner* would let the owner's Drive
> permissions back every request but would make all users share one identity —
> unsuitable for per-user workspaces. This app is designed for **execute as
> accessing user**.

---

## 6. Link PDFs and index

See `docs/UPLOAD_AND_INDEX.md`. In short: open the app → **Administration** →
**Auto-link Drive PDFs** (matches catalogue entries to the folder's files by
name) → click **Index** on each document. Optionally **Enable auto-indexing**
to let a 5-minute time trigger finish large documents in the background.

---

## 7. Updating the code later

- **clasp:** `clasp push` from `src/`.
- Re-deploy: **Deploy → Manage deployments → edit → new version**. The setup
  data in the spreadsheet is preserved across code updates.
