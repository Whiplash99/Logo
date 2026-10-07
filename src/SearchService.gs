/**
 * SearchService.gs
 * -----------------------------------------------------------------------------
 * The core search engine. Searches the Search_Index across all indexed
 * documents simultaneously and ranks results by relevance.
 *
 * Supported modes (all driven from a single query string + optional filters):
 *   - Keyword and partial-term matching
 *   - Exact phrase ("...") matching
 *   - Paragraph / section-number matching (e.g. 3.4.1)
 *   - Boolean AND / OR / NOT
 *   - Abbreviation expansion (RESA <-> runway end safety area)
 *   - Natural-language queries (stop-words stripped, terms AND/OR scored)
 *
 * Ranking prioritises, in order: exact paragraph match, exact phrase match,
 * heading match, then weighted term frequency. Results never contain fabricated
 * text — every snippet is built from indexed Normalized_Text / section text.
 * -----------------------------------------------------------------------------
 */

var SearchService = (function () {

  var STOPWORDS = {
    'the':1,'a':1,'an':1,'of':1,'for':1,'and':1,'or':1,'to':1,'in':1,'on':1,'is':1,
    'are':1,'what':1,'which':1,'how':1,'do':1,'does':1,'the':1,'with':1,'at':1,'by':1,
    'be':1,'as':1,'that':1,'this':1,'it':1,'from':1,'about':1,'guidance':1,'available':1,
    'requirement':1,'requirements':1,'provision':1,'provisions':1,'icao':1
  };

  /**
   * Parse a raw query into structured terms.
   * @return {Object} { phrases, must, should, not, references, raw }
   */
  function parseQuery(raw) {
    raw = String(raw || '').trim();
    var phrases = [];
    var working = raw.replace(/"([^"]+)"/g, function (_, p) {
      phrases.push(p.trim().toLowerCase());
      return ' ';
    });

    var references = Util.extractReferences(raw);

    var tokens = working.split(/\s+/).filter(Boolean);
    var must = [], should = [], not = [];
    var mode = 'should';
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var upper = tok.toUpperCase();
      if (upper === 'AND') { mode = 'must'; continue; }
      if (upper === 'OR') { mode = 'should'; continue; }
      if (upper === 'NOT' || tok === '-') { mode = 'not'; continue; }
      if (tok.charAt(0) === '-' && tok.length > 1) { not.push(clean(tok.substring(1))); continue; }

      var c = clean(tok);
      if (!c) { continue; }
      if (mode === 'must') { must.push(c); }
      else if (mode === 'not') { not.push(c); mode = 'should'; }
      else { should.push(c); }
      if (mode === 'must') { mode = 'should'; }
    }

    // Expand abbreviations both directions to broaden recall.
    var expanded = [];
    should.concat(must).forEach(function (t) {
      var up = t.toUpperCase();
      if (CONFIG.ABBREVIATIONS[up]) {
        CONFIG.ABBREVIATIONS[up].split(' ').forEach(function (w) {
          if (!STOPWORDS[w]) { expanded.push(clean(w)); }
        });
      }
    });

    // Natural-language: strip stopwords from "should" terms.
    should = should.filter(function (t) { return !STOPWORDS[t] && t.length >= 2; });
    should = should.concat(expanded);

    return {
      raw: raw,
      phrases: phrases,
      must: dedupe(must),
      should: dedupe(should),
      not: dedupe(not),
      references: references
    };
  }

  function clean(t) { return Util.normalize(t).replace(/[^a-z0-9.]/g, ''); }
  function dedupe(a) { var s = {}; return a.filter(function (x) { return x && !s[x] && (s[x] = 1); }); }

  /**
   * Execute a search.
   * @param {Object} params { query, filters, sort, page }
   * @return {Object} { total, page, pageSize, results, parsed, took }
   */
  function search(params) {
    params = params || {};
    var start = Date.now();
    var parsed = parseQuery(params.query);
    var filters = params.filters || {};
    var page = Math.max(1, params.page || 1);
    var pageSize = params.pageSize || CONFIG.SEARCH_PAGE_SIZE;

    if (!parsed.raw) {
      return { total: 0, page: 1, pageSize: pageSize, results: [], parsed: parsed, took: 0, message: 'Enter a search term.' };
    }

    var docs = indexDocuments();
    var index = DB.readAll('Search_Index');

    var scored = [];
    for (var i = 0; i < index.length; i++) {
      var row = index[i];
      var doc = docs[row.Document_ID];
      if (!doc) { continue; }
      if (!passesFilters(row, doc, filters)) { continue; }

      var score = scoreRow(row, parsed);
      if (score <= 0) { continue; }

      scored.push({ row: row, doc: doc, score: score });
      if (scored.length > CONFIG.SEARCH_MAX_RESULTS * 3) { /* keep scanning but cap memory later */ }
    }

    // Sort
    var sort = params.sort || 'relevance';
    scored.sort(function (a, b) { return comparator(sort)(a, b); });

    var total = scored.length;
    var slice = scored.slice((page - 1) * pageSize, page * pageSize);
    var results = slice.map(function (s) { return buildResult(s, parsed); });

    recordHistory(parsed.raw, total);

    return {
      total: total,
      page: page,
      pageSize: pageSize,
      results: results,
      parsed: { phrases: parsed.phrases, must: parsed.must, should: parsed.should, not: parsed.not, references: parsed.references },
      sort: sort,
      took: Date.now() - start
    };
  }

  function comparator(sort) {
    if (sort === 'document') {
      return function (a, b) { return String(a.doc.Document_Title).localeCompare(String(b.doc.Document_Title)) || b.score - a.score; };
    }
    if (sort === 'page') {
      return function (a, b) { return (num(a.row.Page_Number) - num(b.row.Page_Number)) || b.score - a.score; };
    }
    if (sort === 'section') {
      return function (a, b) { return sectionKey(a.row).localeCompare(sectionKey(b.row)) || b.score - a.score; };
    }
    return function (a, b) { return b.score - a.score; };
  }

  function sectionKey(row) {
    var meta = parseMeta(row);
    return String(meta.para || row.Heading || '');
  }

  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 999999 : n; }

  /** Score one index row against the parsed query. */
  function scoreRow(row, parsed) {
    var text = String(row.Normalized_Text || '');
    var heading = Util.normalize(row.Heading || '');
    var meta = parseMeta(row);
    var score = 0;

    // NOT terms exclude the row entirely.
    for (var n = 0; n < parsed.not.length; n++) {
      if (text.indexOf(parsed.not[n]) !== -1) { return 0; }
    }

    // Paragraph / section-number exact match ranks highest.
    if (parsed.references.length) {
      for (var r = 0; r < parsed.references.length; r++) {
        var ref = parsed.references[r];
        if (meta.para && meta.para === ref) { score += 1000; }
        else if (meta.para && meta.para.indexOf(ref + '.') === 0) { score += 400; }
        else if (text.indexOf(ref) !== -1) { score += 60; }
      }
    }

    // Exact phrase matches.
    parsed.phrases.forEach(function (p) {
      if (!p) { return; }
      if (text.indexOf(p) !== -1) { score += 300; }
      if (heading.indexOf(p) !== -1) { score += 200; }
    });

    // MUST terms: all required; absence kills the row (unless a strong ref/phrase hit).
    var mustHits = 0;
    parsed.must.forEach(function (t) {
      if (termHit(text, heading, t) > 0) { mustHits++; score += termHit(text, heading, t); }
    });
    if (parsed.must.length && mustHits < parsed.must.length && score < 400) { return 0; }

    // SHOULD terms: additive, heading weighted.
    parsed.should.forEach(function (t) {
      score += termHit(text, heading, t);
    });

    // A result with only phrase/ref requirements and no term hits still counts.
    return score;
  }

  /** Term scoring with heading boost and partial-term matching. */
  function termHit(text, heading, term) {
    if (!term || term.length < 2) { return 0; }
    var s = 0;
    // whole-word boundary match
    var wb = new RegExp('\\b' + Util.escapeRegex(term) + '\\b');
    if (heading.search(wb) !== -1) { s += 40; }
    if (text.search(wb) !== -1) {
      s += 20;
      // frequency bonus (capped)
      var count = (text.match(new RegExp('\\b' + Util.escapeRegex(term) + '\\b', 'g')) || []).length;
      s += Math.min(count - 1, 6) * 3;
    } else if (term.length >= 4 && text.indexOf(term) !== -1) {
      s += 8; // partial / substring match for technical terms
    }
    return s;
  }

  function passesFilters(row, doc, f) {
    if (f.documentId && row.Document_ID !== f.documentId) { return false; }
    if (f.number && String(doc.ICAO_Document_Number) !== String(f.number)) { return false; }
    if (f.volumePart) {
      var vp = (doc.Volume || '') + (doc.Part || '');
      if (vp.indexOf(f.volumePart) === -1 && doc.Volume !== f.volumePart && doc.Part !== f.volumePart) { return false; }
    }
    if (f.edition && String(doc.Edition) !== String(f.edition)) { return false; }
    if (f.subject && String(row.Subject_Category) !== String(f.subject)) { return false; }
    if (f.provisionType) {
      var meta = parseMeta(row);
      if (String(meta.type) !== String(f.provisionType)) { return false; }
    }
    if (f.chapter) {
      var sec = DB.findById('Sections', 'Section_ID', row.Section_ID);
      if (!sec || String(sec.Chapter).indexOf(f.chapter) === -1) { return false; }
    }
    if (f.pageFrom && num(row.Page_Number) < num(f.pageFrom)) { return false; }
    if (f.pageTo && num(row.Page_Number) > num(f.pageTo)) { return false; }
    if (f.statusCurrentOnly && doc.Status !== CONFIG.DOC_STATUS.CURRENT) { return false; }
    return true;
  }

  function buildResult(s, parsed) {
    var row = s.row, doc = s.doc;
    var sec = DB.findById('Sections', 'Section_ID', row.Section_ID) || {};
    var terms = parsed.phrases.concat(parsed.must, parsed.should).filter(Boolean);
    var sourceText = sec.Extracted_Text || row.Normalized_Text || '';
    return {
      indexId: row.Index_ID,
      sectionId: row.Section_ID,
      documentId: row.Document_ID,
      documentTitle: doc.Document_Title,
      documentNumber: doc.ICAO_Document_Number,
      volume: doc.Volume,
      part: doc.Part,
      edition: doc.Edition,
      amendment: doc.Amendment,
      status: doc.Status,
      chapter: sec.Chapter || '',
      sectionNumber: sec.Section_Number || '',
      paragraph: sec.Paragraph_Number || (parseMeta(row).para || ''),
      heading: row.Heading || sec.Heading || '',
      provisionType: sec.Provision_Type || parseMeta(row).type || 'Unclassified',
      subject: row.Subject_Category || '',
      page: row.Page_Number || '',
      printedPage: row.Printed_Page_Number || '',
      ocr: sec.OCR_Status || '',
      quality: sec.Extraction_Quality || '',
      snippet: Util.buildSnippet(sourceText, terms),
      score: Math.round(s.score)
    };
  }

  function parseMeta(row) {
    try { return JSON.parse(row.Search_Metadata || '{}'); } catch (e) { return {}; }
  }

  /** Map of documentId -> document record (indexed docs only). */
  function indexDocuments() {
    var map = {};
    DB.readAll('Documents').forEach(function (d) {
      map[d.Document_ID] = d;
    });
    return map;
  }

  // ---- autocomplete / suggestions ------------------------------------------

  /** Lightweight suggestions from indexed headings and the abbreviation list. */
  function suggest(prefix) {
    prefix = Util.normalize(prefix);
    if (prefix.length < 2) { return []; }
    var out = [], seen = {};

    Object.keys(CONFIG.ABBREVIATIONS).forEach(function (abbr) {
      if (abbr.toLowerCase().indexOf(prefix) === 0) {
        push(abbr + ' — ' + CONFIG.ABBREVIATIONS[abbr]);
      }
    });
    CONFIG.QUICK_ACCESS.forEach(function (q) {
      if (Util.normalize(q).indexOf(prefix) !== -1) { push(q); }
    });

    var sections = DB.readAll('Sections');
    for (var i = 0; i < sections.length && out.length < 10; i++) {
      var h = String(sections[i].Heading || '');
      if (h.length > 4 && Util.normalize(h).indexOf(prefix) !== -1) { push(h); }
    }

    function push(v) {
      var k = v.toLowerCase();
      if (!seen[k] && out.length < 12) { seen[k] = 1; out.push(v); }
    }
    return out;
  }

  // ---- search history (per user) -------------------------------------------

  function recordHistory(query, total) {
    try {
      var user = Auth.currentUser();
      if (!user.User_ID) { return; }
      var key = 'HIST_' + user.User_ID;
      var cache = CacheService.getUserCache();
      var raw = cache.get(key);
      var list = raw ? JSON.parse(raw) : [];
      list = list.filter(function (h) { return h.q !== query; });
      list.unshift({ q: query, n: total, t: Date.now() });
      list = list.slice(0, 15);
      cache.put(key, JSON.stringify(list), 21600);
    } catch (e) {}
  }

  function history() {
    try {
      var user = Auth.currentUser();
      var raw = CacheService.getUserCache().get('HIST_' + user.User_ID);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function clearHistory() {
    try {
      var user = Auth.currentUser();
      CacheService.getUserCache().remove('HIST_' + user.User_ID);
    } catch (e) {}
    return true;
  }

  return {
    parseQuery: parseQuery,
    search: search,
    suggest: suggest,
    history: history,
    clearHistory: clearHistory
  };
})();
