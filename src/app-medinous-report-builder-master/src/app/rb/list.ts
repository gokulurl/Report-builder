import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Folder, RbStore, Schedule } from './store';
import { MyReport, PRESETS, Template, fdate, hm, rangeText } from './engine';
import { TOPICS, clauseErr, clauseText, isLockSum, nextRun, shortPeriod } from './staff';
import { RbDialog, RbInfo, RbPop } from './ui';
import { Viewport } from './viewport';
import { ScheduleDialog } from './dialogs';
import { ShareDialog } from './share-dialog';
import { RunDialog } from './run-dialog';
import { RbSideList } from './side-list';

type View = 'all' | 'fav' | 'sched' | 'shared' | 'tpl' | 'soon:kpi' | 'soon:uns' | string; // string = folder id
type Pop =
  | { kind: 'row'; el: HTMLElement; r: MyReport }
  | { kind: 'sched'; el: HTMLElement; sc: Schedule }
  | { kind: 'folder'; el: HTMLElement; f: Folder }
  | { kind: 'fswitch'; el: HTMLElement };

/** Staff home: views on the left (like a mail client), one flat table for the chosen view on the right. */
@Component({
  selector: 'rb-list',
  imports: [FormsModule, NgTemplateOutlet, MatIconModule, MatTooltipModule, RbDialog, RbPop, ScheduleDialog, ShareDialog, RunDialog, RbSideList, RbInfo],
  template: `
    <div class="hub-shell" [attr.data-rev]="s.rev()">
      <rb-side-list />
      <div class="hub-main">
        <!-- Registration's desk bar: the queues of this module, always in the same place. -->
        <div class="desk-bar">
          <div class="tabs" role="tablist" aria-label="Billing reports">
            @for (t of deskTabs(); track t.id) {
              <button [matTooltip]="t.id === 'tpl' ? 'Reports your IT team set up for you to run' : ''" type="button" role="tab" [class.has-work]="!!t.n" [attr.aria-selected]="tabOn(t.id)" (click)="go(t.id)">
                {{ t.label }}@if (t.n !== null) { <span class="count">{{ t.n }}</span> }
                @if (t.id === 'sched' && failed()) { <mat-icon matTooltip="A scheduled delivery failed. Open Scheduled to run it again" class="rb-failb" aria-label="One failed delivery">error</mat-icon> }
              </button>
            }
          </div>
          <div class="desk-bar-end"><button class="fx-btn fx-btn-primary fx-btn-sm" (click)="newReport()" title="New report (Alt+N)" aria-keyshortcuts="Alt+N"><mat-icon>add</mat-icon><span><u>N</u>ew report</span></button></div>
        </div>
        <div class="hub-work">
      <section class="fx-card rb-lcard">
        <div class="rb-lmain">
          <div class="rb-lhead">
            <!-- Folders live here, not in a tab: the heading of My reports is a drop-down of
                 All my reports and each folder (Gokul, 17 Nov). Default is All my reports. -->
            @if (view() === 'all' || folderView()) {
              <button type="button" class="rb-fswitch" (click)="pop.set({ kind: 'fswitch', el: $any($event.currentTarget) })" aria-haspopup="menu" [attr.aria-label]="head()[0] + '. Choose a folder'"><h2>{{ head()[0] }}</h2><mat-icon>expand_more</mat-icon></button>
            } @else { <h2>{{ head()[0] }}</h2> }
            <!-- One line of help per view, behind the (i): long text stays off the page (Shrunkal, 17 Nov) -->
            <rb-info [text]="head()[1]" />
            @if (folderView(); as f) {
              <button class="fx-btn fx-btn-secondary fx-btn-sm rb-lhead-menu rb-addreps" (click)="openAdd(f)"><mat-icon>add</mat-icon>Add reports</button>
              <button class="fx-icon-btn sm rb-lhead-menu" (click)="pop.set({ kind: 'folder', el: $any($event.currentTarget), f })" [attr.aria-label]="'Folder options for ' + f.name" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
            }
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
                            <div class="rb-sub rb-meta2 flush"><span class="muted tiny">{{ s.tpl(r.tid).title }}</span>@if (!sc.on) { <span class="rb-tag status mute">Paused</span> }</div></td>
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
                } @else { <div class="rb-empty"><b>Nothing scheduled</b>Open a report, then choose Schedule… from its ⋯ menu.</div> }
              }
              @case ('tpl') { <ng-container *ngTemplateOutlet="tplT; context: { $implicit: s.library() }" /> }
              @case ('soon') { <ng-container *ngTemplateOutlet="soonT; context: { icon: 'insights', h: 'KPI cards', p: 'Revenue, open invoices and collections as cards above your reports.' }" /><ng-container *ngTemplateOutlet="soonT; context: { icon: 'article', h: 'Reporting on unstructured data', p: 'Search, count and group clinical notes and remarks.' }" /> }
              @default {
                @if (rows().length) { <ng-container *ngTemplateOutlet="reportsT; context: { $implicit: rows() }" /> }
                @else if (folderView(); as f) { <div class="rb-empty"><b>Nothing in {{ f.name }} yet</b><button class="fx-btn fx-btn-primary fx-btn-sm" (click)="openAdd(f)"><mat-icon>add</mat-icon>Add reports</button></div> }
                @else { <div class="rb-empty"><b>{{ empty()[0] }}</b>{{ empty()[1] }}</div> }
              }
            }
          }
        </div>
      </section>
        </div>
      </div>
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
                  <button [matTooltip]="r.fav ? 'Remove from Favourites' : 'Add to Favourites'" class="fx-icon-btn rb-star" [class.on]="r.fav" (click)="$event.stopPropagation(); fav(r)" [attr.aria-label]="(r.fav ? 'Remove from' : 'Add to') + ' favourites'" [attr.aria-pressed]="!!r.fav"><mat-icon>{{ r.fav ? 'star' : 'star_border' }}</mat-icon></button>
                  <span class="rb-ltitle">{{ r.name }}</span>
                </span>
                <div class="rb-sub rb-meta2">
                  <span class="muted tiny rb-tplname" [matTooltip]="s.tpl(r.tid).title">{{ s.tpl(r.tid).title }}</span>
                  @if (isSum(r)) { <span class="rb-tag info"><mat-icon matTooltip="Shows grouped totals, not each line" class="xs">table_rows</mat-icon> Summary report</span> }
                  @if (scheduled(r)) { <span class="rb-tag status ok"><mat-icon class="xs">schedule</mat-icon> Scheduled</span> }
                  @if (r.owner !== 'me') { <span class="rb-tag vio"><mat-icon class="xs">person</mat-icon> Shared by {{ r.owner }}</span> }
                  @else if (r.share.people.length) { <span class="rb-tag run"><mat-icon class="xs">group</mat-icon> Shared with {{ r.share.people.length }}</span> }
                  @if (folderOfRep(r) && view() !== r.folder) { <span class="rb-tag mute rb-ftag" [matTooltip]="'In folder ' + folderOfRep(r)"><mat-icon class="xs">folder</mat-icon> {{ folderOfRep(r) }}</span> }
                </div>
              </td>
              <td class="muted tiny" [title]="periodTitle(r)"><span class="rb-clamp">{{ periodLine(r) }}</span></td>
              <td class="muted tiny sm">
                <!-- Two set lines, never a date broken across them -->
                @if (r.lastRun) { <span class="rb-l2">{{ fdate(r.lastRun) }} {{ hm(r.lastRun) }}</span>@if (r.lastLines != null) {<span class="rb-l2">{{ r.lastLines }} {{ r.lastLines === 1 ? 'line' : 'lines' }}</span>} }
                @else if (nextOf(r); as nx) { <span class="rb-l2">Next run</span><span class="rb-l2">{{ nx }}</span> }
                @else { <span aria-label="Not run yet">—</span> }
              </td>
              <td class="rb-lact" (click)="$event.stopPropagation()">
                <button matTooltip="Pick period and filters, then view on screen or download" class="fx-btn fx-btn-secondary fx-btn-sm" (click)="running.set({ r })"><mat-icon>play_arrow</mat-icon>Run</button>
                <button matTooltip="View or edit" class="fx-btn fx-btn-ghost fx-btn-sm rb-vebtn" (click)="open(r)" [attr.aria-label]="'View or edit ' + r.name"><mat-icon>edit_note</mat-icon><span>View/Edit</span></button>
                <button [matTooltip]="r.owner === 'me' ? 'Share, rename, move to folder, duplicate or delete' : 'Save a copy to your reports'" class="fx-icon-btn" (click)="pop.set({ kind: 'row', el: $any($event.currentTarget), r })" [attr.aria-label]="'More actions for ' + r.name" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
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
                <div class="rb-sub rb-meta2 flush"><span class="muted tiny">{{ topic(t.id) }}</span>@if (lockSum(t)) { <span matTooltip="Your IT team set this to show totals, not each line" class="rb-tag info">Totals only</span> }@if (t.heavy) { <span class="rb-tag mute">Often runs in background</span> }</div></td>
              <td class="muted tiny"><span class="rb-clamp">{{ t.desc }}</span></td>
              <td class="rb-lact" (click)="$event.stopPropagation()">
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="running.set({ t: t.id })"><mat-icon>play_arrow</mat-icon>Run</button>
                <button matTooltip="View or edit" class="fx-btn fx-btn-ghost fx-btn-sm rb-vebtn" (click)="openTpl(t.id)" [attr.aria-label]="'View or edit ' + t.title"><mat-icon>edit_note</mat-icon><span>View/Edit</span></button>
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
          <h3>{{ h }}<rb-info text="Coming next. Tell us if you would use it, so we know what to build first." /></h3>
          <p>{{ p }}</p>
          <button class="fx-btn fx-btn-secondary" (click)="s.toast('Thanks. Your IT team and Medinous will see that you want ' + h)"><mat-icon>add</mat-icon>I'd use this</button>
        </div>
      </div>
    </ng-template>

    @if (pop(); as p) {
      <rb-pop [anchor]="p.el" (closed)="pop.set(null)">
        @switch (p.kind) {
          @case ('row') {
            @if (p.kind === 'row') {
              @let r = p.r; @let own = r.owner === 'me';
              @if (own) {
                <button class="rb-mi" (click)="pop.set(null); sharing.set(r)"><mat-icon>person_add</mat-icon>Share and access…</button>
                <button class="rb-mi" (click)="pop.set(null); renameOf.set(r); renameTo = r.name; renameErr.set(''); dlg.set('rename')"><mat-icon>edit</mat-icon>Rename</button>
                <div class="rb-mlab">Move to folder</div>
                <button class="rb-mi" [class.on]="!r.folder" (click)="move(r, null)"><mat-icon>close</mat-icon>No folder</button>
                @for (f of s.folders; track f.id) { <button class="rb-mi" [class.on]="r.folder === f.id" (click)="move(r, f.id)"><mat-icon class="rb-fic">folder</mat-icon>{{ f.name }}</button> }
                <button class="rb-mi" (click)="pop.set(null); pendingMove = r; openFolderDlg(null)"><mat-icon>create_new_folder</mat-icon>New folder…</button>
                <div class="rb-msep"></div>
              }
              <button class="rb-mi" (click)="pop.set(null); s.duplicate(r); s.toast(own ? 'Duplicated' : 'Saved a copy to your reports')"><mat-icon>add</mat-icon>{{ own ? 'Duplicate' : 'Save a copy' }}</button>
              @if (own) { <button class="rb-mi" (click)="pop.set(null); deleting.set(r); dlg.set('delete')"><mat-icon>delete_outline</mat-icon>Delete</button> }
            }
          }
          @case ('sched') {
            @if (p.kind === 'sched') {
              <button class="rb-mi" (click)="pop.set(null); schedEdit.set(p.sc)"><mat-icon>edit</mat-icon>Change schedule</button>
              <button class="rb-mi" (click)="delSched(p.sc)"><mat-icon>delete_outline</mat-icon>Delete schedule</button>
            }
          }
          @case ('fswitch') {
            <button class="rb-mi" [class.on]="view() === 'all'" (click)="pop.set(null); go('all')"><mat-icon>description</mat-icon><span class="grow">All my reports</span><span class="r">{{ mineCount() }}</span></button>
            <div class="rb-mlab">Folders</div>
            @for (fo of s.folders; track fo.id) {
              <button class="rb-mi" [class.on]="view() === fo.id" (click)="pop.set(null); go(fo.id)"><mat-icon class="rb-fic">folder</mat-icon><span class="grow">{{ fo.name }}</span><span class="r">{{ inFolder(fo.id).length }}</span></button>
            } @empty { <div class="rb-mempty">No folders yet</div> }
            <div class="rb-msep"></div>
            <button class="rb-mi" (click)="pop.set(null); openFolderDlg(null)"><mat-icon>create_new_folder</mat-icon>New folder</button>
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
        <rb-dialog [title]="folderOf() ? 'Rename folder' : 'New folder'" (closed)="dlg.set(null); pendingMove = null">
          <label class="rb-flab">Folder name<input class="rb-inp" [(ngModel)]="folderName" placeholder="For example: Month end" (keydown.enter)="saveFolder()" /></label>
          @if (folderErr()) { <div class="rb-ferr">{{ folderErr() }}</div> }
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null); pendingMove = null">Cancel</button><button class="fx-btn fx-btn-primary" (click)="saveFolder()">{{ folderOf() ? 'Rename' : pendingMove ? 'Create and move' : 'Create' }}</button></ng-container>
        </rb-dialog>
      }
      @case ('addreps') {
        @let f = addTo()!;
        <rb-dialog [title]="'Add reports to ' + f.name" (closed)="dlg.set(null)">
          <div class="rb-addlist" role="group" [attr.aria-label]="'Reports to add to ' + f.name">
            @for (r of addable(); track r.id) {
              <label class="fx-check rb-addrow2"><input type="checkbox" [checked]="addSel().has(r.id)" (change)="toggleAdd(r.id)" />
                <span class="grow"><b>{{ r.name }}</b>@if (folderOfRep(r); as fn) { <small>Now in {{ fn }}. Moves here</small> }</span></label>
            } @empty { <p class="muted tiny">All your reports are already in this folder.</p> }
          </div>
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">{{ addSel().size ? 'Cancel' : 'Skip' }}</button>
            <button class="fx-btn fx-btn-primary" [disabled]="!addSel().size" (click)="addReps()">Add {{ addSel().size || '' }} {{ addSel().size === 1 ? 'report' : 'reports' }}</button></ng-container>
        </rb-dialog>
      }
      @case ('delfolder') {
        @let f = delFolder()!;
        <rb-dialog [title]="'Delete ' + f.name + '?'" (closed)="dlg.set(null)">
          <p class="muted tiny">@if (inFolder(f.id).length; as n) {{{ n }} {{ n === 1 ? 'report moves' : 'reports move' }} out. Nothing is deleted.} @else {The folder is empty.}</p>
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
          <p class="muted tiny">Its schedules stop. The template stays in Assigned reports.</p>
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button>
            <button class="fx-btn fx-btn-primary danger" (click)="s.deleteRep(r.id); dlg.set(null); s.toast('Deleted')">Delete</button></ng-container>
        </rb-dialog>
      }
    }
    @if (schedEdit(); as sc) { <rb-schedule [report]="s.rep(sc.src)!" [existing]="sc" (closed)="schedEdit.set(null)" /> }
    @if (sharing(); as r) { <rb-share [report]="r" (closed)="sharing.set(null)" /> }
  
    @if (running(); as x) { <rb-run [report]="x.r || null" [tplId]="x.t || ''" (closed)="running.set(null)" /> }`,
})
export class RbList {
  fdate = fdate; hm = hm;
  q = signal('');
  view = signal<View>('all');
  /** One pane below 840px, as in Registration: the views, or one view's reports with a way back. Reports first. */
  vp = inject(Viewport);
  paneDetail = signal(true);
  pop = signal<Pop | null>(null);
  running = signal<{ r?: MyReport; t?: string } | null>(null);
  dlg = signal<'folder' | 'delfolder' | 'rename' | 'delete' | 'addreps' | null>(null);
  /** Add reports: the folder being filled, and the ticked report ids. A report already in another folder moves (one folder each). */
  addTo = signal<Folder | null>(null);
  addSel = signal<Set<string>>(new Set());
  /** Move to folder → New folder…: the report that goes into the folder once it is created. */
  pendingMove: MyReport | null = null;
  schedEdit = signal<Schedule | null>(null);
  sharing = signal<MyReport | null>(null);
  folderOf = signal<Folder | null>(null); folderName = ''; folderErr = signal('');
  delFolder = signal<Folder | null>(null);
  renameOf = signal<MyReport | null>(null); renameTo = ''; renameErr = signal('');
  deleting = signal<MyReport | null>(null);

  constructor(public s: RbStore, private router: Router, route: ActivatedRoute) {
    s.setRole('user');
    // Below 1400px the table is the list: fold the side list, which repeats it, so rows keep one line of tags (Gokul, 1280px screen)
    if (innerWidth < 1400) s.listFolded.set(true);
    route.queryParamMap.subscribe((p) => {
      const v = p.get('view') || 'all';
      this.view.set(v);
    });
  }

  private mine = () => this.s.reps.filter((r) => r.owner === 'me');
  inFolder = (id: string) => this.mine().filter((r) => r.folder === id);
  isOn(v: string) { return !this.q() && this.view() === v; }
  /** Registration's desk tabs: the queues of this module. Folders sit in the My reports heading; Favourites stays a filter on the side list. */
  deskTabs = computed(() => {
    this.s.rev();
    return [
      { id: 'all', label: 'My reports', n: this.mine().length as number | null },
      { id: 'shared', label: 'Shared with me', n: this.s.reps.filter((r) => r.owner !== 'me').length as number | null },
      { id: 'sched', label: 'Scheduled', n: this.s.scheds.length as number | null },
      { id: 'tpl', label: 'Assigned reports', n: this.s.library().length as number | null },
      { id: 'soon', label: 'Coming soon', n: null as number | null },
    ];
  });
  /** A folder is part of My reports, so that tab stays lit inside one. */
  tabOn(v: string) { return this.view() === v || (v === 'all' && !!this.folderView()); }
  mineCount = () => this.mine().length;
  folderView = computed(() => { this.s.rev(); return this.s.folders.find((f) => f.id === this.view()) || null; });
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
      soon: ['Coming soon', 'What we are building next. Tell us which you would use.'],
    };
    return fixed[v] || [this.s.folders.find((f) => f.id === v)?.name || 'All my reports', 'Move reports in from their ⋯ menu'];
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

  go(v: View) { this.paneDetail.set(true); this.q.set(''); this.router.navigate([], { queryParams: { view: v === 'all' ? null : v }, replaceUrl: true }); }
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
  retry(sc: Schedule) { sc.last = { at: new Date(), ok: true }; this.s.bump(); this.s.toast('Run and delivered'); }
  delSched(sc: Schedule) { this.s.scheds = this.s.scheds.filter((x) => x !== sc); this.pop.set(null); this.s.bump(); this.s.toast('Schedule deleted'); }
  openFolderDlg(f: Folder | null) { this.folderOf.set(f); this.folderName = f?.name || ''; this.folderErr.set(''); this.dlg.set('folder'); }
  addable = computed(() => { this.s.rev(); const f = this.addTo(); return f ? this.mine().filter((r) => r.folder !== f.id) : []; });
  openAdd(f: Folder) { this.addTo.set(f); this.addSel.set(new Set()); this.dlg.set('addreps'); }
  toggleAdd(id: string) { const n = new Set(this.addSel()); n.has(id) ? n.delete(id) : n.add(id); this.addSel.set(n); }
  addReps() {
    const f = this.addTo()!, ids = this.addSel();
    this.s.reps.forEach((r) => { if (ids.has(r.id)) r.folder = f.id; });
    this.dlg.set(null); this.s.bump(); this.go(f.id);
    this.s.toast(ids.size + (ids.size === 1 ? ' report' : ' reports') + ' added to ' + f.name);
  }
  saveFolder() {
    const n = this.folderName.trim(), f = this.folderOf();
    if (!n) { this.folderErr.set('Enter a folder name.'); return; }
    if (this.s.folders.some((x) => x !== f && x.name.toLowerCase() === n.toLowerCase())) { this.folderErr.set('A folder with this name already exists.'); return; }
    this.dlg.set(null);
    if (f) { f.name = n; this.s.bump(); this.s.toast('Folder renamed'); return; }
    const nf = this.s.addFolder(n);
    // From a report's Move to folder: create and move in one step
    if (this.pendingMove) { this.pendingMove.folder = nf.id; this.pendingMove = null; this.s.bump(); this.s.toast('Folder created, report moved'); return; }
    // From the heading: open the new folder and go straight to choosing its reports
    this.go(nf.id); this.s.toast('Folder created');
    if (this.mine().length) setTimeout(() => this.openAdd(nf));
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
