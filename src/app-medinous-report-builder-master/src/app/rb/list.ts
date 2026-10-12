import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore, Schedule } from './store';
import { MyReport, fdate, hm } from './engine';
import { TOPICS, nextRun } from './staff';
import { RbDialog, RbPop } from './ui';
import { ScheduleDialog } from './dialogs';

type View = 'all' | 'fav' | 'sched' | 'shared' | 'tpl' | string; // string = folder id

/** Staff home: a list of views on the left (like a mail client), one flat table for the chosen view on the right. */
@Component({
  selector: 'rb-list',
  imports: [FormsModule, NgTemplateOutlet, MatIconModule, MatTooltipModule, RbDialog, RbPop, ScheduleDialog],
  template: `
    <div class="rb-page" [attr.data-rev]="s.rev()">
      <div class="rb-dhead">
        <div><h1>Billing reports</h1><p class="muted">Your reports. Start one from a template, then choose its period, filters and grouping.</p></div>
        <div class="rb-dhead-acts">
          <label class="fx-search rb-lsearch"><mat-icon>search</mat-icon><input [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Search all reports" aria-label="Search all reports" /></label>
          <button class="fx-btn fx-btn-primary" (click)="newReport()"><mat-icon>add</mat-icon>New report</button>
        </div>
      </div>

      <section class="fx-card rb-lcard">
        <nav class="rb-lnav" aria-label="Report views">
          @for (v of mainViews(); track v.id) {
            <button class="rb-lnav-i" [class.on]="!q() && view() === v.id" [attr.aria-current]="!q() && view() === v.id ? 'page' : null" (click)="go(v.id)">
              <mat-icon [class]="v.cls">{{ v.icon }}</mat-icon><span>{{ v.label }}</span><span class="n">{{ v.n }}</span></button>
          }
          <div class="rb-lnav-h">Folders</div>
          @for (f of s.folders; track f.id) {
            <button class="rb-lnav-i" [class.on]="!q() && view() === f.id" [attr.aria-current]="!q() && view() === f.id ? 'page' : null" (click)="go(f.id)">
              <mat-icon>{{ view() === f.id ? 'folder_open' : 'folder' }}</mat-icon><span>{{ f.name }}</span><span class="n">{{ inFolder(f.id).length }}</span></button>
          }
          <button class="rb-lnav-i add" (click)="folderName = ''; folderErr.set(''); dlg.set('folder')"><mat-icon>create_new_folder</mat-icon><span>New folder</span></button>
          <div class="rb-lnav-sep"></div>
          <button class="rb-lnav-i" [class.on]="!q() && view() === 'tpl'" [attr.aria-current]="!q() && view() === 'tpl' ? 'page' : null" (click)="go('tpl')">
            <mat-icon class="tp">dashboard_customize</mat-icon><span>Templates</span><span class="n">{{ s.library().length }}</span></button>
        </nav>

        <div class="rb-lmain">
          <div class="rb-lhead">
            <h2>{{ q() ? 'Results for “' + q() + '”' : title() }}</h2>
            <span class="muted tiny">{{ hint() }}</span>
          </div>

          @if (q()) {
            @if (found().length) { <ng-container *ngTemplateOutlet="reportsT; context: { $implicit: found() }" /> }
            @if (foundTpl().length) {
              <div class="rb-lsub">Templates</div>
              <ng-container *ngTemplateOutlet="tplT; context: { $implicit: foundTpl() }" />
            }
            @if (!found().length && !foundTpl().length) { <div class="rb-empty"><b>Nothing matches “{{ q() }}”</b>Try another word, or clear the search.</div> }
          } @else {
            @switch (view()) {
              @case ('sched') {
                @if (s.scheds.length) {
                  <div class="rb-ltw"><table class="rb-lt">
                    <colgroup><col class="c-title" /><col class="c-per" /><col class="c-run sm" /><col class="c-act" /></colgroup>
                    <thead><tr><th>Report</th><th>Runs</th><th class="sm">Next run</th><th><span class="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      @for (sc of s.scheds; track sc.id) {
                        @let r = s.rep(sc.src)!;
                        <tr class="rb-lrow">
                          <td><span class="rb-tcell"><button class="rb-ltitle" (click)="open(r)">{{ r.name }}</button>@if (!sc.on) { <span class="rb-tag mute">Paused</span> }</span>
                            <div class="muted tiny rb-sub">{{ s.tpl(r.tid).title }}</div></td>
                          <td class="muted tiny">{{ sc.freq }} at {{ sc.time }}<div class="rb-sub">{{ sc.fmt }} to {{ sc.deliver.join(', ') }}</div></td>
                          <td class="muted tiny sm">{{ sc.on ? next(sc) : 'Paused' }}</td>
                          <td class="rb-lact">
                            <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="sc.on = !sc.on; s.bump(); s.toast(sc.on ? 'Schedule resumed' : 'Schedule paused')"><mat-icon>{{ sc.on ? 'pause' : 'play_arrow' }}</mat-icon>{{ sc.on ? 'Pause' : 'Resume' }}</button>
                            <button class="fx-icon-btn" (click)="pop.set({ kind: 'sched', el: $any($event.currentTarget), sc })" aria-label="More schedule actions" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
                          </td>
                        </tr>
                      }
                    </tbody></table></div>
                } @else { <div class="rb-empty"><b>Nothing scheduled</b>Open one of your reports and choose Schedule from its ⋯ menu.</div> }
              }
              @case ('tpl') { <ng-container *ngTemplateOutlet="tplT; context: { $implicit: s.library() }" /> }
              @default {
                @if (rows().length) { <ng-container *ngTemplateOutlet="reportsT; context: { $implicit: rows() }" /> }
                @else { <div class="rb-empty"><b>{{ emptyTitle() }}</b>{{ emptyText() }}</div> }
              }
            }
          }
        </div>
      </section>
    </div>

    <ng-template #reportsT let-list>
      <div class="rb-ltw"><table class="rb-lt">
        <colgroup><col class="c-title" /><col class="c-per" /><col class="c-run sm" /><col class="c-act" /></colgroup>
        <thead><tr><th>Report</th><th>Period and filters</th><th class="sm">Last run</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          @for (r of list; track r.id) {
            <tr class="rb-lrow">
              <td>
                <span class="rb-tcell">
                  <button class="fx-icon-btn rb-star" [class.on]="r.fav" (click)="fav(r)" [attr.aria-label]="(r.fav ? 'Remove from' : 'Add to') + ' favourites'" [attr.aria-pressed]="!!r.fav"><mat-icon>{{ r.fav ? 'star' : 'star_border' }}</mat-icon></button>
                  <button class="rb-ltitle" (click)="open(r)" [title]="r.name">{{ r.name }}</button>
                </span>
                <div class="rb-sub rb-meta2">
                  <span class="muted tiny">{{ s.tpl(r.tid).title }}</span>
                  @if (scheduled(r)) { <span class="rb-tag ok"><mat-icon class="xs">schedule</mat-icon> Scheduled</span> }
                  @if (r.owner !== 'me') { <span class="rb-tag vio">Shared by {{ r.owner.split(' ')[0] }}</span> }
                  @else if (r.share.mode !== 'private') { <span class="rb-tag run">Shared</span> }
                  @if (folderName2(r) && view() !== r.folder) { <span class="rb-tag mute"><mat-icon class="xs">folder</mat-icon> {{ folderName2(r) }}</span> }
                </div>
              </td>
              <td class="muted tiny"><span class="rb-clamp">{{ s.periodText(r) }}@if (r.clauses?.length) { · {{ r.clauses.length }} {{ r.clauses.length === 1 ? 'filter' : 'filters' }}}</span></td>
              <td class="muted tiny sm">{{ r.lastRun ? fdate(r.lastRun) + ' ' + hm(r.lastRun) : 'Not run yet' }}</td>
              <td class="rb-lact">
                <button class="fx-btn fx-btn-secondary fx-btn-sm rb-openb" (click)="open(r)" matTooltip="Open to change the period, filters and grouping" aria-label="Open"><mat-icon>tune</mat-icon><span>Open</span></button>
                <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="open(r, true)"><mat-icon>play_arrow</mat-icon>Run</button>
                <button class="fx-icon-btn" (click)="pop.set({ kind: 'row', el: $any($event.currentTarget), r })" aria-label="More actions" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
              </td>
            </tr>
          }
        </tbody></table></div>
    </ng-template>

    <ng-template #tplT let-list>
      <div class="rb-ltw"><table class="rb-lt">
        <colgroup><col class="c-title" /><col class="c-per" /><col class="c-act" /></colgroup>
        <thead><tr><th>Template</th><th>What it shows</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          @for (t of list; track t.id) {
            <tr class="rb-lrow">
              <td><button class="rb-ltitle" (click)="openTpl(t.id)">{{ t.title }}</button><div class="muted tiny rb-sub">{{ topic(t.id) }}</div></td>
              <td class="muted tiny"><span class="rb-clamp">{{ t.desc }}</span></td>
              <td class="rb-lact">
                <button class="fx-btn fx-btn-secondary fx-btn-sm rb-openb" (click)="openTpl(t.id)" matTooltip="Open to set the period, filters and grouping" aria-label="Open"><mat-icon>tune</mat-icon><span>Open</span></button>
                <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="openTpl(t.id, true)"><mat-icon>play_arrow</mat-icon>Run</button>
              </td>
            </tr>
          }
        </tbody></table></div>
    </ng-template>

    @if (pop(); as p) {
      <rb-pop [anchor]="p.el" (closed)="pop.set(null)">
        @if (p.kind === 'row') {
          @let r = p.r!; @let own = r.owner === 'me';
          <button class="rb-mi" (click)="pop.set(null); open(r)"><mat-icon>tune</mat-icon>Open</button>
          @if (own) {
            <button class="rb-mi" (click)="pop.set(null); renameOf.set(r); renameTo = r.name; renameErr.set(''); dlg.set('rename')"><mat-icon>edit</mat-icon>Rename</button>
            <div class="rb-mlab">Move to folder</div>
            <button class="rb-mi" [class.on]="!r.folder" (click)="move(r, null)"><mat-icon>block</mat-icon>No folder</button>
            @for (f of s.folders; track f.id) { <button class="rb-mi" [class.on]="r.folder === f.id" (click)="move(r, f.id)"><mat-icon>folder</mat-icon>{{ f.name }}</button> }
            <div class="rb-msep"></div>
          }
          <button class="rb-mi" (click)="pop.set(null); s.duplicate(r); s.toast('Duplicated')"><mat-icon>content_copy</mat-icon>Duplicate</button>
          @if (own) { <button class="rb-mi" (click)="pop.set(null); deleting.set(r); dlg.set('delete')"><mat-icon>delete_outline</mat-icon>Delete</button> }
        } @else {
          <button class="rb-mi" (click)="pop.set(null); schedEdit.set(p.sc!)"><mat-icon>edit</mat-icon>Change schedule</button>
          <button class="rb-mi" (click)="delSched(p.sc!)"><mat-icon>delete_outline</mat-icon>Delete schedule</button>
        }
      </rb-pop>
    }

    @switch (dlg()) {
      @case ('folder') {
        <rb-dialog title="New folder" (closed)="dlg.set(null)">
          <input class="rb-inp full tall" [(ngModel)]="folderName" placeholder="For example: Month end" aria-label="Folder name" (keydown.enter)="addFolder()" />
          @if (folderErr()) { <div class="rb-ferr">{{ folderErr() }}</div> }
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="addFolder()">Create</button></ng-container>
        </rb-dialog>
      }
      @case ('rename') {
        <rb-dialog title="Rename" (closed)="dlg.set(null)">
          <input class="rb-inp full tall" [(ngModel)]="renameTo" aria-label="Report name" (keydown.enter)="rename()" />
          @if (renameErr()) { <div class="rb-ferr">{{ renameErr() }}</div> }
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="rename()">Rename</button></ng-container>
        </rb-dialog>
      }
      @case ('delete') {
        @let r = deleting()!;
        <rb-dialog [title]="'Delete ' + r.name + '?'" (closed)="dlg.set(null)">
          <p class="muted tiny">The report's period, filters and columns are removed, and any schedules on it stop. The template stays available under Templates.</p>
          <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button>
            <button class="fx-btn fx-btn-primary danger" (click)="s.deleteRep(r.id); dlg.set(null); s.toast('Deleted')">Delete</button></ng-container>
        </rb-dialog>
      }
    }
    @if (schedEdit(); as sc) { <rb-schedule [report]="s.rep(sc.src)!" [existing]="sc" (closed)="schedEdit.set(null)" /> }
  `,
})
export class RbList {
  fdate = fdate; hm = hm;
  q = signal('');
  view = signal<View>('all');
  pop = signal<{ kind: 'row' | 'sched'; el: HTMLElement; r?: MyReport; sc?: Schedule } | null>(null);
  dlg = signal<'folder' | 'rename' | 'delete' | null>(null);
  schedEdit = signal<Schedule | null>(null);
  folderName = ''; folderErr = signal('');
  renameOf = signal<MyReport | null>(null); renameTo = ''; renameErr = signal('');
  deleting = signal<MyReport | null>(null);

  constructor(public s: RbStore, private router: Router, route: ActivatedRoute) {
    s.setRole('user');
    route.queryParamMap.subscribe((p) => this.view.set(p.get('view') || 'all'));
  }

  private mine = () => this.s.reps.filter((r) => r.owner === 'me');
  inFolder = (id: string) => this.mine().filter((r) => r.folder === id);
  mainViews = computed(() => {
    this.s.rev();
    return [
      { id: 'all', label: 'All my reports', icon: 'description', cls: '', n: this.mine().length },
      { id: 'fav', label: 'Favourites', icon: 'star', cls: 'fav', n: this.s.reps.filter((r) => r.fav).length },
      { id: 'sched', label: 'Scheduled', icon: 'schedule', cls: 'sc', n: this.s.scheds.length },
      { id: 'shared', label: 'Shared with me', icon: 'folder_shared', cls: 'sh', n: this.s.reps.filter((r) => r.owner !== 'me').length },
    ];
  });
  title = computed(() => {
    const v = this.view(); const m = this.mainViews().find((x) => x.id === v);
    return m ? m.label : v === 'tpl' ? 'Templates' : this.s.folders.find((f) => f.id === v)?.name || 'All my reports';
  });
  hint = computed(() => {
    if (this.q()) return '';
    return ({ all: 'Every report you have saved', fav: 'Star a report to keep it here', sched: 'Reports that run on their own and are delivered to you', shared: 'You can run these and save your own copy', tpl: 'Run one as it is, or open it to set the period, filters and grouping' } as Record<string, string>)[this.view()] || 'Use ⋯ → Move to folder on a report to add it here';
  });
  rows = computed<MyReport[]>(() => {
    this.s.rev(); const v = this.view();
    if (v === 'all') return this.mine();
    if (v === 'fav') return this.s.reps.filter((r) => r.fav);
    if (v === 'shared') return this.s.reps.filter((r) => r.owner !== 'me');
    return this.inFolder(v);
  });
  emptyTitle = computed(() => ({ fav: 'No favourites yet', shared: 'Nothing shared with you yet', all: 'No reports yet' } as Record<string, string>)[this.view()] || 'This folder is empty');
  emptyText = computed(() => ({ fav: 'Click the star next to any report.', shared: 'When colleagues share a report with you, it appears here.', all: 'Start one from Templates, or use New report.' } as Record<string, string>)[this.view()] || 'Use the ⋯ menu on a report to move it here.');
  found = computed(() => { this.s.rev(); const q = this.q().toLowerCase(); return this.s.reps.filter((r) => (r.name + ' ' + this.s.tpl(r.tid).title).toLowerCase().includes(q)); });
  foundTpl = computed(() => { const q = this.q().toLowerCase(); return this.s.library().filter((t) => (t.title + ' ' + t.desc).toLowerCase().includes(q)); });

  go(v: View) { this.q.set(''); this.router.navigate([], { queryParams: { view: v === 'all' ? null : v }, replaceUrl: true }); }
  folderName2(r: MyReport) { return r.folder ? this.s.folders.find((f) => f.id === r.folder)?.name || '' : ''; }
  scheduled(r: MyReport) { return this.s.scheds.some((x) => x.src === r.id && x.on); }
  next(sc: Schedule) { const d = nextRun(sc.freq, sc.time, this.s.today); return `${fdate(d)} ${sc.time}`; }
  topic(id: string) { return TOPICS[id] || 'Other'; }

  open(r: MyReport, run = false) { this.router.navigate(['/report', 'rep', r.id], { queryParams: run ? { run: 1 } : {} }); }
  fav(r: MyReport) { r.fav = !r.fav; this.s.bump(); this.s.toast(r.fav ? 'Added to Favourites' : 'Removed from Favourites'); }
  move(r: MyReport, folder: string | null) { r.folder = folder; this.pop.set(null); this.s.bump(); this.s.toast(folder ? 'Moved to ' + this.folderName2(r) : 'Removed from its folder'); }
  delSched(sc: Schedule) { this.s.scheds = this.s.scheds.filter((x) => x !== sc); this.pop.set(null); this.s.bump(); this.s.toast('Schedule deleted'); }
  addFolder() {
    const n = this.folderName.trim();
    if (!n) { this.folderErr.set('Enter a folder name.'); return; }
    if (this.s.folders.some((f) => f.name.toLowerCase() === n.toLowerCase())) { this.folderErr.set('A folder with this name already exists.'); return; }
    const f = this.s.addFolder(n); this.dlg.set(null); this.go(f.id); this.s.toast('Folder created');
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
