import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { CategoriaServicio, Servicio } from '../core/models/service.model';
import { finalize, forkJoin, of, Subject, takeUntil } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-service-create', standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatIconModule, MatInputModule, MatNativeDateModule, MatSelectModule],
  styleUrls: ['./service-management.component.scss', './service-create.component.scss'],
  templateUrl: './service-create.component.html'
})
export class ServiceCreateComponent implements OnInit, OnDestroy {
  form: FormGroup;
  correos: string[] = [''];
  categorias: CategoriaServicio[] = [];
  tipos: string[] = [];
  saving = false;
  loading = false;
  loadFailed = false;
  error = '';
  originalService: Servicio | null = null;
  private renewalId: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder, private http: HttpClient, private router: Router,
    private authService: AuthService, private route: ActivatedRoute
  ) {
    this.form = this.fb.group({
      nombre: ['', Validators.required], proveedor: ['', Validators.required],
      tipo: ['', Validators.required], fechaInicio: ['', Validators.required],
      fechaFin: ['', Validators.required],
      costoMensual: [0, [Validators.required, Validators.min(0)]],
      divisa: ['PEN', Validators.required], responsable: [''], notas: ['']
    });
  }

  get basePath(): string { return this.authService.isTechnicianUser() ? '/tecnico/servicios' : '/servicios'; }
  get isRenewal(): boolean { return this.renewalId !== null; }

  ngOnInit(): void {
    this.renewalId = this.route.snapshot.paramMap.get('id');
    this.loading = true;
    forkJoin({
      categories: this.http.get<any>('/api/v1/service-categories'),
      service: this.renewalId ? this.http.get<any>(`/api/v1/services/${this.renewalId}`) : of(null)
    }).pipe(takeUntil(this.destroy$), finalize(() => this.loading = false)).subscribe({
      next: ({ categories, service }) => {
        if (categories.success === false || (this.isRenewal && (!service?.data || service.success === false))) {
          this.loadFailed = true;
          this.error = 'No se pudieron cargar los datos del formulario.';
          return;
        }
        this.categorias = (categories.data ?? []).filter((category: CategoriaServicio) => category.activa);
        this.tipos = this.categorias.map(category => category.nombre);
        if (!service) return;
        const original = service.data as Servicio;
        if (original.estado === 'CANCELADO' || original.estado === 'FINALIZADO') {
          this.loadFailed = true;
          this.error = 'No se puede renovar un servicio cancelado o finalizado.';
          return;
        }
        this.originalService = original;
        this.form.patchValue({
          nombre: original.nombre, proveedor: original.proveedor, tipo: original.tipo,
          responsable: original.responsable ?? '', costoMensual: original.costoMensual,
          divisa: original.divisa || 'PEN', notas: original.notas ?? '',
          fechaInicio: '', fechaFin: ''
        });
        // Preserve the current type even if it was deactivated after creating the service.
        if (original.tipo && !this.tipos.includes(original.tipo)) this.tipos.push(original.tipo);
        this.correos = original.correosRecordatorio?.length ? [...original.correosRecordatorio] : [''];
      },
      error: err => {
        this.loadFailed = true;
        this.error = err.error?.message || 'No se pudieron cargar los datos del formulario.';
      }
    });
  }

  correoValido(index: number): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((this.correos[index] ?? '').trim()); }
  addNextEmail(index: number): void { if (index === this.correos.length - 1 && this.correoValido(index)) this.correos.push(''); }
  removeEmail(index: number): void { this.correos.length > 1 ? this.correos.splice(index, 1) : this.correos[0] = ''; }
  trackByIndex(index: number): number { return index; }

  save(): void {
    if (this.saving || this.loading || this.loadFailed) return;
    this.error = '';
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const value = this.form.getRawValue();
    const fechaInicio = this.dateValue(value.fechaInicio);
    const fechaFin = this.dateValue(value.fechaFin);
    if (fechaFin < fechaInicio) {
      this.error = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
      return;
    }
    const emails = this.correos.map(email => email.trim()).filter(Boolean);
    if (emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      this.error = 'Revisa los correos de recordatorio: deben ser direcciones válidas.';
      return;
    }
    const payload = { ...value, fechaInicio, fechaFin, costoMensual: Number(value.costoMensual), correosRecordatorio: emails };
    const url = this.isRenewal ? `/api/v1/services/${this.renewalId}/renew` : '/api/v1/services';
    this.saving = true;
    this.http.post<any>(url, payload).pipe(
      takeUntil(this.destroy$), finalize(() => this.saving = false)
    ).subscribe({
      next: response => {
        if (!response.success) { this.error = response.message; return; }
        this.router.navigate([this.basePath]);
        Swal.fire({
          icon: 'success', title: this.isRenewal ? 'Servicio renovado' : 'Servicio creado',
          text: response.message, confirmButtonColor: '#155eef'
        });
      },
      error: err => {
        this.error = err.error?.message || (this.isRenewal ? 'No se pudo renovar el servicio.' : 'No se pudo crear el servicio.');
      }
    });
  }

  private dateValue(value: Date | string): string {
    if (typeof value === 'string') return value;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
