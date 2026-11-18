import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FIXED_REPORTS, RAIL } from './fusion-nav';

/**
 * Stand-in for an existing Fusion screen (Collections, Closing, User mgmt ...). Not part of this work:
 * it is here so the walk from a screen people use today to My reports or Report builder can be clicked.
 * Reporting shows its real list of fixed reports, because My reports sits right beside it.
 */
@Component({
  selector: 'fusion-screen',
  imports: [RouterLink],
  template: `
    <div class="fzs">
      <div class="fzs-band">{{ title() }}</div>
      @if (item() === 'reporting') {
        <div class="fzs-split">
          <ul class="fzs-list">
            @for (r of fixed; track r; let i = $index) { <li [class.on]="i === 0">{{ r }}</li> }
          </ul>
          <div class="fzs-main">
            <div class="fzs-sub">{{ fixed[0] }}</div>
            <p class="fzs-note">Fixed reports stay here, unchanged.
              <a routerLink="/reports">Reports people build themselves are in My reports →</a></p>
            <div class="fzs-ghost"><i></i><i></i><i></i><i></i></div>
          </div>
        </div>
      } @else {
        <div class="fzs-main">
          <p class="fzs-note">Existing Fusion screen. Unchanged.
            @if (mod() === 'billing') { <a routerLink="/reports">Go to My reports →</a> }
            @else { <a routerLink="/it">Go to Report builder →</a> }</p>
          <div class="fzs-ghost"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </div>
      }
    </div>`,
  styles: `
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; background: #f4f7ff; padding: 14.4px 14.4px 0; font-family: Roboto, sans-serif; }
    .fzs { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #fff; }
    .fzs-band { background: #f8f9fa; padding: 4.8px 12.8px; font: 500 12px/17px Roboto, sans-serif; color: #000; }
    .fzs-split { flex: 1; min-height: 0; display: flex; }
    .fzs-list { list-style: none; margin: 0; padding: 0; width: 190px; flex: none; border-inline-end: 1px solid #e3e8f2; overflow-y: auto; }
    .fzs-list li { padding: 7px 10px; font: 600 10.4px/1.3 Roboto, sans-serif; color: #001448; border-bottom: 1px solid #f0f2f5; }
    .fzs-list li.on { background: #d0e2ff; }
    .fzs-main { flex: 1; min-width: 0; padding: 12px 16px; }
    .fzs-sub { font: 600 12px Roboto, sans-serif; color: #000; margin-bottom: 10px; }
    .fzs-note { margin: 0 0 16px; padding: 8px 12px; border-inline-start: 3px solid #fe6300; background: #fff8f2; font-size: 13px; color: #3d3d3d; }
    .fzs-note a { color: #0065cb; font-weight: 500; margin-inline-start: 6px; }
    .fzs-ghost { display: grid; grid-template-columns: repeat(2, minmax(0, 320px)); gap: 14px 24px; }
    .fzs-ghost i { display: block; height: 32px; border: .667px solid rgb(61 61 61 / .25); border-radius: 4px; background: #fafbfc; }
  `,
})
export class FusionScreen {
  private params = toSignal(inject(ActivatedRoute).paramMap);
  readonly fixed = FIXED_REPORTS;
  mod = computed(() => this.params()?.get('mod') ?? 'billing');
  item = computed(() => this.params()?.get('item') ?? '');
  title = computed(() => {
    const all = [...RAIL.Billing, ...RAIL['Application Setup']];
    return all.find((i) => i.key === this.item())?.label ?? this.item();
  });
}
