/**
 * DocumentService.gs
 * -----------------------------------------------------------------------------
 * Registration and management of catalogue documents, plus section retrieval
 * for the viewer and result pages.
 * -----------------------------------------------------------------------------
 */

var DocumentService = (function () {

  function list(opts) {
    opts = opts || {};
    var docs = DB.readAll('Documents');
    if (!opts.includeArchived) {
      docs = docs.filter(function (d) { return d.Status !== CONFIG.DOC_STATUS.ARCHIVED; });
    }
    docs.sort(function (a, b) {
      return String(a.ICAO_Document_Number).localeCompare(String(b.ICAO_Document_Number)) ||
             String(a.Volume + a.Part).localeCompare(String(b.Volume + b.Part));
    });
    return docs.map(decorate);
  }

  function decorate(d) {
    return {
      documentId: d.Document_ID,
      title: d.Document_Title,
      number: d.ICAO_Document_Number,
      volume: d.Volume,
      part: d.Part,
      edition: d.Edition,
      amendment: d.Amendment,
      publicationDate: d.Publication_Date,
      category: d.Document_Category,
      status: d.Status,
      driveFileId: d.Drive_File_ID,
      driveUrl: d.Drive_File_URL,
      totalPages: d.Total_Pages || 0,
      indexedPages: d.Indexed_Pages || 0,
      indexingStatus: d.Indexing_Status,
      description: d.Description,
      sections: countSections(d.Document_ID),
      hasFile: !!d.Drive_File_ID,
      lastUpdated: Util.formatDate(d.Last_Updated)
    };
  }

  function countSections(docId) {
    return DB.find('Sections', function (s) { return s.Document_ID === docId; }).length;
  }

  function get(documentId) {
    var d = DB.findById('Documents', 'Document_ID', documentId);
    if (!d) { throw new Error('Document not found.'); }
    return decorate(d);
  }

  /** Register a new catalogue document (metadata only; file optional). */
  function register(meta) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var rec = {
      Document_ID: Util.newId('DOC'),
      Document_Title: meta.title || 'Untitled document',
      ICAO_Document_Number: meta.number || '',
      Volume: meta.volume || '',
      Part: meta.part || '',
      Edition: meta.edition || '',
      Amendment: meta.amendment || '',
      Publication_Date: meta.publicationDate || '',
      Document_Category: meta.category || 'Document',
      Drive_File_ID: meta.driveFileId || '',
      Drive_File_URL: meta.driveFileId ? DriveService.openUrl(meta.driveFileId) : '',
      Status: meta.status || CONFIG.DOC_STATUS.CURRENT,
      Total_Pages: 0,
      Indexed_Pages: 0,
      Indexing_Status: CONFIG.INDEX_STATUS.PENDING,
      Description: meta.description || '',
      Upload_Date: Util.isoNow(),
      Last_Updated: Util.isoNow()
    };
    DB.insert('Documents', rec);
    AuditService.log('Register document', rec.Document_ID + ' ' + rec.Document_Title, 'OK');
    return decorate(rec);
  }

  function updateMeta(documentId, fields) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var allowed = ['Document_Title','ICAO_Document_Number','Volume','Part','Edition','Amendment',
      'Publication_Date','Document_Category','Status','Description'];
    var update = {};
    allowed.forEach(function (k) {
      var camel = toCamel(k);
      if (fields.hasOwnProperty(camel)) { update[k] = fields[camel]; }
      if (fields.hasOwnProperty(k)) { update[k] = fields[k]; }
    });
    update.Last_Updated = Util.isoNow();
    DB.updateById('Documents', 'Document_ID', documentId, update);
    AuditService.log('Update document metadata', documentId, 'OK');
    return get(documentId);
  }

  /** Link (or replace) the Drive PDF for a document, retaining history. */
  function linkFile(documentId, driveFileId) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var info = DriveService.getFileInfo(driveFileId);
    DB.updateById('Documents', 'Document_ID', documentId, {
      Drive_File_ID: driveFileId,
      Drive_File_URL: info.url,
      Indexing_Status: CONFIG.INDEX_STATUS.PENDING,
      Last_Updated: Util.isoNow()
    });
    AuditService.log('Link Drive file', documentId + ' -> ' + driveFileId, 'OK');
    return get(documentId);
  }

  function setStatus(documentId, status) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    if (CONFIG.ROLE_ORDER.indexOf) { /* noop */ }
    var valid = Object.keys(CONFIG.DOC_STATUS).map(function (k) { return CONFIG.DOC_STATUS[k]; });
    if (valid.indexOf(status) === -1) { throw new Error('Invalid status.'); }
    DB.updateById('Documents', 'Document_ID', documentId, { Status: status, Last_Updated: Util.isoNow() });
    AuditService.log('Set document status', documentId + ' = ' + status, 'OK');
    return get(documentId);
  }

  function archive(documentId) { return setStatus(documentId, CONFIG.DOC_STATUS.ARCHIVED); }

  function removeDocument(documentId) {
    Auth.requireAdmin();
    IndexingService.purgeIndex(documentId);
    DB.remove('Documents', function (d) { return d.Document_ID === documentId; });
    AuditService.log('Delete document', documentId, 'OK');
    DB.invalidateAll();
    return true;
  }

  /** Ordered sections for the viewer / table of contents. */
  function sections(documentId) {
    var secs = DB.find('Sections', function (s) { return s.Document_ID === documentId; });
    secs.sort(function (a, b) {
      return (parseInt(a.Start_Page, 10) || 0) - (parseInt(b.Start_Page, 10) || 0) ||
             String(a.Paragraph_Number).localeCompare(String(b.Paragraph_Number));
    });
    return secs.map(function (s) {
      return {
        sectionId: s.Section_ID,
        chapter: s.Chapter,
        sectionNumber: s.Section_Number,
        paragraph: s.Paragraph_Number,
        heading: s.Heading,
        provisionType: s.Provision_Type,
        startPage: s.Start_Page,
        endPage: s.End_Page,
        quality: s.Extraction_Quality,
        ocr: s.OCR_Status
      };
    });
  }

  /** Full detail for one section, with its document, cross-refs and neighbours. */
  function section(sectionId) {
    var s = DB.findById('Sections', 'Section_ID', sectionId);
    if (!s) { throw new Error('Section not found.'); }
    var doc = DB.findById('Documents', 'Document_ID', s.Document_ID);
    var ordered = sections(s.Document_ID);
    var idx = ordered.findIndex(function (x) { return x.sectionId === sectionId; });
    Activity.record('section', sectionId, s.Heading);
    return {
      sectionId: s.Section_ID,
      documentId: s.Document_ID,
      documentTitle: doc ? doc.Document_Title : '',
      documentNumber: doc ? doc.ICAO_Document_Number : '',
      volume: doc ? doc.Volume : '',
      part: doc ? doc.Part : '',
      edition: doc ? doc.Edition : '',
      amendment: doc ? doc.Amendment : '',
      status: doc ? doc.Status : '',
      driveFileId: doc ? doc.Drive_File_ID : '',
      chapter: s.Chapter,
      sectionNumber: s.Section_Number,
      paragraph: s.Paragraph_Number,
      heading: s.Heading,
      provisionType: s.Provision_Type,
      startPage: s.Start_Page,
      endPage: s.End_Page,
      printedPage: '',
      text: s.Extracted_Text,
      quality: s.Extraction_Quality,
      ocr: s.OCR_Status,
      crossReferences: CrossReferenceService.forSection(sectionId),
      citation: Citation.forSection(s, doc),
      prev: idx > 0 ? ordered[idx - 1] : null,
      next: (idx !== -1 && idx < ordered.length - 1) ? ordered[idx + 1] : null
    };
  }

  function toCamel(s) {
    return s.replace(/_([a-z])/gi, function (_, c) { return c.toUpperCase(); })
            .replace(/^([A-Z])/, function (m) { return m.toLowerCase(); });
  }

  return {
    list: list,
    get: get,
    register: register,
    updateMeta: updateMeta,
    linkFile: linkFile,
    setStatus: setStatus,
    archive: archive,
    removeDocument: removeDocument,
    sections: sections,
    section: section,
    decorate: decorate
  };
})();
