/**
 * AskService.gs
 * -----------------------------------------------------------------------------
 * "Ask ICAO Reference" — a source-based question assistant.
 *
 * This implementation is strictly retrieval-based: it searches the indexed
 * documents, returns the most relevant passages with full citations, and
 * composes a short structured summary ONLY from the retrieved excerpts. It does
 * not generate unsupported technical values and does not substitute external
 * knowledge. If no AI API is configured (none is, by default), this is exactly
 * the authorised fallback described in the specification.
 *
 * The response separates "What the source material says" (verbatim excerpts +
 * citations) from a clearly labelled, non-authoritative overview assembled from
 * those excerpts. When nothing relevant is indexed, it says so plainly.
 * -----------------------------------------------------------------------------
 */

var AskService = (function () {

  function ask(question) {
    question = String(question || '').trim();
    if (!question) { return { question: question, answered: false, message: 'Enter a question.' }; }

    var result = SearchService.search({ query: question, pageSize: 6 });

    if (!result.total) {
      return {
        question: question,
        answered: false,
        message: 'The indexed documents do not contain enough information to answer this question. Try different terms, or consult the original ICAO publication.',
        passages: [],
        sources: []
      };
    }

    var passages = result.results.map(function (r) {
      var sec = DB.findById('Sections', 'Section_ID', r.sectionId) || {};
      return {
        sectionId: r.sectionId,
        documentId: r.documentId,
        documentTitle: r.documentTitle,
        provisionType: r.provisionType,
        paragraph: r.paragraph,
        page: r.page,
        heading: r.heading,
        excerpt: Util.truncate(String(sec.Extracted_Text || '').replace(/\s+/g, ' '), 600),
        ocr: r.ocr,
        citation: Citation.forSectionId(r.sectionId)
      };
    });

    // Overview: list the subjects/provision types the passages cover. This is
    // descriptive only — it reports what was retrieved, not new facts.
    var types = {};
    passages.forEach(function (p) { if (p.provisionType) { types[p.provisionType] = (types[p.provisionType] || 0) + 1; } });
    var typeList = Object.keys(types).map(function (t) { return types[t] + ' × ' + t; });

    return {
      question: question,
      answered: true,
      overview: 'The indexed material returned ' + result.total + ' relevant passage(s) across ' +
                countDocs(passages) + ' document(s)' +
                (typeList.length ? ', including ' + typeList.join(', ') + '.' : '.') +
                ' The source excerpts below are authoritative; the ordering reflects search relevance only.',
      passages: passages,
      sources: passages.map(function (p) { return { sectionId: p.sectionId, citation: p.citation }; }),
      disclaimer: CONFIG.DISCLAIMER
    };
  }

  function countDocs(passages) {
    var set = {};
    passages.forEach(function (p) { set[p.documentId] = 1; });
    return Object.keys(set).length;
  }

  return { ask: ask };
})();
