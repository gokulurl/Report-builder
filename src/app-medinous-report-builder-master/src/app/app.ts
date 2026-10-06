import { Component, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs';
import { RbStore } from './rb/store';
import { RbPop } from './rb/ui';
import { hm } from './rb/engine';

/** Fusion shell. IT administrators get Dashboard (templates) and Report builder; staff get their module's Dashboard. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatIconModule, RbPop],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  hm = hm;
  private url = signal('');
  section = computed(() => (this.url().startsWith('/it/builder') ? 'builder' : 'dash'));
  title = computed(() => {
    if (this.s.role() === 'admin') return this.section() === 'builder' ? 'Report Builder' : 'Reports Dashboard';
    return 'Reports';
  });
  bell = signal<HTMLElement | null>(null);
  who = signal<HTMLElement | null>(null);
  unread = computed(() => { this.s.rev(); return this.s.notes.filter((n) => !n.read).length; });

  constructor(private router: Router, public s: RbStore) {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const u = (e as NavigationEnd).urlAfterRedirects;
      this.url.set(u);
      if (!u.startsWith('/result')) s.backStack = []; // "Back to …" only lives across drill-throughs
    });
  }
  closeBell() { this.bell.set(null); this.s.notes.forEach((n) => (n.read = true)); this.s.bump(); }
  openNote(res: string) {
    this.bell.set(null); this.s.notes.forEach((n) => { if (n.res === res) n.read = true; });
    this.s.toastMsg.set(null); this.s.bump(); this.router.navigate(['/result', res]);
  }
  switchTo(path: string) { this.who.set(null); this.router.navigate([path]); }
}
