import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable, map, throwError } from 'rxjs';
import { attachmentFileError } from './attachment-policy';
import { ApiResponse } from '../models/auth.model';
import { TicketAttachment } from '../models/ticket.model';

@Injectable({
  providedIn: 'root'
})
export class AttachmentService {
  private apiUrl = '/api/v1';

  constructor(private http: HttpClient) {}

  subirAdjunto(ticketId: number, file: File, comentario = '', comentarioId?: number): Observable<HttpEvent<ApiResponse<TicketAttachment>>> {
    const error = attachmentFileError(file);
    if (error) return throwError(() => ({ error: { message: error } }));
    const formData: FormData = new FormData();
    formData.append('file', file);
    if (comentario) {
      formData.append('comentario', comentario);
    }

    if (comentarioId != null) formData.append('comentarioId', String(comentarioId));

    const req = new HttpRequest('POST', `${this.apiUrl}/tickets/${ticketId}/attachments`, formData, {
      reportProgress: true,
      responseType: 'json'
    });

    return this.http.request(req);
  }

  obtenerAdjuntosTicket(ticketId: number): Observable<ApiResponse<TicketAttachment[]>> {
    return this.http.get<ApiResponse<TicketAttachment[]>>(`${this.apiUrl}/tickets/${ticketId}/attachments`);
  }

  obtenerArchivoBlob(url: string): Observable<Blob> {
    return this.http.get(url, { responseType: 'blob' }).pipe(map(blob =>
      new Blob([blob], { type: ['image/png','image/jpeg','image/gif','image/webp','application/pdf'].includes(blob.type) ? blob.type : 'application/octet-stream' }))); 
  }

  eliminarAdjunto(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/attachments/${id}`);
  }
}
