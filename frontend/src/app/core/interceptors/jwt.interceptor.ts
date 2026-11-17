import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap, throwError } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';

let sessionExpiredAlertShown = false;

function passwordRequired(auth: AuthService, error: HttpErrorResponse): void {
  if (error.status === 403 && error.error?.errors?.includes('PASSWORD_CHANGE_REQUIRED')) auth.requirePasswordChange();
}

function expireSession(auth: AuthService, error: HttpErrorResponse, expectedToken: string | null) {
  // Una respuesta antigua no debe cerrar una sesión nueva ni deshacer un cierre voluntario.
  if (!expectedToken || auth.getToken() !== expectedToken) return throwError(() => error);
  auth.clearSession();
  if (!sessionExpiredAlertShown) {
    sessionExpiredAlertShown = true;
    Swal.fire({
      icon: 'warning', title: 'Sesión finalizada',
      text: 'Tu sesión ya no es válida. Inicia sesión nuevamente para continuar.',
      confirmButtonText: 'Ir al login', confirmButtonColor: '#155eef', allowOutsideClick: false
    }).then(() => {
      sessionExpiredAlertShown = false;
      if (!auth.getToken()) auth.logout();
    });
  }
  return throwError(() => error);
}

export const jwtInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  const isPublicAuth = /\/api\/v1\/auth\/(login|refresh-token|logout)(?:\?|$)/.test(req.url);
  const withToken = (value: string) => req.clone({ setHeaders: { Authorization: `Bearer ${value}` } });
  const retry = (value: string) => next(withToken(value)).pipe(catchError((error: HttpErrorResponse) => {
    passwordRequired(auth, error);
    return error.status === 401 ? expireSession(auth, error, value) : throwError(() => error);
  }));

  return next(token && !isPublicAuth ? withToken(token) : req).pipe(catchError((error: HttpErrorResponse) => {
    passwordRequired(auth, error);
    if (error.status !== 401 || isPublicAuth || !auth.getToken()) return throwError(() => error);
    const current = auth.getToken();
    if (current && current !== token) {
      // Repetir solo una renovación de la misma sesión, nunca una petición de otro login.
      return auth.isSameSessionToken(token, current) ? retry(current) : throwError(() => error);
    }
    return auth.refreshToken().pipe(
      catchError(refreshError => refreshError.status === 0 || refreshError.status >= 500
        ? throwError(() => refreshError) : expireSession(auth, refreshError, token)),
      switchMap(res => res.success && res.data.accessToken
        ? retry(res.data.accessToken) : expireSession(auth, error, token))
    );
  }));
};
