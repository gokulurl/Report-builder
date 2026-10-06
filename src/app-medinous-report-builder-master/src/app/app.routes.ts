import { Routes } from '@angular/router';

/**
 * Two entry points: /reports for staff (billing staff in this prototype) and /it for IT administrators.
 * Criteria and result screens are shared; the signed-in role decides where "back" goes.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'reports' },
  { path: 'reports', loadComponent: () => import('./rb/home').then((m) => m.RbHome) },
  { path: 'it', loadComponent: () => import('./rb/templates').then((m) => m.RbTemplates) },
  { path: 'it/builder/:id', loadComponent: () => import('./rb/builder').then((m) => m.RbBuilder) },
  { path: 'run/:kind/:id', loadComponent: () => import('./rb/criteria').then((m) => m.RbCriteria) },
  { path: 'result/:id', loadComponent: () => import('./rb/result').then((m) => m.RbResult) },
  { path: '**', redirectTo: 'reports' },
];
