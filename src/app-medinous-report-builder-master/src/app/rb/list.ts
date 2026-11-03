import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Folder, RbStore, Schedule } from './store';
import { MyReport, PRESETS, Template, fdate, hm, rangeText } from './engine';
import { TOPICS, clauseErr, clauseText, isLockSum, nextRun, shortPeriod } from './staff';
import { RbDialog, RbPop } from './ui';
import { ScheduleDialog } from './dialogs';
import { ShareDialog } from './share-dialog';

type View = 'all' | 'fav' | 'sched' | 'shared' | 'tpl' | 'soon:kpi' | 'soon:uns' | string; // string = folder id
type Pop =
  | { kind: 'row'; el: HTMLElement; r: MyReport }
  | { kind: 'sched'; el: HTMLElement; sc: Schedule }
  | { kind: 'folder'; el: HTMLElement; f: Folder };

/** Staff home: views on the left (like a mail client), one flat table for the chosen view on the right. */
@Component({
  selector: 'rb-list',
  imports: [FormsModule, NgTemplateOutlet, MatIconModule, MatTooltipModule, RbDialog, RbPop, ScheduleDialog, ShareDialog],
  template: `
    <div class="rb-page" [attr.data-rev]="s.rev()">
      <div class="rb-dhead">
        <div><h1>Billing reports</h1><p class="muted">Your reports. Start one from an assigned report, then choose its period, filters and grouping.</p></div>
        <div class="rb-dhead-acts">
          <label class="fx-search rb-lsearch"><mat-icon>search</mat-icon><input [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Search all reports" aria-label="Search all reports" /></label>
          <button class="fx-btn fx-btn-primary" (click)="newReport()"><mat-icon>add</mat-icon>New report</button>
        </div>
      </div>

      <section class="fx-card rb-lcard">
        <nav class="rb-lnav" aria-label="Report views">
          @for (v of mainViews(); track v.id) {
            <button class="rb-lnav-i" [class.on]="isOn(v.id)" [attr.aria-current]="isOn(v.id) ? 'page' : null" (click)="go(v.id)">
              <mat-icon [class]="v.cls">{{ v.icon }}</mat-icon><span>{{ v.label }}</span>
              @if (v.id === 'sched' && failed()) { <mat-icon class="rb-failb" matTooltip="A scheduled report failed to deliver" aria-label="One failed">error</mat-icon> }
              <span class="n">{{ v.n }}</span></button>
          }
          <div class="rb-lnav-h">Folders</div>
          @for (f of s.folders; track f.id) {
            <div class="rb-lnav-row">
              <button class="rb-lnav-i" [class.on]="isOn(f.id)" [attr.aria-current]="isOn(f.id) ? 'page' : null" (click)="go(f.id)">
                <mat-icon>{{ isOn(f.id) ? 'folder_open' : 'folder' }}</mat-icon><span>{{ f.name }}</span><span class="n">{{ inFolder(f.id).length }}</span></button>
              <button class="fx-icon-btn sm rb-fmenu" (click)="pop.set({ kind: 'folder', el: $any($event.currentTarget), f })" [attr.aria-label]="'Folder options for ' + f.name" aria-haspopup="menu"><mat-icon>more_vert</mat-icon></button>
            </div>
          }
          <button class="rb-lnav-i add" (click)="openFolderDlg(null)"><mat-icon>create_new_folder</mat-icon><span>New folder</span></button>
          <div class="rb-lnav-sep"></div>
          <button class="rb-lnav-i" [class.on]="isOn('tpl')" [attr.aria-current]="isOn('tpl') ? 'page' : null" (click)="go('tpl')">
            <mat-icon class="tp">assignment</mat-icon><span>Assigned reports</span><span class="n">{{ s.library().length }}</span></button>
          <div class="rb-lnav-h">Coming soon</div>
          <button class="rb-lnav-i soon" [class.on]="isOn('soon:kpi')" (click)="go('soon:kpi')"><mat-icon>insights</mat-icon><span>KPI cards</span><span class="rb-soonb">Soon</span></button>
          <button class="rb-lnav-i soon" [class.on]="isOn('soon:uns')" (click)="go('soon:uns')"><mat-icon>article</mat-icon><span>Unstructured data</span><span class="rb-soonb">Soon</span></button>
        </nav>

        <div class="rb-lmain">
          <div class="rb-lhead">
            <h2>{{ q() ? 'Results for “' + q() + '”' : head()[0] }}</h2>
            @if (!q()) { <span class="muted tiny">{{ head()[1] }}</span> }
          </div>

          @if (q()) {
            <div class="rb-lsub">Reports</div>
            @if (found().length) { <ng-container *ngTemplateOutlet="reportsT; context: { $implicit: found() }" /> } @else { <p class="rb-lnone muted tiny">No reports match.</p> }
            <div class="rb-lsub">Assigned reports</div>
            @if (foundTpl().length) { <ng-container *ngTemplateOutlet="tplT; context: { $implicit: foundTpl() }" /> } @else { <p class="rb-lnone muted tiny">No assigned reports match.</p> }
          } @else {
            @switch (view()) {
              @case ('sched') {
                @if (s.scheds.length) {
                  <div class="rb-ltw"><table class="rb-lt">
                    <colgroup><col class="c-stitle" /><col class="c-sruns" /><col class="c-del" /><col class="c-run sm" /><col class="c-act" /></colgroup>
                    <thead><tr><th>Report</th><th>Runs</th><th>Last delivered</th><th class="sm">Next run</th><th><span class="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      @for (sc of s.scheds; track sc.id) {
                        @let r = s.rep(sc.src)!;
                        <tr class="rb-lrow rb-rowlink" tabindex="0" (click)="open(r)" (keydown.enter)="open(r)">
                          <td><button class="rb-ltitle" (click)="$event.stopPropagation(); open(r)">{{ r.name }}</button>
                            <div class="rb-sub rb-meta2 flush"><span class="muted tiny">{{ s.tpl(r.tid).title }}</span>@if (!sc.on) { <span class="rb-tag mute">Paused</span> }</div></td>
                          <td class="muted tiny">{{ sc.freq }} at {{ sc.time }}<div class="rb-sub">{{ sc.fmt }} to {{ sc.deliver.join(', ') }}</div></td>
                          <td class="tiny" (click)="$event.stopPropagation()">
                            @if (sc.last; as l) {
                              @if (l.ok) { <span class="rb-okt"><mat-icon>check_circle</mat-icon><span>Delivered<br />{{ fdate(l.at) }} {{ hm(l.at) }}</span></span> }
                              @else { <span class="rb-badt"><mat-icon>error</mat-icon><span>Failed<br />{{ fdate(l.at) }} {{ hm(l.at) }}</span></span>
                                <button class="fx-link tiny" (click)="retry(sc)">Run it now</button> }
                            } @else { <span class="muted">Not yet</span> }
                          </td>
                          <td class="muted tiny sm">{{ sc.on ? next(sc) : 'Paused' }}</td>
                          <td class="rb-lact" (click)="$event.stopPropagation()">
                            <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="sc.on = !sc.on; s.bump(); s.toast(sc.on ? 'Schedule resumed' : 'Schedule paused')"><mat-icon>{{ sc.on ? 'pause' : 'play_arrow' }}</mat-icon>{{ sc.on ? 'Pause' : 'Resume' }}</button>
                            <button class="fx-icon-btn" (click)="pop.set({ kind: 'sched', el: $any($event.currentTarget), sc })" aria-label="More schedule actions" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
                          </td>
                        </tr>
                      }
                    </tbody></table></div>
                } @else { <div class="rb-empty"><b>Nothing scheduled</b>Open one of your reports and choose Schedule from its ⋯ menu.</div> }
              }
              @case ('tpl') { <ng-container *ngTemplateOutlet="tplT; context: { $implicit: s.library() }" /> }
              @case ('soon:kpi') { <ng-container *ngTemplateOutlet="soonT; context: { icon: 'insights', h: 'KPI cards', p: 'Key figures for your module, such as revenue this month, open invoices and collections today, shown as cards above your reports. You will be able to choose which cards you see and click a card to open the report behind it.' }" /> }
              @case ('soon:uns') { <ng-container *ngTemplateOutlet="soonT; context: { icon: 'article', h: 'Reporting on unstructured data', p: 'Reports on free text such as clinical notes, discharge summaries and remarks: searching, counting and grouping what the text says, alongside the structured data you report on today.' }" /> }
              @default {
                @if (rows().length) { <ng-container *ngTemplateOutlet="reportsT; context: { $implicit: rows() }" /> }
                @else { <div class="rb-empty"><b>{{ empty()[0] }}</b>{{ empty()[1] }}</div> }
              }
            }
          }
        </div>
      </section>
    </div>

    <ng-template #reportsT let-list>
      <div class="rb-ltw"><table class="rb-lt">
        <colgroup><col class="c-title" /><col class="c-per" /><col class="c-run sm" /><col class="c-act2" /></colgroup>
        <thead><tr><th>Report</th><th>Period and filters</th><th class="sm">Last run</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          @for (r of list; track r.id) {
            <tr class="rb-lrow rb-rowlink" tabindex="0" (click)="open(r)" (keydown.enter)="open(r)" [attr.aria-label]="'Open ' + r.name">
              <td>
                <span class="rb-tcell">
                  <button class="fx-icon-btn rb-star" [class.on]="r.fav" (click)="$event.stopPropagation(); fav(r)" [attr.aria-label]="(r.fav ? 'Remove from' : 'Add to') + ' favourites'" [attr.aria-pressed]="!!r.fav"><mat-icon>{{ r.fav ? 'star' : 'star_border' }}</mat-icon></button>
                  <span class="rb-ltitle">{{ r.name }}</span>
                </span>
                <div class="rb-sub rb-meta2">
                  <span class="muted tiny">{{ s.tpl(r.tid).title }}</span>
                  @if (isSum(r)) { <span class="rb-tag info"><mat-icon class="xs">table_rows</mat-icon> Summary report</span> }
                  @if (scheduled(r)) { <span class="rb-tag ok"><mat-icon class="xs">schedule</mat-icon> Scheduled</span> }
                  @if (r.owner !== 'me') { <span class="rb-tag vio"><mat-icon class="xs">person</mat-icon> Shared by {{ r.owner }}</span> }
                  @else if (r.share.people.length) { <span class="rb-tag run"><mat-icon class="xs">group</mat-icon> Shared with {{ r.share.people.length }}</span> }
                  @if (folderOfRep(r) && view() !== r.folder) { <span class="rb-tag mute"><mat-icon class="xs">folder</mat-icon> {{ folderOfRep(r) }}</span> }
                </div>
              </td>
              <td class="muted tiny" [title]="periodTitle(r)"><span class="rb-clamp">{{ periodLine(r) }}</span></td>
              <td class="muted tiny sm">
                @if (r.lastRun) { {{ fdate(r.lastRun) }} {{ hm(r.lastRun) }}@if (r.lastLines != null) {<br />{{ r.lastLines }} {{ r.lastLines === 1 ? 'line' : 'lines' }}} }
                @else if (nextOf(r); as nx) { Next run {{ nx }} }
                @else { <span aria-label="Not run yet">—</span> }
              </td>
              <td class="rb-lact" (click)="$event.stopPropagation()">
                <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="open(r, true)"><mat-icon>play_arrow</mat-icon>Run</button>
                <button class="fx-btn fx-btn-secondary fx-btn-sm rb-vebtn" (click)="open(r)" [attr.aria-label]="'View or edit ' + r.name"><mat-icon>edit_note</mat-icon><span>View/Edit</span></button>
                <button class="fx-icon-btn" (click)="pop.set({ kind: 'row', el: $any($event.currentTarget), r })" [attr.aria-label]="'More actions for ' + r.name" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
              </td>
            </tr>
          }
        </tbody></table></div>
    </ng-template>

    <ng-template #tplT let-list>
      <div class="rb-ltw"><table class="rb-lt">
        <colgroup><col class="c-title" /><col class="c-per" /><col class="c-act2" /></colgroup>
        <thead><tr><th>Report</th><th>What it shows</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          @for (t of list; track t.id) {
            <tr class="rb-lrow rb-rowlink" tabindex="0" (click)="openTpl(t.id)" (keydown.enter)="openTpl(t.id)" [attr.aria-label]="'Open ' + t.title">
              <td><span class="rb-ltitle">{{ t.title }}</span>
                <div class="rb-sub rb-meta2 flush"><span class="muted tiny">{{ topic(t.id) }}</span>@if (lockSum(t)) { <span class="rb-tag info">Totals only</span> }@if (t.heavy) { <span class="rb-tag mute">Often runs in background</span> }</div></td>
              <td class="muted tiny"><span class="rb-clamp">{{ t.desc }}</span></td>
              <td class="rb-lact" (click)="$event.stopPropagation()">
                <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="openTpl(t.id, true)"><mat-icon>play_arrow</mat-icon>Run</button>
                <button class="fx-btn fx-btn-secondary fx-btn-sm rb-vebtn" (click)="openTpl(t.id)" [attr.aria-label]="'View or edit ' + t.title"><mat-icon>edit_note</mat-icon><span>View/Edit</span></button>
              </td>
            </tr>
          }
        </tbody></table></div>
    </ng-template>

    <ng-template #soonT let-icon="icon" let-h="h" let-p="p">
      <div class="rb-soonp">
        <mat-icon class="rb-soonpi">{{ icon }}</mat-icon>
        <div>
          <span class="rb-soonb big">Coming soon</span>
          <h3>{{ h }}</h3>
          <p>{{ p }}</p>
          <p class="muted tiny">We are building this next. Tell us if you would use it, so we know what to build first.</p>
          <button class="fx-btn fx-btn-primary" (click)="s.toast('Thanks. Your IT team and Medinous will see that you want ' + h)"><mat-icon>thumb_up</mat-icon>I'd use this</button>
        </div>
      </div>
    </ng-template>

    @if (pop(); as p) {
      <rb-pop [anchor]="p.el" (closed)="pop.set(null)">
        @switch (p.kind) {
          @case ('row') {
            @if (p.kind === 'row') {
              @let r = p.r; @let own = r.owner === 'me';
              <div class="rb-mlab">Download with its saved values</div>
              @for (f of downloads; track f[0]) { <button class="rb-mi" (click)="download(r, f[0])"><mat-icon>{{ f[1] }}</mat-icon>{{ f[2] }}</button> }
              <div class="rb-msep"></div>
              @if (own) {
                <button class="rb-mi" (click)="pop.set(null); sharing.set(r)"><mat-icon>person_add</mat-icon>Share and access…</button>
                <button class="rb-mi" (click)="pop.set(null); renameOf.set(r); renameTo = r.name; renameErr.set(''); dlg.set('rename')"><mat-icon>edit</mat-icon>Rename</button>
                <div class="rb-mlab">Move to folder</div>
                <button class="rb-mi" [class.on]="!r.folder" (click)="move(r, null)"><mat-icon>block</mat-icon>No folder</button>
                @for (f of s.folders; track f.id) { <button class="rb-mi" [class.on]="r.folder === f.id" (click)="move(r, f.id)"><mat-icon>folder</mat-icon>{{ f.name }}</button> }
                <div class="rb-msep"></div>
              }
              <button class="rb-mi" (click)="pop.set(null); s.duplicate(r); s.toast(own ? 'Duplicated' : 'Saved a copy to your reports')"><mat-icon>content_copy</mat-icon>{{ own ? 'Duplicate' : 'Save a copy' }}</button>
              @if (own) { <button class="rb-mi" (click)="pop.set(null); deleting.set(r); dlg.set('delete')"><mat-icon>delete_outline</mat-icon>Delete</button> }
            }
          }
          @case ('sched') {
            @if (p.kind === 'sched') {
              <button class="rb-mi" (click)="pop.set(null); schedEdit.set(p.sc)"><mat-icon>edit</mat-icon>Change schedule</button>
              <button class="rb-mi" (click)="delSched(p.sc)"><mat-icon>delete_outline</mat-icon>Delete schedule</button>
            }
          }
          @case ('folder') {
            @if (p.kind === 'folder') {
              <button class="rb-mi" (click)="pop.set(null); openFolderDlg(p.f)"><mat-icon>edit</mat-icon>Rename folder</button>
              <button class="rb-mi" (click)="pop.set(null); delFolder.set(p.f); dlg.set('delfolder')"><mat-icon>delete_outline</mat-icon>Delete folder</button>
            }
          }
        }
      </rb-pop>
    }

    @switch (dlg()) {
      @case ('folder') {
        <rb-dialog [title]="folderOf() ? 'Rename folder' : 'New folder'" (closed)="dlg.set(null)">
          <label class="rb-flab">Folder name<input class="rb-inp" [(ngModel)]="folderName" placeholder="For example: Month end" (keydown.enter)="saveFolder()" /></label>
          @if (folderErr()) { <div class="rb-ferr">{{ folderErr() }}</div> }
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="saveFolder()">{{ folderOf() ? 'Rename' : 'Create' }}</button></ng-container>
        </rb-dialog>
      }
      @case ('delfolder') {
        @let f = delFolder()!;
        <rb-dialog [title]="'Delete ' + f.name + '?'" (closed)="dlg.set(null)">
          <p class="muted tiny">@if (inFolder(f.id).length; as n) {Its {{ n }} {{ n === 1 ? 'report moves' : 'reports move' }} to All my reports, outside any folder. No reports are deleted.} @else {The folder is empty.}</p>
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary danger" (click)="removeFolder(f)">Delete folder</button></ng-container>
        </rb-dialog>
      }
      @case ('rename') {
        <rb-dialog title="Rename" (closed)="dlg.set(null)">
          <label class="rb-flab">New name<input class="rb-inp" [(ngModel)]="renameTo" (keydown.enter)="rename()" /></label>
          @if (renameErr()) { <div class="rb-ferr">{{ renameErr() }}</div> }
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="rename()">Rename</button></ng-container>
        </rb-dialog>
      }
      @case ('delete') {
        @let r = deleting()!;
        <rb-dialog [title]="'Delete ' + r.name + '?'" (closed)="dlg.set(null)">
          <p class="muted tiny">The report's period, filters and columns are removed, and any schedules on it stop. It stays available under Assigned reports.</p>
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button>
            <button class="fx-btn fx-btn-primary danger" (click)="s.deleteRep(r.id); dlg.set(null); s.toast('Deleted')">Delete</button></ng-container>
        </rb-dialog>
      }
    }
    @if (schedEdit(); as sc) { <rb-schedule [report]="s.rep(sc.src)!" [existing]="sc" (closed)="schedEdit.set(null)" /> }
    @if (sharing(); as r) { <rb-share [report]="r" (closed)="sharing.set(null)" /> }
  `,
})
export class RbList {
  fdate = fdate; hm = hm;
  downloads: [string, string, string][] = [['pdf', 'picture_as_pdf', 'PDF'], ['xlsx', 'grid_on', 'Excel'], ['csv', 'description', 'CSV']];
  q = signal('');
  view = signal<View>('all');
  pop = signal<Pop | null>(null);
  dlg = signal<'folder' | 'delfolder' | 'rename' | 'delete' | null>(null);
  schedEdit = signal<Schedule | null>(null);
  sharing = signal<MyReport | null>(null);
  folderOf = signal<Folder | null>(null); folderName = ''; folderErr = signal('');
  delFolder = signal<Folder | null>(null);
  renameOf = signal<MyReport | null>(null); renameTo = ''; renameErr = signal('');
  deleting = signal<MyReport | null>(null);

  constructor(public s: RbStore, private router: Router, route: ActivatedRoute) {
    s.setRole('user');
    route.queryParamMap.subscribe((p) => this.view.set(p.get('view') || 'all'));
  }

  private mine = () => this.s.reps.filter((r) => r.owner === 'me');
  inFolder = (id: string) => this.mine().filter((r) => r.folder === id);
  isOn(v: string) { return !this.q() && this.view() === v; }
  failed = computed(() => { this.s.rev(); return this.s.scheds.some((x) => x.last && !x.last.ok); });
  mainViews = computed(() => {
    this.s.rev();
    return [
      { id: 'all', label: 'All my reports', icon: 'description', cls: '', n: this.mine().length },
      { id: 'fav', label: 'Favourites', icon: 'star', cls: 'fav', n: this.s.reps.filter((r) => r.fav).length },
      { id: 'sched', label: 'Scheduled', icon: 'schedule', cls: 'sc', n: this.s.scheds.length },
      { id: 'shared', label: 'Shared with me', icon: 'folder_shared', cls: 'sh', n: this.s.reps.filter((r) => r.owner !== 'me').length },
    ];
  });
  head = computed<[string, string]>(() => {
    this.s.rev(); const v = this.view();
    const fixed: Record<string, [string, string]> = {
      all: ['All my reports', 'Every report you have saved'], fav: ['Favourites', 'Star a report to keep it here'],
      sched: ['Scheduled', 'Reports that run on their own and are delivered to you'],
      shared: ['Shared with me', 'Reports colleagues have shared with you. Run them, or save your own copy to change them'],
      tpl: ['Assigned reports', 'Set up for you by your IT team. Run one as it is, or open it to make your own version'],
      'soon:kpi': ['KPI cards', 'Coming soon'], 'soon:uns': ['Unstructured data', 'Coming soon'],
    };
    return fixed[v] || [this.s.folders.find((f) => f.id === v)?.name || 'All my reports', 'Folder. Use ⋯ → Move to folder on a report to add it here'];
  });
  rows = computed<MyReport[]>(() => {
    this.s.rev(); const v = this.view();
    if (v === 'all') return this.mine();
    if (v === 'fav') return this.s.reps.filter((r) => r.fav);
    if (v === 'shared') return this.s.reps.filter((r) => r.owner !== 'me');
    return this.inFolder(v);
  });
  empty = computed<[string, string]>(() => ({
    fav: ['No favourites yet', 'Click the star next to any report.'] as [string, string],
    shared: ['Nothing shared with you yet', 'When colleagues share a report with you, it appears here.'] as [string, string],
    all: ['No reports yet', 'Use New report to start one from an assigned report.'] as [string, string],
  } as Record<string, [string, string]>)[this.view()] || ['This folder is empty', 'Use the ⋯ menu on a report to move it here.']);
  found = computed(() => { this.s.rev(); const q = this.q().toLowerCase(); return this.s.reps.filter((r) => (r.name + ' ' + this.s.tpl(r.tid).title).toLowerCase().includes(q)); });
  foundTpl = computed(() => { const q = this.q().toLowerCase(); return this.s.library().filter((t) => (t.title + ' ' + t.desc).toLowerCase().includes(q)); });

  go(v: View) { this.q.set(''); this.router.navigate([], { queryParams: { view: v === 'all' ? null : v }, replaceUrl: true }); }
  folderOfRep(r: MyReport) { return r.folder ? this.s.folders.find((f) => f.id === r.folder)?.name || '' : ''; }
  scheduled(r: MyReport) { return this.s.scheds.some((x) => x.src === r.id && x.on); }
  next(sc: Schedule) { return `${fdate(nextRun(sc.freq, sc.time, this.s.today))} ${sc.time}`; }
  nextOf(r: MyReport) { const sc = this.s.scheds.find((x) => x.src === r.id && x.on); return sc ? this.next(sc) : ''; }
  topic(id: string) { return TOPICS[id] || 'Other'; }
  lockSum(t: Template) { return isLockSum(t); }
  isSum(r: MyReport) { return r.view === 'summary' || isLockSum(this.s.tpl(r.tid)); }
  /** "Last 30 days · Sponsor: Warba · Net Amount at least KD 100" */
  periodLine(r: MyReport) {
    const cl = (r.clauses || []).filter((c) => !clauseErr(c)).map((c) => clauseText(c).replace(/ is /, ': '));
    return [shortPeriod(r.period, PRESETS), ...cl].join(' · ');
  }
  periodTitle(r: MyReport) { return `${this.s.periodLabel(this.s.tpl(r.tid))}: ${rangeText(r.period, true)}`; }

  open(r: MyReport, run = false) { this.router.navigate(['/report', 'rep', r.id], { queryParams: run ? { run: 1 } : {} }); }
  fav(r: MyReport) { r.fav = !r.fav; this.s.bump(); this.s.toast(r.fav ? 'Added to Favourites' : 'Removed from Favourites'); }
  move(r: MyReport, folder: string | null) { r.folder = folder; this.pop.set(null); this.s.bump(); this.s.toast(folder ? 'Moved to ' + this.folderOfRep(r) : 'Removed from its folder'); }
  /** Download straight from the list with the report's saved values; large reports are prepared in the background. */
  download(r: MyReport, ext: string) {
    this.pop.set(null); const t = this.s.tpl(r.tid);
    if (t.heavy) {
      this.s.toast(`${r.name} is being prepared in the background. You'll be notified when the ${ext.toUpperCase()} is ready`);
      setTimeout(() => { this.s.notes.unshift({ id: Date.now(), text: `${r.name} (${ext.toUpperCase()}) is ready to download`, key: 'rep:' + r.id, at: new Date(), read: false, email: false }); this.s.bump(); }, 6000);
    } else this.s.toast(`Downloaded ${r.name}.${ext}`);
  }
  retry(sc: Schedule) { sc.last = { at: new Date(), ok: true }; this.s.bump(); this.s.toast('Run and delivered'); }
  delSched(sc: Schedule) { this.s.scheds = this.s.scheds.filter((x) => x !== sc); this.pop.set(null); this.s.bump(); this.s.toast('Schedule deleted'); }
  openFolderDlg(f: Folder | null) { this.folderOf.set(f); this.folderName = f?.name || ''; this.folderErr.set(''); this.dlg.set('folder'); }
  saveFolder() {
    const n = this.folderName.trim(), f = this.folderOf();
    if (!n) { this.folderErr.set('Enter a folder name.'); return; }
    if (this.s.folders.some((x) => x !== f && x.name.toLowerCase() === n.toLowerCase())) { this.folderErr.set('A folder with this name already exists.'); return; }
    this.dlg.set(null);
    if (f) { f.name = n; this.s.bump(); this.s.toast('Folder renamed'); return; }
    const nf = this.s.addFolder(n); this.go(nf.id); this.s.toast('Folder created');
  }
  removeFolder(f: Folder) {
    this.s.reps.forEach((r) => { if (r.folder === f.id) r.folder = null; });
    this.s.folders = this.s.folders.filter((x) => x !== f);
    this.dlg.set(null); if (this.view() === f.id) this.go('all'); this.s.bump(); this.s.toast('Folder deleted');
  }
  rename() {
    const n = this.renameTo.trim(), r = this.renameOf()!;
    if (n.length < 3) { this.renameErr.set('Enter a name of at least 3 characters.'); return; }
    if (this.s.reps.some((x) => x !== r && x.owner === 'me' && x.name.toLowerCase() === n.toLowerCase())) { this.renameErr.set('You already have a report with this name.'); return; }
    r.name = n; const d = this.s.docs['rep:' + r.id]; if (d) d.name = n;
    this.dlg.set(null); this.s.bump();
  }
  /** New report opens the report page on the last template used; the template is picked there, with the filters. */
  newReport() { this.openTpl(this.s.lastTemplate || this.s.library()[0].id); }
  openTpl(id: string, run = false) {
    this.s.lastTemplate = id;
    this.router.navigate(['/report', 'tpl', id], { queryParams: run ? { run: 1 } : {} });
  }
}
