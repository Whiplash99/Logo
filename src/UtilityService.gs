/**
 * UtilityService.gs
 * -----------------------------------------------------------------------------
 * Shared, side-effect-free helpers: id generation, text normalisation, HTML
 * escaping, tokenisation, chunking and small formatting utilities.
 * -----------------------------------------------------------------------------
 */

var Util = (function () {

  /** Generate a short, sortable, unique id with a type prefix. */
  function newId(prefix) {
    var ts = Date.now().toString(36);
    var rand = Utilities.getUuid().replace(/-/g, '').substring(0, 6);
    return (prefix || 'ID') + '-' + ts + '-' + rand;
  }

  function now() {
    return new Date();
  }

  function isoNow() {
    return new Date().toISOString();
  }

  /** Normalise free text for indexing / matching: lowercase, collapse space. */
  function normalize(text) {
    if (text === null || text === undefined) { return ''; }
    return String(text)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Split normalised text into distinct search tokens (length >= 2). */
  function tokenize(text) {
    var norm = normalize(text);
    var raw = norm.split(/[^a-z0-9.]+/);
    var seen = {};
    var out = [];
    raw.forEach(function (t) {
      t = t.replace(/^\.+|\.+$/g, '');
      if (t.length >= 2 && !seen[t]) { seen[t] = true; out.push(t); }
    });
    return out;
  }

  /** Escape text for safe insertion into HTML. */
  function escapeHtml(text) {
    if (text === null || text === undefined) { return ''; }
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Detect whether a string looks like a paragraph / section reference. */
  function isReferenceQuery(query) {
    return /\b\d+\.\d+(\.\d+)*\b/.test(String(query || ''));
  }

  /** Extract paragraph-number tokens like 3.4.1 from a query. */
  function extractReferences(query) {
    var matches = String(query || '').match(/\b\d+\.\d+(?:\.\d+)*\b/g);
    return matches || [];
  }

  /**
   * Split extracted page/section text into appropriately sized, word-boundary
   * aligned chunks for indexing.
   */
  function chunkText(text, target, max) {
    target = target || CONFIG.CHUNK_TARGET_CHARS;
    max = max || CONFIG.CHUNK_MAX_CHARS;
    var clean = String(text || '').replace(/\r/g, '').trim();
    if (!clean) { return []; }
    if (clean.length <= max) { return [clean]; }

    var chunks = [];
    var paragraphs = clean.split(/\n{2,}/);
    var buffer = '';
    paragraphs.forEach(function (p) {
      p = p.trim();
      if (!p) { return; }
      if ((buffer + '\n\n' + p).length > target && buffer) {
        chunks.push(buffer.trim());
        buffer = p;
      } else {
        buffer = buffer ? buffer + '\n\n' + p : p;
      }
      // Hard split very long paragraphs.
      while (buffer.length > max) {
        var cut = buffer.lastIndexOf(' ', max);
        if (cut < max * 0.5) { cut = max; }
        chunks.push(buffer.substring(0, cut).trim());
        buffer = buffer.substring(cut).trim();
      }
    });
    if (buffer.trim()) { chunks.push(buffer.trim()); }
    return chunks;
  }

  /**
   * Build a highlighted snippet around the first matching term.
   * Returns plain text with <mark> tags around matched terms. Terms are
   * assumed already escaped by the caller context; we escape the text here.
   */
  function buildSnippet(text, terms, maxChars) {
    maxChars = maxChars || CONFIG.SEARCH_SNIPPET_CHARS;
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) { return ''; }
    var lower = clean.toLowerCase();
    var pos = -1;
    for (var i = 0; i < terms.length; i++) {
      var t = String(terms[i]).toLowerCase();
      if (!t) { continue; }
      var p = lower.indexOf(t);
      if (p !== -1 && (pos === -1 || p < pos)) { pos = p; }
    }
    var start = 0;
    if (pos > 60) { start = pos - 60; }
    var slice = clean.substring(start, start + maxChars);
    if (start > 0) { slice = '… ' + slice; }
    if (start + maxChars < clean.length) { slice = slice + ' …'; }
    var escaped = escapeHtml(slice);
    terms.forEach(function (t) {
      t = String(t).trim();
      if (t.length < 2) { return; }
      var re = new RegExp('(' + escapeRegex(escapeHtml(t)) + ')', 'ig');
      escaped = escaped.replace(re, '<mark>$1</mark>');
    });
    return escaped;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function truncate(text, n) {
    text = String(text || '');
    return text.length > n ? text.substring(0, n - 1) + '…' : text;
  }

  function formatDate(d) {
    if (!d) { return ''; }
    try {
      var date = (d instanceof Date) ? d : new Date(d);
      return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } catch (e) { return String(d); }
  }

  return {
    newId: newId,
    now: now,
    isoNow: isoNow,
    normalize: normalize,
    tokenize: tokenize,
    escapeHtml: escapeHtml,
    isReferenceQuery: isReferenceQuery,
    extractReferences: extractReferences,
    chunkText: chunkText,
    buildSnippet: buildSnippet,
    escapeRegex: escapeRegex,
    truncate: truncate,
    formatDate: formatDate
  };
})();
