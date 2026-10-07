/**
 * ExportService.gs
 * -----------------------------------------------------------------------------
 * Export helpers. Produces CSV (Excel-compatible) and a printable HTML document
 * for search results, bookmarks, reference collections, compliance registers
 * and subject reference sheets. Every export carries full source citations and
 * the authoritative-source notice.
 * -----------------------------------------------------------------------------
 */

var ExportService = (function () {

  function csvEscape(v) {
    v = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(v)) { return '"' + v.replace(/"/g, '""') + '"'; }
    return v;
  }

  function toCsv(headers, rows) {
    var lines = [headers.map(csvEscape).join(',')];
    rows.forEach(function (r) { lines.push(r.map(csvEscape).join(',')); });
    return lines.join('\n');
  }

  /** Export the current user's bookmarks as CSV text. */
  function bookmarksCsv() {
    var bms = BookmarkService.listMine();
    var rows = bms.map(function (b) {
      return [b.collection, b.documentTitle, b.paragraph, b.heading, b.page, Citation.forSectionId(b.sectionId)];
    });
    return toCsv(['Collection', 'Document', 'Paragraph', 'Heading', 'Page', 'Citation'], rows);
  }

  function complianceCsv(filters) {
    var rows = ComplianceService.list(filters).map(function (r) {
      return [r.referenceId, r.documentTitle, r.edition, r.chapter, r.paragraph, r.provisionType,
        r.nationalRegulation, r.aerodromeManualSection, r.responsibleUnit, r.complianceStatus,
        r.evidenceLink, r.identifiedGap, r.correctiveAction, r.targetDate, r.remarks, r.lastReviewed];
    });
    return toCsv(['Reference ID', 'Source Document', 'Edition', 'Chapter', 'Paragraph', 'Provision Type',
      'National Regulation', 'Aerodrome Manual Section', 'Responsible Unit', 'Compliance Status',
      'Evidence', 'Identified Gap', 'Corrective Action', 'Target Date', 'Remarks', 'Last Reviewed'], rows);
  }

  /** Export a set of sections (by id) as CSV reference sheet. */
  function sectionsCsv(sectionIds) {
    var rows = (sectionIds || []).map(function (id) {
      var s = DB.findById('Sections', 'Section_ID', id);
      if (!s) { return ['', '', '', '', 'Section not found', '']; }
      var doc = DB.findById('Documents', 'Document_ID', s.Document_ID);
      return [doc ? doc.Document_Title : '', doc ? doc.Edition : '', s.Chapter, s.Paragraph_Number,
        s.Heading, Citation.forSectionId(id)];
    });
    return toCsv(['Document', 'Edition', 'Chapter', 'Paragraph', 'Heading', 'Citation'], rows);
  }

  /** Printable HTML for a passage + citation (opened in a new window client-side). */
  function printableSection(sectionId) {
    var detail = DocumentService.section(sectionId);
    var html = [
      '<h2>' + Util.escapeHtml(detail.heading || detail.paragraph || 'Provision') + '</h2>',
      '<p><strong>Source:</strong> ' + Util.escapeHtml(detail.citation) + '</p>',
      '<p><strong>Provision type:</strong> ' + Util.escapeHtml(detail.provisionType) + '</p>',
      detail.ocr && detail.ocr.indexOf('OCR') !== -1 ? '<p><em>Note: OCR-derived text — verify against the original.</em></p>' : '',
      '<pre style="white-space:pre-wrap;font-family:inherit">' + Util.escapeHtml(detail.text) + '</pre>',
      '<hr><p style="font-size:12px;color:#555">' + Util.escapeHtml(CONFIG.DISCLAIMER) + '</p>'
    ].join('\n');
    return html;
  }

  return {
    bookmarksCsv: bookmarksCsv,
    complianceCsv: complianceCsv,
    sectionsCsv: sectionsCsv,
    printableSection: printableSection
  };
})();
