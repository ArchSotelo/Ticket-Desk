import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/auth.model';
import { Area, AreaPayload, Categoria, CategoriaPayload, Empresa, EmpresaPayload, Subcategoria, SubcategoriaPayload } from '../models/organization.model';

@Injectable({
  providedIn: 'root'
})
export class OrganizationService {
  private empresaUrl = '/api/v1/empresas';
  private areaUrl = '/api/v1/areas';
  private categoriaUrl = '/api/v1/categorias';
  private subcategoriaUrl = '/api/v1/subcategorias';

  constructor(private http: HttpClient) {}

  listarEmpresas(): Observable<ApiResponse<Empresa[]>> {
    return this.http.get<ApiResponse<Empresa[]>>(this.empresaUrl);
  }

  obtenerEmpresa(id: number): Observable<ApiResponse<Empresa>> {
    return this.http.get<ApiResponse<Empresa>>(`${this.empresaUrl}/${id}`);
  }

  crearEmpresa(payload: EmpresaPayload): Observable<ApiResponse<Empresa>> {
    return this.http.post<ApiResponse<Empresa>>(this.empresaUrl, payload);
  }

  actualizarEmpresa(id: number, payload: EmpresaPayload): Observable<ApiResponse<Empresa>> {
    return this.http.put<ApiResponse<Empresa>>(`${this.empresaUrl}/${id}`, payload);
  }

  eliminarEmpresa(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.empresaUrl}/${id}`);
  }

  listarAreas(empresaId?: number): Observable<ApiResponse<Area[]>> {
    const url = empresaId ? `${this.areaUrl}?empresaId=${empresaId}` : this.areaUrl;
    return this.http.get<ApiResponse<Area[]>>(url);
  }

  obtenerArea(id: number): Observable<ApiResponse<Area>> {
    return this.http.get<ApiResponse<Area>>(`${this.areaUrl}/${id}`);
  }

  crearArea(payload: AreaPayload): Observable<ApiResponse<Area>> {
    return this.http.post<ApiResponse<Area>>(this.areaUrl, payload);
  }

  actualizarArea(id: number, payload: AreaPayload): Observable<ApiResponse<Area>> {
    return this.http.put<ApiResponse<Area>>(`${this.areaUrl}/${id}`, payload);
  }

  eliminarArea(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.areaUrl}/${id}`);
  }

  listarCategorias(): Observable<ApiResponse<Categoria[]>> {
    return this.http.get<ApiResponse<Categoria[]>>(this.categoriaUrl);
  }

  obtenerCategoria(id: number): Observable<ApiResponse<Categoria>> {
    return this.http.get<ApiResponse<Categoria>>(`${this.categoriaUrl}/${id}`);
  }

  crearCategoria(payload: CategoriaPayload): Observable<ApiResponse<Categoria>> {
    return this.http.post<ApiResponse<Categoria>>(this.categoriaUrl, payload);
  }

  actualizarCategoria(id: number, payload: CategoriaPayload): Observable<ApiResponse<Categoria>> {
    return this.http.put<ApiResponse<Categoria>>(`${this.categoriaUrl}/${id}`, payload);
  }

  eliminarCategoria(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.categoriaUrl}/${id}`);
  }

  listarSubcategorias(categoriaId?: number): Observable<ApiResponse<Subcategoria[]>> {
    const url = categoriaId ? `${this.subcategoriaUrl}?categoriaId=${categoriaId}` : this.subcategoriaUrl;
    return this.http.get<ApiResponse<Subcategoria[]>>(url);
  }

  obtenerSubcategoria(id: number): Observable<ApiResponse<Subcategoria>> {
    return this.http.get<ApiResponse<Subcategoria>>(`${this.subcategoriaUrl}/${id}`);
  }

  crearSubcategoria(payload: SubcategoriaPayload): Observable<ApiResponse<Subcategoria>> {
    return this.http.post<ApiResponse<Subcategoria>>(this.subcategoriaUrl, payload);
  }

  actualizarSubcategoria(id: number, payload: SubcategoriaPayload): Observable<ApiResponse<Subcategoria>> {
    return this.http.put<ApiResponse<Subcategoria>>(`${this.subcategoriaUrl}/${id}`, payload);
  }

  eliminarSubcategoria(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.subcategoriaUrl}/${id}`);
  }
}
