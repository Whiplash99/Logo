/**
 * VersionService.gs
 * -----------------------------------------------------------------------------
 * Edition / amendment management and section-level comparison between two
 * editions of the same document family. Paragraph numbers are NOT assumed to be
 * stable across editions — comparison is by paragraph number when both sides
 * have one, and the result always reports the edition each side came from.
 * -----------------------------------------------------------------------------
 */

var VersionService = (function () {

  /** Group documents that share an ICAO number + volume/part as a version set. */
  function versionSets() {
    var docs = DB.readAll('Documents');
    var groups = {};
    docs.forEach(function (d) {
      var key = [d.ICAO_Document_Number, d.Volume, d.Part].join('|');
      (groups[key] = groups[key] || []).push(d);
    });
    return Object.keys(groups).map(function (k) {
      var items = groups[k].sort(function (a, b) { return String(b.Edition).localeCompare(String(a.Edition)); });
      return {
        key: k,
        title: items[0].Document_Title,
        number: items[0].ICAO_Document_Number,
        editions: items.map(function (d) {
          return {
            documentId: d.Document_ID, edition: d.Edition, amendment: d.Amendment,
            status: d.Status, indexed: d.Indexing_Status
          };
        })
      };
    }).filter(function (g) { return g.editions.length > 1; });
  }

  /** Mark a document superseded and (optionally) flag the replacement current. */
  function supersede(oldDocId, newDocId) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    DB.updateById('Documents', 'Document_ID', oldDocId, { Status: CONFIG.DOC_STATUS.SUPERSEDED, Last_Updated: Util.isoNow() });
    if (newDocId) {
      DB.updateById('Documents', 'Document_ID', newDocId, { Status: CONFIG.DOC_STATUS.CURRENT, Last_Updated: Util.isoNow() });
    }
    AuditService.log('Supersede document', oldDocId + ' -> ' + newDocId, 'OK');
    return true;
  }

  /**
   * Compare two editions by paragraph number. Returns added / removed / modified
   * / unchanged section summaries. Each entry names the source edition.
   */
  function compare(docIdA, docIdB) {
    var docA = DB.findById('Documents', 'Document_ID', docIdA);
    var docB = DB.findById('Documents', 'Document_ID', docIdB);
    if (!docA || !docB) { throw new Error('Both documents must exist.'); }

    var a = indexByPara(docIdA);
    var b = indexByPara(docIdB);

    var added = [], removed = [], modified = [], unchanged = 0;

    Object.keys(b).forEach(function (para) {
      if (!a[para]) {
        added.push(summary(b[para], docB));
      } else {
        var sim = similarity(a[para].Extracted_Text, b[para].Extracted_Text);
        if (sim < 0.95) {
          modified.push({
            paragraph: para,
            heading: b[para].Heading,
            before: Util.truncate(a[para].Extracted_Text, 400),
            after: Util.truncate(b[para].Extracted_Text, 400),
            similarity: Math.round(sim * 100)
          });
        } else { unchanged++; }
      }
    });
    Object.keys(a).forEach(function (para) {
      if (!b[para]) { removed.push(summary(a[para], docA)); }
    });

    return {
      editionA: { documentId: docIdA, edition: docA.Edition, title: docA.Document_Title },
      editionB: { documentId: docIdB, edition: docB.Edition, title: docB.Document_Title },
      added: added, removed: removed, modified: modified, unchanged: unchanged,
      summary: added.length + ' added, ' + removed.length + ' removed, ' + modified.length + ' modified, ' + unchanged + ' unchanged (by paragraph number).'
    };
  }

  function indexByPara(docId) {
    var map = {};
    DB.find('Sections', function (s) { return s.Document_ID === docId && s.Paragraph_Number; })
      .forEach(function (s) { map[s.Paragraph_Number] = s; });
    return map;
  }

  function summary(sec, doc) {
    return {
      paragraph: sec.Paragraph_Number, heading: sec.Heading,
      edition: doc.Edition, excerpt: Util.truncate(sec.Extracted_Text, 300)
    };
  }

  /** Jaccard similarity over token sets — cheap and good enough for flagging. */
  function similarity(x, y) {
    var tx = Util.tokenize(x), ty = Util.tokenize(y);
    if (!tx.length && !ty.length) { return 1; }
    var set = {}; tx.forEach(function (t) { set[t] = 1; });
    var inter = 0; ty.forEach(function (t) { if (set[t]) { inter++; } });
    var union = Object.keys(set).length + ty.length - inter;
    return union ? inter / union : 0;
  }

  return { versionSets: versionSets, supersede: supersede, compare: compare };
})();
