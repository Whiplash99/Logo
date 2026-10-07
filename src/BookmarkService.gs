/**
 * BookmarkService.gs
 * -----------------------------------------------------------------------------
 * Bookmarks and named reference collections, private per user and enforced
 * server-side.
 * -----------------------------------------------------------------------------
 */

var BookmarkService = (function () {

  var DEFAULT_COLLECTIONS = [
    'Aerodrome Certification', 'Runway Safety', 'Wildlife Hazard Management',
    'Pavement Maintenance', 'Visual Aids', 'Aerodrome Emergency Planning',
    'Aerodrome Inspections', 'Aerodrome Development Projects'
  ];

  function add(payload) {
    var user = Auth.currentUser();
    if (!user.User_ID) { throw new Error('Sign in to save bookmarks.'); }
    var rec = {
      Bookmark_ID: Util.newId('BMK'),
      User_ID: user.User_ID,
      Document_ID: payload.documentId || '',
      Section_ID: payload.sectionId || '',
      Page_Number: payload.page || '',
      Collection_Name: payload.collection || 'General',
      Label: Util.truncate(payload.label || '', 180),
      Date_Created: Util.isoNow()
    };
    DB.insert('Bookmarks', rec);
    return decorate(rec);
  }

  function remove(bookmarkId) {
    var user = Auth.currentUser();
    var count = DB.remove('Bookmarks', function (b) {
      return b.Bookmark_ID === bookmarkId && b.User_ID === user.User_ID;
    });
    return count > 0;
  }

  function listMine() {
    var user = Auth.currentUser();
    var rows = DB.find('Bookmarks', function (b) { return b.User_ID === user.User_ID; });
    rows.sort(function (a, b) { return String(b.Date_Created).localeCompare(String(a.Date_Created)); });
    return rows.map(decorate);
  }

  function collections() {
    var user = Auth.currentUser();
    var names = {};
    DEFAULT_COLLECTIONS.forEach(function (c) { names[c] = 0; });
    DB.find('Bookmarks', function (b) { return b.User_ID === user.User_ID; })
      .forEach(function (b) { names[b.Collection_Name] = (names[b.Collection_Name] || 0) + 1; });
    return Object.keys(names).map(function (n) { return { name: n, count: names[n] }; });
  }

  function decorate(b) {
    var sec = b.Section_ID ? DB.findById('Sections', 'Section_ID', b.Section_ID) : null;
    var doc = b.Document_ID ? DB.findById('Documents', 'Document_ID', b.Document_ID) : null;
    return {
      bookmarkId: b.Bookmark_ID,
      documentId: b.Document_ID,
      sectionId: b.Section_ID,
      page: b.Page_Number,
      collection: b.Collection_Name,
      label: b.Label || (sec ? sec.Heading : (doc ? doc.Document_Title : 'Bookmark')),
      documentTitle: doc ? doc.Document_Title : '',
      paragraph: sec ? sec.Paragraph_Number : '',
      heading: sec ? sec.Heading : '',
      dateCreated: Util.formatDate(b.Date_Created)
    };
  }

  function isBookmarked(sectionId) {
    var user = Auth.currentUser();
    return !!DB.findOne('Bookmarks', function (b) {
      return b.User_ID === user.User_ID && b.Section_ID === sectionId;
    });
  }

  return {
    add: add, remove: remove, listMine: listMine,
    collections: collections, isBookmarked: isBookmarked,
    DEFAULT_COLLECTIONS: DEFAULT_COLLECTIONS
  };
})();
