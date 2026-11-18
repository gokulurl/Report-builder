import { Injectable, signal } from '@angular/core';

/** Registration v2's four window classes (medinous-registration-v2/src/app/ui/viewport.ts):
 *  compact <600 (one pane, bottom bar) · medium 600–839 (one pane, bottom bar)
 *  · expanded 840–1199 (two panes, top nav) · large 1200+ (two panes, labelled top nav).
 *  CSS uses the same ceilings: 599.98 / 839.98 / 1199.98. Use this only where CSS cannot reach,
 *  such as "show one pane instead of two", which is a template decision. */
@Injectable({ providedIn: 'root' })
export class Viewport {
  private q = (max: number) => matchMedia(`(max-width: ${max}px)`);
  readonly compact = signal(false);
  readonly singlePane = signal(false);
  readonly expanded = signal(false);
  constructor() {
    const watch = (mq: MediaQueryList, s: { set(v: boolean): void }) => { s.set(mq.matches); mq.addEventListener('change', (e) => s.set(e.matches)); };
    watch(this.q(599.98), this.compact);
    watch(this.q(839.98), this.singlePane);
    watch(this.q(1199.98), this.expanded);
  }
}

/** Mnemonics, the Registration v2 way: the letter is underlined on the control and Alt runs it.
 *  Alt, not Ctrl, because Ctrl+R/T/W/S belong to the browser. Returns the letter, or null when the
 *  key is not Alt+letter. Uses e.code so it also works where Alt types a special character. */
export function altLetter(e: KeyboardEvent): string | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !e.code.startsWith('Key')) return null;
  return e.code.slice(3).toLowerCase();
}

/** True while a dialog or the menu covers the page: the page underneath then keeps its shortcuts to itself. */
export function overlayOpen(): boolean {
  return !!document.querySelector('.rb-scrim, .rb-dscrim, .drawer');
}
