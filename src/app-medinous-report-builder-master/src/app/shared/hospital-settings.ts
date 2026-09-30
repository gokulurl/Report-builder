/**
 * Hospital-level display settings (PRD 6.3: "Currency and date order follow hospital settings").
 * Hard-coded for the demo tenant; in Fusion these come from the hospital configuration.
 */
export const HOSPITAL = {
  name: 'Medinous QA Clinic',
  currency: 'KD',
  currencyDecimals: 3,
  locale: 'en-GB',
  userName: 'Gokul M',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "29 Sep 2026" — the hospital's medium date. */
export function mediumDate(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "30 Sep 2026 14:22" */
export function mediumDateTime(d: Date) {
  return `${mediumDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function money(n: number, decimals = HOSPITAL.currencyDecimals) {
  return `${HOSPITAL.currency} ${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
