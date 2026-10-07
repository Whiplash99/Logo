/**
 * IndexingService.gs
 * -----------------------------------------------------------------------------
 * Orchestrates document indexing with resumable, time-bounded batches so large
 * PDFs can be processed within Apps Script execution limits.
 *
 * Flow:
 *   1. startIndexing(documentId) converts the PDF to an OCR Google Doc, extracts
 *      pages, runs the StructureParser, and stores progress state.
 *   2. runBatch(documentId) writes Sections + Search_Index rows for the next
 *      slice of parsed sections, updating progress until complete.
 *   3. On completion, cross-references are generated and the temp OCR doc is
 *      removed.
 *
 * Progress is stored in Script Properties (small JSON) and the parsed sections
 * are cached. Each step is logged to Indexing_Logs. A time-trigger installed by
 * AdminService can drive runBatch automatically; the admin UI can also advance
 * it manually and watch progress.
 * -----------------------------------------------------------------------------
 */

var IndexingService = (function () {

  function progressKey(docId) { return 'INDEX_PROGRESS_' + docId; }
  function sectionsKey(docId) { return 'INDEX_SECTIONS_' + docId; }

  function _props() { return PropertiesService.getScriptProperties(); }

  function getProgress(docId) {
    var raw = _props().getProperty(progressKey(docId));
    return raw ? JSON.parse(raw) : null;
  }

  function setProgress(docId, p) {
    _props().setProperty(progressKey(docId), JSON.stringify(p));
  }

  function clearState(docId) {
    _props().deleteProperty(progressKey(docId));
    // Parsed sections can be large; store in a chunked property set.
    _clearChunked(sectionsKey(docId));
  }

  /**
   * Begin indexing: OCR-convert, extract pages, parse structure, persist the
   * parsed section list, and set progress to batch 0. Does NOT write rows yet.
   */
  function startIndexing(documentId) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var doc = DB.findById('Documents', 'Document_ID', documentId);
    if (!doc) { throw new Error('Document not found.'); }
    if (!doc.Drive_File_ID) { throw new Error('Link a Drive PDF to this document before indexing.'); }

    // Clear any prior index rows for a clean re-index.
    purgeIndex(documentId);

    DB.updateById('Documents', 'Document_ID', documentId, {
      Indexing_Status: CONFIG.INDEX_STATUS.PROCESSING,
      Indexed_Pages: 0
    });

    var started = Date.now();
    var ocrDocId, pages;
    try {
      ocrDocId = PDFProcessor.ensureOcrDoc(doc.Drive_File_ID, doc.Document_Title);
      pages = PDFProcessor.extractPages(ocrDocId);
    } catch (e) {
      _log(documentId, 'OCR/convert', '', CONFIG.INDEX_STATUS.FAILED, e.message);
      DB.updateById('Documents', 'Document_ID', documentId, { Indexing_Status: CONFIG.INDEX_STATUS.FAILED });
      throw new Error('Text extraction failed: ' + e.message);
    }

    var sections = StructureParser.parse(pages);
    _saveChunked(sectionsKey(documentId), JSON.stringify(sections));

    var progress = {
      documentId: documentId,
      ocrDocId: ocrDocId,
      totalPages: pages.length,
      totalSections: sections.length,
      nextSection: 0,
      indexedSections: 0,
      indexedPages: 0,
      status: CONFIG.INDEX_STATUS.PROCESSING,
      startedAt: new Date(started).toISOString()
    };
    setProgress(documentId, progress);

    DB.updateById('Documents', 'Document_ID', documentId, {
      Total_Pages: pages.length
    });

    _log(documentId, 'start', '1-' + pages.length, CONFIG.INDEX_STATUS.PROCESSING,
      'Extracted ' + pages.length + ' page unit(s), ' + sections.length + ' section(s).');

    // Run the first batch immediately for responsiveness.
    return runBatch(documentId);
  }

  /**
   * Process the next slice of parsed sections within the runtime budget.
   * Returns the current progress snapshot.
   */
  function runBatch(documentId) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var progress = getProgress(documentId);
    if (!progress) { throw new Error('No indexing in progress for this document. Start indexing first.'); }
    if (progress.status === CONFIG.INDEX_STATUS.COMPLETE) { return progress; }

    var sections = JSON.parse(_loadChunked(sectionsKey(documentId)) || '[]');
    var start = Date.now();
    var sectionRows = [];
    var indexRows = [];
    var crossSources = [];
    var i = progress.nextSection;
    var batchPages = 0;
    var lowQuality = 0;

    for (; i < sections.length; i++) {
      var s = sections[i];
      var sectionId = Util.newId('SEC');
      sectionRows.push({
        Section_ID: sectionId,
        Document_ID: documentId,
        Chapter: s.chapter || '',
        Section_Number: s.sectionNumber || '',
        Paragraph_Number: s.paragraph || '',
        Heading: s.heading || '',
        Provision_Type: s.provisionType || 'Unclassified',
        Start_Page: s.startPage || '',
        End_Page: s.endPage || '',
        Extracted_Text: Util.truncate(s.text, 45000),
        Extraction_Quality: s.quality || 'High',
        OCR_Status: s.ocr ? 'OCR (verify)' : 'Native'
      });

      // One search-index row per chunk keeps normalized text searchable.
      var chunks = Util.chunkText(s.text);
      chunks.forEach(function (chunk) {
        indexRows.push({
          Index_ID: Util.newId('IDX'),
          Document_ID: documentId,
          Section_ID: sectionId,
          Page_Number: s.startPage || '',
          Printed_Page_Number: s.printedPage || '',
          Heading: s.heading || '',
          Normalized_Text: Util.normalize(chunk),
          Keywords: Util.tokenize(s.heading + ' ' + chunk).slice(0, 40).join(' '),
          Subject_Category: SubjectClassifier.classify(s.heading + ' ' + chunk),
          Search_Metadata: JSON.stringify({ type: s.provisionType, para: s.paragraph })
        });
      });

      // Collect explicit cross references for later resolution.
      var refs = StructureParser.extractExplicitRefs(s.text);
      if (refs.length) { crossSources.push({ sectionId: sectionId, refs: refs }); }

      if (s.quality === 'Low') { lowQuality++; }
      batchPages += Math.max(1, (s.endPage || s.startPage) - s.startPage + 1);

      if (Date.now() - start > CONFIG.INDEX_MAX_RUNTIME_MS || (i - progress.nextSection) >= 120) {
        i++;
        break;
      }
    }

    if (sectionRows.length) { DB.insertMany('Sections', sectionRows); }
    if (indexRows.length) { DB.insertMany('Search_Index', indexRows); }

    // Persist cross-reference seeds into the document progress for resolution.
    progress.crossSeeds = (progress.crossSeeds || []).concat(crossSources);
    progress.nextSection = i;
    progress.indexedSections += sectionRows.length;
    progress.indexedPages = Math.min(progress.totalPages, progress.indexedPages + batchPages);
    progress.lowQuality = (progress.lowQuality || 0) + lowQuality;

    var done = progress.nextSection >= sections.length;
    if (done) {
      finish(documentId, progress);
    } else {
      setProgress(documentId, progress);
      DB.updateById('Documents', 'Document_ID', documentId, {
        Indexed_Pages: progress.indexedPages,
        Indexing_Status: CONFIG.INDEX_STATUS.PROCESSING
      });
      _log(documentId, 'batch', 'sections ' + (progress.nextSection) + '/' + sections.length,
        CONFIG.INDEX_STATUS.PROCESSING, sectionRows.length + ' section(s) written.');
    }
    return getProgress(documentId) || progress;
  }

  function finish(documentId, progress) {
    // Resolve cross references now that all sections exist.
    try {
      CrossReferenceService.buildForDocument(documentId, progress.crossSeeds || []);
    } catch (e) {
      _log(documentId, 'crossref', '', 'Partial', 'Cross-reference build warning: ' + e.message);
    }

    var finalStatus = (progress.lowQuality > 0)
      ? CONFIG.INDEX_STATUS.PARTIAL
      : CONFIG.INDEX_STATUS.COMPLETE;

    DB.updateById('Documents', 'Document_ID', documentId, {
      Indexed_Pages: progress.totalPages,
      Indexing_Status: finalStatus,
      Last_Updated: Util.isoNow()
    });

    PDFProcessor.deleteOcrDoc(progress.ocrDocId);

    _log(documentId, 'complete', '1-' + progress.totalPages, finalStatus,
      progress.indexedSections + ' sections, ' + (progress.lowQuality || 0) + ' low-quality.');

    progress.status = finalStatus;
    setProgress(documentId, progress);
    GlossaryService.harvest(documentId);
    DB.invalidateAll();
  }

  /** Remove all index/section/crossref rows for a document (for re-index). */
  function purgeIndex(documentId) {
    DB.remove('Search_Index', function (r) { return r.Document_ID === documentId; });
    DB.remove('Sections', function (r) { return r.Document_ID === documentId; });
    DB.remove('Cross_References', function (r) {
      return r.Source_Document_ID === documentId || r.Target_Document_ID === documentId;
    });
    DB.remove('Glossary', function (r) { return r.Source_Document_ID === documentId; });
  }

  function retry(documentId) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    clearState(documentId);
    return startIndexing(documentId);
  }

  function logs(documentId, limit) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var rows = DB.readAll('Indexing_Logs').filter(function (r) {
      return !documentId || r.Document_ID === documentId;
    });
    rows.sort(function (a, b) { return String(b.Processing_Date).localeCompare(String(a.Processing_Date)); });
    return rows.slice(0, limit || 50);
  }

  function _log(docId, batch, pageRange, status, message) {
    DB.insert('Indexing_Logs', {
      Log_ID: Util.newId('LOG'),
      Document_ID: docId,
      Processing_Batch: batch,
      Page_Range: pageRange,
      Processing_Status: status,
      Error_Message: message || '',
      Processing_Date: Util.isoNow(),
      Retry_Count: 0
    });
  }

  // ---- chunked property storage (for large parsed-section JSON) ------------

  function _saveChunked(key, str) {
    _clearChunked(key);
    var props = _props();
    var size = 9000; // stay well under the 9KB per-property limit
    var count = Math.ceil(str.length / size);
    var map = {};
    for (var i = 0; i < count; i++) {
      map[key + '_' + i] = str.substring(i * size, (i + 1) * size);
    }
    map[key + '_count'] = String(count);
    props.setProperties(map, false);
  }

  function _loadChunked(key) {
    var props = _props();
    var count = parseInt(props.getProperty(key + '_count') || '0', 10);
    if (!count) { return null; }
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(props.getProperty(key + '_' + i) || '');
    }
    return out.join('');
  }

  function _clearChunked(key) {
    var props = _props();
    var count = parseInt(props.getProperty(key + '_count') || '0', 10);
    for (var i = 0; i < count; i++) { props.deleteProperty(key + '_' + i); }
    props.deleteProperty(key + '_count');
  }

  return {
    startIndexing: startIndexing,
    runBatch: runBatch,
    retry: retry,
    getProgress: getProgress,
    purgeIndex: purgeIndex,
    logs: logs
  };
})();
