import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CategoriaServicio } from '../core/models/service.model';
import { ApiResponse } from '../core/models/auth.model';
import { FilterStateService } from '../core/services/filter-state.service';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';

@Component({
  selector: 'app-service-category-management', standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './service-category-management.component.html',
  styleUrls: ['./service-category-management.component.scss']
})
export class ServiceCategoryManagementComponent implements OnInit, OnDestroy {
  @ViewChild('typeEditor', { static: true }) typeEditor?: ElementRef<HTMLDialogElement>;
  items: CategoriaServicio[] = [];
  form: FormGroup;
  showModal = false;
  editingId: number | null = null;
  loading = false;
  loaded = false;
  loadError = '';
  search = '';
  status = '';
  saving = false;
  changingId: number | null = null;
  confirming = false;
  successMessage = '';
  errorMessage = '';
  formError = '';
  originalIcon = '';
  private destroyed = false;
  private loadRequest?: Subscription;
  private readonly mutations = new Subscription();
  private readonly storageKey = 'admin-service-types';
  iconosDisponibles = [
    { value: 'cloud', label: 'Nube' }, { value: 'language', label: 'Sitio web' }, { value: 'mail', label: 'Correo' },
    { value: 'dns', label: 'Servidor' }, { value: 'computer', label: 'Computadora' }, { value: 'security', label: 'Seguridad' },
    { value: 'database', label: 'Base de datos' }, { value: 'apps', label: 'Aplicaciones' }, { value: 'vpn_lock', label: 'VPN' },
    { value: 'support_agent', label: 'Soporte' }, { value: 'category', label: 'Categoría' }, { value: 'miscellaneous_services', label: 'Servicio' }
  ];
  constructor(private http: HttpClient, private fb: FormBuilder, private router: Router, private filterState: FilterStateService) {
    this.form = this.fb.group({ nombre: ['', [Validators.required, Validators.maxLength(100)]], icono: ['category', Validators.maxLength(60)], descripcion: ['', Validators.maxLength(255)] });
  }
  get busy(): boolean { return this.saving || this.confirming || this.changingId !== null; }
  get actionsDisabled(): boolean { return this.busy || this.loading || !!this.loadError; }
  get hasFilters(): boolean { return !!(this.search.trim() || this.status); }
  get filteredItems(): CategoriaServicio[] {
    const terms = this.normalize(this.search).trim().split(/\s+/).filter(Boolean);
    return this.items.filter(item => (!this.status || (this.status === 'active' ? item.activa : !item.activa))
      && terms.every(term => this.normalize(item.nombre + ' ' + (item.descripcion || '')).includes(term)));
  }
  get hasCustomIcon(): boolean { return !!this.originalIcon && !this.iconosDisponibles.some(icon => icon.value === this.originalIcon); }
  ngOnInit(): void {
    const saved = this.filterState.load<{ search: string; status: string }>(this.storageKey, { search: '', status: '' });
    this.search = typeof saved.search === 'string' ? saved.search : '';
    this.status = ['active', 'inactive'].includes(saved.status) ? saved.status : '';
    this.load();
  }
  ngOnDestroy(): void {
    this.destroyed = true; this.loadRequest?.unsubscribe(); this.mutations.unsubscribe();
    this.typeEditor?.nativeElement.close();
    if (this.confirming) Swal.close();
  }
  filtersChanged(): void { this.filterState.save(this.storageKey, { search: this.search, status: this.status }); }
  clearFilters(): void { this.search = ''; this.status = ''; this.filtersChanged(); }
  back(): void { if (!this.busy) { this.filtersChanged(); this.router.navigate(['/ajustes']); } }
  load(): void {
    if (this.destroyed || this.busy) return;
    this.loadRequest?.unsubscribe(); this.loading = true; this.loadError = '';
    this.loadRequest = this.http.get<ApiResponse<CategoriaServicio[]>>('/api/v1/service-categories').subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !Array.isArray(res.data)) { this.failLoad(); return; }
        this.items = res.data; this.loaded = true;
      },
      error: () => { this.loading = false; this.failLoad(); }
    });
  }
  private failLoad(): void { this.loadError = this.loaded ? 'No se pudo actualizar el catálogo. Se conservan los últimos datos cargados.' : 'No se pudo cargar el catálogo de tipos de servicio.'; }
  open(): void {
    if (this.actionsDisabled || this.showModal) return;
    this.editingId = null; this.originalIcon = '';
    this.form.reset({ nombre: '', icono: 'category', descripcion: '' }); this.openEditor();
  }
  edit(item: CategoriaServicio): void {
    if (this.actionsDisabled || this.showModal) return;
    this.editingId = item.id; this.originalIcon = this.iconFor(item);
    this.form.reset({ nombre: item.nombre, icono: this.originalIcon, descripcion: item.descripcion || '' }); this.openEditor();
  }
  private openEditor(): void {
    this.formError = ''; this.successMessage = ''; this.errorMessage = ''; this.showModal = true;
    this.typeEditor?.nativeElement.showModal();
  }
  close(): void {
    if (this.saving) return;
    this.typeEditor?.nativeElement.close(); this.showModal = false; this.editingId = null; this.formError = '';
  }
  onCancel(event: Event): void { event.preventDefault(); this.close(); }
  onBackdrop(event: MouseEvent): void {
    const dialog = this.typeEditor?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.close();
  }
  iconFor(item: CategoriaServicio): string { return item.icono?.trim() || 'category'; }
  iconoLabel(value: string): string { return this.iconosDisponibles.find(item => item.value === value)?.label || value || 'Categoría'; }
  fieldError(name: string): string {
    const control = this.form.get(name);
    if (!control?.invalid || !control.touched) return '';
    if (control.hasError('required')) return 'Ingresa el nombre del tipo de servicio.';
    return name === 'nombre' ? 'El nombre no puede superar 100 caracteres.' : name === 'descripcion' ? 'La descripción no puede superar 255 caracteres.' : 'El icono no puede superar 60 caracteres.';
  }
  save(): void {
    if (this.saving || !this.showModal || this.destroyed) return;
    this.form.get('nombre')?.setValue(String(this.form.get('nombre')?.value || '').trim());
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const payload = this.form.getRawValue(), editing = this.editingId !== null;
    this.saving = true; this.formError = ''; this.form.disable({ emitEvent: false });
    const request = editing ? this.http.put<ApiResponse<CategoriaServicio>>(`/api/v1/service-categories/${this.editingId}`, payload) : this.http.post<ApiResponse<CategoriaServicio>>('/api/v1/service-categories', payload);
    this.mutations.add(request.subscribe({
      next: res => {
        this.finishSave();
        if (!res.success) { this.formError = res.message || 'No se pudo guardar el tipo de servicio.'; return; }
        this.close(); this.successMessage = editing ? 'Tipo de servicio actualizado correctamente.' : 'Tipo de servicio creado correctamente.'; this.load();
      },
      error: err => { this.finishSave(); this.formError = err.error?.message || 'No se pudo guardar el tipo de servicio. Inténtalo nuevamente.'; }
    }));
  }
  private finishSave(): void { this.saving = false; this.form.enable({ emitEvent: false }); }
  async toggle(item: CategoriaServicio): Promise<void> {
    if (this.actionsDisabled || this.showModal || this.destroyed) return;
    this.confirming = true;
    const active = !item.activa;
    try {
      const confirmation = await Swal.fire({ icon: 'question', title: active ? '¿Activar tipo de servicio?' : '¿Desactivar tipo de servicio?', text: active ? `Se habilitará ${item.nombre}.` : `Se desactivará ${item.nombre}. El tipo y los servicios registrados se conservarán.`, showCancelButton: true, confirmButtonText: active ? 'Sí, activar' : 'Sí, desactivar', cancelButtonText: 'Cancelar', confirmButtonColor: '#2563eb' });
      if (!confirmation.isConfirmed || this.destroyed) return;
      this.changingId = item.id; this.successMessage = ''; this.errorMessage = '';
      this.mutations.add(this.http.patch<ApiResponse<CategoriaServicio>>(`/api/v1/service-categories/${item.id}/status`, {}, { params: { activa: active } }).subscribe({
        next: res => {
          this.changingId = null;
          if (!res.success) { this.errorMessage = res.message || 'No se pudo cambiar el estado.'; return; }
          this.items = this.items.map(current => current.id === item.id ? { ...current, activa: active } : current);
          this.successMessage = active ? 'Tipo de servicio activado correctamente.' : 'Tipo de servicio desactivado correctamente.';
        },
        error: err => { this.changingId = null; this.errorMessage = err.error?.message || 'No se pudo cambiar el estado. Inténtalo nuevamente.'; }
      }));
    } finally { this.confirming = false; }
  }
  trackType(_index: number, item: CategoriaServicio): number { return item.id; }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
}
