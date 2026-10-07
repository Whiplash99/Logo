/**
 * StatsService.gs
 * -----------------------------------------------------------------------------
 * Library statistics for the dashboard. Only values that can be computed
 * accurately from indexed content are returned.
 * -----------------------------------------------------------------------------
 */

var StatsService = (function () {

  function dashboard() {
    var docs = DB.readAll('Documents');
    var sections = DB.readAll('Sections');
    var index = DB.readAll('Search_Index');
    var logs = DB.readAll('Indexing_Logs');

    var indexedPages = 0, totalBookmarks = 0, errors = 0, lastIndex = '';
    docs.forEach(function (d) { indexedPages += parseInt(d.Indexed_Pages, 10) || 0; });
    try { totalBookmarks = DB.readAll('Bookmarks').length; } catch (e) {}

    logs.forEach(function (l) {
      if (l.Processing_Status === CONFIG.INDEX_STATUS.FAILED) { errors++; }
      if (String(l.Processing_Date) > lastIndex) { lastIndex = String(l.Processing_Date); }
    });

    return {
      totalDocuments: docs.length,
      indexedDocuments: docs.filter(function (d) {
        return d.Indexing_Status === CONFIG.INDEX_STATUS.COMPLETE || d.Indexing_Status === CONFIG.INDEX_STATUS.PARTIAL;
      }).length,
      totalIndexedPages: indexedPages,
      totalSections: sections.length,
      totalSearchChunks: index.length,
      totalBookmarks: totalBookmarks,
      lastIndexDate: Util.formatDate(lastIndex),
      indexingErrors: errors
    };
  }

  return { dashboard: dashboard };
})();
