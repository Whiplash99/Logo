/**
 * AdminService.gs
 * -----------------------------------------------------------------------------
 * First-run setup, user management, system status, statistics, usage-tracking
 * toggle and the time-driven indexing trigger. All operations are admin-gated
 * on the server.
 * -----------------------------------------------------------------------------
 */

var AdminService = (function () {

  /**
   * One-time setup, run from the Apps Script editor by the deploying admin.
   * Creates the spreadsheet (if needed), builds the schema, seeds the document
   * catalogue and records the admin as a bootstrap administrator.
   *
   * @param {Object} opts { spreadsheetId?, libraryFolderId, adminEmails? }
   */
  function setup(opts) {
    opts = opts || {};
    var props = PropertiesService.getScriptProperties();

    // 1. Spreadsheet
    var ssId = opts.spreadsheetId || props.getProperty(CONFIG.PROP_SPREADSHEET_ID);
    var ss;
    if (ssId) {
      ss = SpreadsheetApp.openById(ssId);
    } else {
      ss = SpreadsheetApp.create(CONFIG.APP_NAME + ' — Database');
      ssId = ss.getId();
    }
    props.setProperty(CONFIG.PROP_SPREADSHEET_ID, ssId);

    // 2. Schema
    DB.ensureSchema(ss);

    // 3. Library folder
    if (opts.libraryFolderId) {
      props.setProperty(CONFIG.PROP_LIBRARY_FOLDER_ID, opts.libraryFolderId);
    }

    // 4. Bootstrap admins
    var admins = opts.adminEmails || [Session.getEffectiveUser().getEmail()];
    props.setProperty(CONFIG.PROP_BOOTSTRAP_ADMINS, admins.join(','));

    // 5. Seed document catalogue (only if empty)
    seedCatalogue();

    return {
      spreadsheetId: ssId,
      spreadsheetUrl: ss.getUrl(),
      libraryFolderId: props.getProperty(CONFIG.PROP_LIBRARY_FOLDER_ID) || '',
      admins: admins
    };
  }

  /** Register the seed documents if the catalogue is empty. */
  function seedCatalogue() {
    if (DB.readAll('Documents', false).length) { return 0; }
    var count = 0;
    CONFIG.SEED_DOCUMENTS.forEach(function (d) {
      DB.insert('Documents', {
        Document_ID: Util.newId('DOC'),
        Document_Title: d.title,
        ICAO_Document_Number: d.number,
        Volume: d.volume,
        Part: d.part,
        Edition: d.edition,
        Amendment: d.amendment,
        Publication_Date: '',
        Document_Category: d.category,
        Drive_File_ID: '',
        Drive_File_URL: '',
        Status: CONFIG.DOC_STATUS.CURRENT,
        Total_Pages: 0,
        Indexed_Pages: 0,
        Indexing_Status: CONFIG.INDEX_STATUS.PENDING,
        Description: 'Catalogue entry. Link the Drive PDF and run indexing to make the content searchable.',
        Upload_Date: Util.isoNow(),
        Last_Updated: Util.isoNow()
      });
      count++;
    });
    return count;
  }

  /**
   * Try to auto-match seed catalogue entries to PDFs in the library folder by
   * filename hint, linking the Drive file id where a unique match is found.
   */
  function autoLinkFiles() {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var pdfs = DriveService.listLibraryPdfs();
    var docs = DB.readAll('Documents');
    var linked = [];
    docs.forEach(function (d) {
      if (d.Drive_File_ID) { return; }
      var hint = findHint(d);
      if (!hint) { return; }
      var match = pdfs.filter(function (p) {
        return p.name.toLowerCase().indexOf(hint.toLowerCase()) !== -1;
      });
      if (match.length === 1) {
        DB.updateById('Documents', 'Document_ID', d.Document_ID, {
          Drive_File_ID: match[0].id,
          Drive_File_URL: match[0].url,
          Last_Updated: Util.isoNow()
        });
        linked.push({ title: d.Document_Title, file: match[0].name });
      }
    });
    AuditService.log('Auto-link files', linked.length + ' linked', 'OK');
    return linked;
  }

  function findHint(doc) {
    for (var i = 0; i < CONFIG.SEED_DOCUMENTS.length; i++) {
      var s = CONFIG.SEED_DOCUMENTS[i];
      if (s.title === doc.Document_Title) { return s.fileHint; }
    }
    // Fall back to the document number + part.
    return (doc.ICAO_Document_Number + ' ' + (doc.Part || doc.Volume || '')).trim();
  }

  // ---- user management -----------------------------------------------------

  function listUsers() {
    Auth.requireAdmin();
    return DB.readAll('Users').map(function (u) {
      return {
        userId: u.User_ID, email: u.Email, displayName: u.Display_Name,
        role: u.Role, status: u.Access_Status, dateAdded: Util.formatDate(u.Date_Added)
      };
    });
  }

  function addUser(email, role) {
    Auth.requireAdmin();
    email = String(email || '').trim().toLowerCase();
    if (!email) { throw new Error('Email required.'); }
    if (CONFIG.ROLE_ORDER.indexOf(role) === -1) { role = CONFIG.ROLES.VIEWER; }
    var existing = DB.findOne('Users', function (u) { return String(u.Email).toLowerCase() === email; });
    if (existing) {
      DB.updateById('Users', 'User_ID', existing.User_ID, { Role: role, Access_Status: 'Active' });
    } else {
      DB.insert('Users', {
        User_ID: Util.newId('USR'), Email: email, Display_Name: email.split('@')[0],
        Role: role, Access_Status: 'Active', Date_Added: Util.isoNow()
      });
    }
    AuditService.log('Add/Update user', email + ' = ' + role, 'OK');
    return listUsers();
  }

  function setUserRole(userId, role) {
    Auth.requireAdmin();
    if (CONFIG.ROLE_ORDER.indexOf(role) === -1) { throw new Error('Invalid role.'); }
    DB.updateById('Users', 'User_ID', userId, { Role: role });
    AuditService.log('Set user role', userId + ' = ' + role, 'OK');
    return listUsers();
  }

  function setUserStatus(userId, status) {
    Auth.requireAdmin();
    DB.updateById('Users', 'User_ID', userId, { Access_Status: status });
    AuditService.log('Set user status', userId + ' = ' + status, 'OK');
    return listUsers();
  }

  // ---- system status / stats ----------------------------------------------

  function status() {
    Auth.requireAdmin();
    var props = PropertiesService.getScriptProperties();
    return {
      app: CONFIG.APP_NAME,
      version: CONFIG.APP_VERSION,
      spreadsheetId: props.getProperty(CONFIG.PROP_SPREADSHEET_ID) || '',
      libraryFolderId: props.getProperty(CONFIG.PROP_LIBRARY_FOLDER_ID) || '',
      usageTracking: Activity.usageTrackingOn(),
      indexingTrigger: hasIndexTrigger(),
      sheets: DB.sheetNames()
    };
  }

  function setUsageTracking(on) {
    Auth.requireAdmin();
    PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_USAGE_TRACKING, on ? 'on' : 'off');
    return Activity.usageTrackingOn();
  }

  // ---- indexing time-trigger -----------------------------------------------

  function hasIndexTrigger() {
    return ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'indexingTick';
    });
  }

  function installIndexTrigger() {
    Auth.requireAdmin();
    if (hasIndexTrigger()) { return true; }
    ScriptApp.newTrigger('indexingTick').timeBased().everyMinutes(5).create();
    AuditService.log('Install indexing trigger', 'every 5 min', 'OK');
    return true;
  }

  function removeIndexTrigger() {
    Auth.requireAdmin();
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'indexingTick') { ScriptApp.deleteTrigger(t); }
    });
    return true;
  }

  return {
    setup: setup,
    seedCatalogue: seedCatalogue,
    autoLinkFiles: autoLinkFiles,
    listUsers: listUsers,
    addUser: addUser,
    setUserRole: setUserRole,
    setUserStatus: setUserStatus,
    status: status,
    setUsageTracking: setUsageTracking,
    installIndexTrigger: installIndexTrigger,
    removeIndexTrigger: removeIndexTrigger,
    hasIndexTrigger: hasIndexTrigger
  };
})();
