import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { TicketService } from '../../core/services/ticket.service';
import { KanbanTicket } from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { FilterStateService } from '../../core/services/filter-state.service';
import { Subscription, Subject, debounceTime, takeUntil } from 'rxjs';

interface BoardFilters { search: string; priority: string; technician: string; }
interface ColumnState { total: number; page: number; hasMore: boolean; loadingMore: boolean; error: string; }

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DragDropModule, MatIconModule],
  templateUrl: './kanban.component.html',
  styleUrls: ['./kanban.component.scss']
})
export class KanbanComponent implements OnInit, OnDestroy {
  colNuevo: KanbanTicket[] = [];
  colProceso: KanbanTicket[] = [];
  colResuelto: KanbanTicket[] = [];
  colCerrado: KanbanTicket[] = [];
  filters: BoardFilters = { search: '', priority: '', technician: '' };
  priorities: string[] = [];
  technicians: { key: string; name: string }[] = [];
  loading = false;
  loaded = false;
  loadError = '';
  moveError = '';
  moveMessage = '';
  savingTicketId?: number;
  private tickets: KanbanTicket[] = [];
  private columnStates = new Map<string, ColumnState>();
  private dragging = false;
  private deferredReload = false;
  private currentUserId?: number;
  private loadSubscription?: Subscription;
  private readonly reloadBoard$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private ticketService: TicketService,
    private authService: AuthService,
    private router: Router,
    private realtimeService: RealtimeService,
    private route: ActivatedRoute,
    private filterState: FilterStateService
  ) {}

  get isAdminPortal(): boolean { return this.route.snapshot.data['role'] === 'admin'; }
  get puedeReabrirCerrados(): boolean { return this.authService.hasRole('ROLE_ADMIN'); }
  get boardRoute(): string { return this.isAdminPortal ? '/tickets/kanban' : '/tecnico/kanban'; }
  get listRoute(): string { return this.isAdminPortal ? '/tickets/list' : '/tecnico'; }
  get newTicketRoute(): string { return this.isAdminPortal ? '/tickets/new' : '/tecnico/nuevo-ticket'; }
  private get filterKey(): string { return this.isAdminPortal ? 'admin-kanban' : 'technician-kanban'; }
  get totalVisible(): number { return this.columns.reduce((sum, column) => sum + column.total, 0); }
  get hasFilters(): boolean { return !!(this.filters.search.trim() || this.filters.priority || this.filters.technician); }
  get interactionDisabled(): boolean { return this.loading || !!this.loadError || this.savingTicketId !== undefined; }
  get columns() {
    return [
      { code: 'NUEVO', name: 'Nuevos', tone: 'new', icon: 'inbox', empty: 'Sin tickets nuevos', tickets: this.colNuevo, connections: ['EN_PROCESO', 'RESUELTO', 'CERRADO'] },
      { code: 'EN_PROCESO', name: 'En proceso', tone: 'progress', icon: 'engineering', empty: 'Sin tickets en proceso', tickets: this.colProceso, connections: ['NUEVO', 'RESUELTO', 'CERRADO'] },
      { code: 'RESUELTO', name: 'Resueltos', tone: 'resolved', icon: 'task_alt', empty: 'Sin tickets resueltos', tickets: this.colResuelto, connections: ['EN_PROCESO', 'CERRADO'] },
      { code: 'CERRADO', name: 'Cerrados', tone: 'closed', icon: 'inventory_2', empty: 'Sin tickets cerrados', tickets: this.colCerrado, connections: this.puedeReabrirCerrados ? ['NUEVO', 'EN_PROCESO', 'RESUELTO'] : [] }
    ].map(column => ({
      ...column,
      total: this.columnStates.get(column.code)?.total ?? column.tickets.length,
      hasMore: this.columnStates.get(column.code)?.hasMore ?? false,
      loadingMore: this.columnStates.get(column.code)?.loadingMore ?? false,
      error: this.columnStates.get(column.code)?.error ?? ''
    }));
  }

  ngOnInit(): void {
    const saved = this.filterState.load(this.filterKey, this.filters);
    this.filters = {
      search: typeof saved.search === 'string' ? saved.search : '',
      priority: typeof saved.priority === 'string' ? saved.priority : '',
      technician: typeof saved.technician === 'string' ? saved.technician : ''
    };
    this.reloadBoard$.pipe(debounceTime(250), takeUntil(this.destroy$)).subscribe(() => this.cargarTickets());
    this.cargarTickets();
    const userId = this.authService.currentUserSignal()?.userId;
    if (userId) {
      this.currentUserId = userId;
      this.realtimeService.events$.pipe(takeUntil(this.destroy$)).subscribe(event => {
        if (event.scope === 'KANBAN' || event.type.startsWith('kanban-')) this.reloadBoard$.next();
      });
      this.realtimeService.connect(userId, undefined, 'KANBAN');
    }
  }

  ngOnDestroy(): void {
    this.loadSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.reloadBoard$.complete();
    if (this.currentUserId) this.realtimeService.connect(this.currentUserId);
  }

  cargarTickets(): void {
    if (this.dragging || this.savingTicketId !== undefined) { this.deferredReload = true; return; }
    this.loadSubscription?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.loadSubscription = this.ticketService.obtenerKanban(this.apiFilters()).pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        if (!response.success || !response.data || !Array.isArray(response.data.columnas)) {
          this.loading = false;
          this.loadError = 'No se pudo cargar el tablero. Intenta de nuevo.';
          return;
        }
        const board = response.data;
        this.columnStates.clear();
        for (const column of board.columnas) {
          this.columnStates.set(column.codigo, { total: column.total, page: column.pagina, hasMore: column.hayMas, loadingMore: false, error: '' });
        }
        this.tickets = board.columnas.flatMap(column => column.tickets);
        this.priorities = board.prioridades || [];
        this.technicians = (board.tecnicos || []).map(technician => ({ key: String(technician.id), name: technician.nombre }))
          .sort((a, b) => a.name.localeCompare(b.name));
        this.loaded = true;
        this.loading = false;
        this.applyFilters(false);
      },
      error: () => {
        this.loading = false;
        this.loadError = this.loaded ? 'No se pudo actualizar el tablero. Se mantienen los últimos datos cargados.' : 'No se pudieron cargar los tickets. Intenta de nuevo.';
      }
    });
  }

  loadMore(columnCode: string): void {
    const state = this.columnStates.get(columnCode);
    if (!state || state.loadingMore || !state.hasMore) return;
    state.loadingMore = true;
    state.error = '';
    this.ticketService.cargarColumnaKanban(columnCode, state.page + 1, 50, this.apiFilters())
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: response => {
          if (!response.success || !response.data) {
            state.loadingMore = false;
            state.error = 'No se pudo cargar más. Intenta de nuevo.';
            return;
          }
          const page = response.data;
          state.page = page.pagina;
          state.total = page.total;
          state.hasMore = page.hayMas;
          state.loadingMore = false;
          const existingIds = new Set(this.tickets.map(ticket => ticket.id));
          this.tickets = [...this.tickets, ...page.tickets.filter(ticket => !existingIds.has(ticket.id))];
          this.applyFilters(false);
        },
        error: () => { state.loadingMore = false; state.error = 'No se pudo cargar más. Intenta de nuevo.'; }
      });
  }

  applyFilters(persist = true): void {
    if (persist) {
      this.filterState.save(this.filterKey, this.filters);
      this.reloadBoard$.next();
      return;
    }
    this.colNuevo = this.tickets.filter(ticket => ['NUEVO', 'ASIGNADO'].includes(ticket.estadoCodigo));
    this.colProceso = this.tickets.filter(ticket => ['EN_PROCESO', 'PENDIENTE_CLIENTE'].includes(ticket.estadoCodigo));
    this.colResuelto = this.tickets.filter(ticket => ticket.estadoCodigo === 'RESUELTO');
    this.colCerrado = this.tickets.filter(ticket => ticket.estadoCodigo === 'CERRADO');
  }

  clearFilters(): void {
    this.filters = { search: '', priority: '', technician: '' };
    this.applyFilters();
  }

  dragStarted(): void { this.dragging = true; }
  dragEnded(): void { this.dragging = false; this.flushReload(); }
  private flushReload(): void {
    if (!this.dragging && this.savingTicketId === undefined && this.deferredReload) {
      this.deferredReload = false;
      this.reloadBoard$.next();
    }
  }

  drop(event: CdkDragDrop<KanbanTicket[]>): void {
    if (this.interactionDisabled) return;
    const ticket = event.previousContainer.data[event.previousIndex];
    if (!ticket || (ticket.estadoCodigo === 'CERRADO' && !this.puedeReabrirCerrados)) return;
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }
    const column = this.columns.find(item => item.tickets === event.previousContainer.data);
    const newState = event.container.id;
    if (!column?.connections.includes(newState)) return;
    const previousState = ticket.estadoCodigo;
    this.moveError = '';
    this.moveMessage = '';
    this.savingTicketId = ticket.id;
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    this.ticketService.cambiarEstado(ticket.id, newState).pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        if (!response.success) { this.rollbackMove(); return; }
        this.tickets = this.tickets.map(item => item.id === ticket.id ? { ...item, estadoCodigo: newState } : item);
        this.savingTicketId = undefined;
        this.updateLocalCounts(previousState, newState);
        this.applyFilters(false);
        this.moveMessage = `${ticket.codigo}: estado actualizado.`;
        this.deferredReload = true;
        this.flushReload();
      },
      error: () => this.rollbackMove()
    });
  }

  private updateLocalCounts(previousState: string, newState: string): void {
    const previousColumn = this.columnCode(previousState);
    const nextColumn = this.columnCode(newState);
    if (previousColumn === nextColumn) return;
    const previous = this.columnStates.get(previousColumn);
    const next = this.columnStates.get(nextColumn);
    if (previous) previous.total = Math.max(0, previous.total - 1);
    if (next) next.total += 1;
  }

  private columnCode(state: string): string {
    if (['NUEVO', 'ASIGNADO'].includes(state)) return 'NUEVO';
    if (['EN_PROCESO', 'PENDIENTE_CLIENTE'].includes(state)) return 'EN_PROCESO';
    return state;
  }

  private rollbackMove(): void {
    this.savingTicketId = undefined;
    this.applyFilters(false);
    this.moveError = 'No se pudo cambiar el estado. El ticket volvió a su columna anterior.';
    this.flushReload();
  }

  private apiFilters(): { busqueda?: string; prioridad?: string; tecnico?: string } {
    return { busqueda: this.filters.search.trim() || undefined, prioridad: this.filters.priority || undefined, tecnico: this.filters.technician || undefined };
  }

  detailRoute(ticket: KanbanTicket): (string | number)[] { return [this.isAdminPortal ? '/tickets/detail' : '/tecnico/tickets', ticket.id]; }
  abrirDetalle(ticket: KanbanTicket): void { this.router.navigate(this.detailRoute(ticket), { queryParams: { returnTo: this.boardRoute } }); }
  trackColumn(_index: number, column: { code: string }): string { return column.code; }
  trackTicket(_index: number, ticket: KanbanTicket): number { return ticket.id; }
  initials(name: string): string { return (name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
  priorityTone(name: string): string {
    const value = this.normalize(name || '');
    return value.includes('critic') || value.includes('urgent') ? 'critical' : value.includes('alta') ? 'high' : value.includes('media') ? 'medium' : value.includes('baja') ? 'low' : 'neutral';
  }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  technicianAvailable(key: string): boolean { return this.technicians.some(item => item.key === key); }
}
