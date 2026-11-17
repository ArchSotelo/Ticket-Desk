import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CategoriaServicio, Servicio, ServicioAdjunto } from '../core/models/service.model';
import { attachmentFileError, isRasterAttachment, isPdfAttachment } from '../core/services/attachment-policy';
import { showAttachmentAlert } from '../core/services/attachment-alert';
import { AuthService } from '../core/services/auth.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { Subscription } from 'rxjs';
import { ApiResponse } from '../core/models/auth.model';

@Component({
  selector: 'app-service-detail', standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule],
  styleUrls: ['./service-detail.component.scss'],
  templateUrl: './service-detail.component.html'
})
export class ServiceDetailComponent implements OnInit, OnDestroy {
  servicio: Servicio | null = null;
  categorias: CategoriaServicio[] = [];
  guardandoObservaciones = false; subiendoFacturas = false;
  facturaViewer = false; facturaViewerLoading = false; facturaViewerName = ''; facturaViewerUrl = '';
  facturaViewerSafeUrl: SafeResourceUrl | null = null;
  facturaViewerKind: 'image' | 'pdf' | 'file' = 'file';
  fromHistory = false;
  loading = false;
  loadError = '';
  iconsError = '';
  loadingIcons = false;
  changingStatus = false;
  deletingFile = false;
  @ViewChild('attachmentDialog') attachmentDialog?: ElementRef<HTMLDialogElement>;
  private readonly requests = new Subscription();
  private previewRequest?: Subscription;
  private previewVersion = 0;
  private destroyed = false;
  get busy(): boolean { return this.guardandoObservaciones || this.subiendoFacturas || this.changingStatus || this.deletingFile; }
  get attachmentCount(): number { return (this.servicio?.facturaNombre ? 1 : 0) + (this.servicio?.adjuntos?.length || 0); }

  constructor(private route: ActivatedRoute, private http: HttpClient, private router: Router, private authService: AuthService, private sanitizer: DomSanitizer) {}
  get basePath(): string { return this.authService.isTechnicianUser() ? '/tecnico/servicios' : '/servicios'; }
  get historyPath(): string {
    const id = this.route.snapshot.queryParamMap.get('historyId');
    return id && /^[1-9]\d*$/.test(id) ? `${this.basePath}/${id}/historial` : `${this.basePath}/historial`;
  }
  get returnPath(): string { return this.fromHistory ? this.historyPath : this.basePath; }
  get puedeEditarObservaciones(): boolean { return !!this.servicio && this.servicio.estado !== 'CANCELADO' && this.servicio.estado !== 'FINALIZADO'; }
  get puedeGestionarArchivos(): boolean { return this.puedeEditarObservaciones; }

  ngOnInit(): void {
    this.fromHistory = this.route.snapshot.queryParamMap.get('from') === 'history';
    this.load();
    this.loadCategorias();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading = true; this.loadError = '';
    if (!id) { this.loading = false; this.loadError = 'No se encontró el servicio solicitado.'; return; }
    this.requests.add(this.http.get<ApiResponse<Servicio>>(`/api/v1/services/${id}`).subscribe({
      next: res => { this.loading = false; if (res.success && res.data) this.servicio = res.data; else this.loadError = 'No se pudo cargar el detalle del servicio.'; },
      error: () => { this.loading = false; this.loadError = 'No se pudo cargar el detalle del servicio. Intenta nuevamente.'; }
    }));
  }
  loadCategorias(): void {
    this.loadingIcons = true; this.iconsError = '';
    this.requests.add(this.http.get<ApiResponse<CategoriaServicio[]>>('/api/v1/service-categories').subscribe({
      next: res => { this.loadingIcons = false; if (res.success && Array.isArray(res.data)) this.categorias = res.data; else this.iconsError = 'No se pudo cargar el icono del tipo de servicio.'; },
      error: () => { this.loadingIcons = false; this.iconsError = 'No se pudo cargar el icono del tipo de servicio.'; }
    }));
  }
  iconoTipo(tipo: string | undefined): string {
    const category = this.categorias.find(item => item.id === this.servicio?.categoriaServicioId) || this.categorias.find(item => item.nombre === tipo);
    return category?.icono?.trim() || 'category';
  }
  diasVigencia(): number { if (!this.servicio) return 0; const inicio = new Date(`${this.servicio.fechaInicio}T00:00:00`); const fin = new Date(`${this.servicio.fechaFin}T00:00:00`); return Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 86400000) + 1); }
  progresoVigencia(): number { if (!this.servicio) return 0; if (this.servicio.estado === 'VENCIDO' || this.servicio.estado === 'FINALIZADO') return 100; const inicio = new Date(`${this.servicio.fechaInicio}T00:00:00`).getTime(); const fin = new Date(`${this.servicio.fechaFin}T00:00:00`).getTime(); const hoy = new Date(); hoy.setHours(0, 0, 0, 0); const total = fin - inicio; return total <= 0 ? 100 : Math.min(100, Math.max(0, ((hoy.getTime() - inicio) / total) * 100)); }
  periodMessage(): string {
    return ({ VENCIDO: 'La vigencia de este servicio ha terminado.', POR_VENCER: 'La vigencia de este servicio está próxima a terminar.', FINALIZADO: 'Este servicio está finalizado. La información y los adjuntos son de solo lectura.', CANCELADO: 'Este servicio está cancelado. La información y los adjuntos son de solo lectura.', INACTIVO: 'Este servicio está inactivo.' } as Record<string, string>)[this.servicio?.estado || ''] || '';
  }
  formatCost(): string { return (this.servicio?.divisa || 'PEN') + ' ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(this.servicio?.costoMensual || 0); }
  label(status: string): string { return ({ ACTIVO: 'Activo', POR_VENCER: 'Por vencer', VENCIDO: 'Vencido', CANCELADO: 'Cancelado', FINALIZADO: 'Finalizado' } as any)[status] || status; }

  finalizar(): void {
    if (!this.servicio || !this.puedeEditarObservaciones || this.busy) return;
    this.changingStatus = true;
    Swal.fire({ icon: 'question', title: '¿Finalizar servicio?', text: 'El servicio quedará cerrado y pasará al historial. Esta acción no se puede deshacer.', showCancelButton: true, confirmButtonText: 'Sí, finalizar', cancelButtonText: 'Volver', confirmButtonColor: '#155eef' }).then(result => {
      if (!result.isConfirmed || this.destroyed) { this.changingStatus = false; return; }
      this.requests.add(this.http.patch<any>(`/api/v1/services/${this.servicio!.id}/status`, {}, { params: { estado: 'FINALIZADO' } }).subscribe({
        next: response => { this.changingStatus = false; if (response.success) { this.servicio!.estado = 'FINALIZADO'; Swal.fire({ icon: 'success', title: 'Servicio finalizado', text: 'El servicio fue movido al historial.', confirmButtonColor: '#155eef' }); } },
        error: err => { this.changingStatus = false; Swal.fire({ icon: 'error', title: 'No se pudo finalizar', text: err.error?.message || 'Intenta nuevamente.' }); }
      }));
    });
  }

  guardarObservaciones(): void {
    if (!this.servicio || !this.puedeEditarObservaciones || this.busy) return;
    this.guardandoObservaciones = true;
    this.requests.add(this.http.patch<any>(`/api/v1/services/${this.servicio.id}/notes`, { observaciones: this.servicio.notas || '' }).subscribe({
      next: response => { this.guardandoObservaciones = false; if (response.success) { this.servicio = response.data; Swal.fire({ icon: 'success', title: 'Observaciones guardadas', timer: 1600, showConfirmButton: false }); } },
      error: err => { this.guardandoObservaciones = false; Swal.fire({ icon: 'error', title: 'No se pudieron guardar', text: err.error?.message || 'Intenta nuevamente.' }); }
    }));
  }

  abrirRenovacion(): void {
    if (!this.servicio || !this.puedeEditarObservaciones || this.busy) return;
    this.router.navigate([this.basePath, this.servicio.id, 'renovar']);
  }

  cancelar(): void {
    if (!this.servicio || !this.puedeEditarObservaciones || this.busy) return;
    this.changingStatus = true;
    Swal.fire({ icon: 'warning', title: '¿Cancelar servicio?', text: 'El registro permanecerá disponible en el historial.', input: 'textarea', inputLabel: 'Motivo de cancelación', inputPlaceholder: 'Escribe la observación del motivo...', inputAttributes: { 'aria-label': 'Motivo de cancelación' }, showCancelButton: true, confirmButtonText: 'Sí, cancelar', cancelButtonText: 'Volver', confirmButtonColor: '#b42318', inputValidator: value => !value?.trim() ? 'Debes ingresar una observación.' : null }).then(result => {
      const observacion = result.value?.trim(); if (!result.isConfirmed || !observacion || this.destroyed) { this.changingStatus = false; return; }
      this.requests.add(this.http.patch<any>(`/api/v1/services/${this.servicio!.id}/cancel`, { observacionCancelacion: observacion }).subscribe({
        next: response => { this.changingStatus = false; if (response.success) { this.servicio!.estado = 'CANCELADO'; this.servicio!.observacionCancelacion = observacion; Swal.fire({ icon: 'success', title: 'Servicio cancelado', text: 'La observación fue guardada en el historial.', confirmButtonColor: '#155eef' }); } },
        error: err => { this.changingStatus = false; Swal.fire({ icon: 'error', title: 'No se pudo cancelar', text: err.error?.message || 'Intenta nuevamente.' }); }
      }));
    });
  }

  eliminarFactura(): void {
    if (!this.servicio?.facturaNombre || !this.puedeGestionarArchivos || this.busy) return;
    this.deletingFile = true;
    Swal.fire({ icon: 'warning', title: '¿Eliminar archivo?', text: `Se quitará "${this.servicio.facturaNombre}" del servicio.`, showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b42318' }).then(result => {
      if (!result.isConfirmed || this.destroyed) { this.deletingFile = false; return; }
      this.requests.add(this.http.delete<any>(`/api/v1/services/${this.servicio!.id}/invoice`).subscribe({
        next: response => { this.deletingFile = false; if (response.success) { this.servicio!.facturaNombre = undefined; this.servicio!.facturaUrl = undefined; this.servicio!.facturaTamano = undefined; this.cerrarFactura(); Swal.fire({ icon: 'success', title: 'Archivo eliminado', timer: 1400, showConfirmButton: false }); } },
        error: err => { this.deletingFile = false; Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: err.error?.message || 'Intenta nuevamente.' }); }
      }));
    });
  }
  subirFacturas(event: Event): void {
    if (!this.servicio || !this.puedeGestionarArchivos || this.busy) return;
    const files = Array.from((event.target as HTMLInputElement).files || []);
    if (!files.length) return;
    const invalid = files.map(attachmentFileError).find(Boolean);
    if (invalid) { showAttachmentAlert(invalid); (event.target as HTMLInputElement).value = ''; return; }
    const form = new FormData(); files.forEach(file => form.append('files', file));
    this.subiendoFacturas = true;
    this.requests.add(this.http.post<any>(`/api/v1/services/${this.servicio.id}/attachments`, form).subscribe({
      next: res => { this.subiendoFacturas = false; if (res.data) this.servicio = res.data; (event.target as HTMLInputElement).value = ''; },
      error: err => { this.subiendoFacturas = false; Swal.fire({ icon: 'error', title: 'No se pudieron adjuntar los archivos', text: err.error?.message || 'Intenta nuevamente.' }); }
    }));
  }
  abrirAdjunto(adjunto: ServicioAdjunto): void {
    const previewable=isRasterAttachment(adjunto) || isPdfAttachment(adjunto);
    this.openPreview(previewable ? (adjunto.previewUrl || adjunto.downloadUrl) : adjunto.downloadUrl, adjunto.nombreOriginal, adjunto.mimeType);
  }
  eliminarAdjunto(adjunto: ServicioAdjunto): void {
    if (!this.servicio || !this.puedeGestionarArchivos || this.busy) return;
    this.deletingFile = true;
    Swal.fire({ icon: 'warning', title: '¿Eliminar archivo?', text: `Se quitará "${adjunto.nombreOriginal}" del servicio.`, showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b42318' }).then(result => {
      if (!result.isConfirmed || this.destroyed) { this.deletingFile = false; return; }
      this.requests.add(this.http.delete<any>(`/api/v1/services/${this.servicio!.id}/attachments/${adjunto.id}`).subscribe({
        next: response => { this.deletingFile = false; if (response.success) { this.servicio!.adjuntos = (this.servicio!.adjuntos || []).filter(item => item.id !== adjunto.id); this.cerrarFactura(); Swal.fire({ icon: 'success', title: 'Archivo eliminado', timer: 1400, showConfirmButton: false }); } },
        error: err => { this.deletingFile = false; Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: err.error?.message || 'Intenta nuevamente.' }); }
      }));
    });
  }
  formatoTamano(bytes: number): string { if (!bytes) return '0 KB'; const unidades = ['B', 'KB', 'MB', 'GB']; const indice = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1); return `${(bytes / Math.pow(1024, indice)).toFixed(indice ? 1 : 0)} ${unidades[indice]}`; }
  abrirFactura(): void {
    if (this.servicio?.facturaUrl) {
      const file={nombreOriginal:this.servicio.facturaNombre || 'Factura',mimeType:this.servicio.facturaMime};
      const source=(isRasterAttachment(file) || isPdfAttachment(file)) ? this.servicio.facturaUrl : this.servicio.facturaUrl + '/download';
      this.openPreview(source,file.nombreOriginal,file.mimeType);
    }
  }
  private openPreview(source: string, name: string, mime?: string): void {
    if (!source || this.destroyed) return;
    this.cerrarFactura();
    const version = this.previewVersion;
    this.facturaViewer = true; this.facturaViewerLoading = true; this.facturaViewerName = name;
    this.attachmentDialog?.nativeElement.showModal();
    this.previewRequest = this.http.get(source, { responseType: 'blob' }).subscribe({
      next: blob => {
        if (this.destroyed || version !== this.previewVersion) return;
        const file={nombreOriginal:name,mimeType:mime};
        const image=isRasterAttachment(file) && blob.type===mime;
        const pdf=isPdfAttachment(file) && blob.type===mime;
        // Nunca reinterpretar un HTML/SVG u octet-stream como un documento activo.
        const previewBlob=new Blob([blob],{type:(image || pdf) ? mime! : 'application/octet-stream'});
        this.facturaViewerUrl = URL.createObjectURL(previewBlob);
        this.facturaViewerSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.facturaViewerUrl);
        this.facturaViewerKind = image ? 'image' : pdf ? 'pdf' : 'file'; this.facturaViewerLoading = false;
      },
      error: err => {
        this.cerrarFactura();
        if (err.status === 404) showAttachmentAlert('El archivo no está disponible. Puede haber sido eliminado o movido del almacenamiento.', 'Archivo no disponible');
        else Swal.fire({ icon: 'error', title: 'No se pudo abrir el archivo adjunto' });
      }
    });
  }
  cerrarFactura(): void {
    this.previewVersion++;
    this.previewRequest?.unsubscribe();
    if (this.facturaViewerUrl) URL.revokeObjectURL(this.facturaViewerUrl);
    this.facturaViewer = false; this.facturaViewerLoading = false; this.facturaViewerUrl = ''; this.facturaViewerSafeUrl = null;
    this.attachmentDialog?.nativeElement.close();
  }
  closeOnBackdrop(event: MouseEvent): void { if (event.target === event.currentTarget) this.cerrarFactura(); }
  descargarFactura(): void { if (!this.facturaViewerUrl) return; const link = document.createElement('a'); link.href = this.facturaViewerUrl; link.download = this.facturaViewerName || 'factura'; link.click(); }
  ngOnDestroy(): void { this.destroyed = true; this.requests.unsubscribe(); this.cerrarFactura(); }
}
