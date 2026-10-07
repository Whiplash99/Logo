/**
 * Database.gs
 * -----------------------------------------------------------------------------
 * Google Sheets persistence layer. Defines the schema for every sheet, creates
 * and repairs the workbook on setup, and provides generic, cache-aware CRUD
 * helpers used by every service module.
 *
 * Design notes
 *  - Each sheet is accessed by header name, never by fixed column index, so the
 *    schema can evolve without breaking callers.
 *  - Reads are cached (CacheService) and reused across a request where possible
 *    to avoid repeatedly scanning entire sheets (a key performance requirement).
 *  - Writes acquire a document LockService lock to keep concurrent indexing and
 *    user writes consistent, then invalidate the relevant cache entry.
 * -----------------------------------------------------------------------------
 */

var DB = (function () {

  /** Canonical sheet names and their column order. */
  var SCHEMA = {
    Documents: [
      'Document_ID', 'Document_Title', 'ICAO_Document_Number', 'Volume', 'Part',
      'Edition', 'Amendment', 'Publication_Date', 'Document_Category',
      'Drive_File_ID', 'Drive_File_URL', 'Status', 'Total_Pages', 'Indexed_Pages',
      'Indexing_Status', 'Description', 'Upload_Date', 'Last_Updated'
    ],
    Sections: [
      'Section_ID', 'Document_ID', 'Chapter', 'Section_Number', 'Paragraph_Number',
      'Heading', 'Provision_Type', 'Start_Page', 'End_Page', 'Extracted_Text',
      'Extraction_Quality', 'OCR_Status'
    ],
    Search_Index: [
      'Index_ID', 'Document_ID', 'Section_ID', 'Page_Number', 'Printed_Page_Number',
      'Heading', 'Normalized_Text', 'Keywords', 'Subject_Category', 'Search_Metadata'
    ],
    Cross_References: [
      'Reference_ID', 'Source_Document_ID', 'Source_Section_ID', 'Target_Document_ID',
      'Target_Section_ID', 'Reference_Type', 'Label', 'Verification_Status'
    ],
    Users: [
      'User_ID', 'Email', 'Display_Name', 'Role', 'Access_Status', 'Date_Added'
    ],
    Bookmarks: [
      'Bookmark_ID', 'User_ID', 'Document_ID', 'Section_ID', 'Page_Number',
      'Collection_Name', 'Label', 'Date_Created'
    ],
    User_Notes: [
      'Note_ID', 'User_ID', 'Document_ID', 'Section_ID', 'Note_Text', 'Tags',
      'Date_Created', 'Last_Updated'
    ],
    Compliance_Register: [
      'Reference_ID', 'User_ID', 'Source_Document_ID', 'Volume', 'Part', 'Edition',
      'Amendment', 'Chapter', 'Paragraph', 'Requirement_Text', 'Provision_Type',
      'National_Regulation', 'Aerodrome_Manual_Section', 'Responsible_Unit',
      'Compliance_Status', 'Evidence_Link', 'Identified_Gap', 'Corrective_Action',
      'Target_Date', 'Remarks', 'Last_Reviewed'
    ],
    Indexing_Logs: [
      'Log_ID', 'Document_ID', 'Processing_Batch', 'Page_Range', 'Processing_Status',
      'Error_Message', 'Processing_Date', 'Retry_Count'
    ],
    Audit_Logs: [
      'Log_ID', 'User_ID', 'Action', 'Affected_Record', 'Timestamp', 'Result'
    ],
    Glossary: [
      'Term_ID', 'Term', 'Definition', 'Source_Document_ID', 'Section_ID',
      'Is_Verbatim', 'Date_Added'
    ]
  };

  function sheetNames() {
    return Object.keys(SCHEMA);
  }

  function spreadsheet() {
    var id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SPREADSHEET_ID);
    if (!id) {
      throw new Error('Portal is not configured. An administrator must run setup to create the database.');
    }
    return SpreadsheetApp.openById(id);
  }

  function headers(sheetName) {
    return SCHEMA[sheetName].slice();
  }

  function getSheet(sheetName) {
    return spreadsheet().getSheetByName(sheetName);
  }

  /**
   * Create any missing sheets and ensure header rows match the schema.
   * Safe to run repeatedly (idempotent).
   */
  function ensureSchema(ss) {
    ss = ss || spreadsheet();
    sheetNames().forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
      }
      var cols = SCHEMA[name];
      var range = sheet.getRange(1, 1, 1, cols.length);
      range.setValues([cols]);
      range.setFontWeight('bold').setBackground('#0b1f3a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    });
    // Remove the default empty sheet if present.
    var def = ss.getSheetByName('Sheet1');
    if (def && sheetNames().indexOf('Sheet1') === -1) {
      ss.deleteSheet(def);
    }
  }

  /** Read every row of a sheet as objects keyed by header. Cache-aware. */
  function readAll(sheetName, useCache) {
    if (useCache !== false) {
      var cached = _cacheGet('all:' + sheetName);
      if (cached) { return cached; }
    }
    var sheet = getSheet(sheetName);
    if (!sheet) { return []; }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) { return []; }
    var cols = SCHEMA[sheetName];
    var values = sheet.getRange(2, 1, lastRow - 1, cols.length).getValues();
    var rows = values.map(function (row, i) {
      var obj = { _row: i + 2 };
      cols.forEach(function (c, j) { obj[c] = row[j]; });
      return obj;
    });
    if (useCache !== false) { _cachePut('all:' + sheetName, rows); }
    return rows;
  }

  function find(sheetName, predicate) {
    var rows = readAll(sheetName);
    return rows.filter(predicate);
  }

  function findOne(sheetName, predicate) {
    var rows = readAll(sheetName);
    for (var i = 0; i < rows.length; i++) {
      if (predicate(rows[i])) { return rows[i]; }
    }
    return null;
  }

  function findById(sheetName, idField, id) {
    return findOne(sheetName, function (r) { return String(r[idField]) === String(id); });
  }

  /** Append a single record (object keyed by header). Returns the record. */
  function insert(sheetName, record) {
    return _withLock(function () {
      var sheet = getSheet(sheetName);
      var cols = SCHEMA[sheetName];
      var row = cols.map(function (c) { return record[c] !== undefined && record[c] !== null ? record[c] : ''; });
      sheet.appendRow(row);
      _invalidate(sheetName);
      return record;
    });
  }

  /** Append many records efficiently in one setValues call. */
  function insertMany(sheetName, records) {
    if (!records || !records.length) { return 0; }
    return _withLock(function () {
      var sheet = getSheet(sheetName);
      var cols = SCHEMA[sheetName];
      var matrix = records.map(function (record) {
        return cols.map(function (c) { return record[c] !== undefined && record[c] !== null ? record[c] : ''; });
      });
      sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, cols.length).setValues(matrix);
      _invalidate(sheetName);
      return records.length;
    });
  }

  /** Update the first row matching predicate with the supplied fields. */
  function update(sheetName, predicate, fields) {
    return _withLock(function () {
      var row = findOne(sheetName, predicate);
      if (!row) { return false; }
      var sheet = getSheet(sheetName);
      var cols = SCHEMA[sheetName];
      var current = sheet.getRange(row._row, 1, 1, cols.length).getValues()[0];
      cols.forEach(function (c, j) {
        if (fields.hasOwnProperty(c)) { current[j] = fields[c]; }
      });
      sheet.getRange(row._row, 1, 1, cols.length).setValues([current]);
      _invalidate(sheetName);
      return true;
    });
  }

  function updateById(sheetName, idField, id, fields) {
    return update(sheetName, function (r) { return String(r[idField]) === String(id); }, fields);
  }

  /** Delete every row matching predicate. Returns count removed. */
  function remove(sheetName, predicate) {
    return _withLock(function () {
      var sheet = getSheet(sheetName);
      var rows = readAll(sheetName, false).filter(predicate);
      // Delete from bottom up to keep row indices valid.
      rows.sort(function (a, b) { return b._row - a._row; });
      rows.forEach(function (r) { sheet.deleteRow(r._row); });
      _invalidate(sheetName);
      return rows.length;
    });
  }

  // ---- caching helpers -----------------------------------------------------

  function _cache() { return CacheService.getScriptCache(); }

  function _cacheGet(key) {
    try {
      var raw = _cache().get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _cachePut(key, value) {
    try {
      var raw = JSON.stringify(value);
      // CacheService rejects values > 100KB; skip caching oversized sheets.
      if (raw.length < 95000) { _cache().put(key, raw, CONFIG.CACHE_TTL_MEDIUM); }
    } catch (e) { /* non-fatal */ }
  }

  function _invalidate(sheetName) {
    try { _cache().remove('all:' + sheetName); } catch (e) {}
  }

  function invalidateAll() {
    sheetNames().forEach(_invalidate);
  }

  // ---- locking -------------------------------------------------------------

  function _withLock(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  return {
    SCHEMA: SCHEMA,
    sheetNames: sheetNames,
    spreadsheet: spreadsheet,
    headers: headers,
    getSheet: getSheet,
    ensureSchema: ensureSchema,
    readAll: readAll,
    find: find,
    findOne: findOne,
    findById: findById,
    insert: insert,
    insertMany: insertMany,
    update: update,
    updateById: updateById,
    remove: remove,
    invalidate: _invalidate,
    invalidateAll: invalidateAll
  };
})();
