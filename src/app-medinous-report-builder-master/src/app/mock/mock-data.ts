// Dev-only demo dataset shaped like the Medinous Fusion HMS modules.
// Used by the mock API interceptor when the .NET reporting API is not running.
import {
  PublicationDto,
  ReportScheduleDto,
  ReportModule,
  ReportEntity,
  ReportField,
  ReportRelationship,
  SavedReportDetailDto,
} from '../models/report.models';

// ---------- deterministic random ----------
let seed = 20260924;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const TODAY = new Date('2026-09-24T00:00:00');
function daysAgo(n: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- metadata ----------
export const MODULES: ReportModule[] = [
  { moduleId: 1, moduleName: 'Registration', moduleCode: 'REG' },
  { moduleId: 2, moduleName: 'Billing', moduleCode: 'BIL' },
  { moduleId: 3, moduleName: 'Laboratory', moduleCode: 'LAB' },
  { moduleId: 4, moduleName: 'IP Management', moduleCode: 'IPM' },
  { moduleId: 5, moduleName: 'Operation Theatre', moduleCode: 'OT' },
  { moduleId: 6, moduleName: 'Pharmacy', moduleCode: 'PHA' },
];

export const ENTITIES: (ReportEntity & { moduleId: number })[] = [
  { entityId: 1, moduleId: 1, entityName: 'Patients', objectType: 'View', description: 'Registered patients with demographics, contact, registration and activity columns.', rowMeaning: 'a registered patient' },
  { entityId: 2, moduleId: 1, entityName: 'Patient Visits', objectType: 'View', description: 'Outpatient visits with date, type, department, doctor and status.', rowMeaning: 'a visit' },
  { entityId: 3, moduleId: 2, entityName: 'Patient Bills', objectType: 'View', description: 'OP bills with sponsor, amounts and payment status.', rowMeaning: 'a bill' },
  { entityId: 4, moduleId: 2, entityName: 'Receipts', objectType: 'View', description: 'Receipts against bills, with payment mode and cashier.', rowMeaning: 'a receipt' },
  { entityId: 5, moduleId: 3, entityName: 'Lab Orders', objectType: 'View', description: 'Lab test orders with section, priority, specimen status and turnaround.', rowMeaning: 'a lab test order' },
  { entityId: 6, moduleId: 4, entityName: 'Admissions', objectType: 'View', description: 'Inpatient admissions with ward, bed category and length of stay.', rowMeaning: 'an admission' },
  { entityId: 7, moduleId: 5, entityName: 'Surgeries', objectType: 'View', description: 'Surgery cases with procedure, theatre, team and duration.', rowMeaning: 'a surgery case' },
  { entityId: 8, moduleId: 6, entityName: 'Dispensing', objectType: 'View', description: 'OP pharmacy dispensing lines with drug, quantity and amount.', rowMeaning: 'a dispensed item' },
];

const NUM_AGGS = ['Count', 'Sum', 'Avg', 'Min', 'Max'];
const STR_AGGS = ['Count', 'CountDistinct'];
const DATE_AGGS = ['Count', 'Min', 'Max'];

export const FIELDS: (ReportField & { entityId: number })[] = [];
let fid = 1;
function f(
  entityId: number,
  sys: string,
  label: string,
  category: string,
  dataType: 'String' | 'Number' | 'Date' | 'Boolean',
  opts: { desc?: string; computed?: boolean; groupable?: boolean; aggs?: string[]; related?: boolean; restricted?: boolean; kind?: 'money' | 'integer' | 'decimal' } = {}
) {
  FIELDS.push({
    fieldId: fid++,
    entityId,
    systemFieldName: sys,
    displayLabel: label,
    description: opts.desc ?? null,
    category,
    displayOrder: fid,
    dataType,
    formatPattern: null,
    isFilterable: true,
    isSortable: true,
    isGroupable: opts.groupable ?? dataType !== 'Number',
    isComputed: !!opts.computed,
    isRelated: !!opts.related,
    isRestricted: !!opts.restricted,
    numberKind: dataType === 'Number' ? opts.kind || 'decimal' : undefined,
    allowedAggregations:
      opts.aggs ?? (dataType === 'Number' ? NUM_AGGS : dataType === 'Date' ? DATE_AGGS : STR_AGGS),
  });
}

// Column catalogue. Every column has a description (PRD 6.3) and only the summaries that make sense for it
// (PRD Appendix: "Summaries" per column). Numbers carry a kind so formats only offer what fits.
const ID = { aggs: ['Count', 'CountDistinct'], groupable: false };
const CAT = { aggs: ['Count'] };
const NAME = { aggs: ['Count'], groupable: false };
const DATE = { aggs: ['Min', 'Max', 'Count'] };
const MONEY = { aggs: ['Sum', 'Avg', 'Min', 'Max'], kind: 'money' as const, groupable: false };
const MEASURE = { aggs: ['Avg', 'Min', 'Max'], kind: 'integer' as const, groupable: false };
const COUNTABLE = { aggs: ['Sum', 'Avg', 'Max'], kind: 'integer' as const, groupable: false };

// 1 Patients
f(1, 'PatientId', 'Patient ID', 'Identification', 'String', { ...ID, desc: 'Medical record number. Count Distinct gives the number of patients.' });
f(1, 'FullName', 'Patient Name', 'Identification', 'String', { ...NAME, computed: true, desc: 'First and last name, calculated in the data set' });
f(1, 'Gender', 'Gender', 'Demographics', 'String', { ...CAT, desc: 'Male or Female, as registered' });
f(1, 'DateOfBirth', 'Date of Birth', 'Demographics', 'Date', { aggs: ['Min', 'Max'], desc: 'As recorded at registration' });
f(1, 'Age', 'Age (Years)', 'Demographics', 'Number', { ...MEASURE, computed: true, groupable: true, desc: 'Whole years from date of birth, calculated when the report runs' });
f(1, 'Nationality', 'Nationality', 'Demographics', 'String', { ...CAT, desc: 'Readable name from the nationality master' });
f(1, 'MobileNo', 'Mobile No', 'Contact', 'String', { ...NAME, restricted: true, desc: 'Restricted: exporting asks for a reason' });
f(1, 'City', 'City', 'Contact', 'String', { ...CAT, desc: 'City of the registered address' });
f(1, 'PatientType', 'Patient Type', 'Registration', 'String', { ...CAT, desc: 'Cash, Insurance or Corporate' });
f(1, 'RegistrationDate', 'Registration Date', 'Registration', 'Date', { ...DATE, desc: 'Date the patient was first registered' });
f(1, 'RegisteredBy', 'Registered By', 'Registration', 'String', { ...CAT, desc: 'Front-desk user who registered the patient' });
f(1, 'IsVip', 'VIP', 'Registration', 'Boolean', { ...CAT, desc: 'Yes when the patient is flagged as VIP' });
// 2 Patient Visits
f(2, 'VisitNo', 'Visit No', 'Identification', 'String', { ...ID, desc: 'Outpatient visit reference' });
f(2, 'PatientId', 'Patient ID', 'Identification', 'String', { ...ID, desc: 'Medical record number. Count Distinct gives the number of patients.' });
f(2, 'VisitDate', 'Visit Date', 'Visit', 'Date', { ...DATE, desc: 'Date of the visit' });
f(2, 'VisitType', 'Visit Type', 'Visit', 'String', { ...CAT, desc: 'New, Review, Referral or Emergency' });
f(2, 'Department', 'Department', 'Visit', 'String', { ...CAT, desc: 'Department the visit was booked in' });
f(2, 'Doctor', 'Doctor', 'Visit', 'String', { ...CAT, desc: 'Consulting doctor, by name' });
f(2, 'VisitStatus', 'Visit Status', 'Status', 'String', { ...CAT, desc: 'Checked-in, Consulted, Cancelled or No-show' });
f(2, 'WaitMinutes', 'Wait Time (min)', 'Service', 'Number', { ...MEASURE, desc: 'Minutes from check-in to consultation' });
f(2, 'ConsultationFee', 'Consultation Fee', 'Financial', 'Number', { ...MONEY, desc: 'Fee charged for the consultation' });
// 3 Patient Bills
f(3, 'BillNo', 'Bill No', 'Identification', 'String', { ...ID, desc: 'Bill reference. Count gives the number of bills.' });
f(3, 'PatientId', 'Patient ID', 'Identification', 'String', { ...ID, desc: 'Medical record number. Count Distinct gives the number of patients.' });
f(3, 'VisitNo', 'Visit No', 'Identification', 'String', { ...ID, desc: 'Visit the bill belongs to' });
f(3, 'BillDate', 'Bill Date', 'Bill', 'Date', { ...DATE, desc: 'Date the bill was raised' });
f(3, 'BillType', 'Bill Type', 'Bill', 'String', { ...CAT, desc: 'OP, IP or Pharmacy' });
f(3, 'Department', 'Department', 'Bill', 'String', { ...CAT, desc: 'Department the bill was raised in' });
f(3, 'Sponsor', 'Sponsor', 'Sponsor', 'String', { ...CAT, desc: 'Paying sponsor, or Self Pay' });
f(3, 'GrossAmount', 'Gross Amount', 'Financial', 'Number', { ...MONEY, desc: 'Before discount' });
f(3, 'Discount', 'Discount', 'Financial', 'Number', { ...MONEY, desc: 'Discount given on the bill' });
f(3, 'NetAmount', 'Net Amount', 'Financial', 'Number', { ...MONEY, desc: 'Gross amount less discount' });
f(3, 'PatientShare', 'Patient Share', 'Financial', 'Number', { ...MONEY, desc: 'Part of the net amount the patient pays' });
f(3, 'SponsorShare', 'Sponsor Share', 'Financial', 'Number', { ...MONEY, desc: 'Part of the net amount the sponsor pays' });
f(3, 'BillStatus', 'Bill Status', 'Status', 'String', { ...CAT, desc: 'Paid, Part Paid, Unpaid or Cancelled' });
// 4 Receipts
f(4, 'ReceiptNo', 'Receipt No', 'Identification', 'String', { ...ID, desc: 'Receipt reference. Count gives the number of receipts.' });
f(4, 'BillNo', 'Bill No', 'Identification', 'String', { ...ID, desc: 'Bill the receipt was taken against' });
f(4, 'ReceiptDate', 'Receipt Date', 'Receipt', 'Date', { ...DATE, desc: 'Date the payment was received' });
f(4, 'PaymentMode', 'Payment Mode', 'Receipt', 'String', { ...CAT, desc: 'Cash, Card, BenefitPay or Cheque' });
f(4, 'Amount', 'Amount Received', 'Financial', 'Number', { ...MONEY, desc: 'Amount received on this receipt' });
f(4, 'Cashier', 'Cashier', 'Receipt', 'String', { ...CAT, desc: 'Cashier who took the payment' });
// 5 Lab Orders
f(5, 'OrderNo', 'Order No', 'Identification', 'String', { ...ID, desc: 'Lab order reference' });
f(5, 'PatientId', 'Patient ID', 'Identification', 'String', { ...ID, desc: 'Medical record number. Count Distinct gives the number of patients.' });
f(5, 'VisitNo', 'Visit No', 'Identification', 'String', { ...ID, desc: 'Visit the test was ordered in' });
f(5, 'OrderDate', 'Order Date', 'Order', 'Date', { ...DATE, desc: 'Date the test was ordered' });
f(5, 'TestName', 'Test Name', 'Order', 'String', { ...CAT, desc: 'Test as named in the lab catalogue' });
f(5, 'Section', 'Lab Section', 'Order', 'String', { ...CAT, desc: 'Haematology, Biochemistry, Microbiology or Immunology' });
f(5, 'Priority', 'Priority', 'Order', 'String', { ...CAT, desc: 'Routine, Urgent or STAT' });
f(5, 'SpecimenStatus', 'Specimen Status', 'Status', 'String', { ...CAT, desc: 'Where the specimen is in its lifecycle' });
f(5, 'TatMinutes', 'Turnaround Time (min)', 'Service', 'Number', { ...MEASURE, desc: 'Minutes from collection to verified result' });
f(5, 'IsCritical', 'Critical Result', 'Status', 'Boolean', { ...CAT, desc: 'Yes when the result was flagged critical' });
// 6 Admissions
f(6, 'AdmissionNo', 'Admission No', 'Identification', 'String', { ...ID, desc: 'Inpatient admission reference' });
f(6, 'PatientId', 'Patient ID', 'Identification', 'String', { ...ID, desc: 'Medical record number. Count Distinct gives the number of patients.' });
f(6, 'AdmissionDate', 'Admission Date', 'Admission', 'Date', { ...DATE, desc: 'Date the patient was admitted' });
f(6, 'DischargeDate', 'Discharge Date', 'Admission', 'Date', { ...DATE, desc: 'Blank while the patient is still admitted' });
f(6, 'AdmissionType', 'Admission Type', 'Admission', 'String', { ...CAT, desc: 'Elective or Emergency' });
f(6, 'Ward', 'Ward', 'Bed', 'String', { ...CAT, desc: 'Ward of the current or last bed' });
f(6, 'BedCategory', 'Bed Category', 'Bed', 'String', { ...CAT, desc: 'General, Semi-Private, Private or ICU' });
f(6, 'AttendingDoctor', 'Attending Doctor', 'Admission', 'String', { ...CAT, desc: 'Doctor responsible for the admission' });
f(6, 'LengthOfStay', 'Length of Stay (days)', 'Admission', 'Number', { ...COUNTABLE, computed: true, desc: 'Days admitted; to today while still admitted. Total gives bed-days.' });
f(6, 'AdmissionStatus', 'Admission Status', 'Status', 'String', { ...CAT, desc: 'Admitted or Discharged' });
// 7 Surgeries
f(7, 'CaseNo', 'OT Case No', 'Identification', 'String', { ...ID, desc: 'Operation theatre case reference' });
f(7, 'PatientId', 'Patient ID', 'Identification', 'String', { ...ID, desc: 'Medical record number. Count Distinct gives the number of patients.' });
f(7, 'AdmissionNo', 'Admission No', 'Identification', 'String', { ...ID, desc: 'Admission the surgery belongs to' });
f(7, 'SurgeryDate', 'Surgery Date', 'Surgery', 'Date', { ...DATE, desc: 'Date of surgery' });
f(7, 'Procedure', 'Procedure', 'Surgery', 'String', { ...CAT, desc: 'Procedure as named in the OT catalogue' });
f(7, 'Theatre', 'Theatre', 'Surgery', 'String', { ...CAT, desc: 'Theatre the case was done in' });
f(7, 'Surgeon', 'Surgeon', 'Team', 'String', { ...CAT, desc: 'Lead surgeon, by name' });
f(7, 'AnaesthesiaType', 'Anaesthesia Type', 'Team', 'String', { ...CAT, desc: 'General, Spinal, Regional Block, Local or Sedation' });
f(7, 'DurationMinutes', 'Duration (min)', 'Surgery', 'Number', { aggs: ['Sum', 'Avg', 'Min', 'Max'], kind: 'integer', groupable: false, desc: 'Minutes from incision to closure. Total gives theatre minutes.' });
f(7, 'CaseStatus', 'Case Status', 'Status', 'String', { ...CAT, desc: 'Scheduled, Completed, Cancelled or Postponed' });
// 8 Dispensing
f(8, 'DispenseNo', 'Dispense No', 'Identification', 'String', { ...ID, desc: 'Pharmacy dispense reference' });
f(8, 'PatientId', 'Patient ID', 'Identification', 'String', { ...ID, desc: 'Medical record number. Count Distinct gives the number of patients.' });
f(8, 'DispenseDate', 'Dispense Date', 'Dispense', 'Date', { ...DATE, desc: 'Date the item was dispensed' });
f(8, 'Store', 'Store', 'Dispense', 'String', { ...CAT, desc: 'Pharmacy store that dispensed it' });
f(8, 'DrugName', 'Drug Name', 'Item', 'String', { ...CAT, desc: 'Item as named in the formulary' });
f(8, 'DrugCategory', 'Drug Category', 'Item', 'String', { ...CAT, desc: 'Therapeutic category' });
f(8, 'Quantity', 'Quantity', 'Item', 'Number', { ...COUNTABLE, desc: 'Units dispensed' });
f(8, 'Amount', 'Amount', 'Financial', 'Number', { ...MONEY, desc: 'Charge for the dispensed quantity' });
f(8, 'Pharmacist', 'Pharmacist', 'Dispense', 'String', { ...CAT, desc: 'Pharmacist who dispensed it' });

// Related, pre-resolved columns (PRD 5.2) — appended so earlier field ids stay stable
f(1, 'LatestVisitDate', 'Latest Visit Date', 'Activity', 'Date', { aggs: ['Min', 'Max'], related: true, desc: 'Derived from visit history' });
f(1, 'VisitCount12m', 'Visit Count, 12 months', 'Activity', 'Number', { ...COUNTABLE, related: true, desc: 'Derived from visit history' });
f(1, 'OutstandingBalance', 'Outstanding Balance', 'Activity', 'Number', { aggs: ['Sum', 'Avg', 'Max'], kind: 'money', groupable: false, related: true, desc: 'Derived from billing' });
f(3, 'SponsorCategory', 'Sponsor Category', 'Sponsor', 'String', { ...CAT, related: true, desc: 'Insurance, Corporate or Cash, from the sponsor master' });


export function fieldIdOf(entityId: number, sys: string): number {
  return FIELDS.find((x) => x.entityId === entityId && x.systemFieldName === sys)!.fieldId;
}

let rid = 1;
function rel(a: number, aField: string, b: number, bField: string): ReportRelationship {
  const name = (id: number) => ENTITIES.find((e) => e.entityId === id)!.entityName;
  return {
    relationshipId: rid++,
    primaryEntityId: a,
    primaryEntityName: name(a),
    foreignEntityId: b,
    foreignEntityName: name(b),
    primaryJoinField: aField,
    foreignJoinField: bField,
    joinType: 'left',
  };
}
export const RELATIONSHIPS: ReportRelationship[] = [
  rel(1, 'PatientId', 2, 'PatientId'),
  rel(1, 'PatientId', 3, 'PatientId'),
  rel(2, 'VisitNo', 3, 'VisitNo'),
  rel(3, 'BillNo', 4, 'BillNo'),
  rel(1, 'PatientId', 5, 'PatientId'),
  rel(2, 'VisitNo', 5, 'VisitNo'),
  rel(1, 'PatientId', 6, 'PatientId'),
  rel(1, 'PatientId', 7, 'PatientId'),
  rel(6, 'AdmissionNo', 7, 'AdmissionNo'),
  rel(1, 'PatientId', 8, 'PatientId'),
];

// ---------- rows ----------
const FIRST_M = ['Ahmed', 'Mohammed', 'Ali', 'Hassan', 'Yousif', 'Khalid', 'Omar', 'Rajesh', 'Suresh', 'John', 'Faisal', 'Abdulla'];
const FIRST_F = ['Fatima', 'Maryam', 'Sara', 'Noora', 'Aisha', 'Layla', 'Priya', 'Anjali', 'Mary', 'Huda', 'Zainab', 'Reem'];
const LAST = ['Al-Farsi', 'Al-Khalifa', 'Al-Mahmood', 'Hussain', 'Ebrahim', 'Nair', 'Kumar', 'Thomas', 'Al-Sayed', 'Salman', 'Al-Ansari', 'Janahi'];
const NATIONALITY = ['Bahraini', 'Bahraini', 'Bahraini', 'Indian', 'Indian', 'Pakistani', 'Filipino', 'Egyptian', 'Saudi', 'British'];
const CITY = ['Manama', 'Muharraq', 'Riffa', 'Isa Town', 'Hamad Town', 'Sitra', 'Budaiya'];
const STAFF = ['Reception - Asma', 'Reception - Jose', 'Reception - Latifa', 'Reception - Vinod'];
const DEPTS = ['General Medicine', 'Paediatrics', 'Orthopaedics', 'Obstetrics & Gynaecology', 'ENT', 'Cardiology', 'Dermatology', 'Emergency'];
const DOCTORS: Record<string, string[]> = {
  'General Medicine': ['Dr. Sameer Rao', 'Dr. Huda Al-Aali'],
  Paediatrics: ['Dr. Lina Haddad', 'Dr. Arun Menon'],
  Orthopaedics: ['Dr. Tariq Aziz', 'Dr. Paul Mathew'],
  'Obstetrics & Gynaecology': ['Dr. Noor Al-Qassab', 'Dr. Deepa Pillai'],
  ENT: ['Dr. Kamal Yusuf'],
  Cardiology: ['Dr. Hisham Ali', 'Dr. Ravi Shankar'],
  Dermatology: ['Dr. Mona Saleh'],
  Emergency: ['Dr. Adel Nasser', 'Dr. Grace Joseph'],
};
const SPONSORS = ['Self Pay', 'Self Pay', 'Bahrain National Insurance', 'GIG Gulf', 'AXA Gulf', 'Bapco Corporate', 'Allianz'];

export const ROWS: Record<number, Record<string, any>[]> = {};

const patients: Record<string, any>[] = [];
for (let i = 1; i <= 420; i++) {
  const g = rnd() < 0.52 ? 'Male' : 'Female';
  const dob = daysAgo(int(200, 85 * 365));
  const reg = daysAgo(int(0, 720));
  const age = Math.floor((TODAY.getTime() - new Date(dob).getTime()) / (365.25 * 864e5));
  patients.push({
    PatientId: 'MRN' + pad(100000 + i * 7, 7),
    FullName: `${pick(g === 'Male' ? FIRST_M : FIRST_F)} ${pick(LAST)}`,
    Gender: g,
    DateOfBirth: dob,
    Age: age,
    Nationality: pick(NATIONALITY),
    MobileNo: '+973 3' + pad(int(0, 9999999), 7),
    City: pick(CITY),
    PatientType: pick(['Cash', 'Cash', 'Insurance', 'Insurance', 'Corporate']),
    RegistrationDate: reg,
    RegisteredBy: pick(STAFF),
    IsVip: rnd() < 0.04,
  });
}
ROWS[1] = patients;

const visits: Record<string, any>[] = [];
const bills: Record<string, any>[] = [];
const receipts: Record<string, any>[] = [];
const labs: Record<string, any>[] = [];
let vNo = 1, bNo = 1, rNo = 1, lNo = 1;
const TESTS: [string, string][] = [
  ['Complete Blood Count', 'Haematology'], ['ESR', 'Haematology'], ['HbA1c', 'Biochemistry'],
  ['Lipid Profile', 'Biochemistry'], ['Liver Function Test', 'Biochemistry'], ['Renal Function Test', 'Biochemistry'],
  ['Urine Culture', 'Microbiology'], ['Blood Culture', 'Microbiology'], ['TSH', 'Immunology'], ['Vitamin D', 'Immunology'],
];
for (const p of patients) {
  const n = int(0, 6);
  for (let k = 0; k < n; k++) {
    const dept = pick(DEPTS);
    const vDate = daysAgo(int(0, 365));
    const status = pick(['Consulted', 'Consulted', 'Consulted', 'Consulted', 'Checked-in', 'Cancelled', 'No-show']);
    const fee = pick([10, 15, 20, 25]);
    const v = {
      VisitNo: 'OPV' + pad(vNo++, 6),
      PatientId: p['PatientId'],
      VisitDate: vDate,
      VisitType: dept === 'Emergency' ? 'Emergency' : pick(['New', 'Review', 'Review', 'Referral']),
      Department: dept,
      Doctor: pick(DOCTORS[dept]),
      VisitStatus: status,
      WaitMinutes: status === 'Consulted' ? int(4, 75) : null,
      ConsultationFee: fee,
    };
    visits.push(v);
    if (status !== 'Consulted') continue;
    const gross = fee + int(0, 12) * 5 + (rnd() < 0.3 ? int(20, 180) : 0);
    const discount = rnd() < 0.2 ? Math.round(gross * 0.1) : 0;
    const net = gross - discount;
    const sponsor = p['PatientType'] === 'Cash' ? 'Self Pay' : pick(SPONSORS.slice(2));
    const pShare = sponsor === 'Self Pay' ? net : Math.round(net * 0.2 * 1000) / 1000;
    const bStatus = pick(['Paid', 'Paid', 'Paid', 'Part Paid', 'Unpaid']);
    const b = {
      BillNo: 'OPB' + pad(bNo++, 6),
      PatientId: p['PatientId'],
      VisitNo: v.VisitNo,
      BillDate: vDate,
      BillType: 'OP',
      Department: dept,
      Sponsor: sponsor,
      GrossAmount: gross,
      Discount: discount,
      NetAmount: net,
      PatientShare: pShare,
      SponsorShare: Math.round((net - pShare) * 1000) / 1000,
      BillStatus: bStatus,
    };
    bills.push(b);
    const parts = bStatus === 'Paid' ? int(1, 2) : bStatus === 'Part Paid' ? 1 : 0;
    for (let r = 0; r < parts; r++) {
      receipts.push({
        ReceiptNo: 'RCT' + pad(rNo++, 6),
        BillNo: b.BillNo,
        ReceiptDate: addDays(vDate, r),
        PaymentMode: pick(['Cash', 'Card', 'Card', 'BenefitPay', 'Cheque']),
        Amount: Math.round((bStatus === 'Part Paid' ? pShare / 2 : pShare / parts) * 1000) / 1000,
        Cashier: pick(['Cashier - Rashid', 'Cashier - Neha', 'Cashier - Ameena']),
      });
    }
    if (rnd() < 0.45) {
      const t = pick(TESTS);
      const st = pick(['Verified', 'Verified', 'Verified', 'Resulted', 'In Process', 'Collected', 'Ordered', 'Rejected']);
      labs.push({
        OrderNo: 'LAB' + pad(lNo++, 6),
        PatientId: p['PatientId'],
        VisitNo: v.VisitNo,
        OrderDate: vDate,
        TestName: t[0],
        Section: t[1],
        Priority: dept === 'Emergency' ? 'STAT' : pick(['Routine', 'Routine', 'Routine', 'Urgent']),
        SpecimenStatus: st,
        TatMinutes: st === 'Verified' || st === 'Resulted' ? int(25, 420) : null,
        IsCritical: rnd() < 0.05,
      });
    }
  }
}
ROWS[2] = visits;
ROWS[3] = bills;
ROWS[4] = receipts;
ROWS[5] = labs;

const admissions: Record<string, any>[] = [];
const surgeries: Record<string, any>[] = [];
const PROCS = ['Laparoscopic Cholecystectomy', 'Appendicectomy', 'Total Knee Replacement', 'LSCS', 'Tonsillectomy', 'Hernia Repair', 'ORIF - Radius', 'Cataract Extraction'];
let aNo = 1, cNo = 1;
for (const p of patients) {
  if (rnd() > 0.22) continue;
  const adm = daysAgo(int(0, 360));
  const los = int(1, 12);
  const discharged = daysAgo(0) > addDays(adm, los);
  const a = {
    AdmissionNo: 'IPA' + pad(aNo++, 5),
    PatientId: p['PatientId'],
    AdmissionDate: adm,
    DischargeDate: discharged ? addDays(adm, los) : null,
    AdmissionType: pick(['Elective', 'Elective', 'Emergency']),
    Ward: pick(['Ward 1A - Medical', 'Ward 2B - Surgical', 'Maternity Ward', 'Paediatric Ward', 'ICU']),
    BedCategory: pick(['General', 'General', 'Semi-Private', 'Private', 'ICU']),
    AttendingDoctor: pick(Object.values(DOCTORS).flat()),
    LengthOfStay: discharged ? los : Math.max(0, Math.round((TODAY.getTime() - new Date(adm).getTime()) / 864e5)),
    AdmissionStatus: discharged ? 'Discharged' : 'Admitted',
  };
  admissions.push(a);
  if (rnd() < 0.6) {
    surgeries.push({
      CaseNo: 'OTC' + pad(cNo++, 5),
      PatientId: p['PatientId'],
      AdmissionNo: a.AdmissionNo,
      SurgeryDate: addDays(adm, int(0, 1)),
      Procedure: pick(PROCS),
      Theatre: pick(['OT-1', 'OT-2', 'OT-3', 'OT-4']),
      Surgeon: pick(['Dr. Tariq Aziz', 'Dr. Paul Mathew', 'Dr. Noor Al-Qassab', 'Dr. Kamal Yusuf', 'Dr. Faris Al-Hamar']),
      AnaesthesiaType: pick(['General', 'General', 'Spinal', 'Regional Block', 'Local', 'Sedation']),
      DurationMinutes: int(25, 240),
      CaseStatus: pick(['Completed', 'Completed', 'Completed', 'Completed', 'Scheduled', 'Cancelled', 'Postponed']),
    });
  }
}
ROWS[6] = admissions;
ROWS[7] = surgeries;

const DRUGS: [string, string, number][] = [
  ['Paracetamol 500mg Tab', 'Analgesic', 0.05], ['Amoxicillin 500mg Cap', 'Antibiotic', 0.18],
  ['Metformin 500mg Tab', 'Antidiabetic', 0.08], ['Atorvastatin 20mg Tab', 'Cardiovascular', 0.22],
  ['Omeprazole 20mg Cap', 'Gastrointestinal', 0.12], ['Salbutamol Inhaler', 'Respiratory', 2.4],
  ['Insulin Glargine Pen', 'Antidiabetic', 9.5], ['Ceftriaxone 1g Inj', 'Antibiotic', 1.8],
];
const dispensing: Record<string, any>[] = [];
let dNo = 1;
for (const v of visits) {
  if (v['VisitStatus'] !== 'Consulted' || rnd() > 0.5) continue;
  const d = pick(DRUGS);
  const qty = pick([10, 14, 20, 28, 30, 1, 2]);
  dispensing.push({
    DispenseNo: 'PHD' + pad(dNo++, 6),
    PatientId: v['PatientId'],
    DispenseDate: v['VisitDate'],
    Store: 'OP Pharmacy',
    DrugName: d[0],
    DrugCategory: d[1],
    Quantity: qty,
    Amount: Math.round(qty * d[2] * 1000) / 1000,
    Pharmacist: pick(['Pharm. Sneha', 'Pharm. Abbas', 'Pharm. Rincy']),
  });
}
ROWS[8] = dispensing;

// Related values, one per row
for (const p of patients) {
  const vs = visits.filter((v) => v['PatientId'] === p['PatientId']);
  p['LatestVisitDate'] = vs.length ? vs.map((v) => v['VisitDate']).sort().at(-1) : null;
  p['VisitCount12m'] = vs.filter((v) => v['VisitDate'] >= daysAgo(365)).length;
  p['OutstandingBalance'] = Math.round(bills.filter((b) => b['PatientId'] === p['PatientId'] && b['BillStatus'] !== 'Paid')
    .reduce((s, b) => s + (b['BillStatus'] === 'Part Paid' ? b['PatientShare'] / 2 : b['PatientShare']), 0) * 1000) / 1000;
}
for (const b of bills) b['SponsorCategory'] = b['Sponsor'] === 'Self Pay' ? 'Cash' : b['Sponsor'] === 'Bapco Corporate' ? 'Corporate' : 'Insurance';

export const USERS = [
  { userId: 'me', name: 'Gokul M', department: 'Administration' },
  { userId: 'rasool', name: 'Pattan Rasool', department: 'IT' },
  { userId: 'thulasi', name: 'Thulasiram R', department: 'IT' },
  { userId: 'saravana', name: 'Saravana Kumar', department: 'Finance' },
  { userId: 'murali', name: 'Murali P S', department: 'Management' },
  { userId: 'asma', name: 'Asma (Reception)', department: 'Front Office' },
];

// ---------- seeded saved reports ----------
const F = fieldIdOf;
const now = new Date().toISOString();
export const SEED_REPORTS: SavedReportDetailDto[] = [
  {
    reportId: 'rpt-daily-collection',
    name: 'Daily Collection by Payment Mode',
    description: 'Receipt totals per payment mode, for the cash counter close.',
    moduleId: 2, ownerId: 'me', ownerName: 'Gokul M', isShared: true, isTemplate: false, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'Daily Collection by Payment Mode', moduleId: 2, mode: 'preview', layoutType: 'ChartAndTable',
      parameters: [
        { paramId: 'fromDate', label: 'From date', dataType: 'Date', defaultValue: '2026-09-01' },
        { paramId: 'toDate', label: 'To date', dataType: 'Date', defaultValue: '2026-09-24' },
        { paramId: 'cashier', label: 'Cashier', dataType: 'String', defaultValue: '', entityFieldId: F(4, 'Cashier') },
        { paramId: 'mode', label: 'Payment mode', dataType: 'String', defaultValue: '', entityFieldId: F(4, 'PaymentMode') },
      ],
      chartConfig: { chartType: 'bar', labelField: 'Payment Mode', dataFields: ['Total of Amount Received'] },
      dataConfiguration: {
        primaryEntityId: 4,
        selectedFields: [
          { fieldId: F(4, 'PaymentMode'), label: 'Payment Mode' },
          { fieldId: F(4, 'ReceiptNo'), label: 'Count of Receipt No', aggregate: 'Count' },
          { fieldId: F(4, 'Amount'), label: 'Total of Amount Received', aggregate: 'Sum', formatPattern: 'n2' },
        ],
        groupings: [F(4, 'PaymentMode')],
        filterGroup: { logic: 'and', filters: [
          { fieldId: F(4, 'ReceiptDate'), operator: 'between', value: ['@fromDate', '@toDate'] },
          { fieldId: F(4, 'Cashier'), operator: 'eq', value: '@cashier' },
          { fieldId: F(4, 'PaymentMode'), operator: 'eq', value: '@mode' },
        ] },
        sortings: [{ fieldId: F(4, 'Amount'), direction: 'DESC' }],
      },
    },
  },
  {
    reportId: 'rpt-op-visits-dept',
    name: 'OP Visits by Department',
    description: 'Consulted visits and average wait per department.',
    moduleId: 1, ownerId: 'me', ownerName: 'Gokul M', isShared: false, isTemplate: false, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'OP Visits by Department', moduleId: 1, mode: 'preview', layoutType: 'Table',
      parameters: [
        { paramId: 'fromDate', label: 'From date', dataType: 'Date', defaultValue: '2026-08-01' },
        { paramId: 'toDate', label: 'To date', dataType: 'Date', defaultValue: '2026-09-24' },
        { paramId: 'visitType', label: 'Visit type', dataType: 'String', defaultValue: '', entityFieldId: F(2, 'VisitType') },
      ],
      conditionalFormats: [{ targetColumn: 'Average of Wait Time (min)', operator: 'gt', value: '40', backgroundColor: '#fdecea', textColor: '#b42318' }],
      dataConfiguration: {
        primaryEntityId: 2,
        selectedFields: [
          { fieldId: F(2, 'Department'), label: 'Department' },
          { fieldId: F(2, 'VisitNo'), label: 'Count of Visit No', aggregate: 'Count' },
          { fieldId: F(2, 'WaitMinutes'), label: 'Average of Wait Time (min)', aggregate: 'Avg', formatPattern: 'n0' },
        ],
        groupings: [F(2, 'Department')],
        filterGroup: { logic: 'and', filters: [
          { fieldId: F(2, 'VisitStatus'), operator: 'eq', value: 'Consulted' },
          { fieldId: F(2, 'VisitDate'), operator: 'between', value: ['@fromDate', '@toDate'] },
          { fieldId: F(2, 'VisitType'), operator: 'eq', value: '@visitType' },
        ] },
        sortings: [{ fieldId: F(2, 'VisitNo'), direction: 'DESC' }],
      },
    },
  },
  {
    reportId: 'rpt-unpaid-bills',
    name: 'Outstanding OP Bills',
    description: 'Unpaid and part-paid bills with patient details.',
    moduleId: 2, ownerId: 'me', ownerName: 'Gokul M', isShared: true, isTemplate: false, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'Outstanding OP Bills', moduleId: 2, mode: 'preview', layoutType: 'Table',
      parameters: [
        { paramId: 'fromDate', label: 'From date', dataType: 'Date', defaultValue: '2026-01-01' },
        { paramId: 'toDate', label: 'To date', dataType: 'Date', defaultValue: '2026-09-24' },
        { paramId: 'dept', label: 'Department', dataType: 'String', defaultValue: '', entityFieldId: F(3, 'Department') },
        { paramId: 'sponsor', label: 'Sponsor', dataType: 'String', defaultValue: '', entityFieldId: F(3, 'Sponsor') },
      ],
      dataConfiguration: {
        primaryEntityId: 3,
        selectedFields: [
          { fieldId: F(3, 'BillNo'), label: 'Bill No' },
          { fieldId: F(3, 'BillDate'), label: 'Bill Date', formatPattern: 'medium' },
          { fieldId: F(3, 'PatientId'), label: 'Patient ID' },
          { fieldId: F(3, 'Department'), label: 'Department' },
          { fieldId: F(3, 'PatientShare'), label: 'Patient Share', formatPattern: 'n2' },
          { fieldId: F(3, 'BillStatus'), label: 'Bill Status' },
        ],
        filterGroup: { logic: 'and', filters: [
          { fieldId: F(3, 'BillStatus'), operator: 'in', value: ['Unpaid', 'Part Paid'] },
          { fieldId: F(3, 'BillDate'), operator: 'between', value: ['@fromDate', '@toDate'] },
          { fieldId: F(3, 'Department'), operator: 'eq', value: '@dept' },
          { fieldId: F(3, 'Sponsor'), operator: 'eq', value: '@sponsor' },
        ] },
        sortings: [{ fieldId: F(3, 'BillDate'), direction: 'DESC' }],
      },
    },
  },
  {
    reportId: 'rpt-revenue-sponsor',
    name: 'Revenue by Sponsor',
    description: 'Bills under each sponsor with a subtotal per sponsor and a grand total.',
    moduleId: 2, ownerId: 'me', ownerName: 'Gokul M', isShared: false, isTemplate: false, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'Revenue by Sponsor', moduleId: 2, mode: 'preview', layoutType: 'Table',
      parameters: [
        { paramId: 'fromDate', label: 'From date', dataType: 'Date', defaultValue: '2026-09-01' },
        { paramId: 'toDate', label: 'To date', dataType: 'Date', defaultValue: '2026-09-24' },
      ],
      dataConfiguration: {
        primaryEntityId: 3,
        groupingMode: 'detail',
        selectedFields: [
          { fieldId: F(3, 'Sponsor'), label: 'Sponsor' },
          { fieldId: F(3, 'BillNo'), label: 'Bill No', aggregate: 'Count' },
          { fieldId: F(3, 'Department'), label: 'Department' },
          { fieldId: F(3, 'NetAmount'), label: 'Net Amount', aggregate: 'Sum', formatPattern: 'c2' },
        ],
        groupings: [F(3, 'Sponsor')],
        filterGroup: { logic: 'and', filters: [{ fieldId: F(3, 'BillDate'), operator: 'between', value: ['@fromDate', '@toDate'] }] },
        sortings: [{ fieldId: F(3, 'NetAmount'), direction: 'DESC' }],
      },
    },
  },
  {
    reportId: 'rpt-rasool-lab',
    name: 'Critical Lab Results',
    description: 'Critical results by section. Shared with you by Pattan Rasool.',
    moduleId: 3, ownerId: 'rasool', ownerName: 'Pattan Rasool', isShared: true, sharedWith: ['me'], isTemplate: false, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'Critical Lab Results', moduleId: 3, mode: 'preview', layoutType: 'Table',
      dataConfiguration: {
        primaryEntityId: 5,
        selectedFields: [
          { fieldId: F(5, 'OrderNo'), label: 'Order No' },
          { fieldId: F(5, 'OrderDate'), label: 'Order Date', formatPattern: 'medium' },
          { fieldId: F(5, 'TestName'), label: 'Test Name' },
          { fieldId: F(5, 'Section'), label: 'Lab Section' },
          { fieldId: F(5, 'Priority'), label: 'Priority' },
        ],
        filterGroup: { logic: 'and', filters: [{ fieldId: F(5, 'IsCritical'), operator: 'eq', value: true }] },
        sortings: [{ fieldId: F(5, 'OrderDate'), direction: 'DESC' }],
      },
    },
  },
  {
    reportId: 'rpt-withdrawn',
    name: 'Patient Registrations (old)',
    description: 'Saved before the Referral Source column was withdrawn from the catalogue.',
    moduleId: 1, ownerId: 'me', ownerName: 'Gokul M', isShared: false, isTemplate: false, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'Patient Registrations (old)', moduleId: 1, mode: 'preview', layoutType: 'Table',
      dataConfiguration: {
        primaryEntityId: 1,
        selectedFields: [
          { fieldId: F(1, 'PatientId'), label: 'Patient ID' },
          { fieldId: F(1, 'FullName'), label: 'Patient Name' },
          { fieldId: 9001, label: 'Referral Source' },
          { fieldId: F(1, 'RegistrationDate'), label: 'Registration Date' },
          { fieldId: F(1, 'OutstandingBalance'), label: 'Outstanding Balance', formatPattern: 'c2' },
          { fieldId: F(1, 'LatestVisitDate'), label: 'Latest Visit Date' },
        ],
        sortings: [{ fieldId: F(1, 'RegistrationDate'), direction: 'DESC' }],
      },
    },
  },
  {
    reportId: 'tpl-lab-tat',
    name: 'Lab Turnaround by Section',
    description: 'Average and worst TAT per lab section. Start here for any TAT report.',
    moduleId: 3, ownerId: 'admin', ownerName: 'Reporting Admin', isShared: true, isTemplate: true, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'Lab Turnaround by Section', moduleId: 3, mode: 'preview', layoutType: 'ChartAndTable',
      chartConfig: { chartType: 'bar', labelField: 'Lab Section', dataFields: ['Average of Turnaround Time (min)'] },
      dataConfiguration: {
        primaryEntityId: 5,
        selectedFields: [
          { fieldId: F(5, 'Section'), label: 'Lab Section' },
          { fieldId: F(5, 'TatMinutes'), label: 'Average of Turnaround Time (min)', aggregate: 'Avg', formatPattern: 'n0' },
        ],
        groupings: [F(5, 'Section')],
      },
    },
  },
  {
    reportId: 'tpl-ot-utilisation',
    name: 'Theatre Utilisation',
    description: 'Completed cases and theatre minutes per OT.',
    moduleId: 5, ownerId: 'admin', ownerName: 'Reporting Admin', isShared: true, isTemplate: true, createdAt: now, modifiedAt: now,
    configuration: {
      title: 'Theatre Utilisation', moduleId: 5, mode: 'preview', layoutType: 'Table',
      dataConfiguration: {
        primaryEntityId: 7,
        selectedFields: [
          { fieldId: F(7, 'Theatre'), label: 'Theatre' },
          { fieldId: F(7, 'CaseNo'), label: 'Count of OT Case No', aggregate: 'Count' },
          { fieldId: F(7, 'DurationMinutes'), label: 'Total of Duration (min)', aggregate: 'Sum' },
        ],
        groupings: [F(7, 'Theatre')],
        filterGroup: { logic: 'and', filters: [{ fieldId: F(7, 'CaseStatus'), operator: 'eq', value: 'Completed' }] },
      },
    },
  },
];

export const SEED_SCHEDULES: ReportScheduleDto[] = [
  {
    scheduleId: 'sch-daily-collection', reportId: 'rpt-daily-collection', reportName: 'Daily Collection by Payment Mode', moduleId: 2,
    frequency: 'Daily', time: '06:00', dateRange: 'Previous day', parameters: { cashier: '', mode: '' },
    deliverNotification: true, deliverEmail: true, emails: 'finance@medinousqa.com', format: 'Excel',
    active: true, nextRun: '2026-09-29T06:00:00', lastRun: '2026-09-28T06:00:00', lastStatus: 'Delivered',
  },
  {
    scheduleId: 'sch-outstanding', reportId: 'rpt-unpaid-bills', reportName: 'Outstanding OP Bills', moduleId: 2,
    frequency: 'Monthly', time: '07:30', dayOfMonth: 1, dateRange: 'Previous month', parameters: { dept: '', sponsor: '' },
    deliverNotification: true, deliverEmail: false, emails: '', format: 'PDF',
    active: false, nextRun: '2026-10-01T07:30:00', lastRun: '2026-09-01T07:30:00', lastStatus: 'Delivered',
  },
];

/** Published reports (PRD 6.11): live reports re-run; snapshots hold a stored result. */
export const SEED_PUBLICATIONS: PublicationDto[] = [
  { publicationId: 'pub-coll', reportId: 'rpt-daily-collection', reportName: 'Daily Collection by Payment Mode', description: 'Receipt totals per payment mode, for the cash counter close.', moduleId: 2, type: 'live', publishedBy: 'Gokul M', publishedAt: '2026-09-20T09:00:00' },
  { publicationId: 'pub-out', reportId: 'rpt-unpaid-bills', reportName: 'Outstanding OP Bills', description: 'Unpaid and part-paid bills with patient details.', moduleId: 2, type: 'live', publishedBy: 'Gokul M', publishedAt: '2026-09-20T09:05:00' },
  { publicationId: 'pub-rev', reportId: 'rpt-revenue-sponsor', reportName: 'Revenue by Sponsor', description: 'Bills under each sponsor with subtotals and a grand total.', moduleId: 2, type: 'live', publishedBy: 'Gokul M', publishedAt: '2026-09-22T10:00:00' },
  { publicationId: 'pub-opv', reportId: 'rpt-op-visits-dept', reportName: 'OP Visits by Department', description: 'Consulted visits and average wait per department.', moduleId: 1, type: 'live', publishedBy: 'Gokul M', publishedAt: '2026-09-21T11:00:00' },
  { publicationId: 'pub-reg', reportId: 'rpt-withdrawn', reportName: 'Patient Registrations (old)', description: 'Registered patients with balance and latest visit.', moduleId: 1, type: 'live', publishedBy: 'Gokul M', publishedAt: '2026-09-10T08:00:00' },
];
