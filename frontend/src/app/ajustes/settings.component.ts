import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { Subject, Subscription, finalize, takeUntil } from 'rxjs';
import { FilterStateService } from '../core/services/filter-state.service';
import { AuthService } from '../core/services/auth.service';

import {
  NotificationService,
  NotificationSettings
} from '../core/services/notification.service';

interface EmailTemplateOption {
  key: string;
  label: string;
  description: string;
  subjectControl: string;
  bodyControl: string;
}
type SettingsCategory = 'all' | 'security' | 'notifications' | 'services';
interface SettingCard {
  id: string; icon: string; title: string; description: string;
  category: Exclude<SettingsCategory, 'all'> | 'general';
  section: 'communication' | 'services' | 'security' | 'documentation';
  available: boolean; action?: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings-detail.component.scss', './settings-hub.component.scss']
})
export class SettingsComponent implements OnInit, OnDestroy {
  // ============================================================
  // Estado de la vista
  // ============================================================

  selected: 'home' | 'email' | 'services' | 'security' = 'home';
  settingsFilter: SettingsCategory = 'all';
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly categories: { id: SettingsCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'General', icon: 'tune' },
    { id: 'security', label: 'Seguridad', icon: 'shield' },
    { id: 'notifications', label: 'Notificaciones', icon: 'notifications' },
    { id: 'services', label: 'Servicios', icon: 'miscellaneous_services' }
  ];
  private searchSubscription?: Subscription;

  saved = false;
  testSent = false;
  testing = false;
  testError = '';
  saving = false;
  loadingEmail = false;
  loadingServices = false;
  emailLoadError = '';
  serviceLoadError = '';
  loadingSmtp = false;
  smtpError = '';
  serviceSubmitted = false;
  private readonly destroyed = new Subject<void>();
  readonly notificationEvents = [
    { control: 'onTicketCreated', label: 'Ticket creado', description: 'Nuevo caso registrado', icon: 'mail' },
    { control: 'onAssigned', label: 'Técnico asignado', description: 'Responsable seleccionado', icon: 'person' },
    { control: 'onStatusChanged', label: 'Cambio de estado', description: 'El caso avanza o finaliza', icon: 'sync_alt' },
    { control: 'onReply', label: 'Nueva respuesta', description: 'Mensaje en la conversación', icon: 'chat' },
    { control: 'onAttachment', label: 'Archivo adjunto', description: 'Nueva evidencia cargada', icon: 'attach_file' },
    { control: 'onSla', label: 'SLA próximo a vencer', description: 'Alerta de tiempo restante', icon: 'schedule' }
  ];

  // ============================================================
  // Estado SMTP
  // ============================================================

  smtpEnabled = false;
  smtpConfigured = false;

  // ============================================================
  // Selección de plantillas
  // ============================================================

  templateEvent = 'created';
  serviceTemplateEvent = 'upcoming';

  // ============================================================
  // Opciones de plantillas de correo
  // ============================================================

  templateOptions: EmailTemplateOption[] = [
    {
      key: 'created',
      label: 'Ticket creado',
      description: 'Aviso de un nuevo ticket registrado.',
      subjectControl: 'ticketCreatedSubject',
      bodyControl: 'ticketCreatedBody'
    },
    {
      key: 'assigned',
      label: 'Ticket asignado',
      description: 'Aviso al técnico responsable.',
      subjectControl: 'assignedSubject',
      bodyControl: 'assignedBody'
    },
    {
      key: 'status',
      label: 'Cambio de estado',
      description: 'Aviso de avance o cierre del ticket.',
      subjectControl: 'statusChangedSubject',
      bodyControl: 'statusChangedBody'
    },
    {
      key: 'reply',
      label: 'Nueva respuesta',
      description: 'Aviso de un nuevo mensaje.',
      subjectControl: 'replySubject',
      bodyControl: 'replyBody'
    },
    {
      key: 'attachment',
      label: 'Archivo adjunto',
      description: 'Aviso cuando se agrega evidencia.',
      subjectControl: 'attachmentSubject',
      bodyControl: 'attachmentBody'
    },
    {
      key: 'sla',
      label: 'SLA próximo a vencer',
      description: 'Alerta de tiempo restante.',
      subjectControl: 'slaSubject',
      bodyControl: 'slaBody'
    }
  ];

  serviceTemplateOptions: EmailTemplateOption[] = [
    {
      key: 'upcoming',
      label: 'Servicio por vencer',
      description:
        'Aviso enviado dentro del plazo configurado antes del vencimiento.',
      subjectControl: 'asuntoPorVencer',
      bodyControl: 'plantillaPorVencer'
    },
    {
      key: 'expired',
      label: 'Servicio vencido',
      description: 'Aviso enviado cuando la fecha de fin ya pasó.',
      subjectControl: 'asuntoVencido',
      bodyControl: 'plantillaVencido'
    }
  ];

  // ============================================================
  // Formularios
  // ============================================================

  emailForm: FormGroup;
  serviceForm: FormGroup;
  loginPolicyForm: FormGroup;
  blockedAccounts: Array<{ id: number; username: string; nombreCompleto: string; email: string; intentosFallidos: number; bloqueadoHasta: string | null }> = [];
  blockedPage = 0;
  blockedTotalPages = 0;
  blockedTotalElements = 0;
  loadingSecurity = false;
  loadingBlocked = false;
  savingPolicy = false;
  unlockingUserId: number | null = null;
  securityError = '';
  securitySuccess = '';
  securityAuditActor = '';
  securityUpdatedAt = '';

  // ============================================================
  // Tarjetas de configuración
  // ============================================================

  readonly cards: SettingCard[] = [
    {
      id: 'email',
      icon: 'mail',
      title: 'Configuración de correo',
      description:
        'Configura las notificaciones y plantillas de correo.',
      category: 'notifications', section: 'communication', available: true, action: 'Configurar'
    },
    {
      id: 'services',
      icon: 'miscellaneous_services',
      title: 'Configuración de servicios',
      description:
        'Define vencimientos, recordatorios y plantillas de avisos.',
      category: 'services', section: 'services', available: true, action: 'Configurar'
    },
    {
      id: 'service-types',
      icon: 'category',
      title: 'Tipos de servicio',
      description:
        'Administra los tipos e iconos para clasificar tus servicios.',
      category: 'services', section: 'services', available: true, action: 'Administrar'
    },
    {
      id: 'api-documentation',
      icon: 'api',
      title: 'Documentación del API',
      description: 'Consulta y prueba los endpoints del backend con tu sesión actual.',
      category: 'general', section: 'documentation', available: true, action: 'Abrir'
    },
    {
      id: 'security',
      icon: 'shield',
      title: 'Seguridad',
      description: 'Administra cuentas bloqueadas y la política de inicio de sesión.',
      category: 'security', section: 'security', available: true, action: 'Administrar'
    }
  ];

  // ============================================================
  // Constructor
  // ============================================================

  constructor(
    private fb: FormBuilder,
    private notificationService: NotificationService,
    private router: Router,
    private filterState: FilterStateService,
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.emailForm = this.createEmailForm();
    this.serviceForm = this.createServiceForm();
    this.loginPolicyForm = this.fb.group({
      maxIntentos: [5, [Validators.required, Validators.min(3), Validators.max(20)]],
      duracionBloqueoMinutos: [15, [Validators.required, Validators.min(1), Validators.max(1440)]],
      limiteLoginPorMinuto: [30, [Validators.required, Validators.min(5), Validators.max(300)]]
    });
    this.emailForm.valueChanges.pipe(takeUntil(this.destroyed)).subscribe(() => this.saved = false);
    this.serviceForm.valueChanges.pipe(takeUntil(this.destroyed)).subscribe(() => this.saved = false);
  }

  // ============================================================
  // Getters - Plantillas de correo
  // ============================================================

  get selectedTemplate(): EmailTemplateOption {
    return (
      this.templateOptions.find(
        item => item.key === this.templateEvent
      ) ?? this.templateOptions[0]
    );
  }

  get selectedSubjectControl(): FormControl {
    return this.emailForm.get(
      this.selectedTemplate.subjectControl
    ) as FormControl;
  }

  get selectedBodyControl(): FormControl {
    return this.emailForm.get(
      this.selectedTemplate.bodyControl
    ) as FormControl;
  }

  // ============================================================
  // Getters - Plantillas de servicios
  // ============================================================

  get selectedServiceTemplate(): EmailTemplateOption {
    return (
      this.serviceTemplateOptions.find(
        item => item.key === this.serviceTemplateEvent
      ) ?? this.serviceTemplateOptions[0]
    );
  }

  get selectedServiceSubjectControl(): FormControl {
    return this.serviceForm.get(
      this.selectedServiceTemplate.subjectControl
    ) as FormControl;
  }

  get selectedServiceBodyControl(): FormControl {
    return this.serviceForm.get(
      this.selectedServiceTemplate.bodyControl
    ) as FormControl;
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  ngOnInit(): void {
    const saved = this.filterState.load<{ category: SettingsCategory; search: string }>('admin-settings', { category: 'all', search: '' });
    this.settingsFilter = this.visibleCategories.some(item => item.id === saved.category) ? saved.category : 'all';
    this.searchControl.setValue(typeof saved.search === 'string' ? saved.search : '', { emitEvent: false });
    this.searchSubscription = this.searchControl.valueChanges.subscribe(() => this.persistHub());
    this.loadSettings();
  }
  ngOnDestroy(): void { this.searchSubscription?.unsubscribe(); this.destroyed.next(); this.destroyed.complete(); }
  get visibleCards(): SettingCard[] {
    const terms = this.normalize(this.searchControl.value).trim().split(/\s+/).filter(Boolean);
    return this.cards.filter(card => (card.section !== 'security' || this.authService.hasRole('ROLE_ADMIN'))
      && (this.settingsFilter === 'all' || card.category === this.settingsFilter)
      && terms.every(term => this.normalize(card.title + ' ' + card.description).includes(term)));
  }
  get communicationCards(): SettingCard[] { return this.visibleCards.filter(card => card.section === 'communication'); }
  get serviceCards(): SettingCard[] { return this.visibleCards.filter(card => card.section === 'services'); }
  get securityCards(): SettingCard[] { return this.authService.hasRole('ROLE_ADMIN') ? this.visibleCards.filter(card => card.section === 'security') : []; }
  get documentationCards(): SettingCard[] { return this.visibleCards.filter(card => card.section === 'documentation'); }
  get visibleCategories(): typeof this.categories { return this.authService.hasRole('ROLE_ADMIN') ? this.categories : this.categories.filter(item => item.id !== 'security'); }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  private persistHub(): void { this.filterState.save('admin-settings', { category: this.settingsFilter, search: this.searchControl.value }); }
  selectCategory(category: SettingsCategory): void {
    if (category === 'security' && !this.authService.hasRole('ROLE_ADMIN')) return;
    if (!this.categories.some(item => item.id === category)) return;
    this.selected = 'home'; this.settingsFilter = category; this.saved = false; this.testError = ''; this.persistHub();
  }
  resetHubFilters(): void { this.settingsFilter = 'all'; this.searchControl.setValue(''); this.persistHub(); }
  clearSearch(): void { this.searchControl.setValue(''); }
  trackCard(_index: number, card: SettingCard): string { return card.id; }

  // ============================================================
  // Navegación
  // ============================================================

  open(card: string): void {
    if (this.saving || this.testing) return;
    if (card === 'security' && !this.authService.hasRole('ROLE_ADMIN')) return;
    if (card === 'api-documentation') { this.router.navigateByUrl('/documentacion-api'); return; }
    if (card === 'services-menu') { this.showServicesOptions(); return; }
    if (!this.cards.some(item => item.id === card && item.available)) return;
    this.persistHub();
    this.saved = false; this.testSent = false; this.testError = '';
    if (card === 'email') {
      this.selected = 'email';
      if (this.emailLoadError) this.loadSettings();
      this.loadEmailStatus();
      return;
    }

    if (card === 'service-types') {
      this.router.navigate(['/categorias-servicio']);
      return;
    }

    if (card === 'services') {
      this.selected = 'services';
      this.loadServiceSettings();
      return;
    }
    if (card === 'security') {
      this.selected = 'security';
      this.loadSecurity();
    }
  }

  back(): void {
    if (this.saving || this.testing || this.savingPolicy || this.unlockingUserId !== null) return;
    this.selected = 'home';
    this.saved = false;
    this.testError = '';
  }

  showServicesOptions(): void {
    this.selectCategory('services');
  }

  backToServicesMenu(): void {
    this.back();
  }

  loadSecurity(): void {
    this.loadingSecurity = true; this.securityError = '';
    this.http.get<any>('/api/v1/admin/security/login-policy').pipe(finalize(() => this.loadingSecurity = false)).subscribe({
      next: response => {
        if (!response.success || !response.data) { this.securityError = response.message || 'No se pudo cargar la política de acceso.'; return; }
        this.loginPolicyForm.patchValue({ maxIntentos: response.data.maxIntentos, duracionBloqueoMinutos: response.data.duracionBloqueoMinutos, limiteLoginPorMinuto: response.data.limiteLoginPorMinuto });
        this.securityAuditActor = response.data.actualizadoPor || '';
        this.securityUpdatedAt = response.data.fechaActualizacion || '';
      }, error: error => this.securityError = error.error?.message || 'No se pudo cargar la política de acceso.'
    });
    this.loadBlockedAccounts(0);
  }

  loadBlockedAccounts(page = this.blockedPage): void {
    this.loadingBlocked = true;
    this.http.get<any>('/api/v1/admin/security/blocked-accounts', { params: { page, size: 10 } }).pipe(finalize(() => this.loadingBlocked = false)).subscribe({
      next: response => {
        if (!response.success || !response.data) { this.securityError = response.message || 'No se pudieron cargar las cuentas bloqueadas.'; return; }
        this.blockedAccounts = response.data.content || [];
        this.blockedPage = response.data.number || 0;
        this.blockedTotalPages = response.data.totalPages || 0;
        this.blockedTotalElements = response.data.totalElements || 0;
      }, error: error => this.securityError = error.error?.message || 'No se pudieron cargar las cuentas bloqueadas.'
    });
  }

  saveLoginPolicy(): void {
    this.securitySuccess = ''; this.securityError = '';
    if (this.loginPolicyForm.invalid || this.savingPolicy) { this.loginPolicyForm.markAllAsTouched(); return; }
    this.savingPolicy = true;
    this.http.put<any>('/api/v1/admin/security/login-policy', this.loginPolicyForm.getRawValue()).pipe(finalize(() => this.savingPolicy = false)).subscribe({
      next: response => {
        if (!response.success || !response.data) { this.securityError = response.message || 'No se pudo guardar la política.'; return; }
        this.securitySuccess = response.message || 'Política guardada. Se aplicará a los próximos intentos de acceso.';
        this.securityAuditActor = response.data.actualizadoPor || '';
        this.securityUpdatedAt = response.data.fechaActualizacion || '';
      }, error: error => this.securityError = error.error?.message || 'No se pudo guardar la política.'
    });
  }

  async unlockAccount(account: { id: number; username: string }): Promise<void> {
    if (this.unlockingUserId !== null) return;
    const confirmation = await Swal.fire({ icon: 'warning', title: '¿Desbloquear cuenta?', text: `Se restablecerá el contador de intentos de ${account.username}.`, showCancelButton: true, confirmButtonText: 'Desbloquear', cancelButtonText: 'Cancelar', confirmButtonColor: '#155eef' });
    if (!confirmation.isConfirmed) return;
    this.unlockingUserId = account.id; this.securityError = ''; this.securitySuccess = '';
    this.http.post<any>(`/api/v1/admin/security/blocked-accounts/${account.id}/unlock`, {}).pipe(finalize(() => this.unlockingUserId = null)).subscribe({
      next: response => {
        if (!response.success) { this.securityError = response.message || 'No se pudo desbloquear la cuenta.'; return; }
        this.securitySuccess = response.message || 'Cuenta desbloqueada correctamente.';
        this.loadBlockedAccounts(this.blockedPage);
      }, error: error => this.securityError = error.error?.message || 'No se pudo desbloquear la cuenta.'
    });
  }

  formatLockDate(value: string | null): string { return value ? new Date(value).toLocaleString() : 'Bloqueo administrativo'; }
  policyError(name: string): string {
    const control = this.loginPolicyForm.get(name);
    if (!control?.touched || control.valid) return '';
    if (control.hasError('min') || control.hasError('max')) return name === 'maxIntentos' ? 'Usa un valor entre 3 y 20.' : name === 'duracionBloqueoMinutos' ? 'Usa un valor entre 1 y 1440 minutos.' : 'Usa un valor entre 5 y 300 solicitudes.';
    return 'Este campo es obligatorio.';
  }

  // ============================================================
  // Guardado de configuración
  // ============================================================

  saveEmail(): void {
    if (this.saving || this.testing || this.loadingEmail || this.emailLoadError) return;
    this.saved = false; this.testError = ''; this.saving = true;
    const settings =
      this.emailForm.getRawValue() as NotificationSettings;

    this.notificationService.updateSettings(settings).pipe(takeUntil(this.destroyed), finalize(() => this.saving = false)).subscribe({
      next: response => {
        this.saved = response.success;
        if (!response.success) this.testError = response.message || 'No se pudieron guardar las preferencias.';
        this.testSent = false;
      },
      error: error => {
        this.testError =
          error?.error?.message ||
          'No se pudieron guardar las preferencias.';
      }
    });
  }

  saveServiceSettings(): void {
    if (this.saving || this.loadingServices || this.serviceLoadError) return;
    this.serviceSubmitted = true;
    if (this.serviceForm.invalid) { this.serviceForm.markAllAsTouched(); return; }
    this.saved = false;
    this.testError = '';
    this.saving = true;

    this.notificationService
      .updateServiceSettings(this.serviceForm.getRawValue())
      .pipe(takeUntil(this.destroyed), finalize(() => this.saving = false))
      .subscribe({
        next: response => {
          this.saved = response.success;
          if (!response.success) this.testError = response.message || 'No se pudo guardar la configuración.';
        },
        error: error => {
          this.testError =
            error?.error?.message ||
            'No se pudo guardar la configuración.';
        }
      });
  }

  // ============================================================
  // Prueba de correo
  // ============================================================

  testEmail(): void {
    if (this.testing || this.saving) return;
    this.saved = false;
    this.testSent = false;
    this.testError = '';
    this.testing = true;

    this.notificationService.testEmail().pipe(takeUntil(this.destroyed), finalize(() => this.testing = false)).subscribe({
      next: response => {
        this.testing = false;
        this.testSent = response.success;

        if (!response.success) {
          this.testError =
            response.message ||
            'No se pudo enviar el correo de prueba.';
        }
      },
      error: error => {
        this.testing = false;
        this.testError =
          error?.error?.message ||
          'No se pudo conectar con el servidor SMTP.';
      }
    });
  }

  // ============================================================
  // Carga de configuración
  // ============================================================

  loadSettings(): void {
    if (this.loadingEmail) return;
    this.loadingEmail = true; this.emailLoadError = '';
    this.notificationService.getSettings().pipe(takeUntil(this.destroyed), finalize(() => this.loadingEmail = false)).subscribe({
      next: response => {
        this.loadingEmail = false;
        if (response.success && response.data) {
          this.emailForm.patchValue(response.data);
        } else this.emailLoadError = 'No se pudieron cargar las preferencias. Reintenta antes de guardar.';
      },
      error: () => { this.loadingEmail = false; this.emailLoadError = 'No se pudieron cargar las preferencias. Reintenta antes de guardar.'; }
    });
  }

  loadEmailStatus(): void {
    if (this.loadingSmtp) return;
    this.loadingSmtp = true; this.smtpError = '';
    this.notificationService.getEmailStatus().pipe(takeUntil(this.destroyed), finalize(() => this.loadingSmtp = false)).subscribe({
      next: response => {
        this.loadingSmtp = false;
        if (!response.success || !response.data) { this.smtpError = 'No se pudo consultar el estado SMTP.'; return; }
        this.smtpEnabled = response.data?.enabled ?? false;
        this.smtpConfigured = response.data?.configured ?? false;
      },
      error: () => {
        this.loadingSmtp = false; this.smtpError = 'No se pudo consultar el estado SMTP.';
        this.smtpEnabled = false;
        this.smtpConfigured = false;
      }
    });
  }

  loadServiceSettings(): void {
    if (this.loadingServices) return;
    this.loadingServices = true; this.serviceLoadError = ''; this.serviceSubmitted = false;
    this.notificationService.getServiceSettings().pipe(takeUntil(this.destroyed), finalize(() => this.loadingServices = false)).subscribe({
      next: response => {
        this.loadingServices = false;
        if (response.success && response.data) {
          this.serviceForm.patchValue(response.data);
        } else this.serviceLoadError = 'No se pudo cargar la configuración. Reintenta antes de guardar.';
      },
      error: () => { this.loadingServices = false; this.serviceLoadError = 'No se pudo cargar la configuración. Reintenta antes de guardar.'; }
    });
  }

  // ============================================================
  // Creación de formularios
  // ============================================================

  private createEmailForm(): FormGroup {
    return this.fb.group({
      enabled: [false],

      // Eventos
      onTicketCreated: [true],
      onAssigned: [true],
      onStatusChanged: [true],
      onReply: [true],
      onAttachment: [false],
      onSla: [true],

      // Plantilla general
      emailSubject: [
        'Actualización de ticket {{ticket.codigo}} - {{ticket.titulo}}'
      ],
      emailBody: [
        `Hola {{cliente.nombre}},
        El ticket {{ticket.codigo}} ha sido actualizado.
        {{ticket.titulo}}
        {{mensaje}}`
      ],

      // Ticket creado
      ticketCreatedSubject: [
        'Ticket creado: {{ticket.codigo}} - {{ticket.titulo}}'
      ],
      ticketCreatedBody: [
        `Hola {{cliente.nombre}},
        Se creó un nuevo ticket.
        Código: {{ticket.codigo}}
        Título: {{ticket.titulo}}
        {{mensaje}}`
      ],

      // Ticket asignado
      assignedSubject: ['Ticket asignado: {{ticket.codigo}}'],
      assignedBody: [
        `Hola,
        Se te asignó el ticket {{ticket.codigo}}.
        Título: {{ticket.titulo}}
        {{mensaje}}`
      ],

      // Cambio de estado
      statusChangedSubject: ['Estado actualizado: {{ticket.codigo}}'],
      statusChangedBody: [
        `Hola {{cliente.nombre}},
        El estado de tu ticket cambió.
        Código: {{ticket.codigo}}
        Título: {{ticket.titulo}}
        Estado actual: {{mensaje}}`
      ],

      // Nueva respuesta
      replySubject: ['Nueva respuesta: {{ticket.codigo}}'],
      replyBody: [
        `Hola {{cliente.nombre}},
        Se agregó una respuesta a tu ticket.
        Código: {{ticket.codigo}}
        Título: {{ticket.titulo}}
        {{mensaje}}`
      ],

      // Archivo adjunto
      attachmentSubject: ['Nuevo archivo adjunto: {{ticket.codigo}}'],
      attachmentBody: [
        `Hola {{cliente.nombre}},
        Se agregó un archivo al ticket {{ticket.codigo}}.
        Título: {{ticket.titulo}}
        {{mensaje}}`
      ],

      // SLA
      slaSubject: ['Alerta SLA: {{ticket.codigo}}'],
      slaBody: [
        `Alerta de SLA.
        El ticket {{ticket.codigo}} está próximo a vencer.
        {{mensaje}}`
      ]
    });
  }

  private createServiceForm(): FormGroup {
    return this.fb.group({
      diasPorVencer: [
        5,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(365),
          Validators.pattern(/^\d+$/)
        ]
      ],

      recordatorioVencido: [true],

      // Plantilla de recordatorio
      asuntoRecordatorio: [
        'Recordatorio de servicio: {{servicio.nombre}}',
        Validators.required
      ],
      plantillaRecordatorio: [
        `Hola,
        El servicio {{servicio.nombre}} vence el {{servicio.fechaFin}}.
        Estado: {{servicio.estado}}.
        Por favor, revisa su renovación.`,
        Validators.required
      ],

      // Servicio por vencer
      asuntoPorVencer: [
        'Recordatorio: servicio por vencer - {{servicio.nombre}}',
        Validators.required
      ],
      plantillaPorVencer: [
        `Hola,
        El servicio {{servicio.nombre}} vencerá el {{servicio.fechaFin}}.
        Estado: {{servicio.estado}}.
        Por favor, revisa su renovación.`,
        Validators.required
      ],

      // Servicio vencido
      asuntoVencido: [
        'Servicio vencido: {{servicio.nombre}}',
        Validators.required
      ],
      plantillaVencido: [
        `Hola,
        El servicio {{servicio.nombre}} venció el {{servicio.fechaFin}}.
        Estado: {{servicio.estado}}.
        Revisa la renovación o regularización del servicio.`,
        Validators.required
      ]
    });
  }
}
