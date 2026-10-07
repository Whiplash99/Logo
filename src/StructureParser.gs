/**
 * StructureParser.gs
 * -----------------------------------------------------------------------------
 * Detect document structure from extracted page text: chapters, section and
 * paragraph numbering, headings, and the ICAO provision classification.
 *
 * The parser is deliberately conservative. It only assigns a provision type
 * (Standard / Recommended Practice / Note / etc.) when the source wording
 * supports it; otherwise the content is left 'Unclassified' so the application
 * never mislabels guidance material as a Standard.
 * -----------------------------------------------------------------------------
 */

var StructureParser = (function () {

  // Matches ICAO paragraph numbering at the start of a line: 3.4.1, 5.3.5.2 ...
  var PARA_RE = /^(\d{1,2}(?:\.\d{1,3}){1,4})\s+(.*)$/;
  // Matches chapter headings.
  var CHAPTER_RE = /^(?:chapter)\s+([0-9]+)\b[.:]?\s*(.*)$/i;
  // Appendix / Attachment headers.
  var APPENDIX_RE = /^(appendix|attachment)\s+([0-9A-Z]+)\b[.:]?\s*(.*)$/i;

  /**
   * Parse an array of extracted pages (from PDFProcessor) into an ordered list
   * of logical sections. Each section carries its originating page span.
   *
   * @param {Array} pages  [{pageIndex, printedPage, text, quality, ocr}]
   * @return {Array} sections
   */
  function parse(pages) {
    var sections = [];
    var currentChapter = '';
    var open = null; // the section currently accumulating text

    function closeOpen(endPage) {
      if (open) {
        open.endPage = endPage;
        open.text = open.textParts.join('\n').trim();
        delete open.textParts;
        sections.push(open);
        open = null;
      }
    }

    pages.forEach(function (page) {
      var lines = String(page.text).split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) { continue; }

        var ch = line.match(CHAPTER_RE);
        if (ch) {
          closeOpen(page.pageIndex);
          currentChapter = 'Chapter ' + ch[1] + (ch[2] ? ' — ' + ch[2].trim() : '');
          continue;
        }

        var ap = line.match(APPENDIX_RE);
        if (ap) {
          closeOpen(page.pageIndex);
          open = newSection(currentChapter, '', '', cap(ap[1]) + ' ' + ap[2], page);
          open.provisionType = cap(ap[1]); // Appendix / Attachment
          if (ap[3]) { open.textParts.push(ap[3]); }
          continue;
        }

        var pm = line.match(PARA_RE);
        if (pm) {
          closeOpen(page.pageIndex);
          var number = pm[1];
          var rest = pm[2] || '';
          open = newSection(currentChapter, sectionOf(number), number, headingOf(rest), page);
          open.textParts.push(rest);
          open.provisionType = classify(rest, number);
          continue;
        }

        // Continuation of current section (or lead text before first number).
        if (open) {
          open.textParts.push(line);
          if (open.provisionType === 'Unclassified') {
            var inferred = classify(line, open.paragraph);
            if (inferred !== 'Unclassified') { open.provisionType = inferred; }
          }
        } else {
          // Pre-amble before first numbered paragraph on a page.
          open = newSection(currentChapter, '', '', headingOf(line), page);
          open.textParts.push(line);
        }
        if (open) { open.ocr = open.ocr || page.ocr; open.quality = worseQuality(open.quality, page.quality); }
      }
      // Record end page as we go so a section spanning pages is captured.
      if (open) { open.endPage = page.pageIndex; }
    });
    closeOpen(pages.length ? pages[pages.length - 1].pageIndex : 1);

    return sections.filter(function (s) { return s.text && s.text.length > 1; });
  }

  function newSection(chapter, sectionNumber, paragraph, heading, page) {
    return {
      chapter: chapter,
      sectionNumber: sectionNumber,
      paragraph: paragraph,
      heading: Util.truncate(heading || '', 160),
      provisionType: 'Unclassified',
      startPage: page.pageIndex,
      endPage: page.pageIndex,
      printedPage: page.printedPage,
      quality: page.quality,
      ocr: page.ocr,
      textParts: []
    };
  }

  /** The parent section number: 3.4.1 -> 3.4 */
  function sectionOf(number) {
    var parts = number.split('.');
    return parts.length > 2 ? parts.slice(0, 2).join('.') : number;
  }

  function headingOf(rest) {
    // A heading is the leading clause up to the first sentence terminator.
    var m = String(rest).match(/^([^.;:]{3,120})/);
    return m ? m[1].trim() : Util.truncate(rest, 80);
  }

  /**
   * Classify a provision from wording. ICAO Annexes mark Standards with "shall"
   * and Recommended Practices with "should" / "Recommendation.-". Manuals use
   * notes, definitions and guidance language. Conservative by design.
   */
  function classify(text, number) {
    var t = ' ' + String(text).toLowerCase() + ' ';
    if (/^\s*note\b/i.test(text) || /\bnote\s*\.?-/i.test(text)) { return 'Note'; }
    if (/^\s*recommendation\.?-/i.test(text)) { return 'Recommended Practice'; }
    if (/\bis defined as\b|\bmeans\b\.|—?\s*[A-Z][a-z].*\.$/.test(text) && /definition/i.test(text)) { return 'Definition'; }
    if (/\bshould\b/.test(t) && !/\bshall\b/.test(t)) { return 'Recommended Practice'; }
    if (/\bshall\b/.test(t)) { return 'Standard'; }
    if (/\bmay\b|\bcan\b|\btypically\b|\bfor example\b|\bguidance\b/.test(t)) { return 'Guidance Material'; }
    return 'Unclassified';
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

  function worseQuality(a, b) {
    var rank = { 'High': 3, 'Medium': 2, 'Low': 1 };
    if (!a) { return b; }
    return (rank[b] || 3) < (rank[a] || 3) ? b : a;
  }

  /** Find explicit cross-references ("see 3.4.1", "see Doc 9157, Part 4"). */
  function extractExplicitRefs(text) {
    var refs = [];
    var re = /\b(?:see|refer(?:ence)?(?:\s+to)?|in accordance with)\s+((?:Doc\s*\d{3,4}[^.,;]*?|Annex\s*\d+[^.,;]*?|\d+\.\d+(?:\.\d+)*))/ig;
    var m;
    while ((m = re.exec(text)) !== null) {
      refs.push(m[1].trim());
      if (refs.length > 30) { break; }
    }
    return refs;
  }

  return {
    parse: parse,
    classify: classify,
    extractExplicitRefs: extractExplicitRefs
  };
})();
