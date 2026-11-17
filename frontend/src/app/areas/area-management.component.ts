import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { Area, Empresa } from '../core/models/organization.model';
import { OrganizationService } from '../core/services/organization.service';
import { FilterStateService } from '../core/services/filter-state.service';

interface AreaFilters { search: string; company: string; status: string; pageIndex: number; pageSize: number; }

@Component({
  selector: 'app-area-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './area-management.component.html',
  styleUrls: ['./area-management.component.scss']
})
export class AreaManagementComponent implements OnInit, OnDestroy {
  @ViewChild('areaEditor', { static: true }) areaEditor?: ElementRef<HTMLDialogElement>;
  areas: Area[] = [];
  private todasLasAreas: Area[] = [];
  private filteredAreas: Area[] = [];
  empresas: Empresa[] = [];
  search = '';
  company = '';
  status = '';
  pageIndex = 0;
  pageSize = 8;
  readonly pageSizeOptions = [5, 8, 12, 20];
  totalElements = 0;
  totalPages = 0;
  loading = false;
  loaded = false;
  loadingCompanies = false;
  companiesError = '';
  loadError = '';
  saving = false;
  deletingId: number | null = null;
  confirmingDelete = false;
  form: FormGroup;
  showModal = false;
  editingId: number | null = null;
  successMessage = '';
  errorMessage = '';
  private destroyed = false;
  private loadRequest?: Subscription;
  private companiesRequest?: Subscription;
  private readonly mutations = new Subscription();
  private readonly storageKey = 'admin-areas';

  constructor(private fb: FormBuilder, private organizationService: OrganizationService, private filterState: FilterStateService) {
    this.form = this.fb.group({
      empresaId: [null, Validators.required],
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      descripcion: ['', Validators.maxLength(255)],
      activo: [true]
    });
  }
  get busy(): boolean { return this.saving || this.confirmingDelete || this.deletingId !== null; }
  get hasFilters(): boolean { return !!(this.search.trim() || this.company || this.status); }
  get selectedCompanyExists(): boolean { return this.filterCompanies.some(company => String(company.id) === this.company); }
  get firstItemIndex(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItemIndex(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }
  get filterCompanies(): { id: number; name: string }[] {
    const names = new Map<number, string>(this.empresas.map(company => [company.id, company.razonSocial]));
    this.todasLasAreas.forEach(area => { if (!names.has(area.empresaId)) names.set(area.empresaId, area.empresaNombre || 'Empresa #' + area.empresaId); });
    return Array.from(names, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  ngOnInit(): void {
    const saved = this.filterState.load<AreaFilters>(this.storageKey, { search: '', company: '', status: '', pageIndex: 0, pageSize: 8 });
    this.search = typeof saved.search === 'string' ? saved.search : '';
    this.company = typeof saved.company === 'string' && /^\d+$/.test(saved.company) ? saved.company : '';
    this.status = ['active', 'inactive'].includes(saved.status) ? saved.status : '';
    this.pageIndex = Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0 ? saved.pageIndex : 0;
    this.pageSize = this.pageSizeOptions.includes(saved.pageSize) ? saved.pageSize : 8;
    this.loadCompanies();
    this.load();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadRequest?.unsubscribe();
    this.companiesRequest?.unsubscribe();
    this.mutations.unsubscribe();
    this.areaEditor?.nativeElement.close();
    if (this.confirmingDelete) Swal.close();
  }
  loadCompanies(): void {
    this.companiesRequest?.unsubscribe();
    this.loadingCompanies = true;
    this.companiesError = '';
    this.companiesRequest = this.organizationService.listarEmpresas().subscribe({
      next: res => {
        this.loadingCompanies = false;
        if (!res.success || !Array.isArray(res.data)) { this.companiesError = 'No se pudo cargar el catálogo de empresas.'; return; }
        this.empresas = res.data;
      },
      error: () => { this.loadingCompanies = false; this.companiesError = 'No se pudo cargar el catálogo de empresas.'; }
    });
  }
  load(): void {
    this.loadRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    // No enviar empresaId: ese endpoint devuelve solo activas si se filtra en el servidor.
    this.loadRequest = this.organizationService.listarAreas().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !Array.isArray(res.data)) { this.failLoad(); return; }
        this.todasLasAreas = res.data;
        this.loaded = true;
        this.applyFilters(false);
      },
      error: () => { this.loading = false; this.failLoad(); }
    });
  }
  private failLoad(): void {
    this.loadError = this.loaded ? 'No se pudo actualizar el directorio. Se conservan los últimos datos cargados.' : 'No se pudo cargar el directorio de áreas.';
  }
  applyFilters(resetPage = true): void {
    if (resetPage) this.pageIndex = 0;
    const search = this.normalize(this.search.trim());
    this.filteredAreas = this.todasLasAreas.filter(area =>
      (!search || this.normalize(area.nombre).includes(search))
      && (!this.company || String(area.empresaId) === this.company)
      && (!this.status || (this.status === 'active' ? area.activo === true : area.activo === false)));
    this.totalElements = this.filteredAreas.length;
    this.totalPages = Math.ceil(this.totalElements / this.pageSize);
    this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.totalPages - 1));
    this.actualizarPagina();
  }
  clearFilters(): void { this.search = ''; this.company = ''; this.status = ''; this.applyFilters(); }
  actualizarPagina(): void {
    this.areas = this.filteredAreas.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
    this.persist();
  }
  irAPagina(page: number): void {
    if (!Number.isInteger(page) || page < 0 || page >= this.totalPages || this.loading) return;
    this.pageIndex = page;
    this.actualizarPagina();
  }
  cambiarTamanoPagina(size: number | string): void {
    const value = Number(size);
    if (!this.pageSizeOptions.includes(value)) return;
    this.pageSize = value;
    this.applyFilters();
  }
  visiblePages(): number[] {
    const start = Math.max(0, Math.min(this.totalPages - 5, this.pageIndex - 2));
    return Array.from({ length: Math.max(0, Math.min(this.totalPages, start + 5) - start) }, (_, index) => start + index);
  }
  private persist(): void { this.filterState.save(this.storageKey, { search: this.search, company: this.company, status: this.status, pageIndex: this.pageIndex, pageSize: this.pageSize }); }

  openModal(): void {
    if (this.busy || this.showModal) return;
    this.editingId = null;
    this.form.reset({ empresaId: null, nombre: '', descripcion: '', activo: true });
    this.openEditor();
  }
  edit(item: Area): void {
    if (this.busy || this.showModal) return;
    this.editingId = item.id;
    this.form.reset({ empresaId: item.empresaId, nombre: item.nombre, descripcion: item.descripcion || '', activo: item.activo });
    this.openEditor();
  }
  private openEditor(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.showModal = true;
    // El diálogo nativo usa la capa superior del navegador: no se recorta con el scroll del layout.
    this.areaEditor?.nativeElement.showModal();
  }
  closeModal(): void {
    if (this.saving) return;
    this.areaEditor?.nativeElement.close();
    this.showModal = false;
    this.editingId = null;
    this.errorMessage = '';
  }
  onCancel(event: Event): void { event.preventDefault(); this.closeModal(); }
  onBackdropClick(event: MouseEvent): void {
    const dialog = this.areaEditor?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeModal();
  }
  fieldError(name: string): string {
    const control = this.form.get(name);
    if (!control || !control.touched || !control.invalid) return '';
    if (control.hasError('required')) return name === 'empresaId' ? 'Selecciona una empresa.' : 'Ingresa el nombre del área.';
    return name === 'nombre' ? 'El nombre no puede superar 100 caracteres.' : 'La descripción no puede superar 255 caracteres.';
  }
  save(): void {
    if (this.saving || !this.showModal) return;
    this.form.get('nombre')?.setValue(String(this.form.get('nombre')?.value || '').trim());
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.loadingCompanies || this.companiesError) { this.errorMessage = 'Espera a que se carguen las empresas o reintenta su carga.'; return; }
    const payload = this.form.getRawValue();
    if (!this.empresas.some(company => company.id === payload.empresaId)) {
      this.errorMessage = 'Selecciona una empresa disponible en el catálogo.'; return;
    }
    this.saving = true;
    this.form.disable({ emitEvent: false });
    this.errorMessage = '';
    const editing = this.editingId !== null;
    const request = editing ? this.organizationService.actualizarArea(this.editingId!, payload) : this.organizationService.crearArea(payload);
    this.mutations.add(request.subscribe({
      next: res => {
        this.saving = false;
        this.form.enable({ emitEvent: false });
        if (!res.success) { this.errorMessage = res.message || 'No se pudo guardar el área.'; return; }
        this.closeModal();
        this.successMessage = editing ? 'Área actualizada correctamente.' : 'Área creada correctamente.';
        this.load();
      },
      error: err => { this.saving = false; this.form.enable({ emitEvent: false }); this.errorMessage = err.error?.message || 'No se pudo guardar el área.'; }
    }));
  }
  async remove(item: Area): Promise<void> {
    if (this.busy || this.showModal || !item.activo) return;
    this.confirmingDelete = true;
    try {
      const confirmation = await Swal.fire({
        icon: 'warning', title: '¿Eliminar área?',
        text: `Se desactivará ${item.nombre}. El registro se conservará como inactivo.`,
        showCancelButton: true, confirmButtonText: 'Sí, desactivar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545', cancelButtonColor: '#6b7280'
      });
      if (!confirmation.isConfirmed || this.destroyed) return;
      this.deletingId = item.id;
      this.successMessage = '';
      this.errorMessage = '';
      this.mutations.add(this.organizationService.eliminarArea(item.id).subscribe({
        next: res => {
          this.deletingId = null;
          if (!res.success) { this.errorMessage = res.message || 'No se pudo desactivar el área.'; return; }
          this.successMessage = 'Área desactivada correctamente.';
          this.load();
        },
        error: err => { this.deletingId = null; this.errorMessage = err.error?.message || 'No se pudo desactivar el área.'; }
      }));
    } finally { this.confirmingDelete = false; }
  }
  trackArea(_index: number, area: Area): number { return area.id; }
  trackCompany(_index: number, company: { id: number }): number { return company.id; }
  private normalize(value: string): string { return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
}
