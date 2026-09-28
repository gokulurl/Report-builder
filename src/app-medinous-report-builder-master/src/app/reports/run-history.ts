/** Per-user memory of the last run of each report (parameter values + time). Browser-only for now. */
export interface LastRun {
  at: string;
  params: Record<string, any>;
}

const KEY = 'report-last-runs-v1';

function readAll(): Record<string, LastRun> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function getLastRun(reportId: string): LastRun | undefined {
  return readAll()[reportId];
}

export function getAllLastRuns(): Record<string, LastRun> {
  return readAll();
}

export function saveLastRun(reportId: string, params: Record<string, any>) {
  const all = readAll();
  all[reportId] = { at: new Date().toISOString(), params };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
