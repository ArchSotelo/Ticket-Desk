import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/auth.model';
import { Notificacion } from '../models/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private apiUrl = '/api/v1/notifications';

  constructor(private http: HttpClient) {}

  getUnread(): Observable<ApiResponse<Notificacion[]>> {
    return this.http.get<ApiResponse<Notificacion[]>>(`${this.apiUrl}/unread`);
  }

  getUnreadCount(): Observable<ApiResponse<{ count: number }>> {
    return this.http.get<ApiResponse<{ count: number }>>(`${this.apiUrl}/unread/count`);
  }

  markAllRead(): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.apiUrl}/mark-all-read`, {});
  }

  markRead(id: number): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.apiUrl}/${id}/read`, {});
  }

  testEmail(): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.apiUrl}/email/test`, {});
  }

  getEmailStatus(): Observable<ApiResponse<{ enabled: boolean; configured: boolean }>> {
    return this.http.get<ApiResponse<{ enabled: boolean; configured: boolean }>>(`${this.apiUrl}/email/status`);
  }

  getSettings(): Observable<ApiResponse<NotificationSettings>> {
    return this.http.get<ApiResponse<NotificationSettings>>(`${this.apiUrl}/settings`);
  }

  updateSettings(settings: NotificationSettings): Observable<ApiResponse<NotificationSettings>> {
    return this.http.put<ApiResponse<NotificationSettings>>(`${this.apiUrl}/settings`, settings);
  }

  getServiceSettings(): Observable<ApiResponse<ServiceSettings>> {
    return this.http.get<ApiResponse<ServiceSettings>>('/api/v1/service-settings');
  }

  updateServiceSettings(settings: ServiceSettings): Observable<ApiResponse<ServiceSettings>> {
    return this.http.put<ApiResponse<ServiceSettings>>('/api/v1/service-settings', settings);
  }
}

export interface NotificationSettings {
  enabled: boolean;
  onTicketCreated: boolean;
  onAssigned: boolean;
  onStatusChanged: boolean;
  onReply: boolean;
  onAttachment: boolean;
  onSla: boolean;
  emailSubject: string;
  emailBody: string;
  ticketCreatedSubject: string;
  ticketCreatedBody: string;
  assignedSubject: string;
  assignedBody: string;
  statusChangedSubject: string;
  statusChangedBody: string;
  replySubject: string;
  replyBody: string;
  attachmentSubject: string;
  attachmentBody: string;
  slaSubject: string;
  slaBody: string;
}

export interface ServiceSettings {
  diasPorVencer: number;
  recordatorioVencido: boolean;
  asuntoRecordatorio: string;
  plantillaRecordatorio: string;
  asuntoPorVencer: string;
  plantillaPorVencer: string;
  asuntoVencido: string;
  plantillaVencido: string;
}
