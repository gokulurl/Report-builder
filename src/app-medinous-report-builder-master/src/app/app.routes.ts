import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'reports' },
  { path: 'reports', loadComponent: () => import('./reports/reports-list').then((m) => m.ReportsList) },
  { path: 'reports/:id', loadComponent: () => import('./reports/report-run').then((m) => m.ReportRun) },
  { path: 'schedules', loadComponent: () => import('./reports/my-schedules').then((m) => m.MySchedules) },
  {
    path: 'builder',
    loadComponent: () => import('./report-builder/report-builder').then((m) => m.ReportBuilder),
    // Unsaved builder work asks before it's thrown away
    canDeactivate: [(c: { canLeave: () => boolean }) => c.canLeave()],
  },
  { path: '**', redirectTo: 'reports' },
];
