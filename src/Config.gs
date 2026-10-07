/**
 * Config.gs
 * -----------------------------------------------------------------------------
 * Central configuration and system settings for the ICAO Aerodrome Standards &
 * Technical Reference Portal (DoAT Aerodrome Portal).
 *
 * All tunable values, sheet schemas, category lists and system constants live
 * here so the application behaviour can be adjusted without touching business
 * logic. Nothing in this file performs I/O.
 * -----------------------------------------------------------------------------
 */

var CONFIG = (function () {
  return {
    APP_NAME: 'DoAT Aerodrome Standards Portal',
    APP_SHORT_NAME: 'Aerodrome Portal',
    APP_VERSION: '1.0.0',

    /**
     * Script Properties keys. The spreadsheet id and the Drive library folder
     * id are stored in Script Properties (set once by the administrator during
     * setup) so the code contains no hard-coded resource ids.
     */
    PROP_SPREADSHEET_ID: 'SPREADSHEET_ID',
    PROP_LIBRARY_FOLDER_ID: 'LIBRARY_FOLDER_ID',
    PROP_BOOTSTRAP_ADMINS: 'BOOTSTRAP_ADMINS', // comma separated emails
    PROP_USAGE_TRACKING: 'USAGE_TRACKING',     // 'on' | 'off'

    /** CacheService time-to-live values (seconds). */
    CACHE_TTL_SHORT: 60,
    CACHE_TTL_MEDIUM: 300,
    CACHE_TTL_LONG: 1500,

    /** Indexing batch sizing to stay within Apps Script execution limits. */
    INDEX_PAGE_BATCH: 15,          // pages processed per batch run
    INDEX_MAX_RUNTIME_MS: 280000,  // soft stop before the 6-min hard limit
    CHUNK_TARGET_CHARS: 1200,      // approximate size of a searchable chunk
    CHUNK_MAX_CHARS: 2400,

    /** Search behaviour. */
    SEARCH_PAGE_SIZE: 15,
    SEARCH_MAX_RESULTS: 400,
    SEARCH_SNIPPET_CHARS: 320,

    /** User roles (ordered by privilege, ascending). */
    ROLES: {
      VIEWER: 'Viewer',
      EDITOR: 'Editor',
      ADMIN: 'Administrator'
    },
    ROLE_ORDER: ['Viewer', 'Editor', 'Administrator'],

    /** Document lifecycle status values. */
    DOC_STATUS: {
      CURRENT: 'Current',
      SUPERSEDED: 'Superseded',
      DRAFT: 'Draft',
      ARCHIVED: 'Archived'
    },

    INDEX_STATUS: {
      PENDING: 'Pending',
      QUEUED: 'Queued',
      PROCESSING: 'Processing',
      PARTIAL: 'Partial',
      COMPLETE: 'Complete',
      FAILED: 'Failed'
    },

    /** ICAO provision classification types. */
    PROVISION_TYPES: [
      'Standard',
      'Recommended Practice',
      'Note',
      'Definition',
      'Appendix',
      'Attachment',
      'Explanatory Material',
      'Guidance Material',
      'Procedure / Technical Specification',
      'Unclassified'
    ],

    CROSS_REF_TYPES: {
      DIRECT: 'Direct Reference',
      RELATED: 'Related Provision',
      SUGGESTED: 'Suggested Reference'
    },

    COMPLIANCE_STATUS: [
      'Compliant',
      'Partially Compliant',
      'Non-Compliant',
      'Not Applicable',
      'Under Review',
      'Pending Verification'
    ],

    /** Quick-access subject categories surfaced on the dashboard. */
    QUICK_ACCESS: [
      'Aerodrome Reference Code',
      'Runway Design and Physical Characteristics',
      'Runway Strips and RESA',
      'Taxiways and Taxiway Shoulders',
      'Aprons and Aircraft Stands',
      'Obstacle Limitation Surfaces',
      'Visual Aids',
      'Aerodrome Lighting',
      'Visual Approach Slope Indicators',
      'Markings and Signs',
      'Aerodrome Electrical Systems',
      'Rescue and Firefighting Services',
      'Wildlife Hazard Management',
      'Aerodrome Emergency Planning',
      'Pavement Design and Maintenance',
      'Aerodrome Inspections',
      'Safety Management Systems',
      'Aerodrome Certification',
      'Airside Operations'
    ],

    /**
     * Technical Knowledge Library subject groups. Subject pages are generated
     * from indexed content; this list only defines the navigation taxonomy and
     * the keyword seeds used to gather related sections.
     */
    KNOWLEDGE_SUBJECTS: [
      {
        group: 'Aerodrome Planning and Design',
        subjects: [
          { name: 'Aerodrome reference code', keywords: ['aerodrome reference code', 'reference code', 'code number', 'code letter'] },
          { name: 'Runway orientation and configuration', keywords: ['runway orientation', 'runway configuration', 'wind', 'usability factor'] },
          { name: 'Runway length and width', keywords: ['runway length', 'runway width', 'width of runways'] },
          { name: 'Runway strips', keywords: ['runway strip', 'strip width', 'graded portion'] },
          { name: 'Runway end safety areas (RESA)', keywords: ['runway end safety area', 'RESA'] },
          { name: 'Taxiway geometry', keywords: ['taxiway width', 'taxiway curve', 'taxiway minimum separation'] },
          { name: 'Taxiway shoulders', keywords: ['taxiway shoulder', 'shoulder width'] },
          { name: 'Apron planning', keywords: ['apron', 'apron size', 'apron clearance'] },
          { name: 'Aircraft stands', keywords: ['aircraft stand', 'stand clearance', 'taxilane'] },
          { name: 'Holding bays', keywords: ['holding bay', 'runway-holding position'] },
          { name: 'Clearways and stopways', keywords: ['clearway', 'stopway'] }
        ]
      },
      {
        group: 'Obstacle Management',
        subjects: [
          { name: 'Obstacle limitation surfaces', keywords: ['obstacle limitation surface', 'approach surface', 'transitional surface', 'conical surface', 'inner horizontal'] },
          { name: 'Obstacle assessment', keywords: ['obstacle assessment', 'obstacle', 'penetration'] },
          { name: 'Obstacle marking and lighting', keywords: ['obstacle marking', 'obstacle light', 'obstacle lighting'] },
          { name: 'Control of obstacles', keywords: ['control of obstacles', 'obstacle control'] },
          { name: 'Aeronautical studies', keywords: ['aeronautical study'] }
        ]
      },
      {
        group: 'Visual Aids',
        subjects: [
          { name: 'Runway markings', keywords: ['runway marking', 'threshold marking', 'centre line marking'] },
          { name: 'Taxiway markings', keywords: ['taxiway marking', 'taxiway centre line'] },
          { name: 'Aerodrome signs', keywords: ['aerodrome sign', 'mandatory instruction sign', 'information sign'] },
          { name: 'Visual approach slope indicators', keywords: ['PAPI', 'visual approach slope', 'approach slope indicator'] },
          { name: 'Approach lighting systems', keywords: ['approach lighting system', 'approach light'] },
          { name: 'Runway lighting', keywords: ['runway edge light', 'runway lighting', 'threshold light'] },
          { name: 'Taxiway lighting', keywords: ['taxiway edge light', 'taxiway centre line light'] },
          { name: 'Apron lighting', keywords: ['apron flood', 'apron lighting'] },
          { name: 'Aerodrome beacon', keywords: ['aerodrome beacon', 'identification beacon'] }
        ]
      },
      {
        group: 'Aerodrome Operations',
        subjects: [
          { name: 'Runway inspections', keywords: ['runway inspection', 'surface inspection'] },
          { name: 'Apron inspections', keywords: ['apron inspection'] },
          { name: 'Airside vehicle operations', keywords: ['vehicle operation', 'airside driving', 'apron safety'] },
          { name: 'Wildlife hazard management', keywords: ['wildlife', 'bird', 'wildlife hazard', 'bird strike'] },
          { name: 'FOD management', keywords: ['foreign object debris', 'FOD'] },
          { name: 'Aerodrome emergency planning', keywords: ['emergency planning', 'emergency plan', 'aerodrome emergency'] },
          { name: 'Disabled aircraft removal', keywords: ['disabled aircraft', 'removal of disabled aircraft'] },
          { name: 'Aerodrome maintenance', keywords: ['maintenance', 'pavement maintenance', 'surface maintenance'] }
        ]
      },
      {
        group: 'Aerodrome Safety',
        subjects: [
          { name: 'Aerodrome safety management', keywords: ['safety management system', 'SMS', 'safety management'] },
          { name: 'Hazard identification', keywords: ['hazard identification', 'hazard'] },
          { name: 'Safety risk assessment', keywords: ['risk assessment', 'safety risk'] },
          { name: 'Occurrence reporting', keywords: ['occurrence reporting', 'reporting'] },
          { name: 'Safety assurance', keywords: ['safety assurance', 'safety performance'] }
        ]
      },
      {
        group: 'Rescue and Firefighting',
        subjects: [
          { name: 'Rescue and firefighting categories', keywords: ['rescue and firefighting', 'RFF category', 'aerodrome category for rescue'] },
          { name: 'RFFS equipment', keywords: ['rescue and firefighting equipment', 'extinguishing agent', 'rescue equipment'] },
          { name: 'Fire extinguishing agents', keywords: ['extinguishing agent', 'foam', 'complementary agent'] },
          { name: 'Emergency response planning', keywords: ['response time', 'emergency response'] },
          { name: 'Personnel training', keywords: ['training', 'firefighter training'] }
        ]
      },
      {
        group: 'Aerodrome Infrastructure',
        subjects: [
          { name: 'Pavement design', keywords: ['pavement', 'pavement classification', 'PCN', 'ACN'] },
          { name: 'Pavement maintenance', keywords: ['pavement maintenance', 'overlay'] },
          { name: 'Electrical systems', keywords: ['electrical', 'power supply', 'secondary power'] },
          { name: 'Aerodrome lighting control', keywords: ['lighting control', 'monitoring', 'control system'] },
          { name: 'Frangibility', keywords: ['frangible', 'frangibility'] },
          { name: 'Drainage', keywords: ['drainage', 'surface water'] }
        ]
      }
    ],

    /**
     * Known aviation abbreviations and their expansions. Used to broaden
     * searches (searching "RESA" also matches "runway end safety area" and
     * vice versa). Expanded at runtime against indexed content only.
     */
    ABBREVIATIONS: {
      'RESA': 'runway end safety area',
      'OLS': 'obstacle limitation surface',
      'RFFS': 'rescue and firefighting service',
      'RFF': 'rescue and firefighting',
      'PAPI': 'precision approach path indicator',
      'APAPI': 'abbreviated precision approach path indicator',
      'VASIS': 'visual approach slope indicator system',
      'PCN': 'pavement classification number',
      'ACN': 'aircraft classification number',
      'PCR': 'pavement classification rating',
      'ACR': 'aircraft classification rating',
      'SMS': 'safety management system',
      'FOD': 'foreign object debris',
      'ARC': 'aerodrome reference code',
      'ARP': 'aerodrome reference point',
      'ILS': 'instrument landing system',
      'ALS': 'approach lighting system',
      'TODA': 'take-off distance available',
      'ASDA': 'accelerate-stop distance available',
      'TORA': 'take-off run available',
      'LDA': 'landing distance available',
      'AGL': 'above ground level',
      'AIP': 'aeronautical information publication',
      'NOTAM': 'notice to airmen',
      'SARPs': 'standards and recommended practices',
      'SARP': 'standard and recommended practice'
    },

    /**
     * Seed document catalogue. These titles reflect the materials provided for
     * the portal. They are registered as catalogue entries so the library is
     * never empty; actual page/section content only becomes searchable once an
     * administrator links a Drive file and runs indexing. Nothing here claims
     * a document is indexed.
     */
    SEED_DOCUMENTS: [
      {
        title: 'Annex 14 — Aerodromes, Volume I — Aerodrome Design and Operations',
        number: 'Annex 14', volume: 'Volume I', part: '',
        edition: 'Ninth Edition (July 2022)', amendment: '',
        category: 'Annex', fileHint: 'Annex 14 (July 2022) Ninth Edition.pdf'
      },
      {
        title: 'Annex 14 — Aerodromes, Volume II — Heliports',
        number: 'Annex 14', volume: 'Volume II', part: '',
        edition: 'Fifth Edition (July 2020)', amendment: '',
        category: 'Annex', fileHint: 'Annex 14 Version 2 5th Edition_July 2020.pdf'
      },
      {
        title: 'Doc 9157 — Aerodrome Design Manual, Part 1 — Runways',
        number: 'Doc 9157', volume: '', part: 'Part 1',
        edition: 'Third Edition (2020)', amendment: '',
        category: 'Manual', fileHint: 'Doc 9157 Aerodrome Design Manual Part 1'
      },
      {
        title: 'Doc 9157 — Aerodrome Design Manual, Part 2 — Taxiways, Aprons and Holding Bays',
        number: 'Doc 9157', volume: '', part: 'Part 2',
        edition: 'Second Edition (2020)', amendment: '',
        category: 'Manual', fileHint: 'Doc 9157 Aerodrome Design Manual Part 2'
      },
      {
        title: 'Doc 9157 — Aerodrome Design Manual, Part 3 — Pavements',
        number: 'Doc 9157', volume: '', part: 'Part 3',
        edition: 'Applicable edition', amendment: '',
        category: 'Manual', fileHint: 'Doc 9157 Aerodrome Design Manual Part 3'
      },
      {
        title: 'Doc 9157 — Aerodrome Design Manual, Part 4 — Visual Aids',
        number: 'Doc 9157', volume: '', part: 'Part 4',
        edition: 'Second Edition (2021)', amendment: '',
        category: 'Manual', fileHint: 'Doc 9157 Aerodrome Design Manual Part 4'
      },
      {
        title: 'Doc 9157 — Aerodrome Design Manual, Part 5 — Electrical Systems',
        number: 'Doc 9157', volume: '', part: 'Part 5',
        edition: 'Second Edition (2017)', amendment: '',
        category: 'Manual', fileHint: 'Doc 9157 Aerodrome Design Manual Part 5'
      },
      {
        title: 'Doc 9157 — Aerodrome Design Manual, Part 6 — Frangibility',
        number: 'Doc 9157', volume: '', part: 'Part 6',
        edition: 'First Edition (2006)', amendment: '',
        category: 'Manual', fileHint: 'Doc 9157 Aerodrome Design Manual Part 6'
      }
    ],

    DISCLAIMER: 'This platform is an electronic reference and information retrieval tool developed to facilitate access to uploaded ICAO aerodrome standards and technical guidance materials. The original ICAO publications and applicable national regulations remain the authoritative sources. Users are responsible for verifying the applicable edition, amendment and regulatory requirements before relying on any provision for operational, technical or compliance decisions.'
  };
})();
