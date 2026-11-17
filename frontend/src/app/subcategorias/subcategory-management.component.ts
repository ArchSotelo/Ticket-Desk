import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { Categoria, Subcategoria } from '../core/models/organization.model';
import { OrganizationService } from '../core/services/organization.service';
import { FilterStateService } from '../core/services/filter-state.service';

interface SubcategoryFilters { search: string; categoryFilter: string; status: string; pageIndex: number; pageSize: number; }

@Component({
  selector: 'app-subcategory-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './subcategory-management.component.html',
  styleUrls: ['./subcategory-management.component.scss']
})
export class SubcategoryManagementComponent implements OnInit, OnDestroy {
  @ViewChild('subcategoryEditor', { static: true }) subcategoryEditor?: ElementRef<HTMLDialogElement>;
  subcategorias: Subcategoria[] = [];
  private todasLasSubcategorias: Subcategoria[] = [];
  private filteredSubcategorias: Subcategoria[] = [];
  categorias: Categoria[] = [];
  search = '';
  categoryFilter = '';
  status = '';
  pageIndex = 0;
  pageSize = 8;
  readonly pageSizeOptions = [5, 8, 12, 20];
  totalElements = 0;
  totalPages = 0;
  loading = false;
  loaded = false;
  loadingCategories = false;
  categoriesError = '';
  loadError = '';
  saving = false;
  deletingId: number | null = null;
  confirmingDelete = false;
  form: FormGroup;
  showModal = false;
  editingId: number | null = null;
  private originalCategoryId: number | null = null;
  successMessage = '';
  errorMessage = '';
  private destroyed = false;
  private loadRequest?: Subscription;
  private categoriesRequest?: Subscription;
  private readonly mutations = new Subscription();
  private readonly storageKey = 'admin-subcategorias';

  constructor(private fb: FormBuilder, private organizationService: OrganizationService, private filterState: FilterStateService) {
    this.form = this.fb.group({
      categoriaId: [null, Validators.required],
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      descripcion: ['', Validators.maxLength(255)],
      activa: [true]
    });
  }
  get busy(): boolean { return this.saving || this.confirmingDelete || this.deletingId !== null; }
  get hasFilters(): boolean { return !!(this.search.trim() || this.categoryFilter || this.status); }
  get selectedCategoryExists(): boolean { return this.filterCategories.some(category => String(category.id) === this.categoryFilter); }
  get firstItemIndex(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItemIndex(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }
  get filterCategories(): { id: number; name: string }[] {
    const names = new Map<number, string>(this.categorias.map(category => [category.id, category.nombre]));
    this.todasLasSubcategorias.forEach(item => { if (!names.has(item.categoriaId)) names.set(item.categoriaId, item.categoriaNombre || 'Categoría #' + item.categoriaId); });
    return Array.from(names, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  get editorCategories(): Categoria[] {
    return this.categorias.filter(category => category.activa || (this.editingId !== null && category.id === this.originalCategoryId));
  }

  ngOnInit(): void {
    const saved = this.filterState.load<SubcategoryFilters>(this.storageKey, { search: '', categoryFilter: '', status: '', pageIndex: 0, pageSize: 8 });
    this.search = typeof saved.search === 'string' ? saved.search : '';
    this.categoryFilter = typeof saved.categoryFilter === 'string' && /^\d+$/.test(saved.categoryFilter) ? saved.categoryFilter : '';
    this.status = ['active', 'inactive'].includes(saved.status) ? saved.status : '';
    this.pageIndex = Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0 ? saved.pageIndex : 0;
    this.pageSize = this.pageSizeOptions.includes(saved.pageSize) ? saved.pageSize : 8;
    this.loadCategories();
    this.load();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadRequest?.unsubscribe();
    this.categoriesRequest?.unsubscribe();
    this.mutations.unsubscribe();
    this.subcategoryEditor?.nativeElement.close();
    if (this.confirmingDelete) Swal.close();
  }
  loadCategories(): void {
    this.categoriesRequest?.unsubscribe();
    this.loadingCategories = true;
    this.categoriesError = '';
    this.categoriesRequest = this.organizationService.listarCategorias().subscribe({
      next: res => {
        this.loadingCategories = false;
        if (!res.success || !Array.isArray(res.data)) { this.categoriesError = 'No se pudo cargar el catálogo de categorías.'; return; }
        this.categorias = res.data;
      },
      error: () => { this.loadingCategories = false; this.categoriesError = 'No se pudo cargar el catálogo de categorías.'; }
    });
  }
  load(): void {
    this.loadRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    // No enviar categoriaId: ese endpoint devuelve solo activas si se filtra en el servidor.
    this.loadRequest = this.organizationService.listarSubcategorias().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !Array.isArray(res.data)) { this.failLoad(); return; }
        this.todasLasSubcategorias = res.data;
        this.loaded = true;
        this.applyFilters(false);
      },
      error: () => { this.loading = false; this.failLoad(); }
    });
  }
  private failLoad(): void {
    this.loadError = this.loaded ? 'No se pudo actualizar el directorio. Se conservan los últimos datos cargados.' : 'No se pudo cargar el directorio de subcategorías.';
  }
  applyFilters(resetPage = true): void {
    if (resetPage) this.pageIndex = 0;
    const search = this.normalize(this.search.trim());
    this.filteredSubcategorias = this.todasLasSubcategorias.filter(item =>
      (!search || (this.normalize(item.nombre).includes(search) || this.normalize(item.descripcion || '').includes(search)))
      && (!this.categoryFilter || String(item.categoriaId) === this.categoryFilter)
      && (!this.status || (this.status === 'active' ? item.activa === true : item.activa === false)));
    this.totalElements = this.filteredSubcategorias.length;
    this.totalPages = Math.ceil(this.totalElements / this.pageSize);
    this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.totalPages - 1));
    this.actualizarPagina();
  }
  clearFilters(): void { this.search = ''; this.categoryFilter = ''; this.status = ''; this.applyFilters(); }
  actualizarPagina(): void {
    this.subcategorias = this.filteredSubcategorias.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
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
  private persist(): void { this.filterState.save(this.storageKey, { search: this.search, categoryFilter: this.categoryFilter, status: this.status, pageIndex: this.pageIndex, pageSize: this.pageSize }); }

  openModal(): void {
    if (this.busy || this.showModal) return;
    this.editingId = null;
    this.originalCategoryId = null;
    this.form.reset({ categoriaId: null, nombre: '', descripcion: '', activa: true });
    this.openEditor();
  }
  edit(item: Subcategoria): void {
    if (this.busy || this.showModal) return;
    this.editingId = item.id;
    this.originalCategoryId = item.categoriaId;
    this.form.reset({ categoriaId: item.categoriaId, nombre: item.nombre, descripcion: item.descripcion || '', activa: item.activa });
    this.openEditor();
  }
  private openEditor(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.showModal = true;
    // El diálogo nativo usa la capa superior del navegador: no se recorta con el scroll del layout.
    this.subcategoryEditor?.nativeElement.showModal();
  }
  closeModal(): void {
    if (this.saving) return;
    this.subcategoryEditor?.nativeElement.close();
    this.showModal = false;
    this.editingId = null;
    this.errorMessage = '';
  }
  onCancel(event: Event): void { event.preventDefault(); this.closeModal(); }
  onBackdropClick(event: MouseEvent): void {
    const dialog = this.subcategoryEditor?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeModal();
  }
  fieldError(name: string): string {
    const control = this.form.get(name);
    if (!control || !control.touched || !control.invalid) return '';
    if (control.hasError('required')) return name === 'categoriaId' ? 'Selecciona una categoría.' : 'Ingresa el nombre de la subcategoría.';
    return name === 'nombre' ? 'El nombre no puede superar 100 caracteres.' : 'La descripción no puede superar 255 caracteres.';
  }
  save(): void {
    if (this.saving || !this.showModal) return;
    this.form.get('nombre')?.setValue(String(this.form.get('nombre')?.value || '').trim());
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.loadingCategories || this.categoriesError) { this.errorMessage = 'Espera a que se carguen las categorías o reintenta su carga.'; return; }
    const payload = this.form.getRawValue();
    if (!this.editorCategories.some(category => category.id === payload.categoriaId)) {
      this.errorMessage = 'Selecciona una categoría disponible en el catálogo.'; return;
    }
    this.saving = true;
    this.form.disable({ emitEvent: false });
    this.errorMessage = '';
    const editing = this.editingId !== null;
    const request = editing ? this.organizationService.actualizarSubcategoria(this.editingId!, payload) : this.organizationService.crearSubcategoria(payload);
    this.mutations.add(request.subscribe({
      next: res => {
        this.saving = false;
        this.form.enable({ emitEvent: false });
        if (!res.success) { this.errorMessage = res.message || 'No se pudo guardar la subcategoría.'; return; }
        this.closeModal();
        this.successMessage = editing ? 'Subcategoría actualizada correctamente.' : 'Subcategoría creada correctamente.';
        this.load();
      },
      error: err => { this.saving = false; this.form.enable({ emitEvent: false }); this.errorMessage = err.error?.message || 'No se pudo guardar la subcategoría.'; }
    }));
  }
  async remove(item: Subcategoria): Promise<void> {
    if (this.busy || this.showModal || this.loading || this.loadError || !item.activa) return;
    this.confirmingDelete = true;
    try {
      const confirmation = await Swal.fire({
        icon: 'warning', title: '¿Eliminar subcategoría?',
        text: `Se desactivará ${item.nombre}. El registro se conservará como inactivo.`,
        showCancelButton: true, confirmButtonText: 'Sí, desactivar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545', cancelButtonColor: '#6b7280'
      });
      if (!confirmation.isConfirmed || this.destroyed) return;
      this.deletingId = item.id;
      this.successMessage = '';
      this.errorMessage = '';
      this.mutations.add(this.organizationService.eliminarSubcategoria(item.id).subscribe({
        next: res => {
          this.deletingId = null;
          if (!res.success) { this.errorMessage = res.message || 'No se pudo desactivar la subcategoría.'; return; }
          this.successMessage = 'Subcategoría desactivada correctamente.';
          this.load();
        },
        error: err => { this.deletingId = null; this.errorMessage = err.error?.message || 'No se pudo desactivar la subcategoría.'; }
      }));
    } finally { this.confirmingDelete = false; }
  }
  trackSubcategory(_index: number, item: Subcategoria): number { return item.id; }
  trackCategory(_index: number, category: { id: number }): number { return category.id; }
  private normalize(value: string): string { return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
}
