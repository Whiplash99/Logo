/**
 * ComplianceService.gs
 * -----------------------------------------------------------------------------
 * Compliance & requirement mapping register. Compliance status is always set by
 * an authorised user — never inferred by the application. ICAO provisions are
 * kept distinct from national regulations and operator requirements.
 * -----------------------------------------------------------------------------
 */

var ComplianceService = (function () {

  function addFromSection(sectionId, fields) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var user = Auth.currentUser();
    var sec = DB.findById('Sections', 'Section_ID', sectionId) || {};
    var doc = sec.Document_ID ? DB.findById('Documents', 'Document_ID', sec.Document_ID) : {};
    fields = fields || {};
    var rec = baseRecord(user);
    rec.Source_Document_ID = sec.Document_ID || '';
    rec.Volume = doc.Volume || '';
    rec.Part = doc.Part || '';
    rec.Edition = doc.Edition || '';
    rec.Amendment = doc.Amendment || '';
    rec.Chapter = sec.Chapter || '';
    rec.Paragraph = sec.Paragraph_Number || '';
    rec.Requirement_Text = Util.truncate(sec.Extracted_Text || '', 4000);
    rec.Provision_Type = sec.Provision_Type || '';
    applyEditable(rec, fields);
    DB.insert('Compliance_Register', rec);
    AuditService.log('Compliance add', rec.Reference_ID, 'OK');
    return decorate(rec);
  }

  function addManual(fields) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var rec = baseRecord(Auth.currentUser());
    applyEditable(rec, fields || {});
    rec.Requirement_Text = fields.requirementText || '';
    rec.Provision_Type = fields.provisionType || '';
    rec.Chapter = fields.chapter || '';
    rec.Paragraph = fields.paragraph || '';
    DB.insert('Compliance_Register', rec);
    AuditService.log('Compliance add (manual)', rec.Reference_ID, 'OK');
    return decorate(rec);
  }

  function update(referenceId, fields) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var rec = DB.findById('Compliance_Register', 'Reference_ID', referenceId);
    if (!rec) { throw new Error('Compliance record not found.'); }
    var upd = {};
    applyEditable(upd, fields || {});
    upd.Last_Reviewed = Util.isoNow();
    DB.updateById('Compliance_Register', 'Reference_ID', referenceId, upd);
    AuditService.log('Compliance update', referenceId, 'OK');
    return decorate(DB.findById('Compliance_Register', 'Reference_ID', referenceId));
  }

  function remove(referenceId) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    DB.remove('Compliance_Register', function (r) { return r.Reference_ID === referenceId; });
    AuditService.log('Compliance delete', referenceId, 'OK');
    return true;
  }

  function applyEditable(rec, f) {
    var map = {
      nationalRegulation: 'National_Regulation',
      aerodromeManualSection: 'Aerodrome_Manual_Section',
      responsibleUnit: 'Responsible_Unit',
      complianceStatus: 'Compliance_Status',
      evidenceLink: 'Evidence_Link',
      identifiedGap: 'Identified_Gap',
      correctiveAction: 'Corrective_Action',
      targetDate: 'Target_Date',
      remarks: 'Remarks'
    };
    Object.keys(map).forEach(function (k) {
      if (f.hasOwnProperty(k)) {
        if (k === 'complianceStatus' && f[k] && CONFIG.COMPLIANCE_STATUS.indexOf(f[k]) === -1) {
          throw new Error('Invalid compliance status.');
        }
        rec[map[k]] = f[k];
      }
    });
  }

  function baseRecord(user) {
    return {
      Reference_ID: Util.newId('CMP'),
      User_ID: user.User_ID || '',
      Source_Document_ID: '',
      Volume: '', Part: '', Edition: '', Amendment: '', Chapter: '', Paragraph: '',
      Requirement_Text: '', Provision_Type: '',
      National_Regulation: '', Aerodrome_Manual_Section: '', Responsible_Unit: '',
      Compliance_Status: 'Under Review', Evidence_Link: '', Identified_Gap: '',
      Corrective_Action: '', Target_Date: '', Remarks: '', Last_Reviewed: Util.isoNow()
    };
  }

  function list(filters) {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    filters = filters || {};
    var rows = DB.readAll('Compliance_Register');
    if (filters.status) { rows = rows.filter(function (r) { return r.Compliance_Status === filters.status; }); }
    if (filters.responsibleUnit) { rows = rows.filter(function (r) { return r.Responsible_Unit === filters.responsibleUnit; }); }
    if (filters.documentId) { rows = rows.filter(function (r) { return r.Source_Document_ID === filters.documentId; }); }
    rows.sort(function (a, b) {
      if (filters.sort === 'target') { return String(a.Target_Date).localeCompare(String(b.Target_Date)); }
      return String(b.Last_Reviewed).localeCompare(String(a.Last_Reviewed));
    });
    return rows.map(decorate);
  }

  function summary() {
    Auth.requireRole(CONFIG.ROLES.EDITOR);
    var rows = DB.readAll('Compliance_Register');
    var counts = { total: rows.length };
    CONFIG.COMPLIANCE_STATUS.forEach(function (s) { counts[s] = 0; });
    var overdue = 0;
    var today = Util.formatDate(new Date());
    rows.forEach(function (r) {
      counts[r.Compliance_Status] = (counts[r.Compliance_Status] || 0) + 1;
      if (r.Target_Date && Util.formatDate(r.Target_Date) < today &&
          r.Compliance_Status !== 'Compliant' && r.Compliance_Status !== 'Not Applicable') {
        overdue++;
      }
    });
    counts.overdue = overdue;
    return counts;
  }

  function decorate(r) {
    var doc = r.Source_Document_ID ? DB.findById('Documents', 'Document_ID', r.Source_Document_ID) : null;
    return {
      referenceId: r.Reference_ID,
      documentId: r.Source_Document_ID,
      documentTitle: doc ? doc.Document_Title : '',
      volume: r.Volume, part: r.Part, edition: r.Edition, amendment: r.Amendment,
      chapter: r.Chapter, paragraph: r.Paragraph,
      requirementText: r.Requirement_Text, provisionType: r.Provision_Type,
      nationalRegulation: r.National_Regulation,
      aerodromeManualSection: r.Aerodrome_Manual_Section,
      responsibleUnit: r.Responsible_Unit,
      complianceStatus: r.Compliance_Status,
      evidenceLink: r.Evidence_Link,
      identifiedGap: r.Identified_Gap,
      correctiveAction: r.Corrective_Action,
      targetDate: Util.formatDate(r.Target_Date),
      remarks: r.Remarks,
      lastReviewed: Util.formatDate(r.Last_Reviewed)
    };
  }

  return {
    addFromSection: addFromSection, addManual: addManual, update: update,
    remove: remove, list: list, summary: summary
  };
})();
