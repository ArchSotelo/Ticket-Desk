import { Directive, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';

import { UsuarioProfile } from '../../core/models/user.model';

import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';

@Directive()
export class ProfileBase implements OnInit, OnDestroy {
  readonly portal: 'client' | 'technician' | 'admin' = 'client';
  // ============================================================
  // Perfil
  // ============================================================

  profile: UsuarioProfile | null = null;

  // ============================================================
  // Formulario
  // ============================================================

  profileForm: FormGroup;
  passwordForm: FormGroup;
  passwordPanelOpen = false;
  changingPassword = false;
  passwordError = '';
  passwordSuccess = '';

  // ============================================================
  // Estado
  // ============================================================

  loading = false;
  loadingProfile = false;
  loadError = '';
  successMessage = '';
  errorMessage = '';
  private readonly destroy$ = new Subject<void>();

  // ============================================================
  // Constructor
  // ============================================================

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private authService: AuthService
  ) {
    this.profileForm = this.createForm();
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirmPassword: ['', Validators.required]
    }, { validators: form => form.get('newPassword')?.value === form.get('confirmPassword')?.value ? null : { mismatch: true } });
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  ngOnInit(): void {
    this.loadProfile();
  }

  ngOnDestroy(): void {
    this.passwordForm.reset();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================
  // Getters
  // ============================================================

  get initials(): string {
    const name =
      `${this.profile?.nombres ?? ''} ${this.profile?.apellidos ?? ''}`
        .trim() || ({ client: 'CL', technician: 'TC', admin: 'AD' }[this.portal]);

    return name
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  // ============================================================
  // Carga del perfil
  // ============================================================

  loadProfile(): void {
    if (this.loading || this.loadingProfile) return;
    this.loadingProfile = true;
    this.loadError = '';
    this.userService.getProfile().pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.loadingProfile = false;
        if (!response.success || !response.data) {
          this.loadError = response.message || 'No se pudo cargar el perfil.';
          return;
        }
        this.profile = response.data;
        this.patchProfileForm(this.profile);
      },
      error: error => {
        this.loadingProfile = false;
        this.loadError = error.error?.message || 'No se pudo cargar el perfil.';
      }
    });
  }

  // ============================================================
  // Recargar perfil
  // ============================================================

  reload(): void {
    if (this.loading || this.loadingProfile) return;
    this.clearMessages();
    this.loadProfile();
  }

  // ============================================================
  // Guardar perfil
  // ============================================================

  save(): void {
    if (this.loading || this.loadingProfile || !this.profile) return;
    this.clearMessages();
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    this.userService
      .updateMyProfile(this.profileForm.getRawValue())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.loading = false;

          if (!response.success || !response.data) {
            this.errorMessage =
              response.message ||
              'No se pudo actualizar el perfil.';
            return;
          }

          this.profile = response.data;
          this.patchProfileForm(response.data);

          this.authService.syncProfile(response.data);

          this.successMessage =
            response.message ||
            'Perfil actualizado correctamente.';
        },

        error: error => {
          this.loading = false;

          this.errorMessage =
            error.error?.message ||
            'No se pudo actualizar el perfil.';
        }
      });
  }

  // ============================================================
  // Formulario
  // ============================================================

  togglePasswordPanel(): void {
    if (this.changingPassword) return;
    this.passwordPanelOpen = !this.passwordPanelOpen;
    this.passwordForm.reset();
    this.passwordError = '';
    this.passwordSuccess = '';
  }

  passwordFieldError(name: string): string {
    const control = this.passwordForm.get(name);
    if (!control?.touched) return '';
    if (control.hasError('required')) return 'Completa este campo.';
    if (control.hasError('minlength')) return 'Usa al menos 8 caracteres.';
    if (control.hasError('maxlength')) return 'Usa como máximo 72 caracteres.';
    if (name === 'confirmPassword' && this.passwordForm.hasError('mismatch')) return 'Las contraseñas no coinciden.';
    return '';
  }

  changePassword(): void {
    if (this.changingPassword) return;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid) return;
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    if (new TextEncoder().encode(newPassword).length > 72) {
      this.passwordError = 'La nueva contraseña es demasiado larga. Usa como máximo 72 bytes.';
      return;
    }
    if (currentPassword === newPassword) {
      this.passwordError = 'La nueva contraseña debe ser diferente de la actual.';
      return;
    }
    this.changingPassword = true;
    this.userService.changeMyPassword({ currentPassword, newPassword })
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: response => {
          this.changingPassword = false;
          if (!response.success) {
            this.passwordError = response.message || 'No se pudo actualizar la contraseña.';
            return;
          }
          this.passwordForm.reset();
          this.passwordPanelOpen = false;
          this.authService.passwordChanged();
        },
        error: error => {
          this.changingPassword = false;
          this.passwordForm.get('currentPassword')?.reset();
          this.passwordError = error.error?.message || 'No se pudo actualizar la contraseña. Inténtalo nuevamente.';
        }
      });
  }

  private createForm(): FormGroup {
    return this.fb.group({
      nombres: ['', Validators.required],
      apellidos: ['', Validators.required],
      email: [
        '',
        [
          Validators.required,
          Validators.email
        ]
      ],
      telefono: [''],
      cargo: ['']
    });
  }

  private patchProfileForm(
    profile: UsuarioProfile
  ): void {
    this.profileForm.patchValue({
      nombres: profile.nombres,
      apellidos: profile.apellidos,
      email: profile.email,
      telefono: profile.telefono ?? '',
      cargo: profile.cargo ?? ''
    });
    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();
  }

  fieldError(name: string): string {
    const control = this.profileForm.get(name);
    if (!control?.touched || !control.invalid) return '';
    if (control.hasError('email')) return 'Ingresa un correo electrónico válido.';
    const labels: Record<string, string> = {
      nombres: 'Ingresa tus nombres.', apellidos: 'Ingresa tus apellidos.', email: 'Ingresa tu correo electrónico.'
    };
    return labels[name] || 'Revisa este campo.';
  }

  get profileTitle(): string {
    return this.portal === 'client' ? 'Mi perfil' : this.portal === 'technician' ? 'Perfil del técnico' : this.profile?.roles?.includes('ROLE_SUPERVISOR') ? 'Perfil del supervisor' : 'Perfil del administrador';
  }

  get isStaff(): boolean {
    return this.portal !== 'client';
  }

  get defaultPosition(): string {
    return this.portal === 'technician' ? 'Técnico' : this.profile?.roles?.includes('ROLE_SUPERVISOR') ? 'Supervisor' : 'Administrador';
  }

  roleLabel(role: string): string {
    const labels: Record<string, string> = {
      ROLE_ADMIN: 'Administrador', ROLE_TECNICO: 'Técnico', ROLE_SUPERVISOR: 'Supervisor',
      ROLE_CLIENTE: 'Cliente'
    };
    return labels[role] || role.replace(/^ROLE_/, '').replace(/_/g, ' ');
  }

  get accountStatus(): string {
    return this.profile?.estado || 'No disponible';
  }

  get accountActive(): boolean {
    return this.profile?.estado?.toUpperCase() === 'ACTIVO';
  }

  // ============================================================
  // Utilidades
  // ============================================================

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }
}
