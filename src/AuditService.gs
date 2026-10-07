/**
 * AuditService.gs
 * -----------------------------------------------------------------------------
 * Append-only audit log for important administrative and data-changing actions.
 * Never records sensitive values (passwords, tokens) — only action metadata.
 * -----------------------------------------------------------------------------
 */

var AuditService = (function () {

  function log(action, affectedRecord, result) {
    try {
      var user = Auth.currentUser();
      DB.insert('Audit_Logs', {
        Log_ID: Util.newId('AUD'),
        User_ID: user.User_ID || '',
        Action: action,
        Affected_Record: affectedRecord || '',
        Timestamp: Util.isoNow(),
        Result: result || 'OK'
      });
    } catch (e) {
      // Auditing must never break the primary operation.
      console.error('Audit failure: ' + e.message);
    }
  }

  function recent(limit) {
    Auth.requireAdmin();
    var rows = DB.readAll('Audit_Logs');
    rows.sort(function (a, b) { return String(b.Timestamp).localeCompare(String(a.Timestamp)); });
    return rows.slice(0, limit || 100);
  }

  return { log: log, recent: recent };
})();
