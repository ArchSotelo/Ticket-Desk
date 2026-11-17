import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';

interface AuditEntry {
  id: number;
  usuarioNombre: string;
  accion: string;
  modulo: string;
  detalle?: string;
  ipOrigen?: string;
  userAgent?: string;
  fechaRegistro: string;
}
interface AuditPage {
  content: AuditEntry[]; number: number; size: number; totalElements: number; totalPages: number;
}
interface AuditFilters { busqueda: string; accion: string; desde: string; hasta: string; }

@Component({
  selector: 'app-audit', standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './audit.component.html', styleUrls: ['./audit.component.scss']
})
export class AuditComponent implements OnInit, OnDestroy {
  entries: AuditEntry[] = [];
  selected: AuditEntry | null = null;
  loading = true;
  error = '';
  filterError = '';
  pageIndex = 0;
  pageSize = 8;
  pageSizeOptions = [5, 8, 12, 20];
  totalElements = 0;
  totalPages = 0;
  group = '';
  order = 'desc';
  filters: AuditFilters = { busqueda: '', accion: '', desde: '', hasta: '' };
  applied: AuditFilters = { ...this.filters };
  readonly groups = [
    { code: '', label: 'Todos los eventos', icon: 'groups' },
    { code: 'accesos', label: 'Accesos', icon: 'person_outline' },
    { code: 'actividad', label: 'Actividad del sistema', icon: 'receipt_long' }
  ];
  readonly actions = [
    { code: 'LOGIN_EXITOSO', label: 'Inicio de sesión correcto' },
    { code: 'LOGIN_FALLIDO', label: 'Inicio de sesión fallido' },
    ...['POST', 'PUT', 'PATCH', 'DELETE'].flatMap(code => [
      { code, label: `Solicitud ${code}` }, { code: `${code}_ERROR`, label: `Error en solicitud ${code}` }
    ])
  ];
  private request?: Subscription;
  private detailFocus?: ReturnType<typeof setTimeout>;
  constructor(private http: HttpClient) {}
  ngOnInit(): void { this.loadPage(0); }
  ngOnDestroy(): void { this.request?.unsubscribe(); clearTimeout(this.detailFocus); }

  loadPage(page: number): void {
    this.request?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.selected = null;
    const params: Record<string, string | number> = {
      page, size: this.pageSize, grupo: this.group, orden: this.order,
      busqueda: this.applied.busqueda.trim(), accion: this.applied.accion
    };
    if (this.applied.desde) params['desde'] = this.applied.desde;
    if (this.applied.hasta) params['hasta'] = this.applied.hasta;
    this.request = this.http.get<{ success?: boolean; data?: AuditPage }>('/api/v1/audit', { params }).subscribe({
      next: res => {
        if (res.success === false || !res.data) {
          this.failLoad(); return;
        }
        const data = res.data;
        // Si se eliminaron registros mientras se navegaba, vuelve a una página válida.
        if (page > 0 && !data.content.length && data.totalPages <= page) {
          this.loadPage(Math.max(0, data.totalPages - 1)); return;
        }
        this.entries = data.content;
        this.pageIndex = data.number;
        this.pageSize = data.size;
        this.totalElements = data.totalElements;
        this.totalPages = data.totalPages;
        this.loading = false;
      },
      error: () => this.failLoad()
    });
  }
  private failLoad(): void {
    this.entries = []; this.totalElements = 0; this.totalPages = 0;
    this.error = 'No se pudo cargar la auditoría. Inténtalo nuevamente.';
    this.loading = false;
  }
  applyFilters(): void {
    this.filterError = '';
    if (this.filters.desde && this.filters.hasta && this.filters.desde > this.filters.hasta) {
      this.filterError = 'La fecha desde no puede ser posterior a la fecha hasta.'; return;
    }
    this.applied = { ...this.filters };
    this.loadPage(0);
  }
  clearFilters(): void {
    this.filters = { busqueda: '', accion: '', desde: '', hasta: '' };
    this.applied = { ...this.filters }; this.filterError = ''; this.loadPage(0);
  }
  setGroup(group: string): void { this.group = group; this.loadPage(0); }
  changeSize(size: number): void { this.pageSize = Number(size); this.loadPage(0); }
  goTo(page: number): void {
    if (!this.loading && page >= 0 && page < this.totalPages) this.loadPage(page);
  }
  visiblePages(): number[] {
    const start = Math.max(0, Math.min(this.totalPages - 5, this.pageIndex - 2));
    return Array.from({ length: Math.max(0, Math.min(5, this.totalPages - start)) }, (_, index) => start + index);
  }
  get firstItem(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItem(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }
  get hasFilters(): boolean { return !!(this.applied.busqueda || this.applied.accion || this.applied.desde || this.applied.hasta || this.group); }
  trackEntry(_: number, entry: AuditEntry): number { return entry.id; }
  openDetail(entry: AuditEntry): void {
    this.selected = entry;
    clearTimeout(this.detailFocus);
    this.detailFocus = setTimeout(() => {
      const panel = document.getElementById('audit-detail');
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  closeDetail(): void {
    clearTimeout(this.detailFocus);
    const id = this.selected?.id; this.selected = null;
    if (id != null) document.getElementById(`audit-event-${id}`)?.focus();
  }
  isSuccess(entry: AuditEntry): boolean { return entry.accion === 'LOGIN_EXITOSO'; }
  isError(entry: AuditEntry): boolean { return entry.accion === 'LOGIN_FALLIDO' || entry.accion.endsWith('_ERROR'); }
  title(entry: AuditEntry): string {
    if (entry.accion === 'LOGIN_EXITOSO') return 'Inicio de sesión correcto';
    if (entry.accion === 'LOGIN_FALLIDO') return 'Inicio de sesión fallido';
    if (this.isError(entry)) return `Error en solicitud ${entry.accion.replace(/_ERROR$/, '')}`;
    if (entry.detalle?.includes('/auth/login')) return 'Solicitud de inicio de sesión';
    if (entry.detalle?.includes('/auth/logout')) return 'Solicitud de cierre de sesión';
    return /^(POST|PUT|PATCH|DELETE|GET)$/.test(entry.accion) ? `Solicitud ${entry.accion}` : entry.accion.replace(/_/g, ' ');
  }
  subtitle(entry: AuditEntry): string {
    if (entry.modulo?.toUpperCase() === 'AUTENTICACION') return 'Autenticación';
    const endpoint = entry.detalle?.match(/(?:POST|PUT|PATCH|DELETE|GET)\s+(\S+)/)?.[1];
    return endpoint ? `${entry.accion} · ${endpoint}` : entry.modulo || 'Sin módulo';
  }
  icon(entry: AuditEntry): string {
    return this.isError(entry) ? 'error_outline' : this.isSuccess(entry) ? 'person' : entry.detalle?.includes('/auth/logout') ? 'logout' : 'receipt_long';
  }
  initials(name?: string): string {
    return name && name !== 'No identificado' && name !== 'Usuario no disponible'
      ? name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() : '';
  }
  browser(agent?: string): string {
    if (!agent || agent === 'N/A') return 'No disponible';
    if (/Edg\//i.test(agent)) return 'Edge';
    if (/OPR\//i.test(agent)) return 'Opera';
    if (/Firefox\//i.test(agent)) return 'Firefox';
    if (/Chrome\/|CriOS\//i.test(agent)) return 'Chrome';
    if (/Safari\//i.test(agent)) return 'Safari';
    return 'No identificado';
  }
  os(agent?: string): string {
    if (!agent || agent === 'N/A') return 'No disponible';
    if (/Android/i.test(agent)) return 'Android';
    if (/iPhone|iPad/i.test(agent)) return 'iOS';
    if (/Windows/i.test(agent)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(agent)) return 'macOS';
    if (/Linux/i.test(agent)) return 'Linux';
    return 'No identificado';
  }
  private parsedDate(value: string): Date {
    return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}-05:00`);
  }
  date(value: string): string {
    const date = this.parsedDate(value);
    return Number.isNaN(date.getTime()) ? 'No disponible' : date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
  }
  time(value: string): string {
    const date = this.parsedDate(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
  }
}
