import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { OrganizationService } from '../core/services/organization.service';
import { FilterStateService } from '../core/services/filter-state.service';
import { Area, Empresa } from '../core/models/organization.model';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';

interface UsuarioListado {
  id: number; username: string; nombres: string; apellidos: string; email: string;
  telefono?: string; empresaId?: number; empresaNombre?: string; areaId?: number; areaNombre?: string;
  cargo?: string; estado: string; roles: string[]; requiereCambioPassword?: boolean;
}
interface UserFilters { busqueda: string; rol: string; empresaId: string; estado: string; pageIndex: number; pageSize: number; }

@Component({
  selector: 'app-user-management', standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './user-management.component.html', styleUrls: ['./user-management.component.scss']
})
export class UserManagementComponent implements OnInit, OnDestroy {
  usuarios: UsuarioListado[] = [];
  busqueda = ''; rolFiltro = ''; empresaFiltro = ''; estadoFiltro = '';
  pageIndex = 0; pageSize = 8; readonly pageSizeOptions = [5, 8, 12, 20];
  totalElements = 0; totalPages = 0; loadingUsers = false; loaded = false; loadError = '';
  showModal = false; editingId: number | null = null; saving = false; loadingDetail = false;
  successMessage = ''; errorMessage = ''; loadingCompanies = false; companiesError = ''; loadingAreas = false; areasError = '';
  changingId: number | null = null;
  showPassword = false;
  usuarioEditando: UsuarioListado | null = null;
  empresas: Empresa[] = []; areas: Area[] = []; userForm: FormGroup;
  @ViewChild('userEditor') userEditor?: ElementRef<HTMLDialogElement>;
  @ViewChild('userEditorBody') userEditorBody?: ElementRef<HTMLElement>;
  readonly roleOptions = [
    { label: 'Administrador', value: 'ROLE_ADMIN' }, { label: 'Supervisor', value: 'ROLE_SUPERVISOR' },
    { label: 'Técnico', value: 'ROLE_TECNICO' },
    { label: 'Cliente', value: 'ROLE_CLIENTE' }
  ];
  private applied = { busqueda: '', rol: '', empresaId: '', estado: '' };
  private listRequest?: Subscription; private detailRequest?: Subscription;
  private companiesRequest?: Subscription; private areasRequest?: Subscription;
  private readonly mutations = new Subscription(); private destroyed = false;

  constructor(private http: HttpClient, private fb: FormBuilder, private organizationService: OrganizationService, private filterState: FilterStateService) {
    const requiredText = (max: number) => [Validators.required, Validators.pattern(/\S/), Validators.maxLength(max)];
    this.userForm = this.fb.group({
      username: ['', [...requiredText(50), Validators.minLength(3)]], password: ['', [Validators.required, Validators.minLength(8)]],
      nombres: ['', requiredText(100)], apellidos: ['', requiredText(100)], email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
      telefono: ['', Validators.maxLength(30)], empresaId: [null, Validators.required], areaId: [null], cargo: ['', Validators.maxLength(100)], roles: ['ROLE_CLIENTE', Validators.required], requiereCambioPassword: [true]
    });
    this.syncAreaControl();
  }
  get hasFilters(): boolean { return !!(this.busqueda.trim() || this.rolFiltro || this.empresaFiltro || this.estadoFiltro || Object.values(this.applied).some(Boolean)); }
  get firstItemIndex(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItemIndex(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }
  get busy(): boolean { return this.saving || this.changingId !== null; }
  get originalAreaMissing(): boolean { return !!this.usuarioEditando?.areaId && this.userForm.get('empresaId')?.value === this.usuarioEditando.empresaId && !this.areas.some(area => area.id === this.usuarioEditando?.areaId); }
  get selectedCompanyMissing(): boolean { return !!this.empresaFiltro && !this.empresas.some(company => String(company.id) === this.empresaFiltro); }
  get areaPlaceholder(): string {
    if (!this.userForm.get('empresaId')?.value) return 'Selecciona primero una empresa';
    if (this.loadingAreas) return 'Cargando áreas…';
    if (this.areasError) return 'Áreas no disponibles';
    return 'Sin área';
  }
  private syncAreaControl(): void {
    const area = this.userForm.get('areaId');
    if (!this.userForm.get('empresaId')?.value || this.loadingAreas || !!this.areasError || this.loadingDetail || this.busy) area?.disable({ emitEvent: false });
    else area?.enable({ emitEvent: false });
  }
  togglePasswordVisibility(): void {
    if (!this.showModal || this.userForm.get('password')?.disabled || this.busy) return;
    this.showPassword = !this.showPassword;
  }
  ngOnInit(): void {
    const saved = this.filterState.load<UserFilters>('admin-users', { busqueda: '', rol: '', empresaId: '', estado: '', pageIndex: 0, pageSize: 8 });
    this.busqueda = typeof saved.busqueda === 'string' ? saved.busqueda : '';
    this.rolFiltro = this.roleOptions.some(role => role.value === saved.rol) ? saved.rol : '';
    this.empresaFiltro = typeof saved.empresaId === 'string' && /^[1-9]\d*$/.test(saved.empresaId) ? saved.empresaId : '';
    this.estadoFiltro = ['', 'ACTIVO', 'INACTIVO', 'BLOQUEADO'].includes(saved.estado) ? saved.estado : '';
    this.pageIndex = Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0 ? saved.pageIndex : 0;
    this.pageSize = this.pageSizeOptions.includes(saved.pageSize) ? saved.pageSize : 8;
    this.applied = { busqueda: this.busqueda.trim(), rol: this.rolFiltro, empresaId: this.empresaFiltro, estado: this.estadoFiltro };
    this.loadCompanies(); this.loadUsers();
  }
  ngOnDestroy(): void {
    this.destroyed = true; this.listRequest?.unsubscribe(); this.detailRequest?.unsubscribe(); this.companiesRequest?.unsubscribe(); this.areasRequest?.unsubscribe(); this.mutations.unsubscribe(); this.userEditor?.nativeElement.close();
  }
  loadCompanies(): void {
    this.companiesRequest?.unsubscribe(); this.loadingCompanies = true; this.companiesError = '';
    this.companiesRequest = this.organizationService.listarEmpresas().subscribe({
      next: res => { this.loadingCompanies = false; if (res.success && Array.isArray(res.data)) this.empresas = res.data; else this.companiesError = 'No se pudieron cargar las empresas.'; },
      error: () => { this.loadingCompanies = false; this.companiesError = 'No se pudieron cargar las empresas.'; }
    });
  }
  loadAreas(empresaId: number | null): void {
    this.areasRequest?.unsubscribe(); this.areas = []; this.areasError = ''; this.loadingAreas = false;
    if (!empresaId) { this.syncAreaControl(); return; }
    this.loadingAreas = true; this.syncAreaControl();
    this.areasRequest = this.organizationService.listarAreas(empresaId).subscribe({
      next: res => { this.loadingAreas = false; if (res.success && Array.isArray(res.data)) this.areas = res.data; else this.areasError = 'No se pudieron cargar las áreas de la empresa.'; this.syncAreaControl(); },
      error: () => { this.loadingAreas = false; this.areasError = 'No se pudieron cargar las áreas de la empresa.'; this.syncAreaControl(); }
    });
  }
  onEmpresaChange(empresaId: number | null): void { this.userForm.patchValue({ areaId: null }); this.loadAreas(empresaId); }
  loadUsers(page = this.pageIndex): void {
    this.listRequest?.unsubscribe(); this.pageIndex = page; this.loadingUsers = true; this.loaded = false; this.loadError = ''; this.usuarios = []; this.totalElements = this.totalPages = 0; this.persist();
    let params = new HttpParams().set('busqueda', this.applied.busqueda).set('page', page).set('size', this.pageSize);
    if (this.applied.rol) params = params.set('rol', this.applied.rol);
    if (this.applied.empresaId) params = params.set('empresaId', this.applied.empresaId);
    if (this.applied.estado) params = params.set('estado', this.applied.estado);
    this.listRequest = this.http.get<any>('/api/v1/users', { params }).subscribe({
      next: res => {
        const data = res.data;
        if (!res.success || !data || !Array.isArray(data.content) || !Number.isInteger(data.totalElements) || data.totalElements < 0 || !Number.isInteger(data.totalPages) || data.totalPages < 0 || !Number.isInteger(data.number) || data.number < 0 || !this.pageSizeOptions.includes(data.size) || data.totalPages !== Math.ceil(data.totalElements / data.size)) { this.failList(); return; }
        if (data.totalPages && data.number >= data.totalPages) { this.loadUsers(data.totalPages - 1); return; }
        this.loadingUsers = false; this.loaded = true; this.usuarios = data.content; this.pageIndex = data.totalPages ? data.number : 0; this.pageSize = data.size; this.totalElements = data.totalElements; this.totalPages = data.totalPages; this.persist();
      }, error: () => this.failList()
    });
  }
  private failList(): void { this.loadingUsers = false; this.loadError = 'No se pudo cargar el directorio de usuarios. Intenta nuevamente.'; }
  buscarUsuarios(): void { this.busqueda = this.busqueda.trim(); this.applied = { busqueda: this.busqueda, rol: this.rolFiltro, empresaId: this.empresaFiltro, estado: this.estadoFiltro }; this.loadUsers(0); }
  clearFilters(): void { this.busqueda = this.rolFiltro = this.empresaFiltro = this.estadoFiltro = ''; this.buscarUsuarios(); }
  irAPagina(page: number): void { if (!this.loadingUsers && Number.isInteger(page) && page >= 0 && page < this.totalPages) this.loadUsers(page); }
  cambiarTamanoPagina(value: number | string): void { const size = Number(value); if (!this.loadingUsers && this.pageSizeOptions.includes(size)) { this.pageSize = size; this.loadUsers(0); } }
  visiblePages(): number[] { const start = Math.max(0, Math.min(this.totalPages - 5, this.pageIndex - 2)); return Array.from({ length: Math.min(5, this.totalPages) }, (_, index) => start + index); }
  private persist(): void { this.filterState.save('admin-users', { ...this.applied, pageIndex: this.pageIndex, pageSize: this.pageSize }); }
  initials(user: UsuarioListado): string { return ((user.nombres?.charAt(0) || '') + (user.apellidos?.charAt(0) || '')).toUpperCase() || 'US'; }
  fullName(user: UsuarioListado): string { return [user.nombres, user.apellidos].filter(Boolean).join(' ') || user.username; }
  formatRole(role: string): string { return this.roleOptions.find(option => option.value === role)?.label || role.replace(/^ROLE_/, ''); }
  roleClass(role: string): string { return ['ROLE_ADMIN', 'ROLE_TECNICO'].includes(role) ? role.toLowerCase() : 'role-other'; }
  roleIcon(role: string): string { return role === 'ROLE_ADMIN' ? 'shield' : role === 'ROLE_TECNICO' ? 'build' : 'person'; }
  statusLabel(status: string): string { return ({ ACTIVO: 'Activo', INACTIVO: 'Inactivo', BLOQUEADO: 'Bloqueado' } as Record<string, string>)[status] || status; }
  trackUser(_index: number, user: UsuarioListado): number { return user.id; }

  private resetEditor(): void {
    this.detailRequest?.unsubscribe(); this.areasRequest?.unsubscribe(); this.usuarioEditando = null; this.areas = []; this.areasError = ''; this.loadingAreas = false; this.loadingDetail = false; this.errorMessage = ''; this.successMessage = ''; this.showPassword = false; this.userForm.enable();
    this.userForm.reset({ username: '', password: '', nombres: '', apellidos: '', email: '', telefono: '', empresaId: null, areaId: null, cargo: '', roles: 'ROLE_CLIENTE', requiereCambioPassword: true });
    this.syncAreaControl();
  }
  private showEditor(): void { this.showModal = true; this.userEditor?.nativeElement.showModal(); if (this.userEditorBody) this.userEditorBody.nativeElement.scrollTop = 0; }
  openCreateModal(): void {
    if (this.busy) return;
    this.resetEditor(); this.editingId = null;
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(8)]); this.userForm.get('password')?.updateValueAndValidity(); this.showEditor();
  }
  edit(id: number): void {
    if (this.busy) return;
    this.resetEditor(); this.editingId = id; this.loadingDetail = true; this.userForm.disable(); this.showEditor();
    this.detailRequest = this.http.get<any>(`/api/v1/users/${id}`).subscribe({
      next: res => {
        this.loadingDetail = false;
        if (!res.success || !res.data) { this.errorMessage = res.message || 'No se pudo cargar el usuario.'; return; }
        const user = res.data as UsuarioListado; this.usuarioEditando = user; this.userForm.enable();
        this.userForm.get('password')?.setValidators([Validators.minLength(8)]);
        this.userForm.patchValue({ username: user.username, password: '', nombres: user.nombres, apellidos: user.apellidos, email: user.email, telefono: user.telefono || '', empresaId: user.empresaId ?? null, areaId: user.areaId ?? null, cargo: user.cargo || '', roles: user.roles?.[0] || 'ROLE_CLIENTE', requiereCambioPassword: user.requiereCambioPassword ?? true });
        this.userForm.get('password')?.updateValueAndValidity(); this.loadAreas(user.empresaId ?? null);
      }, error: err => { this.loadingDetail = false; this.errorMessage = err.error?.message || 'No se pudo cargar el usuario.'; }
    });
  }
  closeModal(): void { if (this.busy) return; this.detailRequest?.unsubscribe(); this.areasRequest?.unsubscribe(); this.userEditor?.nativeElement.close(); this.showModal = false; this.showPassword = false; this.editingId = null; this.usuarioEditando = null; this.errorMessage = ''; this.loadingDetail = false; }
  closeOnBackdrop(event: MouseEvent): void { if (event.target === event.currentTarget) this.closeModal(); }
  fieldError(name: string): string {
    const control = this.userForm.get(name); if (!control || !control.touched || !control.invalid) return '';
    if (control.hasError('required') || control.hasError('pattern')) return 'Completa este campo.';
    if (control.hasError('email')) return 'Ingresa un correo válido.';
    if (control.hasError('minlength')) return `Mínimo ${control.errors?.['minlength'].requiredLength} caracteres.`;
    if (control.hasError('maxlength')) return `Máximo ${control.errors?.['maxlength'].requiredLength} caracteres.`;
    return 'Revisa este campo.';
  }
  save(): void {
    if (this.busy || this.loadingDetail || (this.editingId && !this.usuarioEditando)) return;
    if (this.userForm.invalid) { this.userForm.markAllAsTouched(); return; }
    const value = this.userForm.getRawValue();
    if (this.loadingCompanies || this.companiesError || !this.empresas.some(company => company.id === Number(value.empresaId))) { this.errorMessage = 'Selecciona una empresa disponible. Si el catálogo falló, vuelve a cargarlo.'; return; }
    const originalArea = Number(value.areaId) === this.usuarioEditando?.areaId && Number(value.empresaId) === this.usuarioEditando?.empresaId;
    if (this.loadingAreas || this.areasError || (value.areaId && !originalArea && !this.areas.some(area => area.id === Number(value.areaId)))) { this.errorMessage = 'Revisa el área de la empresa antes de guardar.'; return; }
    const payload: any = { ...value, username: value.username.trim(), nombres: value.nombres.trim(), apellidos: value.apellidos.trim(), email: value.email.trim(), empresaId: Number(value.empresaId), areaId: value.areaId ? Number(value.areaId) : null, roles: [value.roles] };
    if (this.editingId && !String(value.password || '').trim()) delete payload.password;
    if (this.editingId) delete payload.requiereCambioPassword;
    // Si no se cambia el rol, no reemplazar asignaciones existentes al editar otros datos.
    if (this.editingId && this.usuarioEditando?.roles?.[0] === value.roles) delete payload.roles;
    this.saving = true; this.errorMessage = ''; this.userForm.disable();
    const request = this.editingId ? this.http.put<any>(`/api/v1/users/${this.editingId}`, payload) : this.http.post<any>('/api/v1/users', payload);
    this.mutations.add(request.subscribe({
      next: res => {
        this.saving = false; this.userForm.enable(); this.syncAreaControl();
        if (!res.success) { this.errorMessage = res.message || 'No se pudo guardar el usuario.'; return; }
        const message = this.editingId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.';
        this.closeModal(); this.successMessage = message; this.loadUsers();
      }, error: err => { this.saving = false; this.userForm.enable(); this.syncAreaControl(); this.errorMessage = err.error?.message || 'No se pudo guardar el usuario.'; }
    }));
  }
  toggleEstado(item: UsuarioListado): void { void this.actualizarEstado(item); }
  toggleEstadoDesdeModal(): void { if (this.usuarioEditando) void this.actualizarEstado(this.usuarioEditando); }
  private async actualizarEstado(item: UsuarioListado): Promise<void> {
    if (this.busy) return;
    this.changingId = item.id;
    const activar = item.estado !== 'ACTIVO', nuevoEstado = activar ? 'ACTIVO' : 'INACTIVO';
    const confirmation = await Swal.fire({ icon: activar ? 'question' : 'warning', title: activar ? '¿Activar usuario?' : '¿Desactivar usuario?', text: activar ? `El usuario ${item.username} podrá ingresar nuevamente al sistema.` : `El usuario ${item.username} no podrá acceder mientras esté inactivo.`, showCancelButton: true, confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar', cancelButtonText: 'Cancelar', confirmButtonColor: activar ? '#16803c' : '#b42318' });
    if (!confirmation.isConfirmed || this.destroyed) { this.changingId = null; return; }
    this.mutations.add(this.http.patch<any>(`/api/v1/users/${item.id}/estado?estado=${nuevoEstado}`, {}).subscribe({
      next: res => {
        this.changingId = null;
        if (!res.success) { this.errorMessage = res.message || 'No se pudo actualizar el estado.'; return; }
        item.estado = nuevoEstado; this.successMessage = activar ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.'; this.loadUsers();
      }, error: err => { this.changingId = null; this.errorMessage = err.error?.message || 'No se pudo actualizar el estado.'; }
    }));
  }
}
