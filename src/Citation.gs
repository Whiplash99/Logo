/**
 * Citation.gs
 * -----------------------------------------------------------------------------
 * Builds a consistent citation string for a section. Every field is derived
 * from the document metadata and indexed section — nothing is invented. Fields
 * that are unknown are simply omitted rather than guessed.
 * -----------------------------------------------------------------------------
 */

var Citation = (function () {

  function forSection(section, doc) {
    if (!doc) { return ''; }
    var parts = ['ICAO'];
    var title = doc.Document_Title || doc.ICAO_Document_Number;
    parts.push(title);
    if (doc.Edition) { parts.push(doc.Edition); }
    if (doc.Amendment) { parts.push('Amendment ' + doc.Amendment); }
    if (section) {
      if (section.Chapter) { parts.push(section.Chapter); }
      if (section.Section_Number && section.Section_Number !== section.Paragraph_Number) {
        parts.push('Section ' + section.Section_Number);
      }
      if (section.Paragraph_Number) { parts.push('Paragraph ' + section.Paragraph_Number); }
      if (section.Start_Page) { parts.push('PDF page ' + section.Start_Page); }
    }
    return parts.join(', ') + '.';
  }

  function forSectionId(sectionId) {
    var s = DB.findById('Sections', 'Section_ID', sectionId);
    if (!s) { return ''; }
    var d = DB.findById('Documents', 'Document_ID', s.Document_ID);
    return forSection(s, d);
  }

  return { forSection: forSection, forSectionId: forSectionId };
})();
