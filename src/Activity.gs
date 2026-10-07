/**
 * Activity.gs
 * -----------------------------------------------------------------------------
 * Per-user "recently viewed" history (documents, sections) and optional,
 * administrator-toggled frequency tracking for the dashboard. Stored in the
 * user cache; non-sensitive and private to the user.
 * -----------------------------------------------------------------------------
 */

var Activity = (function () {

  function key() {
    var u = Auth.currentUser();
    return 'RECENT_' + (u.User_ID || 'anon');
  }

  function record(kind, id, label) {
    try {
      var cache = CacheService.getUserCache();
      var raw = cache.get(key());
      var list = raw ? JSON.parse(raw) : [];
      list = list.filter(function (r) { return !(r.kind === kind && r.id === id); });
      list.unshift({ kind: kind, id: id, label: Util.truncate(label || '', 120), t: Date.now() });
      list = list.slice(0, 20);
      cache.put(key(), JSON.stringify(list), 86400);

      if (usageTrackingOn()) { bumpFrequency(kind, id, label); }
    } catch (e) {}
  }

  function recent() {
    try {
      var raw = CacheService.getUserCache().get(key());
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function usageTrackingOn() {
    return PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_USAGE_TRACKING) === 'on';
  }

  function bumpFrequency(kind, id, label) {
    try {
      var sc = CacheService.getScriptCache();
      var raw = sc.get('FREQ');
      var map = raw ? JSON.parse(raw) : {};
      var k = kind + ':' + id;
      map[k] = map[k] || { kind: kind, id: id, label: label, count: 0 };
      map[k].count++;
      sc.put('FREQ', JSON.stringify(map), 21600);
    } catch (e) {}
  }

  /** Frequently used references (if usage tracking enabled), else a static list. */
  function frequent() {
    if (usageTrackingOn()) {
      try {
        var raw = CacheService.getScriptCache().get('FREQ');
        var map = raw ? JSON.parse(raw) : {};
        return Object.keys(map).map(function (k) { return map[k]; })
          .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
      } catch (e) { return []; }
    }
    // Static fallback: configurable via Script Property FREQUENT_STATIC (JSON).
    try {
      var s = PropertiesService.getScriptProperties().getProperty('FREQUENT_STATIC');
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }

  return { record: record, recent: recent, frequent: frequent, usageTrackingOn: usageTrackingOn };
})();
