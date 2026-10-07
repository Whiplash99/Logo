/**
 * NotesService.gs
 * -----------------------------------------------------------------------------
 * Private per-user notes attached to a document or section. Notes are stored
 * separately from the ICAO source content and are never shown to other users.
 * -----------------------------------------------------------------------------
 */

var NotesService = (function () {

  function save(payload) {
    var user = Auth.currentUser();
    if (!user.User_ID) { throw new Error('Sign in to save notes.'); }

    if (payload.noteId) {
      var existing = DB.findById('User_Notes', 'Note_ID', payload.noteId);
      if (!existing || existing.User_ID !== user.User_ID) {
        throw new Error('Note not found or not yours.');
      }
      DB.updateById('User_Notes', 'Note_ID', payload.noteId, {
        Note_Text: payload.text || '',
        Tags: (payload.tags || []).join(','),
        Last_Updated: Util.isoNow()
      });
      return decorate(DB.findById('User_Notes', 'Note_ID', payload.noteId));
    }

    var rec = {
      Note_ID: Util.newId('NOT'),
      User_ID: user.User_ID,
      Document_ID: payload.documentId || '',
      Section_ID: payload.sectionId || '',
      Note_Text: payload.text || '',
      Tags: (payload.tags || []).join(','),
      Date_Created: Util.isoNow(),
      Last_Updated: Util.isoNow()
    };
    DB.insert('User_Notes', rec);
    return decorate(rec);
  }

  function remove(noteId) {
    var user = Auth.currentUser();
    return DB.remove('User_Notes', function (n) {
      return n.Note_ID === noteId && n.User_ID === user.User_ID;
    }) > 0;
  }

  function listMine(sectionId) {
    var user = Auth.currentUser();
    var rows = DB.find('User_Notes', function (n) {
      return n.User_ID === user.User_ID && (!sectionId || n.Section_ID === sectionId);
    });
    rows.sort(function (a, b) { return String(b.Last_Updated).localeCompare(String(a.Last_Updated)); });
    return rows.map(decorate);
  }

  function decorate(n) {
    var sec = n.Section_ID ? DB.findById('Sections', 'Section_ID', n.Section_ID) : null;
    var doc = n.Document_ID ? DB.findById('Documents', 'Document_ID', n.Document_ID) : null;
    return {
      noteId: n.Note_ID,
      documentId: n.Document_ID,
      sectionId: n.Section_ID,
      text: n.Note_Text,
      tags: String(n.Tags || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean),
      documentTitle: doc ? doc.Document_Title : '',
      heading: sec ? sec.Heading : '',
      paragraph: sec ? sec.Paragraph_Number : '',
      lastUpdated: Util.formatDate(n.Last_Updated)
    };
  }

  return { save: save, remove: remove, listMine: listMine };
})();
