import { Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore } from './store';
import { MyReport, USERS } from './engine';
import { RbDialog } from './ui';

/** Share and access: find colleagues by name, email or role; each one can run the report and save their own copy. */
@Component({
  selector: 'rb-share',
  imports: [MatIconModule, MatTooltipModule, RbDialog],
  template: `
    <rb-dialog [title]="'Share ' + report().name" [width]="520" (closed)="closed.emit()">
      <p class="muted tiny">People you add can run this report and save their own copy. They cannot change yours. Each person sees only the data their own access allows.</p>
      <label class="rb-flab">Add people
        <span class="fx-search"><mat-icon>search</mat-icon><input [value]="q()" (input)="q.set($any($event.target).value)" placeholder="Search by name, email or role" autocomplete="off" aria-label="Search people" /></span>
      </label>
      @if (q().trim()) {
        <div class="rb-shres" role="listbox" aria-label="Matching people">
          @for (u of matches(); track u[0]) {
            <button class="rb-mi" (click)="add(u[0])"><mat-icon>person_add</mat-icon>{{ u[0] }}<span class="r">{{ u[2] }}</span></button>
          } @empty { <div class="rb-mlab">No one matches “{{ q() }}”</div> }
        </div>
      }
      <div class="rb-flab">People with access</div>
      <div class="rb-shlist">
        <div class="rb-shp"><mat-icon class="rb-shav">account_circle</mat-icon><div><b>You</b></div><span class="muted tiny">Owner</span></div>
        @for (p of people(); track p) {
          @let u = user(p);
          <div class="rb-shp"><mat-icon class="rb-shav">account_circle</mat-icon>
            <div><b>{{ u[0] }}</b><div class="muted tiny">{{ u[1] }}@if (u[2]) { · {{ u[2] }}}</div></div>
            <span class="muted tiny">Can run and save a copy</span>
            <button class="fx-icon-btn sm" (click)="remove(p)" [attr.aria-label]="'Remove access for ' + u[0]" matTooltip="Remove access"><mat-icon>person_remove</mat-icon></button></div>
        } @empty { <p class="muted tiny">Only you can see this report.</p> }
      </div>
      <ng-container foot>
        <button class="fx-btn fx-btn-secondary" (click)="closed.emit()">Cancel</button>
        <button class="fx-btn fx-btn-primary" (click)="save()">Save</button>
      </ng-container>
    </rb-dialog>`,
})
export class ShareDialog {
  report = input.required<MyReport>();
  closed = output();
  q = signal('');
  people = signal<string[]>([]);
  constructor(private s: RbStore) { setTimeout(() => this.people.set([...this.report().share.people].filter((x) => x !== 'me'))); }
  matches = computed(() => {
    const q = this.q().trim().toLowerCase();
    return USERS.filter((u) => !this.people().includes(u[0]) && u.join(' ').toLowerCase().includes(q));
  });
  user(n: string): [string, string, string] { return USERS.find((u) => u[0] === n) || [n, '', '']; }
  add(n: string) { this.people.update((p) => [...p, n]); this.q.set(''); }
  remove(n: string) { this.people.update((p) => p.filter((x) => x !== n)); }
  save() {
    const people = this.people();
    this.report().share = { mode: people.length ? 'people' : 'private', people };
    this.s.bump(); this.closed.emit();
    this.s.toast(people.length ? `Shared with ${people.length} ${people.length === 1 ? 'person' : 'people'}` : 'Only you can see this report now');
  }
}
