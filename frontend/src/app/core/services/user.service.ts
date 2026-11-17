import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { ApiResponse } from '../models/auth.model';
import { UsuarioProfile, UsuarioProfileUpdate } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = '/api/v1/users';

  constructor(private http: HttpClient) {}

  getProfile(): Observable<ApiResponse<UsuarioProfile>> {
    return this.http.get<ApiResponse<UsuarioProfile>>(`${this.apiUrl}/me`);
  }

  changeMyPassword(payload: { currentPassword: string; newPassword: string }): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(`${this.apiUrl}/me/password`, payload);
  }

  updateMyProfile(payload: UsuarioProfileUpdate): Observable<ApiResponse<UsuarioProfile>> {
    return this.http.put<ApiResponse<UsuarioProfile>>(`${this.apiUrl}/me`, payload);
  }
}
