import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/auth.model';
import { DashboardStats } from '../models/ticket.model';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private apiUrl = '/api/v1/dashboard';

  constructor(private http: HttpClient) {}

  obtenerMetricas(periodo: { fechaDesde?: string; fechaHasta?: string } = {}): Observable<ApiResponse<DashboardStats>> {
    let params = new HttpParams();
    if (periodo.fechaDesde) params = params.set('fechaDesde', periodo.fechaDesde);
    if (periodo.fechaHasta) params = params.set('fechaHasta', periodo.fechaHasta);
    return this.http.get<ApiResponse<DashboardStats>>(`${this.apiUrl}/stats`, { params });
  }
}
