import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { BrandFooterComponent } from '../../shared/brand-footer/brand-footer.component';

@Component({
  selector: 'app-change-password', standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, BrandFooterComponent],
  templateUrl: './change-password.component.html', styleUrls: ['./change-password.component.scss']
})
export class ChangePasswordComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  currentPassword = '';
  newPassword = '';
  confirmation = '';
  saving = false;
  errorMessage = '';
  constructor(public auth: AuthService, private users: UserService) {}

  submit(): void {
    if (this.saving) return;
    this.errorMessage = '';
    if (!this.currentPassword || this.newPassword.trim().length < 8 || new TextEncoder().encode(this.newPassword).length > 72) {
      this.errorMessage = 'Completa tu contraseña actual y una nueva de al menos 8 caracteres y un máximo de 72 bytes.';
      return;
    }
    if (this.newPassword === this.currentPassword) { this.errorMessage = 'La nueva contraseña debe ser diferente de la actual.'; return; }
    if (this.newPassword !== this.confirmation) { this.errorMessage = 'Las nuevas contraseñas no coinciden.'; return; }
    this.saving = true;
    this.users.changeMyPassword({ currentPassword: this.currentPassword, newPassword: this.newPassword }).pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.saving = false;
        if (response.success) this.auth.passwordChanged();
        else this.errorMessage = response.message || 'No se pudo actualizar la contraseña.';
      },
      error: error => {
        this.saving = false;
        this.errorMessage = error.error?.message || 'No se pudo actualizar la contraseña. Inténtalo nuevamente.';
      }
    });
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
