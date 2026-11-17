import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { DashboardService } from '../core/services/dashboard.service';
import { DashboardStats, Ticket } from '../core/models/ticket.model';
import { TicketService } from '../core/services/ticket.service';
import { FilterStateService } from '../core/services/filter-state.service';

interface ChartEntry { name: string; value: number; color: string; }
interface TrendPoint { x: number; y: number; value: number; date: string; }
type DashboardPeriod = 'all' | 'today' | 'last7' | 'last30' | 'month' | 'custom';
interface PeriodState { preset: DashboardPeriod; from: string; to: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, DragDropModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly periods: { value: DashboardPeriod; label: string }[] = [
    { value: 'all', label: 'Todo el historial' }, { value: 'today', label: 'Hoy' },
    { value: 'last7', label: 'Últimos 7 días' }, { value: 'last30', label: 'Últimos 30 días' },
    { value: 'month', label: 'Este mes' }, { value: 'custom', label: 'Rango personalizado' }
  ];
  selectedPeriod: DashboardPeriod = 'all';
  dateFrom = '';
  dateTo = '';
  periodError = '';
  appliedPeriod: PeriodState = { preset: 'all', from: '', to: '' };
  readonly chartIds = ['tendencia', 'estado', 'categoria', 'prioridad', 'sla', 'tecnico'];
  chartOrder = [...this.chartIds];
  readonly chartTitles: Record<string, string> = {
    tendencia: 'Tickets creados vs. resueltos', estado: 'Tickets por estado', categoria: 'Tickets por categoría',
    prioridad: 'Tickets por prioridad', sla: 'Cumplimiento de SLA', tecnico: 'Tickets por técnico'
  };
  readonly chartDescriptions: Record<string, string> = {
    tendencia: 'Últimos 7 días · independiente del historial general.', estado: 'Distribución de todos los tickets registrados.',
    categoria: 'Categorías con mayor volumen de incidencias.', prioridad: 'Distribución por nivel de urgencia.',
    sla: 'Resultados de SLA reportados por el sistema.', tecnico: 'Asignaciones del historial, incluidos tickets cerrados.'
  };
  stats: DashboardStats | null = null;
  latestTickets: Ticket[] = [];
  loadingMetrics = false;
  loadingLatest = false;
  metricsError = '';
  latestError = '';
  updatedAt?: Date;
  stateEntries: ChartEntry[] = [];
  priorityEntries: ChartEntry[] = [];
  categoryEntries: ChartEntry[] = [];
  technicianEntries: ChartEntry[] = [];
  slaEntries: ChartEntry[] = [];
  trendCreated: TrendPoint[] = [];
  trendResolved: TrendPoint[] = [];
  trendDates: string[] = [];
  trendTicks: { value: number; y: number }[] = [];
  private metricsRequest?: Subscription;
  private latestRequest?: Subscription;

  constructor(private dashboardService: DashboardService, private ticketService: TicketService, private route: ActivatedRoute, private filterState: FilterStateService) {}

  get isTechnician(): boolean { return this.route.snapshot.data['role'] === 'technician'; }
  get dashboardRoute(): string { return this.isTechnician ? '/tecnico/dashboard' : '/dashboard'; }
  get listRoute(): string { return this.isTechnician ? '/tecnico' : '/tickets/list'; }
  get refreshing(): boolean { return this.loadingMetrics || this.loadingLatest; }
  private get filterKey(): string { return this.isTechnician ? 'technician-dashboard-period' : 'admin-dashboard-period'; }
  get periodParams(): { fechaDesde?: string; fechaHasta?: string } {
    return this.appliedPeriod.preset === 'all' ? {} : { fechaDesde: this.appliedPeriod.from, fechaHasta: this.appliedPeriod.to };
  }
  get appliedPeriodLabel(): string {
    const label = this.periods.find(period => period.value === this.appliedPeriod.preset)?.label || '';
    const display = (date: string) => date.split('-').reverse().join('/');
    return this.appliedPeriod.preset === 'all' ? label : label + ': ' + display(this.appliedPeriod.from) + ' – ' + display(this.appliedPeriod.to);
  }
  chartDescription(id: string): string {
    if (id === 'tendencia') return this.stats?.descripcionTendencia || (this.appliedPeriod.preset === 'all' ? this.chartDescriptions[id] : 'Datos de los tickets creados en el periodo seleccionado.');
    if (id === 'estado' && this.appliedPeriod.preset !== 'all') return 'Distribución de los tickets creados en el periodo.';
    if (id === 'tecnico' && this.appliedPeriod.preset !== 'all') return 'Asignaciones de tickets creados en el periodo, incluidos los cerrados.';
    return this.chartDescriptions[id];
  }
  get stateTotal(): number { return this.sum(this.stateEntries); }
  get slaTotal(): number { return this.sum(this.slaEntries); }
  get technicianTotal(): number { return this.sum(this.technicianEntries); }
  get slaPercent(): number | undefined { return this.slaTotal ? this.slaEntries[0].value * 100 / this.slaTotal : undefined; }
  get categoryMax(): number { return Math.max(1, ...this.categoryEntries.map(entry => entry.value)); }
  get priorityMax(): number { return Math.max(1, ...this.priorityEntries.map(entry => entry.value)); }
  get stateBackground(): string { return this.donutBackground(this.stateEntries); }
  get slaBackground(): string { return this.donutBackground(this.slaEntries); }
  get trendAvailable(): boolean { return this.trendDates.length > 0; }
  get metrics() {
    return [
      { label: 'Total tickets', value: this.formatCount(this.stats?.totalTickets), icon: 'confirmation_number', tone: 'blue' },
      { label: 'Abiertos', value: this.formatCount(this.stats?.ticketsAbiertos), icon: 'inbox', tone: 'cyan' },
      { label: 'En proceso', value: this.formatCount(this.stats?.ticketsEnProceso), icon: 'pending_actions', tone: 'amber' },
      { label: 'Resueltos', value: this.formatCount(this.stats?.ticketsResueltos), icon: 'task_alt', tone: 'green' },
      { label: 'Incumplidos SLA', value: this.formatCount(this.stats?.ticketsSlaIncumplidos), icon: 'alarm_off', tone: 'red' },
      { label: 'Cumplimiento SLA', value: this.formatPercent(this.stats?.porcentajeCumplimientoSla), icon: 'monitoring', tone: 'purple' }
    ];
  }

  ngOnInit(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard-chart-order') || 'null');
      if (Array.isArray(saved) && saved.length === this.chartIds.length && new Set(saved).size === this.chartIds.length && saved.every(id => this.chartIds.includes(id))) this.chartOrder = saved;
    } catch { /* Mantener el orden inicial si el almacenamiento no está disponible. */ }
    const saved = this.filterState.load<PeriodState>(this.filterKey, { preset: 'all', from: '', to: '' });
    if (this.periods.some(period => period.value === saved.preset)) {
      if (saved.preset !== 'custom') this.appliedPeriod = this.presetRange(saved.preset);
      else if (this.validDate(saved.from) && this.validDate(saved.to) && saved.from <= saved.to) this.appliedPeriod = saved;
    }
    this.selectedPeriod = this.appliedPeriod.preset;
    this.dateFrom = this.appliedPeriod.from;
    this.dateTo = this.appliedPeriod.to;
    this.refresh();
  }
  ngOnDestroy(): void { this.metricsRequest?.unsubscribe(); this.latestRequest?.unsubscribe(); }
  refresh(): void {
    if (this.appliedPeriod.preset !== 'all' && this.appliedPeriod.preset !== 'custom') {
      const current = this.presetRange(this.appliedPeriod.preset);
      if (current.from !== this.appliedPeriod.from || current.to !== this.appliedPeriod.to) { this.commitPeriod(current); return; }
    }
    this.reloadMetrics();
    this.reloadLatest();
  }

  selectPeriod(value: string): void {
    if (!this.periods.some(period => period.value === value)) return;
    this.selectedPeriod = value as DashboardPeriod;
    this.periodError = '';
    if (value === 'custom') {
      const today = this.todayIso();
      if (!this.dateFrom) this.dateFrom = this.appliedPeriod.from || today.slice(0, 7) + '-01';
      if (!this.dateTo) this.dateTo = this.appliedPeriod.to || today;
      return;
    }
    this.commitPeriod(this.presetRange(value as DashboardPeriod));
  }
  applyCustomPeriod(): void {
    this.periodError = !this.validDate(this.dateFrom) || !this.validDate(this.dateTo)
      ? 'Selecciona fechas válidas de inicio y fin.'
      : this.dateFrom > this.dateTo ? 'La fecha desde no puede ser posterior a la fecha hasta.' : '';
    if (this.periodError) return;
    this.commitPeriod({ preset: 'custom', from: this.dateFrom, to: this.dateTo });
  }
  private commitPeriod(period: PeriodState): void {
    this.metricsRequest?.unsubscribe();
    this.latestRequest?.unsubscribe();
    this.appliedPeriod = period;
    this.selectedPeriod = period.preset;
    this.dateFrom = period.from;
    this.dateTo = period.to;
    this.filterState.save(this.filterKey, period);
    // No presentar datos del periodo anterior bajo la nueva selección.
    this.stats = null;
    this.latestTickets = [];
    this.updatedAt = undefined;
    this.refresh();
  }
  private presetRange(preset: DashboardPeriod): PeriodState {
    if (preset === 'all') return { preset, from: '', to: '' };
    const to = this.todayIso();
    let from = to;
    if (preset === 'month') from = to.slice(0, 7) + '-01';
    else if (preset === 'last7' || preset === 'last30') {
      const date = new Date(to + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() - (preset === 'last7' ? 6 : 29));
      from = date.toISOString().slice(0, 10);
    }
    return { preset, from, to };
  }
  private todayIso(): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = (name: string) => parts.find(part => part.type === name)!.value;
    return value('year') + '-' + value('month') + '-' + value('day');
  }
  private validDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || value > '9999-12-31') return false;
    const date = new Date(value + 'T12:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  reloadMetrics(): void {
    this.metricsRequest?.unsubscribe();
    this.loadingMetrics = true;
    this.metricsError = '';
    const params = this.periodParams;
    this.metricsRequest = this.dashboardService.obtenerMetricas(params).subscribe({
      next: res => {
        this.loadingMetrics = false;
        if (!res.success || !res.data || !this.validCount(res.data.totalTickets)) { this.failMetrics(); return; }
        if (params.fechaDesde && (res.data.fechaDesde !== params.fechaDesde || res.data.fechaHasta !== params.fechaHasta)) {
          this.metricsError = 'El backend no confirmó el periodo solicitado. Actualiza el backend y vuelve a intentar.';
          return;
        }
        this.stats = res.data;
        this.prepareCharts();
        this.updatedAt = new Date();
      },
      error: () => { this.loadingMetrics = false; this.failMetrics(); }
    });
  }
  private failMetrics(): void {
    this.metricsError = this.stats ? 'No se pudieron actualizar las métricas. Se conservan los últimos datos cargados.' : 'No se pudieron cargar las métricas del dashboard.';
  }
  reloadLatest(): void {
    this.latestRequest?.unsubscribe();
    this.loadingLatest = true;
    this.latestError = '';
    this.latestRequest = this.ticketService.listarTickets(0, 5, '', { sortBy: 'fechaCreacion', sortDir: 'DESC', ...this.periodParams }).subscribe({
      next: res => {
        this.loadingLatest = false;
        if (!res.success || !Array.isArray(res.data?.content)) { this.failLatest(); return; }
        this.latestTickets = res.data.content;
      },
      error: () => { this.loadingLatest = false; this.failLatest(); }
    });
  }
  private failLatest(): void {
    this.latestError = this.latestTickets.length ? 'No se pudieron actualizar los tickets recientes. Se conservan los últimos datos cargados.' : 'No se pudieron cargar los tickets recientes.';
  }

  private prepareCharts(): void {
    const stats = this.stats!;
    this.stateEntries = this.entries(stats.ticketsPorEstado, name => this.stateColor(name));
    if (stats.ticketsPorEstado && typeof stats.ticketsPorEstado === 'object' && (this.stateEntries.length || stats.totalTickets === 0)) {
      ['Nuevo', 'En proceso', 'Resuelto', 'Cerrado'].forEach(name => {
        if (!this.stateEntries.some(entry => this.normalize(entry.name) === this.normalize(name))) this.stateEntries.push({ name, value: 0, color: this.stateColor(name) });
      });
      this.stateEntries.sort((a, b) => b.value - a.value);
    }
    this.priorityEntries = this.entries(stats.ticketsPorPrioridad, name => this.priorityColor(name));
    const order = ['baja', 'media', 'alta', 'critica'];
    this.priorityEntries.sort((a, b) => {
      const rank = (name: string) => { const index = order.indexOf(this.normalize(name)); return index < 0 ? order.length : index; };
      return rank(a.name) - rank(b.name);
    });
    this.categoryEntries = this.entries(stats.ticketsPorCategoria, () => 'var(--db-blue)');
    this.technicianEntries = this.entries(stats.ticketsPorTecnico, () => 'var(--db-purple)');
    this.slaEntries = [stats.ticketsSlaCumplidos, stats.ticketsSlaIncumplidos, stats.ticketsSlaPendientes].every(value => this.validCount(value))
      ? [
          { name: 'Cumplidos', value: stats.ticketsSlaCumplidos, color: 'var(--db-green)' },
          { name: 'Incumplidos', value: stats.ticketsSlaIncumplidos, color: 'var(--db-red)' },
          { name: 'Pendientes', value: stats.ticketsSlaPendientes, color: 'var(--db-slate)' }
        ] : [];
    this.prepareTrend(stats);
  }
  private prepareTrend(stats: DashboardStats): void {
    const dates = stats.fechasTendencia;
    const created = stats.ticketsCreadosPorFecha;
    const resolved = stats.ticketsResueltosPorFecha;
    this.trendDates = [];
    this.trendCreated = [];
    this.trendResolved = [];
    this.trendTicks = [];
    if (!Array.isArray(dates) || !dates.length || !dates.every(date => typeof date === 'string')
      || !Array.isArray(created) || !Array.isArray(resolved) || created.length !== dates.length || resolved.length !== dates.length
      || !created.every(value => this.validCount(value)) || !resolved.every(value => this.validCount(value))) return;
    this.trendDates = dates;
    const step = Math.max(1, Math.ceil(Math.max(...created, ...resolved) / 4));
    const maximum = step * 4;
    this.trendTicks = [4, 3, 2, 1, 0].map(tick => ({ value: tick * step, y: 15 + (4 - tick) * 42.5 }));
    const points = (values: number[]): TrendPoint[] => values.map((value, index) => ({
      x: values.length === 1 ? 350 : 20 + index * 660 / (values.length - 1),
      y: 185 - value / maximum * 170, value, date: dates[index]
    }));
    this.trendCreated = points(created);
    this.trendResolved = points(resolved);
  }

  linePoints(points: TrendPoint[]): string { return points.map(point => point.x + ',' + point.y).join(' '); }
  trendTotal(points: TrendPoint[]): number { return points.reduce((total, point) => total + point.value, 0); }
  barWidth(value: number, maximum: number): number { return maximum > 0 ? Math.min(100, value / maximum * 100) : 0; }
  private sum(entries: ChartEntry[]): number { return entries.reduce((total, entry) => total + entry.value, 0); }
  private validCount(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
  private entries(values: Record<string, number> | undefined, color: (name: string) => string): ChartEntry[] {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return [];
    return Object.entries(values).filter(([, value]) => this.validCount(value)).map(([name, value]) => ({ name, value, color: color(name) })).sort((a, b) => b.value - a.value);
  }
  private donutBackground(entries: ChartEntry[]): string {
    const total = this.sum(entries);
    if (!total) return 'var(--db-track)';
    let offset = 0;
    return 'conic-gradient(' + entries.filter(entry => entry.value > 0).map(entry => {
      const start = offset;
      offset += entry.value * 100 / total;
      return entry.color + ' ' + start + '% ' + offset + '%';
    }).join(', ') + ')';
  }
  private normalize(value: string): string { return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').trim().toLowerCase(); }
  private stateColor(name: string): string {
    const state = this.normalize(name);
    if (state.includes('cerrad')) return 'var(--db-slate)';
    if (state.includes('resuelt')) return 'var(--db-green)';
    if (state.includes('cancel') || state.includes('anulad')) return 'var(--db-red)';
    if (state.includes('proceso')) return 'var(--db-blue)';
    if (state.includes('pendiente')) return 'var(--db-amber)';
    return 'var(--db-cyan)';
  }
  priorityTone(name: string): string {
    const value = this.normalize(name);
    return value.includes('critic') || value.includes('urgent') ? 'red' : value.includes('alta') ? 'orange' : value.includes('media') ? 'amber' : value.includes('baja') ? 'green' : 'slate';
  }
  private priorityColor(name: string): string { return 'var(--db-' + this.priorityTone(name) + ')'; }
  stateTone(name: string): string {
    const state = this.normalize(name);
    return state.includes('cerrad') ? 'slate' : state.includes('resuelt') ? 'green' : state.includes('cancel') ? 'red' : state.includes('proceso') ? 'blue' : 'cyan';
  }
  initials(name: string): string { return (name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
  formatCount(value: unknown): string { return this.validCount(value) ? value.toLocaleString('es-PE') : '—'; }
  formatPercent(value: unknown): string { return this.validCount(value) ? value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'; }
  formatDate(value?: string): string {
    const date = value ? new Date(value) : undefined;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  }
  get updatedTime(): string { return this.updatedAt?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) || ''; }
  detailRoute(ticket: Ticket): (string | number)[] { return [this.isTechnician ? '/tecnico/tickets' : '/tickets/detail', ticket.id]; }
  onChartDrop(event: CdkDragDrop<string[]>): void { this.moveChart(event.previousIndex, event.currentIndex); }
  moveChart(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.chartOrder.length || to >= this.chartOrder.length) return;
    moveItemInArray(this.chartOrder, from, to);
    try { localStorage.setItem('dashboard-chart-order', JSON.stringify(this.chartOrder)); } catch { /* El reordenamiento sigue funcionando sin almacenamiento. */ }
  }
  trackChart(_index: number, id: string): string { return id; }
  trackEntry(_index: number, entry: ChartEntry): string { return entry.name; }
  trackTicket(_index: number, ticket: Ticket): number { return ticket.id; }
}
