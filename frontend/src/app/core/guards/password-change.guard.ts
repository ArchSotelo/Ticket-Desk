import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const passwordChangeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticatedSignal()) return router.createUrlTree(['/auth/login']);
  return auth.hasPendingPasswordChange() ? true : router.createUrlTree([auth.getLandingRoute()]);
};
