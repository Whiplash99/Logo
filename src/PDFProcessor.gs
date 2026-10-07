/**
 * PDFProcessor.gs
 * -----------------------------------------------------------------------------
 * PDF text extraction and OCR coordination.
 *
 * Apps Script cannot read PDF page text directly. The reliable, no-third-party
 * approach is to convert the PDF to a Google Doc via the Drive Advanced Service
 * (Drive.Files.insert with convert=true and ocr=true). Google applies OCR to
 * scanned pages automatically. We then read the resulting Google Doc text.
 *
 * Limitations (surfaced honestly to the administrator, never hidden):
 *  - The conversion yields a continuous text stream; precise PDF page breaks
 *    are approximated using page-break elements and form-feed characters where
 *    present. Printed page numbers are detected heuristically from the text.
 *  - Complex tables and technical drawings may convert poorly. Such content is
 *    flagged with reduced extraction quality so users know to consult the PDF.
 *  - Large PDFs are converted once, cached as a temporary Google Doc, and read
 *    in page batches by IndexingService to respect execution-time limits.
 * -----------------------------------------------------------------------------
 */

var PDFProcessor = (function () {

  var TEMP_PREFIX = '[portal-ocr] ';

  /**
   * Convert a PDF (by Drive file id) to a temporary Google Doc with OCR and
   * return the new Doc's id. The temp doc is reused across indexing batches and
   * removed when indexing completes.
   */
  function ensureOcrDoc(pdfFileId, docTitle) {
    var pdfFile = DriveApp.getFileById(pdfFileId);
    var resource = {
      title: TEMP_PREFIX + (docTitle || pdfFile.getName()),
      mimeType: 'application/vnd.google-apps.document'
    };
    // ocr:true triggers Google OCR for scanned/image PDFs.
    var created = Drive.Files.insert(resource, pdfFile.getBlob(), {
      ocr: true,
      ocrLanguage: 'en',
      convert: true
    });
    return created.id;
  }

  function deleteOcrDoc(docId) {
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) {}
  }

  /**
   * Read the full text of the OCR Google Doc and split it into page units.
   * Returns an array of { pageIndex, printedPage, text, quality, ocr }.
   *
   * Page splitting strategy: DocumentApp exposes page-break elements; we also
   * split on form-feed. Where neither is present (common after conversion),
   * we fall back to a single logical block per paragraph-group so indexing
   * still works — page numbers are then marked as approximate.
   */
  function extractPages(ocrDocId) {
    var doc = DocumentApp.openById(ocrDocId);
    var body = doc.getBody();
    var numChildren = body.getNumChildren();

    var pages = [];
    var currentText = [];
    var pageIndex = 1;

    function flush() {
      var text = currentText.join('\n').trim();
      if (text) {
        pages.push(buildPage(pageIndex, text));
        pageIndex++;
      }
      currentText = [];
    }

    for (var i = 0; i < numChildren; i++) {
      var el = body.getChild(i);
      var type = el.getType();
      if (type === DocumentApp.ElementType.PAGE_BREAK) {
        flush();
        continue;
      }
      var txt = '';
      try { txt = el.asText ? el.getText() : ''; } catch (e) { txt = ''; }
      if (txt && txt.indexOf('\f') !== -1) {
        var parts = txt.split('\f');
        currentText.push(parts.shift());
        flush();
        while (parts.length > 1) { currentText.push(parts.shift()); flush(); }
        currentText.push(parts.shift());
      } else if (txt) {
        currentText.push(txt);
      }
    }
    flush();

    // If the document produced only one giant block, re-chunk by size so the
    // indexer still has workable units. Pages are then approximate.
    if (pages.length <= 1 && pages.length > 0 && pages[0].text.length > CONFIG.CHUNK_MAX_CHARS * 3) {
      var big = pages[0].text;
      var chunks = Util.chunkText(big, 3000, 5000);
      pages = chunks.map(function (c, idx) {
        var p = buildPage(idx + 1, c);
        p.approximate = true;
        return p;
      });
    }
    return pages;
  }

  function buildPage(index, text) {
    var printed = detectPrintedPage(text);
    var quality = assessQuality(text);
    return {
      pageIndex: index,
      printedPage: printed,
      text: text,
      quality: quality.label,
      ocr: quality.likelyOcr,
      approximate: false
    };
  }

  /** Heuristically detect a printed page number from page text. */
  function detectPrintedPage(text) {
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var candidates = lines.slice(0, 2).concat(lines.slice(-2));
    for (var i = 0; i < candidates.length; i++) {
      var m = candidates[i].match(/^(?:page\s+)?(\d{1,4})$/i) ||
              candidates[i].match(/\b(\d{1,2}-\d{1,3})\b/); // e.g. 4-12 (manual style)
      if (m) { return m[1]; }
    }
    return '';
  }

  /**
   * Assess extraction quality. Very short text or a high ratio of non-word
   * characters suggests a scanned page where OCR was incomplete.
   */
  function assessQuality(text) {
    var len = text.length;
    if (len < 40) { return { label: 'Low', likelyOcr: true }; }
    var letters = (text.match(/[a-zA-Z]/g) || []).length;
    var ratio = letters / len;
    if (ratio < 0.45) { return { label: 'Low', likelyOcr: true }; }
    if (ratio < 0.62) { return { label: 'Medium', likelyOcr: true }; }
    return { label: 'High', likelyOcr: false };
  }

  return {
    ensureOcrDoc: ensureOcrDoc,
    deleteOcrDoc: deleteOcrDoc,
    extractPages: extractPages,
    detectPrintedPage: detectPrintedPage,
    assessQuality: assessQuality
  };
})();
