import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { TicketService } from '../../core/services/ticket.service';
import { Ticket } from '../../core/models/ticket.model';
import { FilterStateService } from '../../core/services/filter-state.service';

@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink],
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.scss']
})
export class TicketListComponent implements OnInit, OnDestroy {
  mode: 'admin' | 'technician' = 'admin';
  exporting = false;
  private readonly destroy$ = new Subject<void>();
  private readonly listCancel$ = new Subject<void>();
  private readonly countsCancel$ = new Subject<void>();
  private countsSignature = '';
  tickets: Ticket[] = [];
  busqueda = '';
  estadoSeleccionado = '';
  prioridadSeleccionada = '';
  categoriaSeleccionada: number | '' = '';
  fechaDesde = '';
  fechaHasta = '';
  pageIndex = 0;
  pageSize = 8;
  pageSizeOptions = [5, 8, 12, 20];
  totalElements = 0;
  totalPages = 0;
  loadingTickets = false;
  loadingCounts = false;
  errorMessage = '';
  listError = '';
  countsError = '';
  filterError = '';
  categorias: { id: number; nombre: string }[] = [];
  prioridades: { id: number; nombre: string }[] = [];
  filtersOpen = false;
  readonly statusTabs = [
    { code: '', label: 'Todos' }, { code: 'NUEVO', label: 'Nuevos' },
    { code: 'EN_PROCESO', label: 'En proceso' }, { code: 'RESUELTO', label: 'Resueltos' },
    { code: 'CERRADO', label: 'Cerrados' }
  ];
  counts: Record<string, number | null> = { '': null, NUEVO: null, EN_PROCESO: null, RESUELTO: null, CERRADO: null };

  constructor(
    private ticketService: TicketService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private filterState: FilterStateService
  ) {}

  ngOnInit(): void {
    this.mode = this.route.snapshot.data['role'] === 'technician' ? 'technician' : 'admin';
    Object.assign(this, this.filterState.load(this.filterStorageKey, {
      busqueda: '', estadoSeleccionado: '', prioridadSeleccionada: '', categoriaSeleccionada: '' as number | '',
      fechaDesde: '', fechaHasta: '', pageIndex: 0, pageSize: 8, filtersOpen: false
    }));
    this.cargarCatalogos();
    this.cargarTickets();
    const ticketIdParam = this.route.snapshot.queryParamMap.get('ticketId');
    if (ticketIdParam) {
      const ticketId = Number(ticketIdParam);
      if (Number.isInteger(ticketId) && ticketId > 0) {
        this.router.navigate(this.detailRoute(ticketId), {
          replaceUrl: true, queryParams: { returnTo: this.listRoute }
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.listCancel$.complete();
    this.countsCancel$.complete();
  }

  get listRoute(): string { return this.mode === 'technician' ? '/tecnico' : '/tickets/list'; }
  get newTicketRoute(): string { return this.mode === 'technician' ? '/tecnico/nuevo-ticket' : '/tickets/new'; }
  private get filterStorageKey(): string { return this.mode === 'technician' ? 'technician-tickets' : 'admin-tickets'; }

  detailRoute(ticketId: number): [string, number] {
    return [this.mode === 'technician' ? '/tecnico/tickets' : '/tickets/detail', ticketId];
  }

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
    this.persistirFiltros();
  }

  cargarCatalogos(): void {
    this.http.get<any>('/api/v1/catalogs/categories').pipe(takeUntil(this.destroy$)).subscribe({
      next: res => { if (res.success && Array.isArray(res.data)) this.categorias = res.data; },
      error: () => this.errorMessage = 'No se pudieron cargar las categorías.'
    });
    this.http.get<any>('/api/v1/catalogs/priorities').pipe(takeUntil(this.destroy$)).subscribe({
      next: res => { if (res.success && Array.isArray(res.data)) this.prioridades = res.data; },
      error: () => this.errorMessage = 'No se pudieron cargar las prioridades.'
    });
  }

  private validarFechas(): boolean {
    if (this.fechaDesde && this.fechaHasta && this.fechaDesde > this.fechaHasta) {
      this.filterError = 'La fecha desde no puede ser posterior a la fecha hasta.';
      this.filtersOpen = true;
      return false;
    }
    this.filterError = '';
    return true;
  }

  private filtrosBase() {
    return {
      prioridad: this.prioridadSeleccionada || undefined,
      categoriaId: this.categoriaSeleccionada === '' ? undefined : Number(this.categoriaSeleccionada),
      fechaDesde: this.fechaDesde || undefined,
      fechaHasta: this.fechaHasta || undefined,
      sortBy: 'fechaCreacion',
      sortDir: 'DESC' as const
    };
  }

  cargarTickets(page = this.pageIndex, refreshCounts = false): void {
    if (!this.validarFechas()) return;
    this.persistirFiltros(page);
    this.listCancel$.next();
    this.loadingTickets = true;
    this.listError = '';
    this.ticketService.listarTickets(page, this.pageSize, this.busqueda.trim(), {
      ...this.filtrosBase(), estado: this.estadoSeleccionado || undefined
    }).pipe(takeUntil(this.listCancel$), takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.loadingTickets = false;
        if (!res.success || !res.data || !Array.isArray(res.data.content) ||
            !Number.isFinite(res.data.totalElements) || res.data.totalElements < 0) {
          this.listError = res.message || 'No se pudieron cargar los tickets.';
          this.tickets = []; this.totalElements = 0; this.totalPages = 0;
          return;
        }
        this.tickets = res.data.content;
        this.pageIndex = res.data.number ?? page;
        this.pageSize = res.data.size ?? this.pageSize;
        this.totalElements = res.data.totalElements;
        this.totalPages = res.data.totalPages ?? Math.ceil(this.totalElements / this.pageSize);
        this.persistirFiltros();
      },
      error: () => {
        this.loadingTickets = false;
        this.tickets = []; this.totalElements = 0; this.totalPages = 0;
        this.listError = 'No se pudieron cargar los tickets. Intenta nuevamente.';
      }
    });
    this.cargarContadores(refreshCounts);
  }

  cargarContadores(force = false): void {
    if (!this.validarFechas()) return;
    const filters = this.filtrosBase();
    const search = this.busqueda.trim();
    const signature = JSON.stringify({ search, ...filters });
    if (!force && this.countsSignature === signature) return;
    this.countsSignature = signature;
    this.countsCancel$.next();
    this.loadingCounts = true;
    this.countsError = '';
    this.statusTabs.forEach(tab => this.counts[tab.code] = null);
    forkJoin(this.statusTabs.map(tab => this.ticketService.listarTickets(0, 1, search, {
      ...filters, estado: tab.code || undefined
    }))).pipe(takeUntil(this.countsCancel$), takeUntil(this.destroy$)).subscribe({
      next: responses => {
        this.loadingCounts = false;
        responses.forEach((res, index) => {
          const total = res.data?.totalElements;
          this.counts[this.statusTabs[index].code] = res.success && typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null;
        });
        if (responses.some(res => !res.success || !Number.isFinite(res.data?.totalElements) || res.data.totalElements < 0)) {
          this.countsError = 'No se pudo cargar el resumen por estado.';
          this.countsSignature = '';
        }
      },
      error: () => {
        this.loadingCounts = false;
        this.countsError = 'No se pudo cargar el resumen por estado.';
        this.countsSignature = '';
      }
    });
  }

  seleccionarEstado(code: string): void {
    this.estadoSeleccionado = code;
    this.pageIndex = 0;
    this.cargarTickets(0);
  }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    this.cargarTickets(0, true);
  }

  exportarExcel(): void {
    if (this.exporting || !this.validarFechas()) return;
    this.exporting = true;
    this.errorMessage = '';
    let params = new HttpParams();
    const filtros: Record<string, string | number | undefined> = {
      estado: this.estadoSeleccionado || undefined,
      prioridad: this.prioridadSeleccionada || undefined,
      categoriaId: this.categoriaSeleccionada === '' ? undefined : Number(this.categoriaSeleccionada),
      busqueda: this.busqueda.trim() || undefined,
      fechaDesde: this.fechaDesde || undefined,
      fechaHasta: this.fechaHasta || undefined
    };
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    });
    this.http.get('/api/v1/reports/tickets/excel', { params, responseType: 'blob' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: blob => {
        this.exporting = false;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `tickets_filtrados_${new Date().toISOString().slice(0, 10)}.xlsx`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting = false;
        this.errorMessage = 'No se pudo exportar el Excel.';
      }
    });
  }

  limpiarFiltros(): void {
    this.busqueda = ''; this.estadoSeleccionado = ''; this.prioridadSeleccionada = '';
    this.categoriaSeleccionada = ''; this.fechaDesde = ''; this.fechaHasta = '';
    this.pageIndex = 0;
    this.filterState.clear(this.filterStorageKey);
    this.cargarTickets(0, true);
  }

  private persistirFiltros(page = this.pageIndex): void {
    this.filterState.save(this.filterStorageKey, {
      busqueda: this.busqueda, estadoSeleccionado: this.estadoSeleccionado,
      prioridadSeleccionada: this.prioridadSeleccionada, categoriaSeleccionada: this.categoriaSeleccionada,
      fechaDesde: this.fechaDesde, fechaHasta: this.fechaHasta, pageIndex: page, pageSize: this.pageSize, filtersOpen: this.filtersOpen
    });
  }

  irAPagina(page: number): void {
    if (page < 0 || page >= this.totalPages || this.loadingTickets) return;
    this.cargarTickets(page);
  }

  visiblePages(): number[] {
    if (!this.totalPages) return [];
    const start = Math.max(0, Math.min(this.totalPages - 5, this.pageIndex - 2));
    return Array.from({ length: Math.min(this.totalPages, start + 5) - start }, (_, index) => start + index);
  }

  get firstItemIndex(): number { return this.totalElements ? (this.pageIndex * this.pageSize) + 1 : 0; }
  get lastItemIndex(): number { return this.totalElements ? Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements) : 0; }

  cambiarTamanoPagina(tamano: number): void {
    const size = Number(tamano);
    if (!this.pageSizeOptions.includes(size) || size === this.pageSize) return;
    this.pageSize = size;
    this.pageIndex = 0;
    this.cargarTickets(0);
  }

  get hasFilters(): boolean {
    return !!(this.busqueda.trim() || this.estadoSeleccionado || this.prioridadSeleccionada ||
      this.categoriaSeleccionada !== '' || this.fechaDesde || this.fechaHasta);
  }

  trackTicket(_index: number, ticket: Ticket): number { return ticket.id; }

  initials(name?: string): string {
    const words = name?.trim().split(/\s+/).filter(Boolean) || [];
    return words.length ? (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() : '?';
  }

  avatarTone(name?: string): number {
    return [...(name || '')].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4;
  }

  statusTone(code?: string): string {
    return ({ NUEVO: 'cyan', ASIGNADO: 'violet', EN_PROCESO: 'blue', PENDIENTE_CLIENTE: 'amber',
      RESUELTO: 'green', CERRADO: 'neutral', CANCELADO: 'red' } as Record<string, string>)[code || ''] || 'neutral';
  }

  priorityTone(name?: string): string {
    const normalized = name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return ({ baja: 'green', media: 'amber', alta: 'orange', critica: 'red' } as Record<string, string>)[normalized || ''] || 'neutral';
  }

  formatDate(value?: string): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
