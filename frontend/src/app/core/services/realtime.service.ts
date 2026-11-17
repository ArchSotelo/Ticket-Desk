import { effect, Injectable, NgZone } from '@angular/core';
import { map, Subject, Subscription } from 'rxjs';
import { AuthService } from './auth.service';

export interface RealtimeEvent { type: string; scope?: string; userId?: number; ticketId?: number; payload?: any; }

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private currentUserId?: number;
  private currentTicketId?: number;
  private currentScope?: string;
  private connecting = false;
  private forceRefresh = false;
  private tokenSubscription?: Subscription;
  private eventsSubject = new Subject<RealtimeEvent>();
  events$ = this.eventsSubject.asObservable();
  constructor(private zone: NgZone, private authService: AuthService) {
    effect(() => {
      const user = this.authService.currentUserSignal();
      if (!user || user.requiresPasswordChange || (this.currentUserId !== undefined && user.userId !== this.currentUserId)) this.disconnect();
    });
  }
  connect(userId: number, ticketId?: number, scope?: string): void {
    if (this.currentUserId !== undefined && this.currentUserId !== userId) this.disconnect();
    this.currentUserId = userId;
    this.currentTicketId = ticketId;
    this.currentScope = scope;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendSubscription();
      return;
    }
    if (this.connecting || this.socket?.readyState === WebSocket.CONNECTING) return;
    if (!this.authService.getToken() || this.authService.currentUserSignal()?.requiresPasswordChange) return;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.connecting = true;
    const attemptedToken = this.authService.getToken();
    const tokens = this.forceRefresh ? this.authService.refreshToken().pipe(map(res => res.data.accessToken)) : this.authService.getValidToken();
    this.forceRefresh = false;
    this.tokenSubscription = tokens.subscribe({
      next: token => {
        this.connecting = false;
        if (this.currentUserId && this.authService.getToken() === token) this.openSocket(token);
      },
      error: error => {
        this.connecting = false;
        if (error?.status === 0 || error?.status >= 500) {
          this.scheduleReconnect();
        } else if (this.authService.getToken() === attemptedToken) {
          this.disconnect();
          this.zone.run(() => this.authService.logout());
        } else {
          this.scheduleReconnect();
        }
      }
    });
  }

  private openSocket(token: string): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws/updates?access_token=${encodeURIComponent(token)}`); this.socket = socket;
    socket.onopen = () => this.sendSubscription();
    socket.onmessage = event => {
      if (this.socket !== socket || !this.authService.getToken()) return;
      this.zone.run(() => { try { this.eventsSubject.next(JSON.parse(event.data)); } catch { /* evento inválido */ } });
    };
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      // Una suscripción denegada no debe provocar reintentos infinitos al mismo canal.
      // Si solo caducó el JWT, conservar el canal y renovar la sesión al reconectar.
      if (event.code === 1008 && event.reason === 'SESSION_REVOKED') this.forceRefresh = true;
      if (event.code === 1008 && !['SESSION_EXPIRED', 'SESSION_REVOKED'].includes(event.reason)) {
        this.currentTicketId = undefined;
        this.currentScope = undefined;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.currentUserId || !this.authService.getToken()) return;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.currentUserId) this.connect(this.currentUserId, this.currentTicketId, this.currentScope);
    }, 3000);
  }

  disconnect(): void {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.tokenSubscription?.unsubscribe();
    this.tokenSubscription = undefined;
    this.connecting = false;
    this.forceRefresh = false;
    this.currentUserId = undefined;
    this.currentTicketId = undefined;
    this.currentScope = undefined;
    this.socket?.close();
    this.socket = undefined;
  }

  private sendSubscription(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.currentUserId) return;
    this.socket.send(JSON.stringify({
      type: 'subscribe',
      ticketId: this.currentTicketId,
      scope: this.currentScope
    }));
  }
}
