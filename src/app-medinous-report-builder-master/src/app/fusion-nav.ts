/**
 * The Fusion left rail, per module, as the live product has it (qa.medinousfusion.com, 17 Nov 2026).
 * Items marked `added` are the only changes this work makes to the rail.
 * Icons are the product's own assets/svg files (copied to public/fusion for the prototype).
 */
export type ModuleName = 'Billing' | 'Application Setup';
export type RailItem = { key: string; label: string; icon: string; path: string; added?: boolean };

const fz = (mod: string, key: string, label: string, icon: string): RailItem => ({ key, label, icon, path: `/fusion/${mod}/${key}` });

export const RAIL: Record<ModuleName, RailItem[]> = {
  Billing: [
    fz('billing', 'collections', 'Collections', 'op-billing'),
    fz('billing', 'closing', 'Closing', 'closing'),
    fz('billing', 'queue', 'Queue', 'dashboard'),
    fz('billing', 'insurance-desk', 'Insurance desk', 'insurance-desk'),
    fz('billing', 'claim-processing', 'Claim processing', 'claim-process'),
    fz('billing', 'reporting', 'Reporting', 'Reporting'),
    // Added: staff reports, beside the fixed Reporting screens. Every module that has templates gets one.
    { key: 'my-reports', label: 'My reports', icon: 'my-reports', path: '/reports', added: true },
    fz('billing', 'master-screens', 'Master screens', 'master-data'),
    fz('billing', 'nphies', 'NPHIES', 'claim-process'),
  ],
  'Application Setup': [
    fz('setup', 'user-mgmt', 'User mgmt', 'user-management'),
    fz('setup', 'admin-mgmt', 'Admin mgmt', 'master-data'),
    fz('setup', 'master-screens', 'Master screens', 'master-data'),
    // Added: IT builds and publishes templates here. IT only.
    { key: 'report-builder', label: 'Report builder', icon: 'report-builder', path: '/it', added: true },
  ],
};

/** Switch Module's list, in the live product's order. */
export const MODULES = [
  'Application Setup', 'Billing', 'Claims & Remittance', 'General Stores', 'IP Management', 'Laboratory',
  'OP Nursing', 'Operation Theatre', 'Pharmacy', 'Radiology', 'Registration',
];

/** Billing → Reporting's fixed reports, as listed on the live screen. They stay; My reports sits beside them. */
export const FIXED_REPORTS = [
  'Collection Report - Main Cashier', 'Collection Report - User Wise', 'Invoice Print', 'Receipt Print', 'Re-print Receipt',
  'Insurance Invoice List', 'Invoice Discount Report', 'Patient Debit Report', 'Gross/Net Revenue Report', 'Advance Balance Report',
  'Doctor Collection Report', 'Dynamic Reporting Tool', 'Patient Statement Report', 'Advance Receipts Adjusted Report',
  'Consolidated Collection Report', 'Provisional Bill Report', 'Invoice Claim Report',
];
