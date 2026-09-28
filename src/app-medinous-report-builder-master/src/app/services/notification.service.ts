import { Injectable, computed, signal } from '@angular/core';

export interface AppNotification {
  id: number;
  title: string;
  detail: string;
  time: Date;
  reportId?: string;
  /** Parameter values to reopen the report with, for "Report ready" notifications. */
  params?: Record<string, any>;
  /** Finished background result, so opening the notification doesn't run the report again. */
  result?: any;
  ranWith?: { label: string; value: string }[];
  read: boolean;
}

/** In-app notification bell. Background runs and scheduled deliveries post here. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private seq = 1;
  readonly items = signal<AppNotification[]>([
    {
      id: this.seq++,
      title: 'Scheduled report delivered: Daily Collection by Payment Mode',
      detail: 'Emailed to you as Excel · Previous day',
      time: new Date(Date.now() - 3 * 3600_000),
      reportId: 'rpt-daily-collection',
      read: true,
    },
  ]);
  readonly unread = computed(() => this.items().filter((n) => !n.read).length);

  push(n: Omit<AppNotification, 'id' | 'time' | 'read'>) {
    this.items.update((list) => [{ ...n, id: this.seq++, time: new Date(), read: false }, ...list]);
  }

  markAllRead() {
    this.items.update((list) => list.map((n) => ({ ...n, read: true })));
  }
}
