import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiResponse } from '../core/models/auth.model';
import { CategoriaServicio, Servicio } from '../core/models/service.model';
import { AuthService } from '../core/services/auth.service';
import { FilterStateService } from '../core/services/filter-state.service';

interface HistoryFilters { busqueda: string; estado: string; desde: string; hasta: string; pageIndex: number; pageSize: number; }

@Component({
  selector: 'app-service-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './service-history.component.html',
  styleUrls: ['./service-history.component.scss']
})
export class ServiceHistoryComponent implements OnInit, OnDestroy {
  historial: Servicio[] = [];
  categorias: CategoriaServicio[] = [];
  filtered: Servicio[] = [];
  busqueda = '';
  estado = '';
  desde = '';
  hasta = '';
  pageIndex = 0;
  pageSize = 8;
  readonly pageSizeOptions = [5, 8, 12, 20];
  loading = false;
  loaded = false;
  loadError = '';
  filterError = '';
  iconsError = '';
  loadingIcons = false;
  historyId: string | null = null;
  private applied = { busqueda: '', estado: '', desde: '', hasta: '' };
  private listRequest?: Subscription;
  private iconsRequest?: Subscription;

  constructor(private route: ActivatedRoute, private http: HttpClient, private authService: AuthService, private filterState: FilterStateService) {}
  get basePath(): string { return this.authService.isTechnicianUser() ? '/tecnico/servicios' : '/servicios'; }
  get filterKey(): string { return (this.authService.isTechnicianUser() ? 'technician' : 'admin') + '-services-history' + (this.historyId ? '-' + this.historyId : ''); }
  get detailQuery(): { from: string; historyId?: string } { return this.historyId ? { from: 'history', historyId: this.historyId } : { from: 'history' }; }
  get totalElements(): number { return this.filtered.length; }
  get totalPages(): number { return Math.ceil(this.totalElements / this.pageSize); }
  get firstItem(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItem(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }
  get pageItems(): Servicio[] { return this.filtered.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize); }
  get hasFilters(): boolean { return !!(this.busqueda.trim() || this.estado || this.desde || this.hasta || Object.values(this.applied).some(Boolean)); }

  ngOnInit(): void {
    this.historyId = this.route.snapshot.paramMap.get('id');
    const saved = this.filterState.load<HistoryFilters>(this.filterKey, { busqueda: '', estado: '', desde: '', hasta: '', pageIndex: 0, pageSize: 8 });
    this.busqueda = typeof saved.busqueda === 'string' ? saved.busqueda : '';
    this.estado = ['', 'FINALIZADO', 'CANCELADO'].includes(saved.estado) ? saved.estado : '';
    this.desde = this.validDate(saved.desde) ? saved.desde : '';
    this.hasta = this.validDate(saved.hasta) ? saved.hasta : '';
    if (this.desde && this.hasta && this.desde > this.hasta) this.desde = this.hasta = '';
    this.pageIndex = Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0 ? saved.pageIndex : 0;
    this.pageSize = this.pageSizeOptions.includes(saved.pageSize) ? saved.pageSize : 8;
    this.applied = { busqueda: this.busqueda.trim(), estado: this.estado, desde: this.desde, hasta: this.hasta };
    this.load();
    this.loadCategorias();
  }
  ngOnDestroy(): void { this.listRequest?.unsubscribe(); this.iconsRequest?.unsubscribe(); }
  load(): void {
    this.listRequest?.unsubscribe();
    this.loading = true;
    this.loaded = false;
    this.loadError = '';
    this.historial = this.filtered = [];
    const url = this.historyId ? `/api/v1/services/${this.historyId}/history` : '/api/v1/services/history';
    this.listRequest = this.http.get<ApiResponse<Servicio[]>>(url).subscribe({
      next: res => {
        if (!res.success || !Array.isArray(res.data)) { this.failLoad(); return; }
        this.historial = res.data;
        this.loading = false;
        this.loaded = true;
        this.applyFilters();
      },
      error: () => this.failLoad()
    });
  }
  private failLoad(): void { this.loading = false; this.loadError = 'No se pudo cargar el historial de servicios. Intenta nuevamente.'; }
  loadCategorias(): void {
    this.iconsRequest?.unsubscribe();
    this.loadingIcons = true;
    this.iconsError = '';
    this.iconsRequest = this.http.get<ApiResponse<CategoriaServicio[]>>('/api/v1/service-categories').subscribe({
      next: res => {
        this.loadingIcons = false;
        if (!res.success || !Array.isArray(res.data)) { this.iconsError = 'No se pudieron cargar los iconos de los tipos de servicio.'; return; }
        // También se conservan los iconos de tipos que ahora están inactivos.
        this.categorias = res.data;
      },
      error: () => { this.loadingIcons = false; this.iconsError = 'No se pudieron cargar los iconos de los tipos de servicio.'; }
    });
  }
  buscar(): void {
    this.filterError = '';
    if ((this.desde && !this.validDate(this.desde)) || (this.hasta && !this.validDate(this.hasta))) { this.filterError = 'Introduce fechas válidas para filtrar por el inicio del servicio.'; return; }
    if (this.desde && this.hasta && this.desde > this.hasta) { this.filterError = 'La fecha de inicio desde no puede ser posterior a inicio hasta.'; return; }
    this.busqueda = this.busqueda.trim();
    this.applied = { busqueda: this.busqueda, estado: this.estado, desde: this.desde, hasta: this.hasta };
    this.pageIndex = 0;
    this.applyFilters();
  }
  clearFilters(): void { this.busqueda = this.estado = this.desde = this.hasta = ''; this.buscar(); }
  private normalize(value: string): string { return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  private applyFilters(): void {
    const filters = this.applied, search = this.normalize(filters.busqueda);
    // Se filtra todo el historial recibido, no solamente las filas de la página visible.
    this.filtered = this.historial.filter(item =>
      (!search || [item.nombre, item.proveedor, item.tipo].some(value => this.normalize(value).includes(search)))
      && (!filters.estado || item.estado === filters.estado)
      && ((!filters.desde && !filters.hasta) || (this.validDate(item.fechaInicio)
        && (!filters.desde || item.fechaInicio >= filters.desde) && (!filters.hasta || item.fechaInicio <= filters.hasta))));
    this.pageIndex = Math.min(this.pageIndex, Math.max(0, this.totalPages - 1));
    this.persist();
  }
  goTo(page: number): void { if (!this.loading && Number.isInteger(page) && page >= 0 && page < this.totalPages) { this.pageIndex = page; this.persist(); } }
  changeSize(size: number | string): void {
    const value = Number(size);
    if (this.loading || !this.pageSizeOptions.includes(value)) return;
    this.pageSize = value; this.pageIndex = 0; this.persist();
  }
  visiblePages(): number[] {
    const start = Math.max(0, Math.min(this.totalPages - 5, this.pageIndex - 2));
    return Array.from({ length: Math.min(5, this.totalPages) }, (_, index) => start + index);
  }
  private persist(): void { this.filterState.save(this.filterKey, { ...this.applied, pageIndex: this.pageIndex, pageSize: this.pageSize }); }
  private validDate(value: string): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  iconoServicio(item: Servicio): string {
    const category = this.categorias.find(entry => entry.id === item.categoriaServicioId) || this.categorias.find(entry => entry.nombre === item.tipo);
    return category?.icono?.trim() || 'category';
  }
  label(status: string): string { return ({ FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' } as Record<string, string>)[status] || status; }
  formatCost(amount: number, divisa: string): string { return (divisa || 'PEN') + ' ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0)); }
  formatDate(value: string): string { return this.validDate(value) ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : 'Sin fecha'; }
  trackService(_index: number, item: Servicio): number { return item.id; }
}
