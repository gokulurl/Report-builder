import { Component, computed, input, output, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore } from './store';
import { ENTITIES, MODULES, Template } from './engine';
import { RbDialog, RbPop } from './ui';

/** Publish a template to the modules whose staff should find it. Its own module is always included. */
@Component({
  selector: 'rb-publish',
  imports: [RbDialog],
  template: `
    <rb-dialog [title]="'Publish ' + tpl().title" (closed)="closed.emit()">
      <p class="muted tiny">Staff in these modules will find it in their reports. It always appears in {{ tpl().module }}, where its data comes from.</p>
      @for (m of modules; track m) {
        <label class="rb-mrow"><input type="checkbox" [checked]="picked().includes(m)" [disabled]="m === tpl().module" (change)="toggle(m)" /><b>{{ m }}</b></label>
      }
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
  imports: [MatIconModule, MatTooltipModule, RbDialog, RbPop, PublishDialog],
  template: `
    <div class="rb-page" [attr.data-rev]="s.rev()">
      <div class="rb-dhead">
        <div><h1>Templates</h1>
          <p class="muted">A template is the shape of a report. Staff choose the period and their own filters each time they run it.</p></div>
        <div class="rb-dhead-acts">
          <label class="fx-check inline"><input type="checkbox" [checked]="showRemoved()" (change)="showRemoved.set(!showRemoved())" /> Show removed</label>
          <button class="fx-btn fx-btn-primary" (click)="newOpen.set(true)"><mat-icon>add</mat-icon>New template</button>
        </div>
      </div>
      <section class="fx-card rb-list">
        @for (t of list(); track t.id) {
          <div class="rb-row" [class.removed]="t.removed">
            <div class="rb-rmain">
              <div class="rb-rt static">{{ t.title }}
                <span class="rb-tag" [class.ok]="t.status === 'published'" [class.mute]="t.status === 'draft'">{{ t.status === 'draft' ? 'Draft' : 'Published' }}</span>
                @if (t.removed) { <span class="rb-tag mute">Removed</span> }
              </div>
              <div class="rb-rd">{{ t.desc }}</div>
              <div class="rb-strip"><mat-icon>event</mat-icon><span>Period on {{ s.periodLabel(t) }}, chosen by staff@if (t.scope.length) {. Restricted to {{ s.scopeText(t) }}}</span></div>
            </div>
            <div class="rb-rplace">@for (p of t.places; track p) { <span class="rb-pill">{{ p }}</span> }</div>
            <div class="rb-racts">
              @if (t.removed) {
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="t.removed = false; s.bump()"><mat-icon>restore</mat-icon>Restore</button>
              } @else {
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="router.navigate(['/run', 'tpl', t.id])"><mat-icon>visibility</mat-icon>Open as staff</button>
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="router.navigate(['/it/builder', t.id])"><mat-icon>edit</mat-icon>Edit</button>
                <button class="fx-icon-btn" (click)="menu.set({ t, el: $any($event.currentTarget) })" aria-label="More actions" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
              }
            </div>
          </div>
        }
      </section>
    </div>

    @if (menu(); as m) {
      <rb-pop [anchor]="m.el" (closed)="menu.set(null)">
        <button class="rb-mi" (click)="publishing.set(m.t); menu.set(null)"><mat-icon>ios_share</mat-icon>Change where it appears</button>
        <button class="rb-mi" (click)="m.t.removed = true; menu.set(null); s.bump(); s.toast(m.t.title + ' removed. Show removed to restore it')"><mat-icon>delete_outline</mat-icon>Remove template</button>
      </rb-pop>
    }
    @if (publishing(); as t) {
      <rb-publish [tpl]="t" (closed)="publishing.set(null)" (done)="published(t, $event)" />
    }
    @if (newOpen()) {
      <rb-dialog title="New template" (closed)="newOpen.set(false)">
        <p class="muted tiny">Choose where the data comes from.</p>
        <label class="rb-flab">Module
          <select class="rb-sel full" [value]="mod()" (change)="mod.set($any($event.target).value); ent.set(firstEntity())">
            @for (m of modules; track m) { <option>{{ m }}</option> }
          </select></label>
        <div class="rb-flab">Data set</div>
        @for (e of entities(); track e.id) {
          <label class="rb-mrow" [class.off]="!e.sample">
            <input type="radio" name="ent" [checked]="ent() === e.id" [disabled]="!e.sample" (change)="ent.set(e.id)" />
            <div><b>{{ e.name }}</b><div class="muted tiny">{{ e.row }}@if (!e.sample) {. Sample data not available in this prototype}</div></div>
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
  newOpen = signal(false);
  modules = MODULES;
  mod = signal('Billing');
  ent = signal<string | null>('inv_detail');
  entities = computed(() => ENTITIES[this.mod()]);

  constructor(public s: RbStore, public router: Router, route: ActivatedRoute) {
    s.setRole('admin');
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
    t.places = places; t.status = 'published'; this.publishing.set(null); this.s.bump();
    this.s.toast('Published to ' + places.join(', ').replace(/, ([^,]*)$/, ' and $1'));
  }
}
