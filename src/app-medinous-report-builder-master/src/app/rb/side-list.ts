import { Component, ElementRef, HostListener, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore } from './store';
import { ENTITIES, MyReport, PRESETS, Template } from './engine';
import { altLetter, overlayOpen } from './viewport';
import { isLockSum, shortPeriod } from './staff';

type Row = { key: string; name: string; sub: string; badge: string; tone: string; fav?: boolean; open: () => void };

/** Registration's patient list, for reports (medinous-registration-v2/src/app/ui/patient-list).
 *  The list stays beside the open report, so the next one is a click away rather than a trip
 *  back to the dashboard. Staff see their reports; IT administrators see the templates.
 *  Same parts as Registration: heading with + New and fold, one search, a segmented filter,
 *  rows with a dot badge, a rail when folded. Folders are a tab on My reports, not here. */
@Component({
  selector: 'rb-side-list',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  host: { '[class.folded]': 's.listFolded()' },
  template: `
    @if (s.listFolded()) {
      <button type="button" class="pl-rail" (click)="s.listFolded.set(false)" [attr.aria-label]="'Expand the ' + noun().toLowerCase() + ' list'"
              [title]="'Expand the ' + noun().toLowerCase() + ' list'" aria-expanded="false">
        <mat-icon>keyboard_double_arrow_right</mat-icon>
        <span class="pl-rail-count">{{ rows().length }}</span>
        <span class="pl-rail-label">{{ noun() }}</span>
      </button>
    } @else {
      <div class="pl-head">
        <div class="pl-top">
          <h2>{{ noun() }}</h2>
          <button type="button" class="pl-link" (click)="addNew()" [matTooltip]="admin() ? 'New template (Alt+N)' : 'New report from your last assigned report (Alt+N)'" aria-keyshortcuts="Alt+N">
            <mat-icon>add</mat-icon><span>New</span></button>
          <button type="button" class="fx-icon-btn" (click)="s.listFolded.set(true)" [attr.aria-label]="'Collapse the ' + noun().toLowerCase() + ' list'"
                  [title]="'Collapse the ' + noun().toLowerCase() + ' list'" aria-expanded="true"><mat-icon>keyboard_double_arrow_left</mat-icon></button>
        </div>
        <label class="pl-search">
          <mat-icon>search</mat-icon>
          <input [matTooltip]="admin() ? 'Search all templates by name (Ctrl+F)' : 'Search all your reports by name (Ctrl+F)'" #box type="search" autocomplete="off" [attr.aria-label]="'Find ' + noun().toLowerCase()" [placeholder]="admin() ? 'Template name' : 'Report name'"
                 [ngModel]="q()" (ngModelChange)="q.set($event)" />
          @if (q()) { <button type="button" class="fx-icon-btn sm" aria-label="Clear" (click)="q.set('')"><mat-icon>close</mat-icon></button> }
        </label>
        @if (!q()) {
          <div class="pl-seg" role="radiogroup" aria-label="Show">
            @for (f of filters(); track f) {
              <button [matTooltip]="f === 'Shared' ? 'Reports colleagues shared with you' : ''" type="button" role="radio" [attr.aria-checked]="cur() === f" (click)="filter.set(f)">{{ f }}</button>
            }
          </div>
          <!-- Folders live in their own tab on My reports (Shrunkal, 17 Nov) -->
        }
      </div>
      <div class="pl-rows" role="listbox" [attr.aria-label]="noun()">
        @for (r of rows(); track r.key) {
          <button type="button" role="option" class="pl-row" [class.on]="r.key === selected()" [attr.aria-selected]="r.key === selected()" (click)="r.open()">
            <mat-icon class="pl-ic" [class.fav]="r.fav">{{ r.fav ? 'star' : admin() ? 'table_chart' : 'description' }}</mat-icon>
            <span class="grow"><b>{{ r.name }}</b><small>{{ r.sub }}</small></span>
            @if (r.badge) { <span class="pl-badge" [class]="'pl-badge ' + r.tone" [matTooltip]="badgeTip(r.badge)">{{ r.badge }}</span> }
          </button>
        } @empty {
          <p class="pl-empty">{{ q() ? 'Nothing matches that.' : emptyText() }}</p>
        }
      </div>
    }
  `,
})
export class RbSideList {
  /** Only the badges whose word needs a sentence; Scheduled, Published and Draft say it themselves. */
  badgeTip(b: string) {
    return ({ Failed: 'Last scheduled delivery failed. Run it again from the Scheduled tab', Summary: 'Shows grouped totals, not each line',
      Removed: 'Hidden from staff. Restore it from Show removed' } as Record<string, string>)[b] || '';
  }
  s = inject(RbStore);
  private router = inject(Router);
  /** "rep:m1" or "tpl:t1": the row that is open. */
  selected = input('');
  get q() { return this.s.listQuery; }
  get filter() { return this.s.listFilter; }
  showRemoved = signal(false);
  private box = viewChild<ElementRef<HTMLInputElement>>('box');

  admin = computed(() => this.s.role() === 'admin');
  noun = computed(() => (this.admin() ? 'Templates' : 'Reports'));
  filters = computed(() => (this.admin() ? ['All', 'Published', 'Draft'] : ['My reports', 'Favourites', 'Shared']));
  /** The filter in force: what was picked, if this role has it, else the first. */
  cur = computed(() => (this.filters().includes(this.filter()) ? this.filter() : this.filters()[0]));
  emptyText = computed(() => {
    const f = this.cur();
    if (f === 'Favourites') return 'No favourites yet. Star a report to keep it here.';
    if (f === 'Shared') return 'Nothing shared with you yet.';
    return this.admin() ? 'No templates.' : 'No reports yet. Use New to start one from an assigned report.';
  });

  rows = computed<Row[]>(() => {
    this.s.rev();
    const q = this.q().trim().toLowerCase();
    const has = (t: string) => !q || t.toLowerCase().includes(q);
    if (this.admin()) {
      const f = this.cur();
      return this.s.templates
        .filter((t) => (this.showRemoved() || !t.removed) && (q || f === 'All' || (f === 'Published') === (t.status === 'published')) && has(t.title))
        .map((t) => this.tplRow(t));
    }
    const f = this.cur();
    return this.s.reps
      .filter((r) => {
        if (!has(r.name)) return false;
        if (q) return true;
        if (f === 'Favourites') return !!r.fav;
        if (f === 'Shared') return r.owner !== 'me';
        return r.owner === 'me';
      })
      .map((r) => this.repRow(r));
  });

  private repRow(r: MyReport): Row {
    const sched = this.s.scheds.find((x) => x.src === r.id && x.on);
    const failed = this.s.scheds.some((x) => x.src === r.id && x.last && !x.last.ok);
    const sum = r.view === 'summary' || isLockSum(this.s.tpl(r.tid));
    return {
      key: 'rep:' + r.id, name: r.name, fav: !!r.fav,
      sub: r.owner === 'me' ? shortPeriod(r.period, PRESETS) : 'Shared by ' + r.owner,
      badge: failed ? 'Failed' : sched ? 'Scheduled' : sum ? 'Summary' : '',
      tone: failed ? 'danger' : sched ? 'ok' : 'info',
      open: () => this.router.navigate(['/report', 'rep', r.id]),
    };
  }
  private tplRow(t: Template): Row {
    return {
      key: 'tpl:' + t.id, name: t.title, sub: t.module + ' · ' + (ENTITIES[t.module]?.find((e) => e.id === t.entity)?.name || t.entity),
      badge: t.removed ? 'Removed' : t.status === 'draft' ? 'Draft' : '',   // the exception only: a list of 'Published' says nothing
      tone: t.removed ? 'mute' : t.status === 'draft' ? 'warn' : 'ok',
      open: () => this.router.navigate(['/it/builder', t.id]),
    };
  }
  /** Registration's + Add new: for staff, a report from the last assigned report used; for IT, a new template. */
  addNew() {
    if (this.admin()) { this.router.navigate(['/it'], { queryParams: { new: 1 } }); return; }
    this.router.navigate(['/report', 'tpl', this.s.lastTemplate || this.s.library()[0].id]);
  }

  /** Alt+N is + New, on every screen. The list's one search: Ctrl+F reaches it from anywhere, unfolding the list first (as in Registration). */
  @HostListener('document:keydown', ['$event']) onKey(e: KeyboardEvent) {
    if (altLetter(e) === 'n' && !overlayOpen()) { e.preventDefault(); this.addNew(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault(); this.s.listFolded.set(false);
      setTimeout(() => this.box()?.nativeElement.focus());
    }
  }
}
