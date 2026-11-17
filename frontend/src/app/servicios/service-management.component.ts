import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiResponse } from '../core/models/auth.model';
import { CategoriaServicio, Servicio, ServicioPage } from '../core/models/service.model';
import { AuthService } from '../core/services/auth.service';
import { FilterStateService } from '../core/services/filter-state.service';

interface ServiceFilters { busqueda: string; estadoFiltro: string; pageIndex: number; pageSize: number; }

@Component({
  selector: 'app-service-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './service-management.component.html',
  // El resto de pantallas mantiene sus estilos compartidos sin cambios.
  styleUrls: ['./service-list.component.scss']
})
export class ServiceManagementComponent implements OnInit, OnDestroy {
  servicios: Servicio[] = [];
  categorias: CategoriaServicio[] = [];
  busqueda = '';
  estadoFiltro = '';
  pageIndex = 0;
  pageSize = 8;
  readonly pageSizeOptions = [5, 8, 12, 20];
  totalElements = 0;
  totalPages = 0;
  totalesPorDivisa: Record<string, number> = {};
  loading = false;
  loaded = false;
  loadError = '';
  iconsError = '';
  loadingIcons = false;
  exporting = false;
  exportError = '';
  private appliedBusqueda = '';
  private appliedEstado = '';
  private listRequest?: Subscription;
  private iconsRequest?: Subscription;
  private exportRequest?: Subscription;

  constructor(private http: HttpClient, private router: Router, private authService: AuthService, private filterState: FilterStateService) {}
  get filterKey(): string { return this.authService.isTechnicianUser() ? 'technician-services' : 'admin-services'; }
  get basePath(): string { return this.authService.isTechnicianUser() ? '/tecnico/servicios' : '/servicios'; }
  get canManage(): boolean { return !this.authService.isTechnicianUser(); }
  get hasFilters(): boolean { return !!(this.busqueda.trim() || this.estadoFiltro || this.appliedBusqueda || this.appliedEstado); }
  get firstItem(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItem(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }

  ngOnInit(): void {
    const saved = this.filterState.load<ServiceFilters>(this.filterKey, { busqueda: '', estadoFiltro: '', pageIndex: 0, pageSize: 8 });
    this.busqueda = typeof saved.busqueda === 'string' ? saved.busqueda : '';
    this.estadoFiltro = ['', 'ACTIVO', 'POR_VENCER', 'VENCIDO'].includes(saved.estadoFiltro) ? saved.estadoFiltro : '';
    this.pageIndex = Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0 ? saved.pageIndex : 0;
    this.pageSize = this.pageSizeOptions.includes(saved.pageSize) ? saved.pageSize : 8;
    this.appliedBusqueda = this.busqueda.trim();
    this.appliedEstado = this.estadoFiltro;
    this.load();
    this.loadCategorias();
  }
  ngOnDestroy(): void {
    this.listRequest?.unsubscribe();
    this.iconsRequest?.unsubscribe();
    this.exportRequest?.unsubscribe();
  }
  loadCategorias(): void {
    this.iconsRequest?.unsubscribe();
    this.loadingIcons = true;
    this.iconsError = '';
    this.iconsRequest = this.http.get<ApiResponse<CategoriaServicio[]>>('/api/v1/service-categories').subscribe({
      next: res => {
        this.loadingIcons = false;
        if (!res.success || !Array.isArray(res.data)) { this.iconsError = 'No se pudieron cargar los iconos de los tipos de servicio.'; return; }
        // Los servicios existentes conservan su icono aunque el tipo se desactive.
        this.categorias = res.data;
      },
      error: () => { this.loadingIcons = false; this.iconsError = 'No se pudieron cargar los iconos de los tipos de servicio.'; }
    });
  }
  iconoServicio(item: Servicio): string {
    const category = this.categorias.find(entry => entry.id === item.categoriaServicioId)
      || this.categorias.find(entry => entry.nombre === item.tipo);
    return category?.icono?.trim() || 'category';
  }
  divisasConTotal(): string[] { return Object.keys(this.totalesPorDivisa).sort(); }
  load(page = this.pageIndex): void {
    this.listRequest?.unsubscribe();
    this.pageIndex = page;
    this.loading = true;
    this.loaded = false;
    this.loadError = '';
    this.servicios = [];
    this.totalesPorDivisa = {};
    this.totalElements = this.totalPages = 0;
    this.persist();
    const params = new HttpParams().set('busqueda', this.appliedBusqueda).set('estado', this.appliedEstado).set('page', page).set('size', this.pageSize);
    this.listRequest = this.http.get<ApiResponse<ServicioPage>>('/api/v1/services', { params }).subscribe({
      next: res => {
        const data = res.data;
        if (!res.success || !data || !Array.isArray(data.content)
          || !Number.isInteger(data.totalElements) || data.totalElements < 0
          || !Number.isInteger(data.totalPages) || data.totalPages < 0
          || !Number.isInteger(data.number) || data.number < 0
          || !this.pageSizeOptions.includes(data.size)
          || data.totalPages !== Math.ceil(data.totalElements / data.size)
          || !data.totalesPorDivisa || typeof data.totalesPorDivisa !== 'object' || Array.isArray(data.totalesPorDivisa)) {
          this.failLoad(); return;
        }
        if (data.totalPages > 0 && data.number >= data.totalPages) { this.load(data.totalPages - 1); return; }
        this.loading = false;
        this.loaded = true;
        // El servidor calcula el estado con la configuración de vencimientos vigente.
        this.servicios = data.content;
        this.totalElements = data.totalElements;
        this.totalPages = data.totalPages;
        this.pageIndex = data.totalPages ? data.number : 0;
        this.pageSize = data.size;
        this.totalesPorDivisa = Object.fromEntries(Object.entries(data.totalesPorDivisa).filter(([, total]) => Number.isFinite(Number(total))).map(([currency, total]) => [currency, Number(total)]));
        this.persist();
      },
      error: () => this.failLoad()
    });
  }
  private failLoad(): void { this.loading = false; this.loadError = 'No se pudo cargar el directorio de servicios. Intenta nuevamente.'; }
  buscar(): void {
    this.busqueda = this.busqueda.trim();
    this.appliedBusqueda = this.busqueda;
    this.appliedEstado = this.estadoFiltro;
    this.load(0);
  }
  clearFilters(): void { this.busqueda = ''; this.estadoFiltro = ''; this.buscar(); }
  goTo(page: number): void { if (Number.isInteger(page) && page >= 0 && page < this.totalPages && !this.loading) this.load(page); }
  visiblePages(): number[] {
    const start = Math.max(0, Math.min(this.totalPages - 5, this.pageIndex - 2));
    return Array.from({ length: Math.max(0, Math.min(this.totalPages, start + 5) - start) }, (_, index) => start + index);
  }
  changeSize(size: number | string): void {
    const value = Number(size);
    if (!this.pageSizeOptions.includes(value) || this.loading) return;
    this.pageSize = value;
    this.load(0);
  }
  private persist(): void { this.filterState.save(this.filterKey, { busqueda: this.appliedBusqueda, estadoFiltro: this.appliedEstado, pageIndex: this.pageIndex, pageSize: this.pageSize }); }
  openCreate(): void { this.router.navigate([this.basePath, 'nuevo']); }
  edit(item: Servicio): void { this.router.navigate([this.basePath, item.id]); }
  exportar(): void {
    if (this.exporting) return;
    this.exporting = true;
    this.exportError = '';
    // Se conserva la exportación general existente; no depende de los filtros ni de la página.
    this.exportRequest = this.http.get('/api/v1/services/export/excel', { responseType: 'blob' }).subscribe({
      next: blob => {
        let url = '';
        try {
          url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'servicios_' + new Date().toISOString().slice(0, 10) + '.xlsx';
          anchor.click();
        } finally { if (url) URL.revokeObjectURL(url); this.exporting = false; }
      },
      error: () => { this.exporting = false; this.exportError = 'No se pudo exportar el archivo Excel. Intenta nuevamente.'; }
    });
  }
  statusLabel(estado: string): string { return ({ ACTIVO: 'Activo', POR_VENCER: 'Por vencer', VENCIDO: 'Vencido', INACTIVO: 'Inactivo', CANCELADO: 'Cancelado', FINALIZADO: 'Finalizado' } as Record<string, string>)[estado] || estado; }
  statusClass(estado: string): string { return ['ACTIVO', 'POR_VENCER', 'VENCIDO', 'INACTIVO', 'CANCELADO', 'FINALIZADO'].includes(estado) ? estado.toLowerCase() : ''; }
  formatCost(amount: number, divisa: string): string { return (divisa || 'PEN') + ' ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0)); }
  formatDate(value: string): string { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ''); return match ? match[3] + '/' + match[2] + '/' + match[1] : 'Sin fecha'; }
  trackService(_index: number, item: Servicio): number { return item.id; }
  trackCurrency(_index: number, currency: string): string { return currency; }
}
