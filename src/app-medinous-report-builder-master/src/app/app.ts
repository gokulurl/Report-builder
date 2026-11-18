import { Component, afterNextRender, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs';
import { RbStore } from './rb/store';
import { RbPop } from './rb/ui';
import { hm } from './rb/engine';
import { MODULES, RAIL, type ModuleName, type RailItem } from './fusion-nav';

type Lang = { code: string; label: string; english: string; ready: boolean; dir: 'ltr' | 'rtl'; note?: string };

/**
 * The Fusion shell, kept as the live product has it: the white app bar (logo, hospital | department,
 * language, switch module, help, profile) and the module's left rail. The new screens render inside
 * the content area only. Two rail items are new: MY REPORTS in Billing and REPORT BUILDER in
 * Application Setup. The bell is the one addition to the app bar (background runs notify there).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatIconModule, MatTooltipModule, RbPop],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  hm = hm;
  readonly modules = MODULES;
  private url = signal('');

  /** The module comes from the URL, as in Fusion: the rail always belongs to one module. */
  module = computed<ModuleName>(() => {
    const u = this.url();
    return u.startsWith('/it') || u.startsWith('/fusion/setup') ? 'Application Setup' : 'Billing';
  });
  rail = computed<RailItem[]>(() => RAIL[this.module()]);
  /** Which rail item is lit. A report page belongs to MY REPORTS; the builder to REPORT BUILDER. */
  active = computed(() => {
    const u = this.url().split('?')[0];
    if (u.startsWith('/reports') || u.startsWith('/report/')) return 'my-reports';
    if (u.startsWith('/it')) return 'report-builder';
    const m = u.match(/^\/fusion\/[^/]+\/([^/]+)/);
    return m ? m[1] : '';
  });

  bell = signal<HTMLElement | null>(null);
  who = signal<HTMLElement | null>(null);
  help = signal<HTMLElement | null>(null);
  mods = signal<HTMLElement | null>(null);
  langPop = signal<HTMLElement | null>(null);
  unread = computed(() => { this.s.rev(); return this.s.notes.filter((n) => !n.read).length; });

  readonly helpGroups = [
    { title: 'Learn', items: ['About Medinous', 'Implementation manual', 'Release notes'] },
    { title: 'Support', items: ['Raise a support ticket', 'Request a callback'] },
  ];
  readonly languages: Lang[] = [
    { code: 'en', label: 'English', english: 'English', ready: true, dir: 'ltr' },
    { code: 'ar', label: 'العربية', english: 'Arabic', ready: true, dir: 'rtl', note: 'Layout only · words not translated yet' },
  ];
  lang = signal(this.readLang());
  current = computed(() => this.languages.find((l) => l.code === this.lang()) ?? this.languages[0]);

  constructor(private router: Router, public s: RbStore) {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const u = (e as NavigationEnd).urlAfterRedirects;
      this.url.set(u);
      // The rail item decides the view: MY REPORTS is always the staff view (IT use it the same way),
      // REPORT BUILDER is IT's. In the product, access to REPORT BUILDER comes from HMS permissions.
      if (u.startsWith('/reports') || u.startsWith('/report/')) this.s.setRole('user');
      else if (u.startsWith('/it')) this.s.setRole('admin');
    });
    this.applyLang();
    afterNextRender(() => this.tagIcons());
  }

  /** Every <mat-icon> keeps its ligature text, because Angular binds it. This copies that text into
   *  data-i, which styles/_hero-icons.scss turns into Registration's Heroicon. */
  private tagIcons() {
    const tag = (el: Element) => { const v = (el.textContent || '').trim(); if ((el as HTMLElement).dataset['i'] !== v) (el as HTMLElement).dataset['i'] = v; };
    document.querySelectorAll('mat-icon').forEach(tag);
    new MutationObserver((ms) => {
      for (const m of ms) {
        const host = (m.target.nodeType === 3 ? m.target.parentElement : (m.target as Element))?.closest?.('mat-icon');
        if (host) tag(host);
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) { const el = n as Element; if (el.matches('mat-icon')) tag(el); el.querySelectorAll('mat-icon').forEach(tag); } });
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  private readLang() { try { return sessionStorage.getItem('rb-lang') || 'en'; } catch { return 'en'; } }
  private applyLang() {
    const l = this.current();
    document.documentElement.dir = l.dir;
    document.documentElement.lang = l.code;
  }
  chooseLang(code: string) {
    this.lang.set(code); this.langPop.set(null);
    try { sessionStorage.setItem('rb-lang', code); } catch { /* private window: the choice lasts this page only */ }
    this.applyLang();
  }

  /** Switch Module, as Fusion does it: the module opens on its first rail item. */
  switchModule(name: string) {
    this.mods.set(null);
    if (name === this.module()) return;
    const items = RAIL[name as ModuleName];
    if (!items) { this.s.toast(name + ' is not in this prototype'); return; }
    if (name === 'Application Setup') this.s.setRole('admin');
    this.router.navigate([items[0].path]);
  }
  openHelp(item: string) { this.help.set(null); this.s.toast(item + ' opens in the full product'); }
  signOut() { this.who.set(null); this.s.toast('Signing out returns to the Medinous sign-in page in the full product'); }
  closeBell() { this.bell.set(null); this.s.notes.forEach((n) => (n.read = true)); this.s.bump(); }
  /** A note or toast belongs to a report ("rep:m1"); opening it shows that report's results. */
  openNote(key: string) {
    this.bell.set(null); this.s.notes.forEach((n) => { if (n.key === key) n.read = true; });
    this.s.toastMsg.set(null); this.s.bump();
    const [kind, id] = key.split(':'); this.router.navigate(['/report', kind, id], { queryParams: { tab: 'results' } });
  }
  /** Prototype only: who is signed in. In the product this comes from the login. */
  viewAs(path: string) { this.who.set(null); this.router.navigate([path]); }
}
