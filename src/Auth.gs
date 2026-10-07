/**
 * Auth.gs
 * -----------------------------------------------------------------------------
 * Authentication and server-side access control.
 *
 * The web app is deployed to execute as the accessing user (see appsscript.json
 * and the deployment guide), so Session.getActiveUser().getEmail() reliably
 * identifies the caller within a Google Workspace domain. Every privileged
 * operation calls requireRole() / requireAdmin() on the SERVER. Hiding a button
 * in the UI is never treated as a security control.
 * -----------------------------------------------------------------------------
 */

var Auth = (function () {

  function currentEmail() {
    var email = Session.getActiveUser().getEmail();
    if (!email) {
      email = Session.getEffectiveUser().getEmail();
    }
    return (email || '').toLowerCase();
  }

  function bootstrapAdmins() {
    var raw = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_BOOTSTRAP_ADMINS) || '';
    return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }

  /**
   * Return the user record for the caller, creating a Viewer record on first
   * access. Bootstrap admins (set in Script Properties during setup) are always
   * resolved as Administrators and self-heal their record.
   */
  function currentUser() {
    var email = currentEmail();
    if (!email) {
      return { User_ID: '', Email: '', Display_Name: 'Unknown', Role: CONFIG.ROLES.VIEWER, Access_Status: 'Active', anonymous: true };
    }
    var isBootstrap = bootstrapAdmins().indexOf(email) !== -1;
    var rec = DB.findOne('Users', function (u) { return String(u.Email).toLowerCase() === email; });

    if (!rec) {
      rec = {
        User_ID: Util.newId('USR'),
        Email: email,
        Display_Name: email.split('@')[0],
        Role: isBootstrap ? CONFIG.ROLES.ADMIN : CONFIG.ROLES.VIEWER,
        Access_Status: 'Active',
        Date_Added: Util.isoNow()
      };
      DB.insert('Users', rec);
    } else if (isBootstrap && rec.Role !== CONFIG.ROLES.ADMIN) {
      DB.updateById('Users', 'User_ID', rec.User_ID, { Role: CONFIG.ROLES.ADMIN });
      rec.Role = CONFIG.ROLES.ADMIN;
    }
    return rec;
  }

  function roleRank(role) {
    var i = CONFIG.ROLE_ORDER.indexOf(role);
    return i === -1 ? 0 : i;
  }

  function hasRole(role) {
    var user = currentUser();
    if (user.Access_Status && String(user.Access_Status).toLowerCase() === 'suspended') {
      return false;
    }
    return roleRank(user.Role) >= roleRank(role);
  }

  function isAdmin() { return hasRole(CONFIG.ROLES.ADMIN); }

  function requireRole(role) {
    if (!hasRole(role)) {
      throw new Error('Permission denied: this action requires the ' + role + ' role.');
    }
    return currentUser();
  }

  function requireAdmin() { return requireRole(CONFIG.ROLES.ADMIN); }

  /** Confirm the caller owns the given user id (for private notes/bookmarks). */
  function requireSelf(userId) {
    var user = currentUser();
    if (String(user.User_ID) !== String(userId) && !isAdmin()) {
      throw new Error('Permission denied: you may only access your own records.');
    }
    return user;
  }

  return {
    currentEmail: currentEmail,
    currentUser: currentUser,
    hasRole: hasRole,
    isAdmin: isAdmin,
    requireRole: requireRole,
    requireAdmin: requireAdmin,
    requireSelf: requireSelf,
    roleRank: roleRank
  };
})();
