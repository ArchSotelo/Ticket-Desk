import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { Empresa } from '../core/models/organization.model';
import { OrganizationService } from '../core/services/organization.service';
import { FilterStateService } from '../core/services/filter-state.service';

interface CompanyFilters { search: string; status: string; pageIndex: number; pageSize: number; }

@Component({
  selector: 'app-company-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './company-management.component.html',
  styleUrls: ['./company-management.component.scss']
})
export class CompanyManagementComponent implements OnInit, OnDestroy {
  @ViewChild('companyEditor', { static: true }) companyEditor?: ElementRef<HTMLDialogElement>;
  @ViewChild('companyEditorBody', { static: true }) private companyEditorBody?: ElementRef<HTMLElement>;
  empresas: Empresa[] = [];
  private todasLasEmpresas: Empresa[] = [];
  private filteredEmpresas: Empresa[] = [];
  search = '';
  status = '';
  pageIndex = 0;
  pageSize = 8;
  readonly pageSizeOptions = [5, 8, 12, 20];
  totalElements = 0;
  totalPages = 0;
  loading = false;
  loaded = false;
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
  private readonly mutations = new Subscription();
  private readonly storageKey = 'admin-empresas';

  constructor(private fb: FormBuilder, private organizationService: OrganizationService, private filterState: FilterStateService) {
    this.form = this.fb.group({
      razonSocial: ['', [Validators.required, Validators.maxLength(150)]],
      ruc: ['', [Validators.required, Validators.maxLength(20)]],
      email: ['', [Validators.email, Validators.maxLength(100)]],
      telefono: ['', Validators.maxLength(30)],
      direccion: ['', Validators.maxLength(255)],
      estado: [true]
    });
  }
  get busy(): boolean { return this.saving || this.confirmingDelete || this.deletingId !== null; }
  get hasFilters(): boolean { return !!(this.search.trim() || this.status); }
  get firstItemIndex(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItemIndex(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }

  ngOnInit(): void {
    const saved = this.filterState.load<CompanyFilters>(this.storageKey, { search: '', status: '', pageIndex: 0, pageSize: 8 });
    this.search = typeof saved.search === 'string' ? saved.search : '';
    this.status = ['active', 'inactive'].includes(saved.status) ? saved.status : '';
    this.pageIndex = Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0 ? saved.pageIndex : 0;
    this.pageSize = this.pageSizeOptions.includes(saved.pageSize) ? saved.pageSize : 8;
    this.load();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadRequest?.unsubscribe();
    this.mutations.unsubscribe();
    this.companyEditor?.nativeElement.close();
    if (this.confirmingDelete) Swal.close();
  }
  load(): void {
    this.loadRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.loadRequest = this.organizationService.listarEmpresas().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !Array.isArray(res.data)) { this.failLoad(); return; }
        this.todasLasEmpresas = res.data;
        this.loaded = true;
        this.applyFilters(false);
      },
      error: () => { this.loading = false; this.failLoad(); }
    });
  }
  private failLoad(): void {
    this.loadError = this.loaded ? 'No se pudo actualizar el directorio. Se conservan los últimos datos cargados.' : 'No se pudo cargar el directorio de empresas.';
  }
  applyFilters(resetPage = true): void {
    if (resetPage) this.pageIndex = 0;
    const search = this.normalize(this.search.trim());
    this.filteredEmpresas = this.todasLasEmpresas.filter(company =>
      (!search || (this.normalize(company.razonSocial).includes(search) || this.normalize(company.ruc).includes(search) || this.normalize(company.email || '').includes(search)))
      && (!this.status || (this.status === 'active' ? company.estado === true : company.estado === false)));
    this.totalElements = this.filteredEmpresas.length;
    this.totalPages = Math.ceil(this.totalElements / this.pageSize);
    this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.totalPages - 1));
    this.actualizarPagina();
  }
  clearFilters(): void { this.search = ''; this.status = ''; this.applyFilters(); }
  actualizarPagina(): void {
    this.empresas = this.filteredEmpresas.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
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
  private persist(): void { this.filterState.save(this.storageKey, { search: this.search, status: this.status, pageIndex: this.pageIndex, pageSize: this.pageSize }); }

  openModal(): void {
    if (this.busy || this.showModal) return;
    this.editingId = null;
    this.form.reset({ razonSocial: '', ruc: '', email: '', telefono: '', direccion: '', estado: true });
    this.openEditor();
  }
  edit(item: Empresa): void {
    if (this.busy || this.showModal) return;
    this.editingId = item.id;
    this.form.reset({ razonSocial: item.razonSocial, ruc: item.ruc, email: item.email || '', telefono: item.telefono || '', direccion: item.direccion || '', estado: item.estado });
    this.openEditor();
  }
  private openEditor(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.showModal = true;
    // El diálogo nativo usa la capa superior del navegador: no se recorta con el scroll del layout.
    this.companyEditor?.nativeElement.showModal();
    // El autofocus no debe ocultar la primera etiqueta en pantallas pequeñas.
    const body = this.companyEditorBody?.nativeElement;
    if (body) body.scrollTop = 0;
  }
  closeModal(): void {
    if (this.saving) return;
    this.companyEditor?.nativeElement.close();
    this.showModal = false;
    this.editingId = null;
    this.errorMessage = '';
  }
  onCancel(event: Event): void { event.preventDefault(); this.closeModal(); }
  onBackdropClick(event: MouseEvent): void {
    const dialog = this.companyEditor?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeModal();
  }
  fieldError(name: string): string {
    const control = this.form.get(name);
    if (!control || !control.touched || !control.invalid) return '';
    if (control.hasError('required')) return name === 'razonSocial' ? 'Ingresa la razón social.' : 'Ingresa el RUC.';
    if (control.hasError('email')) return 'Ingresa un correo electrónico válido.';
    const lengths: Record<string, string> = {
      razonSocial: 'La razón social no puede superar 150 caracteres.',
      ruc: 'El RUC no puede superar 20 caracteres.',
      email: 'El correo no puede superar 100 caracteres.',
      telefono: 'El teléfono no puede superar 30 caracteres.',
      direccion: 'La dirección no puede superar 255 caracteres.'
    };
    return control.hasError('maxlength') ? lengths[name] || '' : '';
  }
  save(): void {
    if (this.saving || !this.showModal) return;
    for (const name of ['razonSocial', 'ruc', 'email', 'telefono', 'direccion']) {
      this.form.get(name)?.setValue(String(this.form.get(name)?.value || '').trim());
    }
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const payload = this.form.getRawValue();
    this.saving = true;
    this.form.disable({ emitEvent: false });
    this.errorMessage = '';
    const editing = this.editingId !== null;
    const request = editing ? this.organizationService.actualizarEmpresa(this.editingId!, payload) : this.organizationService.crearEmpresa(payload);
    this.mutations.add(request.subscribe({
      next: res => {
        this.saving = false;
        this.form.enable({ emitEvent: false });
        if (!res.success) { this.errorMessage = res.message || 'No se pudo guardar la empresa.'; return; }
        this.closeModal();
        this.successMessage = editing ? 'Empresa actualizada correctamente.' : 'Empresa creada correctamente.';
        this.load();
      },
      error: err => { this.saving = false; this.form.enable({ emitEvent: false }); this.errorMessage = err.error?.message || 'No se pudo guardar la empresa.'; }
    }));
  }
  async remove(item: Empresa): Promise<void> {
    if (this.busy || this.showModal || this.loading || this.loadError || !item.estado) return;
    this.confirmingDelete = true;
    try {
      const confirmation = await Swal.fire({
        icon: 'warning', title: '¿Eliminar empresa?',
        text: `Se desactivará ${item.razonSocial}. El registro se conservará como inactivo.`,
        showCancelButton: true, confirmButtonText: 'Sí, desactivar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545', cancelButtonColor: '#6b7280'
      });
      if (!confirmation.isConfirmed || this.destroyed) return;
      this.deletingId = item.id;
      this.successMessage = '';
      this.errorMessage = '';
      this.mutations.add(this.organizationService.eliminarEmpresa(item.id).subscribe({
        next: res => {
          this.deletingId = null;
          if (!res.success) { this.errorMessage = res.message || 'No se pudo desactivar la empresa.'; return; }
          this.successMessage = 'Empresa desactivada correctamente.';
          this.load();
        },
        error: err => { this.deletingId = null; this.errorMessage = err.error?.message || 'No se pudo desactivar la empresa.'; }
      }));
    } finally { this.confirmingDelete = false; }
  }
  trackCompany(_index: number, company: Empresa): number { return company.id; }
  private normalize(value: string): string { return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
}
