import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/auth.model';
import { KanbanBoard, KanbanColumn, PageResponse, Ticket, TicketCreateDTO } from '../models/ticket.model';

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private apiUrl = '/api/v1/tickets';

  constructor(private http: HttpClient) {}

  obtenerKanban(filtros: { busqueda?: string; prioridad?: string; tecnico?: string }): Observable<ApiResponse<KanbanBoard>> {
    let params = new HttpParams();
    if (filtros.busqueda) params = params.set('busqueda', filtros.busqueda);
    if (filtros.prioridad) params = params.set('prioridad', filtros.prioridad);
    if (filtros.tecnico) params = params.set('tecnico', filtros.tecnico);
    return this.http.get<ApiResponse<KanbanBoard>>(`${this.apiUrl}/kanban`, { params });
  }

  cargarColumnaKanban(codigo: string, page: number, size: number,
    filtros: { busqueda?: string; prioridad?: string; tecnico?: string }): Observable<ApiResponse<KanbanColumn>> {
    let params = new HttpParams().set('page', page.toString()).set('size', size.toString());
    if (filtros.busqueda) params = params.set('busqueda', filtros.busqueda);
    if (filtros.prioridad) params = params.set('prioridad', filtros.prioridad);
    if (filtros.tecnico) params = params.set('tecnico', filtros.tecnico);
    return this.http.get<ApiResponse<KanbanColumn>>(`${this.apiUrl}/kanban/${encodeURIComponent(codigo)}`, { params });
  }

  crearTicket(ticket: TicketCreateDTO, idempotencyKey: string): Observable<ApiResponse<Ticket>> {
    return this.http.post<ApiResponse<Ticket>>(this.apiUrl, ticket, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
  }

  listarMisTickets(page = 0, size = 10, busqueda = '', filtros?: {
    estado?: string;
    prioridad?: string;
    categoriaId?: number;
    fechaDesde?: string;
    fechaHasta?: string;
  }): Observable<ApiResponse<PageResponse<Ticket>>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString())
      .set('busqueda', busqueda);
    let query = params;
    if (filtros?.estado) query = query.set('estado', filtros.estado);
    if (filtros?.prioridad) query = query.set('prioridad', filtros.prioridad);
    if (filtros?.categoriaId) query = query.set('categoriaId', filtros.categoriaId.toString());
    if (filtros?.fechaDesde) query = query.set('fechaDesde', filtros.fechaDesde);
    if (filtros?.fechaHasta) query = query.set('fechaHasta', filtros.fechaHasta);
    return this.http.get<ApiResponse<PageResponse<Ticket>>>(`${this.apiUrl}/mine`, { params: query });
  }

  obtenerPorId(id: number): Observable<ApiResponse<Ticket>> {
    return this.http.get<ApiResponse<Ticket>>(`${this.apiUrl}/${id}`);
  }

  listarTickets(
    page = 0,
    size = 10,
    busqueda = '',
    filtros?: {
      estado?: string;
      prioridad?: string;
      categoriaId?: number;
      fechaDesde?: string;
      fechaHasta?: string;
      sortBy?: string;
      sortDir?: 'ASC' | 'DESC';
    }
  ): Observable<ApiResponse<PageResponse<Ticket>>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    if (busqueda) {
      params = params.set('busqueda', busqueda);
    }
    if (filtros?.estado) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros?.prioridad) {
      params = params.set('prioridad', filtros.prioridad);
    }
    if (filtros?.categoriaId) {
      params = params.set('categoriaId', filtros.categoriaId.toString());
    }
    if (filtros?.fechaDesde) {
      params = params.set('fechaDesde', filtros.fechaDesde);
    }
    if (filtros?.fechaHasta) {
      params = params.set('fechaHasta', filtros.fechaHasta);
    }
    if (filtros?.sortBy) {
      params = params.set('sortBy', filtros.sortBy);
    }
    if (filtros?.sortDir) {
      params = params.set('sortDir', filtros.sortDir);
    }
    return this.http.get<ApiResponse<PageResponse<Ticket>>>(this.apiUrl, { params });
  }

  cambiarEstado(ticketId: number, nuevoEstadoCodigo: string): Observable<ApiResponse<Ticket>> {
    return this.http.patch<ApiResponse<Ticket>>(`${this.apiUrl}/${ticketId}/estado?nuevoEstadoCodigo=${nuevoEstadoCodigo}`, {});
  }

  asignarTecnico(ticketId: number, tecnicoId: number): Observable<ApiResponse<Ticket>> {
    return this.http.patch<ApiResponse<Ticket>>(`${this.apiUrl}/${ticketId}/asignar?tecnicoId=${tecnicoId}`, {});
  }

  agregarComentario(ticketId: number, contenido: string, esInterno = false): Observable<ApiResponse<Ticket>> {
    return this.http.post<ApiResponse<Ticket>>(`${this.apiUrl}/${ticketId}/comentarios?contenido=${encodeURIComponent(contenido)}&esInterno=${esInterno}`, {});
  }
}
