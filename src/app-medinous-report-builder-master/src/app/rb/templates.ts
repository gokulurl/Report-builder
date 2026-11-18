import { Component, HostListener, computed, input, output, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore } from './store';
import { ENTITIES, MODULES, Template } from './engine';
import { RbDialog, RbInfo, RbPop } from './ui';
import { RbSideList } from './side-list';

/** Publish a template to the modules whose staff should find it. Its own module is always included. */
@Component({
  selector: 'rb-publish',
  imports: [RbDialog, RbInfo],
  template: `
    <rb-dialog [title]="'Publish ' + tpl().title" (closed)="closed.emit()">
      <p class="muted tiny">Always in {{ tpl().module }}. <rb-info [text]="'Staff in the modules you tick find it in their reports. It always appears in ' + tpl().module + ', where its data comes from.'" /></p>
      <!-- 11 modules: two columns, so the list is half as tall -->
      <div class="rb-modgrid" role="group" aria-label="Modules">
      @for (m of modules; track m) {
        <label class="rb-mrow"><input type="checkbox" [checked]="picked().includes(m)" [disabled]="m === tpl().module" (change)="toggle(m)" /><b>{{ m }}</b></label>
      }
      </div>
      <ng-container foot>
        <button class="fx-btn fx-btn-secondary" (click)="closed.emit()">Cancel</button>
        <button class="fx-btn fx-btn-primary" (click)="done.emit(picked())">Publish</button>
      </ng-container>
    </rb-dialog>`,
})
export class PublishDialog {
  tpl = input.required<Template>();
  closed = output();
  done = output<string[]>();
  modules = MODULES;
  picked = signal<string[]>([]);
  constructor() { setTimeout(() => this.picked.set([...new Set([this.tpl().module, ...this.tpl().places])])); }
  toggle(m: string) { this.picked.update((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m])); }
}

/** IT home: every template, its status and where it is published. */
@Component({
  selector: 'rb-templates',
  imports: [MatIconModule, MatTooltipModule, RbDialog, RbPop, PublishDialog, RbSideList, RbInfo],
  template: `
    <div class="hub-shell" [attr.data-rev]="s.rev()">
      <rb-side-list />
      <div class="hub-main">
        <div class="desk-bar">
          <div class="tabs" role="tablist" aria-label="Templates">
            <button type="button" role="tab" aria-selected="true" class="has-work">Templates <span class="count">{{ list().length }}</span></button>
          </div>
          <div class="desk-bar-end">
            <label class="fx-check inline"><input type="checkbox" [checked]="showRemoved()" (change)="showRemoved.set(!showRemoved())" /> Show removed</label>
            <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="newOpen.set(true)" title="New template (Alt+N)" aria-keyshortcuts="Alt+N"><mat-icon>add</mat-icon><span><u>N</u>ew template</span></button>
          </div>
        </div>
        <div class="hub-work">
      <section class="fx-card rb-list">
        @for (t of list(); track t.id) {
          <div class="rb-row" [class.removed]="t.removed">
            <div class="rb-rmain">
              <div class="rb-rt static">{{ t.title }}
                <span class="rb-tag status" [class.ok]="t.status === 'published'" [class.mute]="t.status === 'draft'">{{ t.status === 'draft' ? 'Draft' : 'Published' }}</span>
                @if (t.removed) { <span class="rb-tag status mute">Removed</span> }
              </div>
              <div class="rb-rd">{{ t.desc }}</div>
              <div class="rb-strip"><mat-icon>event</mat-icon><span>{{ s.periodLabel(t) }}@if (t.scope.length) { · {{ s.scopeText(t) }} only}</span></div>
            </div>
            <div matTooltip="Modules whose staff can find and run this template" class="rb-rplace">@for (p of t.places; track p) { <span class="rb-pill">{{ p }}</span> }</div>
            <div class="rb-racts">
              @if (t.removed) {
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="t.removed = false; s.bump()"><mat-icon>restore</mat-icon>Restore</button>
              } @else {
                <a class="fx-btn fx-btn-ghost fx-btn-sm" href="/reports?view=tpl" target="_blank" rel="noopener" matTooltip="Opens My reports in a new tab, as staff see it"><mat-icon>visibility</mat-icon>See in My reports</a>
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="router.navigate(['/it/builder', t.id])"><mat-icon>edit</mat-icon>Edit</button>
                <button matTooltip="Place in modules or remove" class="fx-icon-btn" (click)="menu.set({ t, el: $any($event.currentTarget) })" aria-label="More actions" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
              }
            </div>
          </div>
        }
      </section>
        </div>
      </div>
    </div>

    @if (menu(); as m) {
      <rb-pop [anchor]="m.el" (closed)="menu.set(null)">
        <button class="rb-mi" (click)="publishing.set(m.t); menu.set(null)"><mat-icon [matTooltip]="m.t.status === 'draft' ? 'Publishes it to staff in the modules you pick' : ''">ios_share</mat-icon>Place in modules</button>
        <button class="rb-mi" (click)="removing.set(m.t); menu.set(null)"><mat-icon>delete_outline</mat-icon>Remove</button>
      </rb-pop>
    }
    @if (removing(); as t) {
      <rb-dialog [title]="'Remove ' + t.title + '?'" (closed)="removing.set(null)">
        <p class="muted tiny">Staff can't start new reports from it.@if (deps(t); as n) { {{ n.reps }} saved {{ n.reps === 1 ? 'report uses' : 'reports use' }} it@if (n.scheds) { and {{ n.scheds }} {{ n.scheds === 1 ? 'schedule stops' : 'schedules stop' }}}. }Restore from Show removed.</p>
        <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="removing.set(null)">Cancel</button>
          <button class="fx-btn fx-btn-primary danger" (click)="remove(t)">Remove</button></ng-container>
      </rb-dialog>
    }
    @if (publishing(); as t) {
      <rb-publish [tpl]="t" (closed)="publishing.set(null)" (done)="published(t, $event)" />
    }
    @if (newOpen()) {
      <rb-dialog title="New template" (closed)="newOpen.set(false)">
        <label class="rb-flab">Module <rb-info text="Where its data comes from. Once published, it always appears in this module" />
          <select class="rb-sel full" [value]="mod()" (change)="mod.set($any($event.target).value); ent.set(firstEntity())">
            @for (m of modules; track m) { <option>{{ m }}</option> }
          </select></label>
        <div class="rb-flab">Entity <rb-info text="What one row of the report is, for example an invoice or a service line." /></div>
        @for (e of entities(); track e.id) {
          <label class="rb-mrow" [class.off]="!e.sample">
            <input type="radio" name="ent" [checked]="ent() === e.id" [disabled]="!e.sample" (change)="ent.set(e.id)" />
            <div><b>{{ e.name }}</b><div class="muted tiny">{{ e.row }}@if (!e.sample) {. Not available in this prototype}</div></div>
          </label>
        }
        <ng-container foot>
          <button class="fx-btn fx-btn-secondary" (click)="newOpen.set(false)">Cancel</button>
          <button class="fx-btn fx-btn-primary" [disabled]="!ent()" (click)="start()">Start</button>
        </ng-container>
      </rb-dialog>
    }`,
})
export class RbTemplates {
  showRemoved = signal(false);
  menu = signal<{ t: Template; el: HTMLElement } | null>(null);
  publishing = signal<Template | null>(null);
  removing = signal<Template | null>(null);
  deps(t: Template) { const reps = this.s.reps.filter((r) => r.tid === t.id); return reps.length ? { reps: reps.length, scheds: this.s.scheds.filter((x) => reps.some((r) => r.id === x.src)).length } : null; }
  remove(t: Template) { t.removed = true; this.removing.set(null); this.s.bump(); this.s.toast(t.title + ' removed. Tick Show removed to restore it'); }
  newOpen = signal(false);
  modules = MODULES;
  mod = signal('Billing');
  ent = signal<string | null>('inv_detail');
  entities = computed(() => ENTITIES[this.mod()]);

  constructor(public s: RbStore, public router: Router, route: ActivatedRoute) {
    s.setRole('admin');
    if (innerWidth < 1200) s.listFolded.set(true);   // medium window: the table is the list; fold the duplicate
    route.queryParamMap.subscribe((p) => { if (p.get('new')) { this.newOpen.set(true); router.navigate([], { queryParams: {}, replaceUrl: true }); } });
  }
  list = computed(() => { this.s.rev(); return this.s.templates.filter((t) => !t.removed || this.showRemoved()); });
  firstEntity() { return ENTITIES[this.mod()].find((e) => e.sample)?.id || null; }
  start() {
    const t = this.s.blankTemplate(this.mod(), this.ent()!);
    this.newOpen.set(false);
    this.router.navigate(['/it/builder', 'new'], { state: { draft: t } });
  }
  published(t: Template, places: string[]) {
    const wasPub = t.status === 'published';
    t.places = places; t.status = 'published'; this.publishing.set(null); this.s.bump();
    this.s.toast((wasPub ? 'Placed in ' : 'Published to ') + places.join(', ').replace(/, ([^,]*)$/, ' and $1'));
  }
}
