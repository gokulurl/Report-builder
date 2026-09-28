import { Component, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs';
import { NotificationService, AppNotification } from './services/notification.service';

/** Fusion shell: app bar + icon rail around every Reports screen. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatIconModule, MatTooltipModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private url = signal('');
  section = computed(() => {
    const u = this.url();
    if (u.startsWith('/schedules')) return 'schedules';
    if (u.startsWith('/builder')) return u.includes('tab=saved') ? 'saved' : 'builder';
    return 'reports';
  });
  title = computed(() => ({ reports: 'Reports', schedules: 'My Schedules', builder: 'Report Builder', saved: 'Report Builder' })[this.section()]);
  bellOpen = signal(false);

  constructor(private router: Router, public notes: NotificationService) {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.bellOpen.set(false);
    });
  }

  toggleBell() {
    this.bellOpen.update((v) => !v);
    if (this.bellOpen()) setTimeout(() => this.notes.markAllRead(), 1500);
  }

  openNote(n: AppNotification) {
    this.bellOpen.set(false);
    if (n.reportId) this.router.navigate(['/reports', n.reportId], { state: { params: n.params, result: n.result, ranWith: n.ranWith } });
  }
}
