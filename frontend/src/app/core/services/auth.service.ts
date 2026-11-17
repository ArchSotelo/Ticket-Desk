import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { defer, finalize, firstValueFrom, from, Observable, of, shareReplay, tap, throwError, map } from 'rxjs';
import { ApiResponse, AuthRequest, AuthResponse } from '../models/auth.model';
import { UsuarioProfile } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = '/api/v1/auth';
  private refreshRequest$?: Observable<ApiResponse<AuthResponse>>;

  // Signals para estado reactivo del usuario
  public currentUserSignal = signal<AuthResponse | null>(this.getStoredUser());
  public isAuthenticatedSignal = computed(() => !!this.currentUserSignal()?.accessToken);

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    if (typeof window !== 'undefined') window.addEventListener('storage', event => {
      if (event.key !== 'user_session') return;
      const stored = this.getStoredUser();
      this.currentUserSignal.set(stored);
      if (!stored) this.router.navigateByUrl('/auth/login', { replaceUrl: true });
      else if (stored.requiresPasswordChange) this.router.navigateByUrl('/auth/change-password', { replaceUrl: true });
    });
  }

  login(request: AuthRequest): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(`${this.apiUrl}/login`, request).pipe(
      tap(res => {
        if (res.success && res.data) {
          this.setSession(res.data);
        }
      })
    );
  }

  refreshToken(): Observable<ApiResponse<AuthResponse>> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }
    const initialSession = this.currentUserSignal();
    const refreshToken = initialSession?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No hay una sesión que renovar.'));
    }
    const renew = () => this.http.post<ApiResponse<AuthResponse>>(`${this.apiUrl}/refresh-token`, { refreshToken }).pipe(
      map(res => {
        if (!res.success || !res.data?.accessToken || !res.data?.refreshToken) throw new Error('No se pudo renovar la sesión.');
        if (this.currentUserSignal()?.refreshToken !== refreshToken
            || this.getStoredUser()?.refreshToken !== refreshToken) throw new Error('La sesión cambió durante la renovación.');
        this.setSession(res.data);
        return res;
      })
    );
    this.refreshRequest$ = defer(() => {
      // Una renovación a la vez entre pestañas. Guardar el sucesor antes de liberar el bloqueo.
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return from(navigator.locks.request('ticketdesk-refresh', async () => {
          const stored = this.getStoredUser();
          if (stored?.refreshToken !== refreshToken) {
            if (stored && initialSession && this.sameSession(stored, initialSession)) {
              this.currentUserSignal.set(stored);
              return { success: true, data: stored } as ApiResponse<AuthResponse>;
            }
            throw new Error('La sesión cambió durante la renovación.');
          }
          return firstValueFrom(renew());
        }));
      }
      return renew();
    }).pipe(
      finalize(() => this.refreshRequest$ = undefined),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.refreshRequest$;
  }

  getValidToken(): Observable<string> {
    return defer(() => {
      const token = this.getToken();
      if (!token) {
        return throwError(() => new Error('No hay una sesión activa.'));
      }
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + 30000) {
          return of(token);
        }
      } catch { /* Un token inválido debe renovarse antes de abrir el WebSocket. */ }
      return this.refreshToken().pipe(map(res => res.data.accessToken));
    });
  }

  logout(): void {
    const refreshToken = this.currentUserSignal()?.refreshToken;
    this.clearSession();
    if (refreshToken) {
      this.http.post(`${this.apiUrl}/logout`, { refreshToken }).subscribe({ error: () => undefined });
    }
    this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

  clearSession(): void {
    localStorage.removeItem('user_session');
    this.currentUserSignal.set(null);
  }

  getToken(): string | null {
    return this.currentUserSignal()?.accessToken || null;
  }

  hasRole(role: string): boolean {
    return this.currentUserSignal()?.roles?.includes(role) ?? false;
  }

  hasAnyRole(roles: string[]): boolean {
    const currentRoles = this.currentUserSignal()?.roles ?? [];
    return roles.some(role => currentRoles.includes(role));
  }

  hasPermission(permission: string): boolean {
    return this.currentUserSignal()?.permissions?.includes(permission) ?? false;
  }

  isClientUser(): boolean {
    const roles = this.currentUserSignal()?.roles ?? [];
    const clientOnlyRoles = ['ROLE_CLIENTE'];
    const adminRoles = ['ROLE_ADMIN', 'ROLE_SUPERVISOR', 'ROLE_TECNICO'];
    return roles.some(role => clientOnlyRoles.includes(role)) && !roles.some(role => adminRoles.includes(role));
  }

  isTechnicianUser(): boolean {
    return !this.hasAnyRole(['ROLE_ADMIN', 'ROLE_SUPERVISOR']) && this.hasRole('ROLE_TECNICO');
  }

  isAdminUser(): boolean {
    return this.hasAnyRole(['ROLE_ADMIN', 'ROLE_SUPERVISOR']);
  }

  hasPendingPasswordChange(): boolean { return this.currentUserSignal()?.requiresPasswordChange === true; }

  requirePasswordChange(): void {
    const current = this.currentUserSignal();
    if (current) {
      this.setSession({ ...current, requiresPasswordChange: true });
      this.router.navigateByUrl('/auth/change-password', { replaceUrl: true });
    }
  }

  passwordChanged(): void {
    this.clearSession();
    this.router.navigateByUrl('/auth/login?passwordChanged=true', { replaceUrl: true });
  }

  getLandingRoute(): string {
    if (this.hasPendingPasswordChange()) return '/auth/change-password';
    if (this.isClientUser()) {
      return '/cliente';
    }

    if (this.isTechnicianUser()) {
      return '/tecnico/dashboard';
    }

    return this.isAdminUser() ? '/dashboard' : '/auth/login';
  }

  syncProfile(profile: UsuarioProfile): void {
    const current = this.currentUserSignal();
    if (!current) {
      return;
    }

    const nextUser: AuthResponse = {
      ...current,
      username: profile.username ?? current.username,
      email: profile.email ?? current.email,
      fullName: `${profile.nombres ?? ''} ${profile.apellidos ?? ''}`.trim() || current.fullName,
      roles: profile.roles?.length ? profile.roles : current.roles,
      permissions: profile.permissions ?? current.permissions,
      requiresPasswordChange: profile.requiereCambioPassword ?? current.requiresPasswordChange
    };

    localStorage.setItem('user_session', JSON.stringify(nextUser));
    this.currentUserSignal.set(nextUser);
  }

  private setSession(authData: AuthResponse): void {
    localStorage.setItem('user_session', JSON.stringify(authData));
    this.currentUserSignal.set(authData);
  }

  isSameSessionToken(previous: string | null, current: string | null): boolean {
    if (!previous || !current) return false;
    try {
      const payload = (token: string) => JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const a = payload(previous), b = payload(current);
      return typeof a.sv === 'number' && a.sv === b.sv && typeof a.sub === 'string' && a.sub === b.sub;
    } catch { return false; }
  }

  private sameSession(a: AuthResponse, b: AuthResponse): boolean {
    return a.userId === b.userId && this.isSameSessionToken(a.accessToken, b.accessToken);
  }

  private getStoredUser(): AuthResponse | null {
    const data = localStorage.getItem('user_session');
    try { return data ? JSON.parse(data) : null; }
    catch { localStorage.removeItem('user_session'); return null; }
  }
}
