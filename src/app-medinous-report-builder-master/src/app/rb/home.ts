import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore, Result } from './store';
import { MyReport, Template, fdate, hm } from './engine';
import { RbDialog } from './ui';
import { ShareDialog } from './share-dialog';

type Tab = 'reports' | 'results' | 'sched';

/** Staff home: the module's report library with each person's saved versions underneath, their results and schedules. */
@Component({
  selector: 'rb-home',
  imports: [NgTemplateOutlet, FormsModule, MatIconModule, MatTooltipModule, RbDialog, ShareDialog],
  template: `
    <div class="rb-page" [attr.data-rev]="s.rev()">
      <div class="rb-dhead">
        <div><h1>Billing reports</h1>
          <p class="muted">Open a report, choose the period and criteria, then run it. Your saved versions sit under each report and run in one click.</p></div>
      </div>
      <section class="fx-card rb-list">
        <div class="rb-htabs" role="tablist">
          @for (t of tabs(); track t.k) {
            <button role="tab" class="rb-htab" [class.on]="tab() === t.k" [attr.aria-selected]="tab() === t.k" (click)="setTab(t.k)">{{ t.l }}<span class="cnt">{{ t.n }}</span></button>
          }
          <label class="fx-search rb-hsearch"><mat-icon>search</mat-icon><input [(ngModel)]="q" placeholder="Search reports" aria-label="Search reports" /></label>
        </div>

        @switch (tab()) {
          @case ('reports') {
            @for (t of library(); track t.id) {
              @let mine = versions(t);
              @if (hit(t.title + ' ' + t.desc) || mine.length) {
                <div class="rb-tgroup">
                  <div class="rb-row">
                    <button class="fx-icon-btn rb-star" [class.on]="s.fav.has(t.id)" (click)="toggleFav(t.id)" [attr.aria-label]="s.fav.has(t.id) ? 'Remove from favourites' : 'Add to favourites'" [attr.aria-pressed]="s.fav.has(t.id)"><mat-icon>{{ s.fav.has(t.id) ? 'star' : 'star_border' }}</mat-icon></button>
                    <div class="rb-rmain">
                      <button class="rb-rt" (click)="open('tpl', t.id)">{{ t.title }}</button>
                      @if (t.display.mode !== 'table') { <span class="rb-tag mute">With chart</span> }
                      @if (t.heavy) { <span class="rb-tag run">Often runs in background</span> }
                      <div class="rb-rd">{{ t.desc }}@if (t.scope.length) {. Always limited to {{ s.scopeText(t) }}}</div>
                      <ng-container *ngTemplateOutlet="last; context: { $implicit: t.id }" />
                    </div>
                    <div class="rb-racts"><button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="open('tpl', t.id)">Open</button></div>
                  </div>
                  @for (r of mine; track r.id) {
                    <div class="rb-row sub">
                      <div class="rb-rmain">
                        <button class="rb-rt" (click)="open('rep', r.id)">{{ r.name }}</button>
                        @if (r.owner === 'me') { <span class="rb-tag mute">My version</span>@if (s.shareText(r)) { <span class="rb-tag run">{{ s.shareText(r) }}</span> } }
                        @else { <span class="rb-tag vio">Shared by {{ r.owner.split(' ')[0] }}</span> }
                        <div class="rb-strip"><mat-icon>event</mat-icon><span>{{ s.strip(t, r) }}</span></div>
                        <ng-container *ngTemplateOutlet="last; context: { $implicit: r.id }" />
                      </div>
                      <div class="rb-racts">
                        @if (r.owner === 'me') {
                          <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="sharing.set(r)" matTooltip="Share" aria-label="Share"><mat-icon>ios_share</mat-icon></button>
                          <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="deleting.set(r)" matTooltip="Delete my version" aria-label="Delete my version"><mat-icon>delete_outline</mat-icon></button>
                        }
                        <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="open('rep', r.id)">Open</button>
                        <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="s.runRep(r.id)"><mat-icon>play_arrow</mat-icon>Run</button>
                      </div>
                    </div>
                  }
                </div>
              }
            } @empty { <div class="rb-empty"><b>No reports here yet</b>IT publishes reports to Billing from the Report builder.</div> }
            @if (library().length && !anyHit()) { <div class="rb-empty"><b>No reports match</b>Try a different search.</div> }
          }
          @case ('results') {
            <div class="rb-subtabs">
              <span class="fx-seg sm">
                @for (f of [['all', 'All'], ['running', 'Running'], ['kept', 'Kept']]; track f[0]) {
                  <button [class.on]="rf() === f[0]" (click)="rf.set(f[0])">{{ f[1] }}</button>
                }
              </span>
              <span class="muted tiny">Every report you have run. Results expire after a while unless you keep them.</span>
            </div>
            @for (r of resultList(); track r.id) {
              <div class="rb-row">
                <div class="rb-rmain">
                  <div class="rb-rt static">{{ r.savedName || r.name }}
                    @if (r.status === 'running') { <span class="rb-tag run">Running {{ secs(r) }} s</span> }
                    @else if (r.savedName) { <span class="rb-tag vio">Kept</span> }
                    @else if (s.expired(r)) { <span class="rb-tag mute">Expired</span> }
                    @else { <span class="rb-tag ok">Ready</span> }
                  </div>
                  <div class="rb-strip"><mat-icon>event</mat-icon><span>{{ r.stripText }}</span></div>
                  <div class="rb-rd">Run {{ fdate(r.ranAt) }} at {{ hm(r.ranAt) }}@if (r.status === 'ready') {, {{ r.rows.length.toLocaleString() }} lines}.
                    {{ r.savedName ? 'Kept until ' + fdate(r.keepUntil!) : s.expired(r) ? 'Run it again for current data' : 'Valid until ' + hm(r.validUntil) }}</div>
                </div>
                <div class="rb-racts">
                  @if (r.status === 'running') { <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="s.cancelRun(r.id)">Cancel</button> }
                  @else {
                    @if (!r.savedName) { <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="router.navigate(['/result', r.id], { queryParams: { keep: 1 } })"><mat-icon>bookmark_border</mat-icon>Keep</button> }
                    @else { <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="delResult(r)" aria-label="Delete kept result" matTooltip="Delete kept result"><mat-icon>delete_outline</mat-icon></button> }
                    <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="router.navigate(['/result', r.id])">View</button>
                  }
                </div>
              </div>
            } @empty { <div class="rb-empty"><b>Nothing here yet</b>Reports you run appear here, with when they ran and what period they cover.</div> }
          }
          @case ('sched') {
            @for (sc of s.scheds; track sc.id; let i = $index) {
              @let src = s.rep(sc.src)!;
              <div class="rb-row">
                <div class="rb-rmain">
                  <div class="rb-rt static">{{ src.name }} @if (!sc.on) { <span class="rb-tag mute">Paused</span> }</div>
                  <div class="rb-strip"><mat-icon>event</mat-icon><span>{{ s.strip(s.tpl(src.tid), src) }}</span></div>
                  <div class="rb-rd">{{ sc.freq }} at {{ sc.time }}. {{ sc.fmt }}. Delivered to {{ sc.deliver.join(', ') }}. Runs with your permissions at the time it runs.</div>
                </div>
                <div class="rb-racts">
                  <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="sc.on = !sc.on; s.bump()"><mat-icon>{{ sc.on ? 'pause' : 'play_arrow' }}</mat-icon>{{ sc.on ? 'Pause' : 'Resume' }}</button>
                  <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="delSched(i)" aria-label="Delete schedule" matTooltip="Delete schedule"><mat-icon>delete_outline</mat-icon></button>
                  <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="open('rep', src.id)">Open</button>
                </div>
              </div>
            } @empty { <div class="rb-empty"><b>No scheduled reports</b>Open a report, set the period and filters, and choose Schedule.</div> }
          }
        }
      </section>
    </div>

    <ng-template #last let-src>
      @let r = s.lastResult(src);
      @if (r) {
        <div class="rb-lr">
          @if (r.status === 'running') { <span class="rb-tag run">Running</span> started {{ hm(r.ranAt) }} }
          @else { Last run {{ hm(r.ranAt) }}, {{ r.rows.length.toLocaleString() }} lines@if (s.expired(r)) {, expired}
            <button class="fx-link" (click)="router.navigate(['/result', r.id])">View result</button> }
        </div>
      }
    </ng-template>

    @if (deleting(); as r) {
      <rb-dialog [title]="'Delete ' + r.name + '?'" (closed)="deleting.set(null)">
        <p class="muted tiny">Your saved period, filters and columns for this version are removed. Its schedules stop. The report itself stays in Reports.</p>
        <ng-container foot>
          <button class="fx-btn fx-btn-secondary" (click)="deleting.set(null)">Cancel</button>
          <button class="fx-btn fx-btn-primary danger" (click)="s.deleteRep(r.id); deleting.set(null); s.toast('Deleted')">Delete</button>
        </ng-container>
      </rb-dialog>
    }
    @if (sharing(); as r) { <rb-share [report]="r" (closed)="sharing.set(null)" /> }
  `,
})
export class RbHome {
  fdate = fdate; hm = hm;
  tab = signal<Tab>('reports');
  rf = signal('all');
  qv = signal('');
  get q() { return this.qv(); } set q(v: string) { this.qv.set(v); }
  deleting = signal<MyReport | null>(null);
  sharing = signal<MyReport | null>(null);

  constructor(public s: RbStore, public router: Router, route: ActivatedRoute) {
    s.setRole('user');
    route.queryParamMap.subscribe((p) => { const t = p.get('tab') as Tab | null; if (t) this.tab.set(t); });
  }

  library = computed(() => {
    this.s.rev();
    return this.s.templates.filter((t) => !t.removed && t.status === 'published' && t.places.includes('Billing'))
      .sort((a, b) => +this.s.fav.has(b.id) - +this.s.fav.has(a.id));
  });
  tabs = computed(() => { this.s.rev(); return [
    { k: 'reports' as Tab, l: 'Reports', n: this.library().length },
    { k: 'results' as Tab, l: 'Results', n: this.s.results.length },
    { k: 'sched' as Tab, l: 'Scheduled', n: this.s.scheds.length },
  ]; });
  hit(text: string) { const q = this.qv().toLowerCase(); return !q || text.toLowerCase().includes(q); }
  versions(t: Template) { return this.s.reps.filter((r) => r.tid === t.id && this.hit(r.name + ' ' + t.title)); }
  anyHit() { return this.library().some((t) => this.hit(t.title + ' ' + t.desc) || this.versions(t).length); }
  resultList = computed(() => {
    this.s.rev(); const f = this.rf();
    return this.s.results.filter((r) => f === 'all' || (f === 'running' && r.status === 'running') || (f === 'kept' && !!r.savedName))
      .filter((r) => this.hit(r.name + ' ' + (r.savedName || ''))).slice().reverse();
  });
  secs(r: Result) { return Math.round((Date.now() - r.t0) / 1000); }
  setTab(t: Tab) { this.tab.set(t); this.router.navigate([], { queryParams: { tab: t === 'reports' ? null : t }, replaceUrl: true }); }
  open(kind: 'tpl' | 'rep', id: string) { this.router.navigate(['/run', kind, id]); }
  toggleFav(id: string) { this.s.fav.has(id) ? this.s.fav.delete(id) : this.s.fav.add(id); this.s.bump(); }
  delResult(r: Result) { this.s.results = this.s.results.filter((x) => x !== r); this.s.toast('Kept result deleted'); this.s.bump(); }
  delSched(i: number) { this.s.scheds.splice(i, 1); this.s.toast('Schedule deleted'); this.s.bump(); }
}
