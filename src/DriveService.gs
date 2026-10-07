/**
 * DriveService.gs
 * -----------------------------------------------------------------------------
 * Google Drive integration: resolve the configured library folder, list PDF
 * files available for registration, fetch file metadata and produce preview /
 * download URLs for the viewer.
 * -----------------------------------------------------------------------------
 */

var DriveService = (function () {

  function libraryFolder() {
    var id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_LIBRARY_FOLDER_ID);
    if (!id) {
      throw new Error('No library folder configured. Set the Drive folder id during setup.');
    }
    return DriveApp.getFolderById(id);
  }

  /** List PDF files in the library folder (shallow). */
  function listLibraryPdfs() {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var folder = libraryFolder();
    var it = folder.getFilesByType(MimeType.PDF);
    var out = [];
    while (it.hasNext()) {
      var f = it.next();
      out.push({
        id: f.getId(),
        name: f.getName(),
        size: f.getSize(),
        url: f.getUrl(),
        lastUpdated: f.getLastUpdated().toISOString()
      });
    }
    out.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return out;
  }

  function getFileInfo(fileId) {
    var f = DriveApp.getFileById(fileId);
    return {
      id: f.getId(),
      name: f.getName(),
      size: f.getSize(),
      mimeType: f.getMimeType(),
      url: f.getUrl(),
      lastUpdated: f.getLastUpdated().toISOString()
    };
  }

  function getFileById(fileId) {
    return DriveApp.getFileById(fileId);
  }

  /** Embedded preview URL (works where Drive permissions allow embedding). */
  function previewUrl(fileId) {
    return 'https://drive.google.com/file/d/' + fileId + '/preview';
  }

  function openUrl(fileId) {
    return 'https://drive.google.com/file/d/' + fileId + '/view';
  }

  return {
    libraryFolder: libraryFolder,
    listLibraryPdfs: listLibraryPdfs,
    getFileInfo: getFileInfo,
    getFileById: getFileById,
    previewUrl: previewUrl,
    openUrl: openUrl
  };
})();
