import { Component, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RbStore } from './store';
import { COLLEAGUES, MyReport, Share } from './engine';
import { RbDialog } from './ui';

/** Share a saved version: only me, named colleagues, or everyone in the module. */
@Component({
  selector: 'rb-share',
  imports: [MatIconModule, RbDialog],
  template: `
    <rb-dialog [title]="'Share ' + report().name" (closed)="closed.emit()">
      <p class="muted tiny">Colleagues get your period, criteria, columns and sort. They can run it and save their own copy, but cannot change yours. Each person sees only data their own access allows.</p>
      @for (o of modes; track o[0]) {
        <label class="rb-mrow"><input type="radio" name="shm" [checked]="sh().mode === o[0]" (change)="setMode(o[0])" /><b>{{ o[1] }}</b></label>
      }
      @if (sh().mode === 'people') {
        <select class="rb-sel full" (change)="add($any($event.target).value); $any($event.target).value = ''" aria-label="Add a colleague">
          <option value="">Add a colleague</option>
          @for (c of colleagues; track c) { <option [disabled]="sh().people.includes(c)">{{ c }}</option> }
        </select>
        <div class="rb-chips">
          @for (p of sh().people; track p) { <span class="rb-chip">{{ p }}<button (click)="remove(p)" [attr.aria-label]="'Remove ' + p"><mat-icon>close</mat-icon></button></span> }
          @empty { <span class="muted tiny">Nobody yet</span> }
        </div>
        @if (err()) { <div class="rb-ferr">{{ err() }}</div> }
      }
      <ng-container foot>
        <button class="fx-btn fx-btn-secondary" (click)="closed.emit()">Cancel</button>
        <button class="fx-btn fx-btn-primary" (click)="save()">Save sharing</button>
      </ng-container>
    </rb-dialog>`,
})
export class ShareDialog {
  report = input.required<MyReport>();
  closed = output();
  colleagues = COLLEAGUES;
  modes: [Share['mode'], string][] = [['private', 'Only me'], ['people', 'Specific colleagues'], ['module', 'Everyone in Billing']];
  sh = signal<Share>({ mode: 'private', people: [] });
  err = signal('');
  constructor(private s: RbStore) { setTimeout(() => this.sh.set(s.clone(this.report().share))); }
  setMode(m: Share['mode']) { this.sh.update((x) => ({ ...x, mode: m })); this.err.set(''); }
  add(p: string) { if (p) this.sh.update((x) => ({ ...x, people: x.people.includes(p) ? x.people : [...x.people, p] })); this.err.set(''); }
  remove(p: string) { this.sh.update((x) => ({ ...x, people: x.people.filter((y) => y !== p) })); }
  save() {
    const sh = this.sh();
    if (sh.mode === 'people' && !sh.people.length) { this.err.set('Add at least one colleague.'); return; }
    this.report().share = sh; this.s.bump(); this.closed.emit();
    this.s.toast(sh.mode === 'private' ? 'Only you can see it now' : sh.mode === 'module' ? 'Shared with everyone in Billing' : `Shared with ${sh.people.length} ${sh.people.length === 1 ? 'person' : 'people'}`);
  }
}
