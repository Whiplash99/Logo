/**
 * SubjectClassifier.gs
 * -----------------------------------------------------------------------------
 * Assigns a subject category to indexed text using the keyword seeds defined in
 * CONFIG.KNOWLEDGE_SUBJECTS. Used to power the Technical Knowledge Library and
 * the quick-access categories. Pure keyword matching — never asserts coverage
 * beyond what the indexed text contains.
 * -----------------------------------------------------------------------------
 */

var SubjectClassifier = (function () {

  var _flat = null;

  function flat() {
    if (_flat) { return _flat; }
    _flat = [];
    CONFIG.KNOWLEDGE_SUBJECTS.forEach(function (group) {
      group.subjects.forEach(function (sub) {
        _flat.push({
          group: group.group,
          name: sub.name,
          keywords: sub.keywords.map(function (k) { return k.toLowerCase(); })
        });
      });
    });
    return _flat;
  }

  /** Return the single best-matching subject name for a block of text. */
  function classify(text) {
    var best = scoreAll(text);
    return best.length ? best[0].name : '';
  }

  /** Return all subjects with a non-zero score, descending. */
  function scoreAll(text) {
    var norm = ' ' + Util.normalize(text) + ' ';
    var scored = [];
    flat().forEach(function (sub) {
      var score = 0;
      sub.keywords.forEach(function (kw) {
        if (norm.indexOf(' ' + kw + ' ') !== -1 || norm.indexOf(kw) !== -1) {
          score += kw.split(' ').length; // multi-word matches weigh more
        }
      });
      if (score > 0) { scored.push({ group: sub.group, name: sub.name, score: score }); }
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }

  function subjectByName(name) {
    var all = flat();
    for (var i = 0; i < all.length; i++) {
      if (all[i].name === name) { return all[i]; }
    }
    return null;
  }

  return { classify: classify, scoreAll: scoreAll, flat: flat, subjectByName: subjectByName };
})();
