import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Complementa la API: no sustituye las comprobaciones de autorización del backend.
export const permissionGuard: CanActivateFn = route => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticatedSignal()) return router.createUrlTree(['/auth/login']);
  if (auth.hasPendingPasswordChange()) return router.createUrlTree(['/auth/change-password']);
  const permission = route.data['permission'];
  return typeof permission === 'string' && auth.hasPermission(permission)
    ? true : router.createUrlTree([auth.getLandingRoute()]);
};
