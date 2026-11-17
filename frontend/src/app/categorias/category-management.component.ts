import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { Categoria } from '../core/models/organization.model';
import { OrganizationService } from '../core/services/organization.service';
import { FilterStateService } from '../core/services/filter-state.service';

interface CategoryFilters { search: string; status: string; pageIndex: number; pageSize: number; }

@Component({
  selector: 'app-category-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './category-management.component.html',
  styleUrls: ['./category-management.component.scss']
})
export class CategoryManagementComponent implements OnInit, OnDestroy {
  @ViewChild('categoryEditor', { static: true }) categoryEditor?: ElementRef<HTMLDialogElement>;
  categorias: Categoria[] = [];
  private todasLasCategorias: Categoria[] = [];
  private filteredCategorias: Categoria[] = [];
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
  private readonly storageKey = 'admin-categorias';

  constructor(private fb: FormBuilder, private organizationService: OrganizationService, private filterState: FilterStateService) {
    this.form = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      descripcion: ['', Validators.maxLength(255)],
      activa: [true]
    });
  }
  get busy(): boolean { return this.saving || this.confirmingDelete || this.deletingId !== null; }
  get hasFilters(): boolean { return !!(this.search.trim() || this.status); }
  get firstItemIndex(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItemIndex(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }

  ngOnInit(): void {
    const saved = this.filterState.load<CategoryFilters>(this.storageKey, { search: '', status: '', pageIndex: 0, pageSize: 8 });
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
    this.categoryEditor?.nativeElement.close();
    if (this.confirmingDelete) Swal.close();
  }
  load(): void {
    this.loadRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.loadRequest = this.organizationService.listarCategorias().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !Array.isArray(res.data)) { this.failLoad(); return; }
        this.todasLasCategorias = res.data;
        this.loaded = true;
        this.applyFilters(false);
      },
      error: () => { this.loading = false; this.failLoad(); }
    });
  }
  private failLoad(): void {
    this.loadError = this.loaded ? 'No se pudo actualizar el directorio. Se conservan los últimos datos cargados.' : 'No se pudo cargar el directorio de categorías.';
  }
  applyFilters(resetPage = true): void {
    if (resetPage) this.pageIndex = 0;
    const search = this.normalize(this.search.trim());
    this.filteredCategorias = this.todasLasCategorias.filter(category =>
      (!search || (this.normalize(category.nombre).includes(search) || this.normalize(category.descripcion || '').includes(search)))
      && (!this.status || (this.status === 'active' ? category.activa === true : category.activa === false)));
    this.totalElements = this.filteredCategorias.length;
    this.totalPages = Math.ceil(this.totalElements / this.pageSize);
    this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.totalPages - 1));
    this.actualizarPagina();
  }
  clearFilters(): void { this.search = ''; this.status = ''; this.applyFilters(); }
  actualizarPagina(): void {
    this.categorias = this.filteredCategorias.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
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
    this.form.reset({ nombre: '', descripcion: '', activa: true });
    this.openEditor();
  }
  edit(item: Categoria): void {
    if (this.busy || this.showModal) return;
    this.editingId = item.id;
    this.form.reset({ nombre: item.nombre, descripcion: item.descripcion || '', activa: item.activa });
    this.openEditor();
  }
  private openEditor(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.showModal = true;
    // El diálogo nativo usa la capa superior del navegador: no se recorta con el scroll del layout.
    this.categoryEditor?.nativeElement.showModal();
  }
  closeModal(): void {
    if (this.saving) return;
    this.categoryEditor?.nativeElement.close();
    this.showModal = false;
    this.editingId = null;
    this.errorMessage = '';
  }
  onCancel(event: Event): void { event.preventDefault(); this.closeModal(); }
  onBackdropClick(event: MouseEvent): void {
    const dialog = this.categoryEditor?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeModal();
  }
  fieldError(name: string): string {
    const control = this.form.get(name);
    if (!control || !control.touched || !control.invalid) return '';
    if (control.hasError('required')) return 'Ingresa el nombre de la categoría.';
    return name === 'nombre' ? 'El nombre no puede superar 100 caracteres.' : 'La descripción no puede superar 255 caracteres.';
  }
  save(): void {
    if (this.saving || !this.showModal) return;
    this.form.get('nombre')?.setValue(String(this.form.get('nombre')?.value || '').trim());
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const payload = this.form.getRawValue();
    this.saving = true;
    this.form.disable({ emitEvent: false });
    this.errorMessage = '';
    const editing = this.editingId !== null;
    const request = editing ? this.organizationService.actualizarCategoria(this.editingId!, payload) : this.organizationService.crearCategoria(payload);
    this.mutations.add(request.subscribe({
      next: res => {
        this.saving = false;
        this.form.enable({ emitEvent: false });
        if (!res.success) { this.errorMessage = res.message || 'No se pudo guardar la categoría.'; return; }
        this.closeModal();
        this.successMessage = editing ? 'Categoría actualizada correctamente.' : 'Categoría creada correctamente.';
        this.load();
      },
      error: err => { this.saving = false; this.form.enable({ emitEvent: false }); this.errorMessage = err.error?.message || 'No se pudo guardar la categoría.'; }
    }));
  }
  async remove(item: Categoria): Promise<void> {
    if (this.busy || this.showModal || this.loading || this.loadError || !item.activa) return;
    this.confirmingDelete = true;
    try {
      const confirmation = await Swal.fire({
        icon: 'warning', title: '¿Eliminar categoría?',
        text: `Se desactivará ${item.nombre}. El registro se conservará como inactivo.`,
        showCancelButton: true, confirmButtonText: 'Sí, desactivar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545', cancelButtonColor: '#6b7280'
      });
      if (!confirmation.isConfirmed || this.destroyed) return;
      this.deletingId = item.id;
      this.successMessage = '';
      this.errorMessage = '';
      this.mutations.add(this.organizationService.eliminarCategoria(item.id).subscribe({
        next: res => {
          this.deletingId = null;
          if (!res.success) { this.errorMessage = res.message || 'No se pudo desactivar la categoría.'; return; }
          this.successMessage = 'Categoría desactivada correctamente.';
          this.load();
        },
        error: err => { this.deletingId = null; this.errorMessage = err.error?.message || 'No se pudo desactivar la categoría.'; }
      }));
    } finally { this.confirmingDelete = false; }
  }
  trackCategory(_index: number, category: Categoria): number { return category.id; }
  private normalize(value: string): string { return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
}
