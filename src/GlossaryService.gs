/**
 * GlossaryService.gs
 * -----------------------------------------------------------------------------
 * Builds a searchable technical glossary from definitions found in indexed
 * content. Verbatim source definitions are flagged Is_Verbatim = true; nothing
 * is paraphrased unless explicitly marked otherwise.
 * -----------------------------------------------------------------------------
 */

var GlossaryService = (function () {

  // ICAO definitions typically read:  "Term.— The definition text."
  var DEF_RE = /([A-Z][A-Za-z()\/ \-]{2,60})\.\s*[—\-]{1,2}\s+([A-Z][^]{10,400}?\.)(?=\s|$)/g;

  /** Scan a freshly indexed document's sections for definitions. */
  function harvest(documentId) {
    var sections = DB.find('Sections', function (s) {
      return s.Document_ID === documentId &&
        (s.Provision_Type === 'Definition' || String(s.Chapter).toLowerCase().indexOf('definition') !== -1
         || /definition/i.test(s.Heading));
    });
    // If no dedicated definition sections, scan the first chapters' text.
    if (!sections.length) {
      sections = DB.find('Sections', function (s) {
        return s.Document_ID === documentId && /chapter 1\b/i.test(s.Chapter);
      });
    }
    var rows = [];
    var seen = {};
    sections.forEach(function (s) {
      var text = String(s.Extracted_Text || '');
      var m;
      DEF_RE.lastIndex = 0;
      while ((m = DEF_RE.exec(text)) !== null) {
        var term = m[1].trim();
        var def = m[2].trim();
        var key = term.toLowerCase();
        if (term.length < 3 || seen[key]) { continue; }
        seen[key] = true;
        rows.push({
          Term_ID: Util.newId('GLS'),
          Term: term,
          Definition: def,
          Source_Document_ID: documentId,
          Section_ID: s.Section_ID,
          Is_Verbatim: true,
          Date_Added: Util.isoNow()
        });
        if (rows.length > 400) { break; }
      }
    });
    if (rows.length) { DB.insertMany('Glossary', rows); }
    return rows.length;
  }

  function search(query) {
    var q = Util.normalize(query);
    var rows = DB.readAll('Glossary');
    if (q) {
      rows = rows.filter(function (r) {
        return Util.normalize(r.Term).indexOf(q) !== -1 || Util.normalize(r.Definition).indexOf(q) !== -1;
      });
    }
    rows.sort(function (a, b) { return String(a.Term).localeCompare(String(b.Term)); });
    return rows.slice(0, 300).map(function (r) {
      var doc = DB.findById('Documents', 'Document_ID', r.Source_Document_ID);
      return {
        termId: r.Term_ID,
        term: r.Term,
        definition: r.Definition,
        sectionId: r.Section_ID,
        documentTitle: doc ? doc.Document_Title : '',
        isVerbatim: r.Is_Verbatim === true || r.Is_Verbatim === 'true'
      };
    });
  }

  return { harvest: harvest, search: search };
})();
