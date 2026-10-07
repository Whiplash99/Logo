/**
 * CrossReferenceService.gs
 * -----------------------------------------------------------------------------
 * Builds and retrieves cross-references between sections.
 *
 * Three relationship classes, kept strictly distinct:
 *   - Direct Reference   : an explicit "see X" found in the source text.
 *   - Related Provision  : same paragraph family or strong subject overlap.
 *   - Suggested Reference : keyword/subject similarity only (algorithmic).
 *
 * A suggested relationship is never presented as an official ICAO cross-ref.
 * -----------------------------------------------------------------------------
 */

var CrossReferenceService = (function () {

  /**
   * Resolve explicit reference seeds collected during indexing into stored
   * cross-reference rows, and add related-provision links by subject.
   */
  function buildForDocument(documentId, seeds) {
    var sections = DB.find('Sections', function (s) { return s.Document_ID === documentId; });
    var allSections = DB.readAll('Sections');
    var rows = [];

    // 1. Explicit "see 3.4.1 / see Doc 9157" references.
    (seeds || []).forEach(function (seed) {
      seed.refs.forEach(function (refText) {
        var target = resolveReference(refText, documentId, allSections);
        if (target) {
          rows.push(makeRow(documentId, seed.sectionId, target.Document_ID, target.Section_ID,
            CONFIG.CROSS_REF_TYPES.DIRECT, refText, 'Verified (explicit in source)'));
        } else {
          // Keep the unresolved explicit reference as a labelled direct ref
          // (target unknown) so the user still sees the source's own pointer.
          rows.push(makeRow(documentId, seed.sectionId, '', '',
            CONFIG.CROSS_REF_TYPES.DIRECT, refText, 'Explicit in source (target not indexed)'));
        }
      });
    });

    // 2. Related provisions by shared subject category (cap to avoid explosion).
    var bySubject = {};
    allSections.forEach(function (s) {
      var subj = s._subject || SubjectClassifier.classify(s.Heading + ' ' + (s.Extracted_Text || '').substring(0, 400));
      s._subject = subj;
      if (!subj) { return; }
      (bySubject[subj] = bySubject[subj] || []).push(s);
    });

    sections.forEach(function (s) {
      var subj = s._subject;
      if (!subj) { return; }
      var peers = (bySubject[subj] || []).filter(function (p) {
        return p.Document_ID !== documentId; // cross-document related links are most useful
      });
      peers.slice(0, 4).forEach(function (p) {
        rows.push(makeRow(documentId, s.Section_ID, p.Document_ID, p.Section_ID,
          CONFIG.CROSS_REF_TYPES.SUGGESTED, subj, 'Algorithmic (subject similarity)'));
      });
    });

    if (rows.length) { DB.insertMany('Cross_References', rows); }
    return rows.length;
  }

  function resolveReference(refText, sourceDocId, allSections) {
    var paraMatch = refText.match(/\b(\d+\.\d+(?:\.\d+)*)\b/);
    var docMatch = refText.match(/Doc\s*(\d{3,4})/i);
    var annexMatch = refText.match(/Annex\s*(\d+)/i);

    var candidates = allSections;
    if (docMatch || annexMatch) {
      var token = docMatch ? ('Doc ' + docMatch[1]) : ('Annex ' + annexMatch[1]);
      var docs = DB.find('Documents', function (d) { return String(d.ICAO_Document_Number).indexOf(token) !== -1; });
      var ids = {};
      docs.forEach(function (d) { ids[d.Document_ID] = 1; });
      candidates = allSections.filter(function (s) { return ids[s.Document_ID]; });
    }
    if (paraMatch) {
      var para = paraMatch[1];
      for (var i = 0; i < candidates.length; i++) {
        if (String(candidates[i].Paragraph_Number) === para) { return candidates[i]; }
      }
    }
    return null;
  }

  function makeRow(srcDoc, srcSec, tgtDoc, tgtSec, type, label, verification) {
    return {
      Reference_ID: Util.newId('XRF'),
      Source_Document_ID: srcDoc,
      Source_Section_ID: srcSec,
      Target_Document_ID: tgtDoc,
      Target_Section_ID: tgtSec,
      Reference_Type: type,
      Label: label || '',
      Verification_Status: verification || ''
    };
  }

  /** Cross-references for a section, grouped and enriched for display. */
  function forSection(sectionId) {
    var refs = DB.find('Cross_References', function (r) { return r.Source_Section_ID === sectionId; });
    if (!refs.length) {
      return { direct: [], related: [], suggested: [], empty: true };
    }
    var out = { direct: [], related: [], suggested: [], empty: false };
    refs.forEach(function (r) {
      var enriched = enrich(r);
      if (r.Reference_Type === CONFIG.CROSS_REF_TYPES.DIRECT) { out.direct.push(enriched); }
      else if (r.Reference_Type === CONFIG.CROSS_REF_TYPES.RELATED) { out.related.push(enriched); }
      else { out.suggested.push(enriched); }
    });
    return out;
  }

  function enrich(r) {
    var tgtDoc = r.Target_Document_ID ? DB.findById('Documents', 'Document_ID', r.Target_Document_ID) : null;
    var tgtSec = r.Target_Section_ID ? DB.findById('Sections', 'Section_ID', r.Target_Section_ID) : null;
    return {
      referenceId: r.Reference_ID,
      type: r.Reference_Type,
      label: r.Label,
      verification: r.Verification_Status,
      targetDocumentId: r.Target_Document_ID,
      targetSectionId: r.Target_Section_ID,
      targetDocumentTitle: tgtDoc ? tgtDoc.Document_Title : '',
      targetHeading: tgtSec ? tgtSec.Heading : '',
      targetParagraph: tgtSec ? tgtSec.Paragraph_Number : '',
      targetPage: tgtSec ? tgtSec.Start_Page : ''
    };
  }

  /** Administrator adds a verified cross-reference manually. */
  function addVerified(sourceSectionId, targetSectionId, label) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var src = DB.findById('Sections', 'Section_ID', sourceSectionId);
    var tgt = DB.findById('Sections', 'Section_ID', targetSectionId);
    if (!src || !tgt) { throw new Error('Both source and target sections must exist.'); }
    DB.insert('Cross_References', makeRow(src.Document_ID, sourceSectionId, tgt.Document_ID, targetSectionId,
      CONFIG.CROSS_REF_TYPES.DIRECT, label || 'Administrator-verified reference', 'Verified (administrator)'));
    AuditService.log('Add cross-reference', sourceSectionId + ' -> ' + targetSectionId, 'OK');
    DB.invalidate('Cross_References');
    return true;
  }

  return {
    buildForDocument: buildForDocument,
    forSection: forSection,
    addVerified: addVerified
  };
})();
