import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { Notificacion } from '../../core/models/notification.model';
import { RealtimeService } from '../../core/services/realtime.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent implements OnInit, OnDestroy {
  private readonly themeStorageKey = 'ticketdesk-theme';
  @Output() toggleSidebar = new EventEmitter<void>();
  @Input() sidebarExpanded = true;
  isDarkMode = false;
  notifications: Notificacion[] = [];
  unreadCount = 0;
  notificationError = '';
  private refreshHandle?: number;
  private realtimeSubscription?: Subscription;

  constructor(
    public authService: AuthService,
    private notificationService: NotificationService,
    private router: Router,
    private realtimeService: RealtimeService
  ) {}

  ngOnInit(): void {
    this.restoreTheme();
    this.refreshNotifications();
    const userId = this.currentUser?.userId;
    if (userId) {
      this.realtimeSubscription = this.realtimeService.events$.subscribe(event => {
        if (event.type === 'notification' && event.payload) {
          const notification = event.payload as Notificacion;
          if (!this.notifications.some(item => item.id === notification.id)) { this.notifications = [notification, ...this.notifications]; this.unreadCount++; }
        }
      });
      this.realtimeService.connect(userId);
    }
    this.refreshHandle = window.setInterval(() => this.refreshNotifications(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      window.clearInterval(this.refreshHandle);
    }
    this.realtimeSubscription?.unsubscribe();
    this.realtimeService.disconnect();
  }

  get currentUser() {
    return this.authService.currentUserSignal();
  }

  get userInitials(): string {
    const name = this.currentUser?.fullName || 'US';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  refreshNotifications(): void {
    if (!this.authService.getToken()) return;
    this.notificationService.getUnread().subscribe({
      next: (res) => {
        this.notificationError = '';
        this.notifications = res.data ?? [];
        this.unreadCount = this.notifications.length;
      },
      error: () => this.notificationError = 'No se pudieron cargar las notificaciones. Intenta nuevamente.'
    });
  }

  openNotification(notification: Notificacion, event: MouseEvent): void {
    event.stopPropagation();
    if (notification.id) {
      this.notificationService.markRead(notification.id).subscribe({
        next: () => this.refreshNotifications(),
        error: () => this.notificationError = 'No se pudo marcar la notificación como leída.'
      });
    }

    const target = this.resolveNotificationTarget(notification.urlDestino);
    this.router.navigateByUrl(target);
  }

  private resolveNotificationTarget(urlDestino?: string): string {
    const rawTarget = urlDestino || '';
    const ticketId = rawTarget.match(/[?&]ticketId=(\d+)/)?.[1];

    if (ticketId) {
      if (this.authService.isClientUser()) return `/cliente/tickets/${ticketId}`;
      if (this.authService.isTechnicianUser()) return `/tecnico/tickets/${ticketId}`;
      return `/tickets/detail/${ticketId}`;
    }

    if (rawTarget.startsWith('/tickets/')) {
      return rawTarget;
    }

    if (rawTarget.startsWith('/cliente/') && this.authService.isClientUser()) return rawTarget;
    if (rawTarget.startsWith('/tecnico/') && this.authService.isTechnicianUser()) return rawTarget;
    if (rawTarget.startsWith('/tecnico') && this.authService.isTechnicianUser()) return rawTarget;
    if (rawTarget.startsWith('/cliente') && this.authService.isClientUser()) return rawTarget;

    return this.authService.isClientUser() ? '/cliente/tickets'
      : this.authService.isTechnicianUser() ? '/tecnico'
      : '/dashboard';
  }

  goToProfile(): void {
    if (this.authService.isClientUser()) {
      this.router.navigateByUrl('/cliente/perfil');
      return;
    }

    if (this.authService.isTechnicianUser()) {
      this.router.navigateByUrl('/tecnico/perfil');
      return;
    }

    this.router.navigateByUrl('/perfil');
  }

  openApiDocumentation(): void {
    this.router.navigateByUrl('/documentacion-api');
  }

  markAllRead(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationService.markAllRead().subscribe({
      next: () => this.refreshNotifications(),
      error: () => this.notificationError = 'No se pudieron marcar las notificaciones como leídas.'
    });
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem(this.themeStorageKey, 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem(this.themeStorageKey, 'light');
    }
  }

  private restoreTheme(): void {
    this.isDarkMode = localStorage.getItem(this.themeStorageKey) === 'dark';
    document.body.classList.toggle('dark-theme', this.isDarkMode);
  }

  logout(): void {
    this.authService.logout();
  }
}
