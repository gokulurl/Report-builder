import { Routes } from '@angular/router';

/**
 * Two entry points: /reports for staff (billing staff in this prototype) and /it for IT administrators.
 * A report opens at /report/rep/:id (a saved report) or /report/tpl/:id (straight from a template, unsaved).
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'reports' },
  { path: 'reports', loadComponent: () => import('./rb/list').then((m) => m.RbList) },
  { path: 'report/:kind/:id', loadComponent: () => import('./rb/doc').then((m) => m.RbDoc) },
  { path: 'it', loadComponent: () => import('./rb/templates').then((m) => m.RbTemplates) },
  { path: 'it/builder/:id', loadComponent: () => import('./rb/builder').then((m) => m.RbBuilder) },
  { path: 'run/:kind/:id', redirectTo: 'report/:kind/:id' },
  { path: '**', redirectTo: 'reports' },
];
