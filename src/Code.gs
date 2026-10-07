/**
 * Code.gs
 * -----------------------------------------------------------------------------
 * Application entry point, HTML routing, the google.script.run API dispatcher
 * and global trigger handlers.
 *
 * The frontend talks to the backend through a SINGLE dispatcher, api(action,
 * payload), which routes to a whitelisted handler. This centralises error
 * handling, keeps the client simple, and ensures every privileged handler
 * performs its own server-side permission check.
 * -----------------------------------------------------------------------------
 */

/** Web app entry point. Serves the single-page application shell. */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.bootstrap = JSON.stringify(getBootstrap());
  return template.evaluate()
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Server-side include helper for composing HTML partials. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Initial data handed to the client at load (avoids an extra round-trip). */
function getBootstrap() {
  var configured = !!PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SPREADSHEET_ID);
  if (!configured) {
    return { configured: false, appName: CONFIG.APP_NAME, disclaimer: CONFIG.DISCLAIMER };
  }
  try {
    var user = Auth.currentUser();
    return {
      configured: true,
      appName: CONFIG.APP_NAME,
      appShortName: CONFIG.APP_SHORT_NAME,
      version: CONFIG.APP_VERSION,
      user: { displayName: user.Display_Name, email: user.Email, role: user.Role },
      isAdmin: Auth.isAdmin(),
      isEditor: Auth.hasRole(CONFIG.ROLES.EDITOR),
      quickAccess: CONFIG.QUICK_ACCESS,
      provisionTypes: CONFIG.PROVISION_TYPES,
      complianceStatuses: CONFIG.COMPLIANCE_STATUS,
      collections: BookmarkService.DEFAULT_COLLECTIONS,
      disclaimer: CONFIG.DISCLAIMER
    };
  } catch (err) {
    return { configured: true, error: err.message, appName: CONFIG.APP_NAME, disclaimer: CONFIG.DISCLAIMER };
  }
}

/**
 * Central API dispatcher. The client calls google.script.run.api(action, payload).
 * Returns a plain object { ok, data } or { ok:false, error }.
 */
function api(action, payload) {
  payload = payload || {};
  try {
    var handler = API_ROUTES[action];
    if (!handler) { throw new Error('Unknown action: ' + action); }
    var data = handler(payload);
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/** Whitelisted API routes. Each handler validates permissions internally. */
var API_ROUTES = {
  // dashboard / meta
  'dashboard.stats': function () { return StatsService.dashboard(); },
  'dashboard.recent': function () { return Activity.recent(); },
  'dashboard.frequent': function () { return Activity.frequent(); },
  'meta.bootstrap': function () { return getBootstrap(); },

  // search
  'search.run': function (p) { return SearchService.search(p); },
  'search.suggest': function (p) { return SearchService.suggest(p.prefix); },
  'search.history': function () { return SearchService.history(); },
  'search.clearHistory': function () { return SearchService.clearHistory(); },

  // documents / viewer
  'docs.list': function (p) { return DocumentService.list(p); },
  'docs.get': function (p) { return DocumentService.get(p.documentId); },
  'docs.sections': function (p) { return DocumentService.sections(p.documentId); },
  'docs.section': function (p) { return DocumentService.section(p.sectionId); },
  'docs.previewUrl': function (p) { return { url: DriveService.previewUrl(p.fileId), open: DriveService.openUrl(p.fileId) }; },

  // knowledge library
  'knowledge.tree': function () { return KnowledgeService.tree(); },
  'knowledge.subject': function (p) { return KnowledgeService.subject(p.name); },

  // ask
  'ask.query': function (p) { return AskService.ask(p.question); },

  // cross references
  'xref.section': function (p) { return CrossReferenceService.forSection(p.sectionId); },
  'xref.addVerified': function (p) { return CrossReferenceService.addVerified(p.sourceSectionId, p.targetSectionId, p.label); },

  // glossary
  'glossary.search': function (p) { return GlossaryService.search(p.query); },

  // bookmarks / collections
  'bookmarks.add': function (p) { return BookmarkService.add(p); },
  'bookmarks.remove': function (p) { return BookmarkService.remove(p.bookmarkId); },
  'bookmarks.list': function () { return BookmarkService.listMine(); },
  'bookmarks.collections': function () { return BookmarkService.collections(); },
  'bookmarks.isSet': function (p) { return { bookmarked: BookmarkService.isBookmarked(p.sectionId) }; },

  // notes
  'notes.save': function (p) { return NotesService.save(p); },
  'notes.remove': function (p) { return NotesService.remove(p.noteId); },
  'notes.list': function (p) { return NotesService.listMine(p.sectionId); },

  // compliance
  'compliance.list': function (p) { return ComplianceService.list(p.filters); },
  'compliance.summary': function () { return ComplianceService.summary(); },
  'compliance.addFromSection': function (p) { return ComplianceService.addFromSection(p.sectionId, p.fields); },
  'compliance.addManual': function (p) { return ComplianceService.addManual(p.fields); },
  'compliance.update': function (p) { return ComplianceService.update(p.referenceId, p.fields); },
  'compliance.remove': function (p) { return ComplianceService.remove(p.referenceId); },

  // versions
  'version.sets': function () { return VersionService.versionSets(); },
  'version.compare': function (p) { return VersionService.compare(p.docIdA, p.docIdB); },
  'version.supersede': function (p) { return VersionService.supersede(p.oldDocId, p.newDocId); },

  // exports
  'export.bookmarksCsv': function () { return { csv: ExportService.bookmarksCsv(), filename: 'bookmarks.csv' }; },
  'export.complianceCsv': function (p) { return { csv: ExportService.complianceCsv(p.filters), filename: 'compliance_register.csv' }; },
  'export.sectionsCsv': function (p) { return { csv: ExportService.sectionsCsv(p.sectionIds), filename: 'references.csv' }; },
  'export.printable': function (p) { return { html: ExportService.printableSection(p.sectionId) }; },

  // admin: documents
  'admin.register': function (p) { return DocumentService.register(p); },
  'admin.updateMeta': function (p) { return DocumentService.updateMeta(p.documentId, p.fields); },
  'admin.linkFile': function (p) { return DocumentService.linkFile(p.documentId, p.driveFileId); },
  'admin.setStatus': function (p) { return DocumentService.setStatus(p.documentId, p.status); },
  'admin.removeDocument': function (p) { return DocumentService.removeDocument(p.documentId); },
  'admin.listDrivePdfs': function () { return DriveService.listLibraryPdfs(); },
  'admin.autoLink': function () { return AdminService.autoLinkFiles(); },

  // admin: indexing
  'admin.startIndex': function (p) { return IndexingService.startIndexing(p.documentId); },
  'admin.runBatch': function (p) { return IndexingService.runBatch(p.documentId); },
  'admin.retryIndex': function (p) { return IndexingService.retry(p.documentId); },
  'admin.indexProgress': function (p) { return IndexingService.getProgress(p.documentId); },
  'admin.indexLogs': function (p) { return IndexingService.logs(p.documentId, p.limit); },
  'admin.installTrigger': function () { return AdminService.installIndexTrigger(); },
  'admin.removeTrigger': function () { return AdminService.removeIndexTrigger(); },

  // admin: users / system
  'admin.users': function () { return AdminService.listUsers(); },
  'admin.addUser': function (p) { return AdminService.addUser(p.email, p.role); },
  'admin.setRole': function (p) { return AdminService.setUserRole(p.userId, p.role); },
  'admin.setUserStatus': function (p) { return AdminService.setUserStatus(p.userId, p.status); },
  'admin.status': function () { return AdminService.status(); },
  'admin.setUsageTracking': function (p) { return AdminService.setUsageTracking(p.on); },
  'admin.audit': function (p) { return AuditService.recent(p.limit); }
};

/**
 * Time-driven trigger: advance indexing for any document still processing.
 * Installed via AdminService.installIndexTrigger(). Processes one batch per
 * document per tick to respect execution-time limits.
 */
function indexingTick() {
  var docs = DB.readAll('Documents', false).filter(function (d) {
    return d.Indexing_Status === CONFIG.INDEX_STATUS.PROCESSING;
  });
  docs.forEach(function (d) {
    try {
      if (IndexingService.getProgress(d.Document_ID)) {
        IndexingService.runBatch(d.Document_ID);
      }
    } catch (e) {
      console.error('indexingTick error for ' + d.Document_ID + ': ' + e.message);
    }
  });
}

/**
 * First-run setup. Run this ONCE from the Apps Script editor after setting the
 * library folder id below (or pass it in). Creates the database spreadsheet,
 * builds the schema, seeds the catalogue and records you as an administrator.
 *
 * Example:
 *   setup({ libraryFolderId: '1i-4baTTlAZRlOKCoavnZ7NImJ6ELa50F' })
 */
function setup(opts) {
  return AdminService.setup(opts || {});
}

/** Convenience: run setup pointing at the provided ICAO library folder. */
function setupWithLibraryFolder() {
  return AdminService.setup({ libraryFolderId: 'REPLACE_WITH_DRIVE_FOLDER_ID' });
}
