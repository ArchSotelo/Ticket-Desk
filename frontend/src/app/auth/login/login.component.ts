import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { BrandFooterComponent } from '../../shared/brand-footer/brand-footer.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, BrandFooterComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly themeStorageKey = 'ticketdesk-theme';
  username = '';
  password = '';
  hidePassword = true;
  loading = false;
  passwordUpdated = false;
  errorMessage = '';
  isDarkMode = localStorage.getItem(this.themeStorageKey) === 'dark';

  constructor(private authService: AuthService, private router: Router, route: ActivatedRoute) {
    this.passwordUpdated = route.snapshot.queryParamMap.get('passwordChanged') === 'true';
    document.body.classList.toggle('dark-theme', this.isDarkMode);
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    document.body.classList.toggle('dark-theme', this.isDarkMode);
    localStorage.setItem(this.themeStorageKey, this.isDarkMode ? 'dark' : 'light');
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  onLogin(): void {
    if (this.loading || !this.username.trim() || !this.password) return;
    this.loading = true;
    this.errorMessage = '';

    this.authService.login({ username: this.username, password: this.password }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          this.router.navigate([this.authService.getLandingRoute()]);
        } else {
          this.errorMessage = String(res.message ?? 'Error de autenticación');
        }
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 423) {
          void Swal.fire({
            icon: 'warning',
            title: 'Cuenta bloqueada',
            text: String(err.error?.message ?? 'Tu cuenta ha sido bloqueada por demasiados intentos de inicio de sesión. Comunícate con el administrador del sistema para solicitar el desbloqueo.'),
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#2563eb'
          });
          return;
        }
        this.errorMessage = String(err.error?.message ?? 'Usuario o contraseña incorrectos');
      }
    });
  }
}
