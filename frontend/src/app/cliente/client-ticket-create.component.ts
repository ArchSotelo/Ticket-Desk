import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import {
  ActivatedRoute,
  Router
} from '@angular/router';
import { lastValueFrom } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';

import { UsuarioProfile } from '../core/models/user.model';

import { showAttachmentAlert } from '../core/services/attachment-alert';
import { attachmentFileError } from '../core/services/attachment-policy';
import { AttachmentService } from '../core/services/attachment.service';
import { TicketService } from '../core/services/ticket.service';
import { UserService } from '../core/services/user.service';

// ============================================================
// Interfaces
// ============================================================

interface CatalogSubcategoria {
  id: number;
  nombre: string;
}

interface CatalogCategoria {
  id: number;
  nombre: string;
  descripcion?: string;
  subcategorias?: CatalogSubcategoria[];
}

interface CatalogPrioridad {
  id: number;
  nombre: string;
  codigo?: string;
}

interface ClienteActivo {
  id: number;
  nombres: string;
  apellidos: string;
  email: string;
  empresaId?: number;
  empresaNombre?: string;
  areaId?: number;
  areaNombre?: string;
  estado?: string;
  roles?: string[];
}

interface ApiListResponse<T> {
  success: boolean;
  data?: {
    content?: T[];
  };
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

// ============================================================
// Component
// ============================================================

@Component({
  selector: 'app-client-ticket-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './client-ticket-create.component.html',
  styleUrls: ['./client-ticket-create.component.scss']
})
export class ClientTicketCreateComponent implements OnInit {
  // ============================================================
  // Formulario
  // ============================================================

  ticketForm: FormGroup;

  // ============================================================
  // Catálogos
  // ============================================================

  categorias: CatalogCategoria[] = [];
  subcategorias: CatalogSubcategoria[] = [];
  prioridades: CatalogPrioridad[] = [];

  // ============================================================
  // Usuario / cliente
  // ============================================================

  profile: UsuarioProfile | null = null;
  clientesActivos: ClienteActivo[] = [];

  role: 'admin' | 'technician' | 'client' = 'client';

  // ============================================================
  // Archivos
  // ============================================================

  adjuntosPendientes: File[] = [];
  isDragging = false;

  // ============================================================
  // Estado
  // ============================================================

  loading = false;
  uploadingFiles = false;
  errorMessage = '';
  submitAttempted = false;
  @ViewChild('ticketFormElement') private formElement?: ElementRef<HTMLFormElement>;
  @ViewChild('validationSummary') private validationSummary?: ElementRef<HTMLElement>;
  private idempotencyKey: string | null = null;

  // ============================================================
  // Constructor
  // ============================================================

  constructor(
    private fb: FormBuilder,
    private ticketService: TicketService,
    private attachmentService: AttachmentService,
    private userService: UserService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.ticketForm = this.createForm();
  }

  // ============================================================
  // Lifecycle
  // ============================================================

   ngOnInit(): void {
    this.role = this.route.snapshot.data['role'] || 'client';
    if (this.esPersonal) {
      this.ticketForm.get('clienteId')?.setValidators(Validators.required);
      this.ticketForm.get('clienteId')?.updateValueAndValidity();
      this.cargarClientesActivos();
    }
    this.userService.getProfile().subscribe({
      next: (res) => {
        this.profile = res.data ?? null;
        if (this.profile?.empresaId && !this.esPersonal) {
          this.ticketForm.patchValue({
            empresaId: this.profile.empresaId,
            areaId: this.profile.areaId ?? null
          });
        }
      }
    });

    this.cargarCatalogos();
  }

  // ============================================================
  // Getters
  // ============================================================

  get esPersonal(): boolean {
    return (
      this.role === 'admin' ||
      this.role === 'technician'
    );
  }

  get solicitante(): ClienteActivo | UsuarioProfile | null {
    if (!this.esPersonal) return this.profile;
    const clienteId = Number(this.ticketForm.get('clienteId')?.value);
    return this.clientesActivos.find(cliente => cliente.id === clienteId) ?? null;
  }

  get nombreSolicitante(): string {
    const cliente = this.solicitante;
    return cliente ? this.nombreCliente(cliente)
      : this.esPersonal ? 'Selecciona un cliente' : 'Cargando tus datos...';
  }

  get inicialesSolicitante(): string {
    const cliente = this.solicitante;
    if (!cliente) return '';
    return [cliente.nombres, cliente.apellidos]
      .map(nombre => nombre?.trim().charAt(0) || '')
      .join('').toUpperCase() || cliente.email?.charAt(0).toUpperCase() || '?';
  }

  get nombrePortal(): string {
    if (this.role === 'admin' && this.profile?.roles?.includes('ROLE_SUPERVISOR')
        && !this.profile.roles.includes('ROLE_ADMIN')) return 'Portal supervisor';
    return this.role === 'admin' ? 'Portal administrador'
      : this.role === 'technician' ? 'Portal técnico' : 'Portal cliente';
  }

  get validationIssues(): { control: string; message: string }[] {
    const fields = ['clienteId', 'titulo', 'prioridadId', 'categoriaId', 'subcategoriaId', 'descripcion', 'empresaId'];
    return fields.flatMap(control => {
      // The company is filled automatically after choosing a client.
      if (control === 'empresaId' && this.esPersonal && !this.ticketForm.get('clienteId')?.value) return [];
      const message = this.fieldError(control);
      return message ? [{ control, message }] : [];
    });
  }

  fieldError(controlName: string): string {
    const control = this.ticketForm.get(controlName);
    if (!control?.invalid) return '';
    const requiredMessages: Record<string, string> = {
      clienteId: 'Selecciona un cliente.',
      titulo: 'Ingresa el título del ticket.',
      prioridadId: 'Selecciona una prioridad.',
      categoriaId: 'Selecciona una categoría.',
      subcategoriaId: 'Selecciona una subcategoría.',
      descripcion: 'Describe el problema o la solicitud.',
      empresaId: this.esPersonal
        ? 'El cliente seleccionado no tiene una empresa asignada. Actualiza su perfil antes de crear el ticket.'
        : 'No tienes una empresa asignada. Contacta al administrador antes de crear el ticket.'
    };
    if (control.hasError('required')) return requiredMessages[controlName] || 'Completa este campo.';
    if (control.hasError('minlength')) {
      const length = control.getError('minlength').requiredLength;
      return controlName === 'titulo'
        ? `El título debe tener al menos ${length} caracteres.`
        : `La descripción debe tener al menos ${length} caracteres.`;
    }
    return 'Revisa el valor de este campo.';
  }

  focusField(controlName: string): void {
    const field = this.formElement?.nativeElement.querySelector<HTMLElement>(
      `[formControlName="${controlName}"]`
    ) || this.validationSummary?.nativeElement;
    field?.focus();
    field?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }

  // ============================================================
  // Configuración según rol
  // ============================================================

  private configureRole(): void {
    if (!this.esPersonal) {
      return;
    }

    const clienteControl =
      this.ticketForm.get('clienteId');

    clienteControl?.setValidators(
      Validators.required
    );

    clienteControl?.updateValueAndValidity();

    this.cargarClientesActivos();
  }

  // ============================================================
  // Perfil
  // ============================================================

  private loadProfile(): void {
    this.userService.getProfile().subscribe({
      next: response => {
        this.profile = response.data ?? null;

        if (
          this.profile?.empresaId &&
          !this.esPersonal
        ) {
          this.ticketForm.patchValue({
            empresaId: this.profile.empresaId,
            areaId: this.profile.areaId ?? null
          });
        }
      }
    });
  }

  // ============================================================
  // Clientes
  // ============================================================

  cargarClientesActivos(): void {
    if (!this.esPersonal) return;
    this.http
      .get<ApiListResponse<ClienteActivo>>(
        '/api/v1/contacts?size=500'
      )
      .subscribe({
        next: response => {
          const usuarios =
            response.data?.content ?? [];

          this.clientesActivos = usuarios
            .filter(usuario =>
              usuario.estado === 'ACTIVO' &&
              usuario.roles?.includes('ROLE_CLIENTE')
            )
            .sort((a, b) =>
              this.nombreCliente(a).localeCompare(
                this.nombreCliente(b)
              )
            );
        },

        error: () => {
          this.clientesActivos = [];
        }
      });
  }

  nombreCliente(cliente: ClienteActivo): string {
    return (
      `${cliente.nombres ?? ''} ${cliente.apellidos ?? ''}`
        .trim() || cliente.email
    );
  }

  onClienteChange(clienteId: number): void {
    const cliente =
      this.clientesActivos.find(
        item => item.id === Number(clienteId)
      );

    this.ticketForm.patchValue({
      empresaId: cliente?.empresaId ?? null,
      areaId: cliente?.areaId ?? null
    });
  }

  // ============================================================
  // Catálogos
  // ============================================================

  cargarCatalogos(): void {
    this.loadCategories();
    this.loadPriorities();
  }

  private loadCategories(): void {
    this.http
      .get<ApiResponse<CatalogCategoria[]>>(
        '/api/v1/catalogs/categories'
      )
      .subscribe({
        next: response => {
          if (response.success) {
            this.categorias = response.data ?? [];
          }
        }
      });
  }

  private loadPriorities(): void {
    this.http
      .get<ApiResponse<CatalogPrioridad[]>>(
        '/api/v1/catalogs/priorities'
      )
      .subscribe({
        next: response => {
          if (response.success) {
            this.prioridades = response.data ?? [];
          }
        }
      });
  }

  onCategoriaChange(categoriaId: number): void {
    const selected =
      this.categorias.find(
        categoria => categoria.id === categoriaId
      );

    this.subcategorias =
      selected?.subcategorias ?? [];

    this.ticketForm.patchValue({
      subcategoriaId: null
    });
  }

  // ============================================================
  // Archivos
  // ============================================================

  onFilesSelected(event: Event): void {
    if (this.loading) return;
    const input =
      event.target as HTMLInputElement;

    if (!input.files?.length) {
      return;
    }

    const nuevosArchivos =
      Array.from(input.files);

    const invalid = nuevosArchivos.map(attachmentFileError).find(Boolean);
    if (invalid) { showAttachmentAlert(invalid); input.value = ''; return; }
    this.adjuntosPendientes = [
      ...this.adjuntosPendientes,
      ...nuevosArchivos
    ];

    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.loading) return;
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (this.loading) return;

    if (!event.dataTransfer?.files?.length) {
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    const invalid = files.map(attachmentFileError).find(Boolean);
    if (invalid) { showAttachmentAlert(invalid); return; }
    this.adjuntosPendientes = [...this.adjuntosPendientes, ...files];
  }

  removeFile(index: number): void {
    if (this.loading) return;
    this.adjuntosPendientes =
      this.adjuntosPendientes.filter(
        (_, currentIndex) =>
          currentIndex !== index
      );
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }

  // ============================================================
  // Navegación
  // ============================================================

  cancelar(): void {
    this.router.navigate([
      this.getCancelRoute()
    ]);
  }

  private getCancelRoute(): string {
    switch (this.role) {
      case 'admin':
        return '/tickets/list';

      case 'technician':
        return '/tecnico';

      default:
        return '/cliente/tickets';
    }
  }

  private getSuccessRoute(): string {
    return this.getCancelRoute();
  }

  // ============================================================
  // Envío del formulario
  // ============================================================

  async onSubmit(): Promise<void> {
    if (this.loading) {
      return;
    }

    this.submitAttempted = true;
    if (this.ticketForm.invalid) {
      this.ticketForm.markAllAsTouched();
      this.errorMessage = '';
      setTimeout(() => this.focusField(this.validationIssues[0]?.control || ''));
      return;
    }

    this.startSubmit();
    this.idempotencyKey ??= this.createIdempotencyKey();

    try {
      const ticket =
        await this.createTicket(this.idempotencyKey);

      if (!ticket?.id) {
        return;
      }

      await this.uploadAttachments(
        ticket.id
      );

      const totalAdjuntos =
        this.adjuntosPendientes.length;

      this.resetAfterSubmit();
      this.idempotencyKey = null;

      await this.showSuccessMessage(
        totalAdjuntos
      );

      await this.router.navigate([
        this.getSuccessRoute()
      ]);
    } catch (error: any) {
      this.errorMessage =
        error?.error?.message ||
        'No se pudo crear el ticket.';
    } finally {
      this.finishSubmit();
    }
  }

  // ============================================================
  // Creación del ticket
  // ============================================================

  private async createTicket(idempotencyKey: string | null): Promise<any> {
    const formValue =
      this.ticketForm.getRawValue();

    const response = await lastValueFrom(
      this.ticketService.crearTicket(formValue, idempotencyKey ?? this.createIdempotencyKey())
    );

    if (!response.success || !response.data) {
      this.errorMessage =
        response.message ||
        'No se pudo crear el ticket.';

      return null;
    }

    return response.data;
  }

  // ============================================================
  // Subida de archivos
  // ============================================================

  private async uploadAttachments(
    ticketId: number
  ): Promise<void> {
    if (!this.adjuntosPendientes.length) {
      return;
    }

    this.uploadingFiles = true;

    const descripcion =
      (
        this.ticketForm.getRawValue()
          .descripcion ?? ''
      ).trim();

    for (const file of this.adjuntosPendientes) {
      await lastValueFrom(
        this.attachmentService.subirAdjunto(
          ticketId,
          file,
          descripcion
        )
      );
    }
  }

  // ============================================================
  // Reset después de crear
  // ============================================================

  private resetAfterSubmit(): void {
    this.submitAttempted = false;
    this.ticketForm.reset({
      clienteId: this.esPersonal
        ? null
        : undefined,
      empresaId:
        this.profile?.empresaId ?? null,
      areaId:
        this.profile?.areaId ?? null,
      categoriaId: null,
      subcategoriaId: null,
      prioridadId: null
    });

    this.subcategorias = [];
    this.adjuntosPendientes = [];
  }

  // ============================================================
  // Mensaje de éxito
  // ============================================================

  private async showSuccessMessage(
    totalAdjuntos: number
  ): Promise<void> {
    await Swal.fire({
      icon: 'success',
      title: 'Ticket registrado',
      text: totalAdjuntos
        ? `Se registró el ticket y se adjuntaron ${totalAdjuntos} archivo(s).`
        : 'Tu ticket fue registrado correctamente.',
      confirmButtonText: 'Continuar',
      confirmButtonColor: '#0052cc',
      timer: 2200,
      timerProgressBar: true
    });
  }

  // ============================================================
  // Estado del envío
  // ============================================================

  private startSubmit(): void {
    this.loading = true;
    this.errorMessage = '';
    this.uploadingFiles = false;
  }

  private createIdempotencyKey(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private finishSubmit(): void {
    this.loading = false;
    this.uploadingFiles = false;
  }

  // ============================================================
  // Formulario
  // ============================================================

  private createForm(): FormGroup {
    return this.fb.group({
      titulo: [
        '',
        [
          Validators.required,
          Validators.minLength(5)
        ]
      ],

      descripcion: [
        '',
        [
          Validators.required,
          Validators.minLength(10)
        ]
      ],

      clienteId: [null],

      empresaId: [
        null,
        Validators.required
      ],

      areaId: [null],

      categoriaId: [
        null,
        Validators.required
      ],

      subcategoriaId: [null, Validators.required],

      prioridadId: [
        null,
        Validators.required
      ]
    });
  }
}
