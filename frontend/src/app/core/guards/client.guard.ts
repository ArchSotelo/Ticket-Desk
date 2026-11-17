import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const clientGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticatedSignal()) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (authService.hasPendingPasswordChange()) {
    router.navigate(['/auth/change-password']);
    return false;
  }

  if (authService.isClientUser()) {
    return true;
  }

  router.navigate([authService.getLandingRoute()]);
  return false;
};
