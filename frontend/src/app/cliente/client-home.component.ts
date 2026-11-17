import {
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Router,
  RouterLink
} from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { Ticket } from '../core/models/ticket.model';
import { Notificacion } from '../core/models/notification.model';

import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { TicketService } from '../core/services/ticket.service';
import { forkJoin, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-client-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule
  ],
  templateUrl: './client-home.component.html',
  styleUrls: ['./client-home.component.scss']
})
export class ClientHomeComponent implements OnInit, OnDestroy {
  // ============================================================
  // Constantes
  // ============================================================

  private readonly REFRESH_INTERVAL = 30_000;

  private readonly OPEN_TICKET_STATES = [
    'NUEVO',
    'ASIGNADO',
    'EN_PROCESO',
    'PENDIENTE_CLIENTE'
  ];

  private readonly RESOLVED_TICKET_STATES = [
    'RESUELTO',
    'CERRADO'
  ];

  // ============================================================
  // Usuario
  // ============================================================

  currentUser = this.authService.currentUserSignal();

  // ============================================================
  // Métricas
  // ============================================================

  totalTickets: number | null = null;
  abiertos: number | null = null;
  resueltos: number | null = null;
  recentTickets: Ticket[] = [];
  loadingRecent = true;
  loadingMetrics = true;
  recentError = '';
  metricsError = '';
  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new Subject<void>();

  // ============================================================
  // Notificaciones
  // ============================================================

  unreadCount = 0;
  notifications: Notificacion[] = [];

  // ============================================================
  // Timer
  // ============================================================

  private refreshHandle?: number;

  // ============================================================
  // Constructor
  // ============================================================

  constructor(
    private ticketService: TicketService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router
  ) {}

  // ============================================================
  // Lifecycle
  // ============================================================

  ngOnInit(): void {
    this.refreshMetrics();
    this.refreshNotifications();

    this.refreshHandle = window.setInterval(
      () => this.refreshNotifications(),
      this.REFRESH_INTERVAL
    );
  }

  ngOnDestroy(): void {
    this.stopNotificationsRefresh();
    this.destroy$.next();
    this.destroy$.complete();
    this.refresh$.complete();
  }

  // ============================================================
  // Métricas de tickets
  // ============================================================

  refreshMetrics(): void {
    this.refresh$.next();
    this.loadingRecent = true;
    this.loadingMetrics = true;
    this.recentError = '';
    this.metricsError = '';
    // /mine is restricted to the signed-in client and sorted newest first.
    this.ticketService.listarMisTickets(0, 4).pipe(takeUntil(this.refresh$), takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.loadingRecent = false;
        if (!response.success || !response.data || !Array.isArray(response.data.content) || !Number.isFinite(response.data.totalElements)) {
          this.recentTickets = [];
          this.totalTickets = null;
          this.recentError = 'No se pudieron cargar tus tickets recientes.';
          return;
        }
        this.recentTickets = response.data.content.slice(0, 4);
        this.totalTickets = response.data.totalElements;
      },
      error: () => {
        this.loadingRecent = false;
        this.recentTickets = [];
        this.totalTickets = null;
        this.recentError = 'No se pudieron cargar tus tickets recientes. Inténtalo nuevamente.';
      }
    });
    const states = [...this.OPEN_TICKET_STATES, ...this.RESOLVED_TICKET_STATES];
    forkJoin(states.map(estado => this.ticketService.listarMisTickets(0, 1, '', { estado })))
      .pipe(takeUntil(this.refresh$), takeUntil(this.destroy$)).subscribe({
        next: responses => {
          this.loadingMetrics = false;
          const open = responses.slice(0, this.OPEN_TICKET_STATES.length);
          const resolved = responses.slice(this.OPEN_TICKET_STATES.length);
          const sum = (group: typeof responses): number | null => group.every(response => response.success && response.data && Number.isFinite(response.data.totalElements))
            ? group.reduce((total, response) => total + response.data!.totalElements, 0) : null;
          this.abiertos = sum(open);
          this.resueltos = sum(resolved);
          if (this.abiertos === null || this.resueltos === null) this.metricsError = 'No se pudo cargar parte del resumen de tickets.';
        },
        error: () => {
          this.loadingMetrics = false;
          this.abiertos = null;
          this.resueltos = null;
          this.metricsError = 'No se pudo cargar el resumen de tickets.';
        }
      });
  }

  statusTone(code: string): string {
    return ({ NUEVO: 'cyan', ASIGNADO: 'violet', EN_PROCESO: 'blue', PENDIENTE_CLIENTE: 'amber', RESUELTO: 'green', CERRADO: 'neutral', CANCELADO: 'red' } as Record<string, string>)[code] || 'neutral';
  }

  priorityTone(name: string): string {
    const normalized = (name || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return ({ baja: 'green', media: 'amber', alta: 'orange', critica: 'red' } as Record<string, string>)[normalized] || 'neutral';
  }

  trackTicket(_index: number, ticket: Ticket): number {
    return ticket.id;
  }

  formatDate(value?: string): string {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime())
      ? date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  }

  // ============================================================
  // Notificaciones
  // ============================================================

  refreshNotifications(): void {
    if (!this.authService.getToken()) {
      this.stopNotificationsRefresh();
      return;
    }
    this.notificationService.getUnread().pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.notifications = response.data ?? [];
        this.unreadCount = this.notifications.length;
      },
      error: () => {
        if (!this.authService.getToken()) this.stopNotificationsRefresh();
      }
    });
  }

  openNotification(
    notification: Notificacion,
    event: MouseEvent
  ): void {
    event.stopPropagation();

    this.markNotificationAsRead(notification);
    this.navigateToNotification(notification);
  }

  markAllRead(event: MouseEvent): void {
    event.stopPropagation();

    this.notificationService.markAllRead().subscribe({
      next: () => {
        this.refreshNotifications();
      },
      error: () => undefined
    });
  }

  // ============================================================
  // Navegación de notificaciones
  // ============================================================

  private navigateToNotification(
    notification: Notificacion
  ): void {
    const ticketId =
      notification.urlDestino?.match(
        /[?&]ticketId=(\d+)/
      )?.[1];

    const target = ticketId
      ? `/cliente/tickets/${ticketId}`
      : notification.urlDestino ||
        '/cliente/tickets';

    this.router.navigateByUrl(target);
  }

  // ============================================================
  // Estado de notificación
  // ============================================================

  private markNotificationAsRead(
    notification: Notificacion
  ): void {
    if (!notification.id) {
      return;
    }

    this.notificationService
      .markRead(notification.id)
      .subscribe({ error: () => undefined });
  }

  // ============================================================
  // Timer
  // ============================================================

  private stopNotificationsRefresh(): void {
    if (this.refreshHandle !== undefined) {
      window.clearInterval(this.refreshHandle);
      this.refreshHandle = undefined;
    }
  }
}
