/**
 * KnowledgeService.gs
 * -----------------------------------------------------------------------------
 * The Technical Knowledge Library groups indexed content by subject rather than
 * by document. Subject pages are generated entirely from indexed sections and
 * link back to their source. Subjects with no indexed content are reported as
 * empty rather than fabricated.
 * -----------------------------------------------------------------------------
 */

var KnowledgeService = (function () {

  /** Navigation tree with per-subject indexed-section counts. */
  function tree() {
    var sections = DB.readAll('Sections');
    // Pre-compute subject scores per section once.
    var subjectCounts = {};
    sections.forEach(function (s) {
      var scored = SubjectClassifier.scoreAll(s.Heading + ' ' + String(s.Extracted_Text || '').substring(0, 600));
      if (scored.length) {
        var name = scored[0].name;
        subjectCounts[name] = (subjectCounts[name] || 0) + 1;
      }
    });
    return CONFIG.KNOWLEDGE_SUBJECTS.map(function (group) {
      return {
        group: group.group,
        subjects: group.subjects.map(function (sub) {
          return { name: sub.name, count: subjectCounts[sub.name] || 0 };
        })
      };
    });
  }

  /** Full subject page: matching sections grouped by document. */
  function subject(name) {
    var sub = SubjectClassifier.subjectByName(name);
    if (!sub) { throw new Error('Unknown subject.'); }
    var sections = DB.readAll('Sections');
    var matches = [];
    sections.forEach(function (s) {
      var scored = SubjectClassifier.scoreAll(s.Heading + ' ' + String(s.Extracted_Text || '').substring(0, 800));
      var top = scored.length ? scored[0] : null;
      if (top && top.name === name) {
        matches.push({ s: s, score: top.score });
      }
    });
    matches.sort(function (a, b) { return b.score - a.score; });

    var byDoc = {};
    matches.slice(0, 80).forEach(function (m) {
      var doc = DB.findById('Documents', 'Document_ID', m.s.Document_ID);
      var key = m.s.Document_ID;
      if (!byDoc[key]) {
        byDoc[key] = { documentTitle: doc ? doc.Document_Title : '', documentId: key, number: doc ? doc.ICAO_Document_Number : '', items: [] };
      }
      byDoc[key].items.push({
        sectionId: m.s.Section_ID,
        paragraph: m.s.Paragraph_Number,
        heading: m.s.Heading,
        provisionType: m.s.Provision_Type,
        page: m.s.Start_Page,
        snippet: Util.truncate(String(m.s.Extracted_Text || '').replace(/\s+/g, ' '), 260)
      });
    });

    var groups = Object.keys(byDoc).map(function (k) { return byDoc[k]; });
    var glossary = GlossaryService.search(name.split(' ')[0]).slice(0, 6);

    return {
      name: name,
      group: sub.group,
      keywords: sub.keywords,
      empty: matches.length === 0,
      totalMatches: matches.length,
      documents: groups,
      definitions: glossary
    };
  }

  /** Quick-access subject -> run a scoped search (used by dashboard tiles). */
  function quickAccess(subject) {
    return SearchService.search({ query: subject, pageSize: 10 });
  }

  return { tree: tree, subject: subject, quickAccess: quickAccess };
})();
