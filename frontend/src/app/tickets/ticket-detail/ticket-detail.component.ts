import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TicketService } from '../../core/services/ticket.service';
import { showAttachmentAlert } from '../../core/services/attachment-alert';
import { attachmentFileError, isRasterAttachment, isPdfAttachment } from '../../core/services/attachment-policy';
import { AttachmentService } from '../../core/services/attachment.service';
import { AuthService } from '../../core/services/auth.service';
import { Ticket, TicketAttachment, TicketComment } from '../../core/models/ticket.model';
import { RealtimeService } from '../../core/services/realtime.service';
import { Subscription } from 'rxjs';
import { AttachmentModalDirective } from '../../shared/attachment-modal.directive';
import { RichReplyEditorComponent } from '../../shared/rich-text/rich-reply-editor.component';
import { TicketMessagePipe } from '../../shared/rich-text/ticket-message-format.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

interface TechnicianItem { id: number; username: string; nombres: string; apellidos: string; estado?: string; roles?: string[]; }
interface StateItem { codigo: string; nombre: string; }

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RichReplyEditorComponent, TicketMessagePipe, AttachmentModalDirective],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.scss', './unified-ticket-detail.component.scss']
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  ticket: Ticket | null = null;
  loading = true;
  sending = false;
  errorMessage = '';
  successMessage = '';
  responseOpen = false;
  response = '';
  responseMode: 'public' | 'internal' = 'public';
  responseFiles: File[] = [];
  pendingAttachmentCommentId: number | null = null;
  initialAttachments: TicketAttachment[] = [];
  messageAttachments = new Map<number, TicketAttachment[]>();
  technicians: TechnicianItem[] = [];
  selectedTechnicianId: number | null = null;
  mode: 'admin' | 'technician' | 'client' = 'client';
  activeTab: 'conversation' | 'attachments' | 'history' = 'conversation';
  states: StateItem[] = [];
  selectedStateCode = '';
  savingState = false;
  assigning = false;
  statesLoading = false;
  techniciansLoading = false;
  statesError = '';
  techniciansError = '';
  private attachmentViewerSubscription?: Subscription;
  private readonly requests = new Subscription();
  private previewUrls = new Map<number, string>();
  attachmentViewer: TicketAttachment | null = null;
  attachmentViewerUrl = '';
  attachmentViewerSafeUrl: SafeResourceUrl | null = null;
  attachmentViewerLoading = false;
  currentUserId: number | null = this.authService.currentUserSignal()?.userId ?? null;
  private realtimeSubscription?: Subscription;
  private detailRequest?: Subscription;
  private detailRequestVersion = 0;
  private deferredRealtimeReload = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketService: TicketService,
    private attachmentService: AttachmentService,
    private authService: AuthService,
    private http: HttpClient,
    private realtimeService: RealtimeService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    const role = this.route.snapshot.data['role'];
    this.mode = role === 'admin' ? 'admin' : role === 'technician' ? 'technician' : 'client';
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.goBack(); return; }
    this.loadTicket(id);
    if (this.currentUserId) {
      this.realtimeSubscription = this.realtimeService.events$.subscribe(event => {
        if (['ticket-comment', 'ticket-updated'].includes(event.type) && event.ticketId === id) {
          if (this.sending || this.savingState || this.assigning) this.deferredRealtimeReload = true;
          else this.loadTicket(id, true);
        }
      });
      this.realtimeService.connect(this.currentUserId, id);
    }
    if (this.mode === 'admin') this.loadTechnicians();
    if (this.mode !== 'client') this.loadStates();
  }

  ngOnDestroy(): void {
    this.realtimeSubscription?.unsubscribe();
    this.cancelDetailRead();
    this.requests.unsubscribe();
    this.closeAttachmentViewer();
    this.previewUrls.forEach(url => URL.revokeObjectURL(url));
    this.previewUrls.clear();
    if (this.currentUserId) this.realtimeService.connect(this.currentUserId);
  }

  get pageTitle(): string { return this.mode === 'admin' ? 'Detalle y gestión del ticket' : 'Detalle del ticket'; }
  get responseLabel(): string { return this.mode === 'client' ? 'Responder al técnico' : 'Responder al cliente'; }
  get attachmentComment(): string { return this.mode === 'client' ? 'Respuesta del cliente' : `Respuesta del ${this.mode === 'admin' ? 'administrador' : 'técnico'}`; }
  get canAssign(): boolean { return this.mode !== 'client' && this.authService.hasPermission('TICKET_ASSIGN'); }
  get canChangeState(): boolean { return this.mode !== 'client' && (!this.isClosed() || this.authService.hasRole('ROLE_ADMIN')); }
  get stateChanged(): boolean { return !!this.ticket && this.selectedStateCode !== this.ticket.estadoCodigo; }
  get roleLabel(): string { return this.mode === 'client' ? 'Cliente' : this.mode === 'technician' ? 'Técnico' : this.authService.hasRole('ROLE_SUPERVISOR') ? 'Supervisor' : 'Administrador'; }
  get hasCurrentStateOption(): boolean { return this.states.some(s => s.codigo === this.ticket?.estadoCodigo); }
  get hasCurrentTechnicianOption(): boolean { return this.technicians.some(t => t.id === this.ticket?.tecnicoId); }
  get technicianChanged(): boolean { return this.canAssign && this.selectedTechnicianId !== null && this.selectedTechnicianId !== (this.ticket?.tecnicoId ?? null); }
  get canSaveManagement(): boolean {
    if (!this.ticket || this.mode === 'client' || this.sending || this.savingState || this.assigning) return false;
    if (!this.stateChanged && !this.technicianChanged) return false;
    if (this.stateChanged && (!this.canChangeState || this.statesLoading || !!this.statesError || !this.states.some(s => s.codigo === this.selectedStateCode))) return false;
    return !this.technicianChanged || (!this.techniciansLoading && !this.techniciansError && this.technicians.some(t => t.id === this.selectedTechnicianId));
  }
  saveManagement(): void {
    if (!this.canSaveManagement) return;
    const target = this.selectedTechnicianId;
    const assign = this.technicianChanged;
    if (this.stateChanged) this.saveState(() => { if (assign && target !== null) this.onTechnicianChange(target, true); });
    else if (assign && target !== null) this.onTechnicianChange(target);
  }
  setResponseMode(mode: 'public' | 'internal'): void {
    if (this.sending || (mode === 'internal' && this.mode === 'client')) return;
    this.responseMode = mode;
  }
  get trackingStep(): number {
    return ['RESUELTO', 'CERRADO'].includes(this.ticket?.estadoCodigo || '') ? 2 : this.ticket?.estadoCodigo === 'NUEVO' ? 0 : 1;
  }
  get trackingMessage(): string {
    switch (this.ticket?.estadoCodigo) {
      case 'CANCELADO': return 'La solicitud fue cancelada.';
      case 'CERRADO': return 'La atención de tu solicitud ha finalizado.';
      case 'RESUELTO': return 'El equipo de soporte ha resuelto tu solicitud.';
      case 'PENDIENTE_CLIENTE': return 'El equipo necesita tu respuesta para continuar.';
      case 'NUEVO': return 'Recibimos tu solicitud. Pronto será atendida.';
      default: return 'El equipo de soporte está atendiendo tu solicitud.';
    }
  }
  private duration(minutes: number): string {
    const value = Math.max(0, Math.ceil(minutes));
    const days = Math.floor(value / 1440), hours = Math.floor((value % 1440) / 60), rest = value % 60;
    return [days ? `${days} d` : '', hours ? `${hours} h` : '', rest || (!days && !hours) ? `${rest} min` : ''].filter(Boolean).join(' ');
  }
  get sla(): { target: string; label: string; remaining: string; percent: number; tone: string } | null {
    const ticket = this.ticket;
    if (!ticket) return null;
    const due = Date.parse(ticket.fechaLimiteResolucion || '');
    const created = Date.parse(ticket.fechaCreacion || '');
    if (!Number.isFinite(due) || !Number.isFinite(created) || due <= created) return null;
    const total = ticket.tiempoEstimadoMinutos > 0 ? ticket.tiempoEstimadoMinutos : (due - created) / 60000;
    const finished = ['RESUELTO', 'CERRADO', 'CANCELADO'].includes(ticket.estadoCodigo);
    const end = finished ? Date.parse(ticket.fechaResolucion || ticket.fechaModificacion || '') : Date.now();
    const elapsed = Number.isFinite(end) ? end - created : 0;
    const remaining = Math.ceil((due - Date.now()) / 60000);
    const failed = finished ? ticket.cumplioSlaResolucion === false : remaining <= 0;
    return { target: this.duration(total), percent: Math.round(Math.max(0, Math.min(100, elapsed / (due - created) * 100))),
      label: ticket.estadoCodigo === 'CANCELADO' ? 'Cancelado' : finished ? failed ? 'Fuera del plazo' : ticket.cumplioSlaResolucion === true ? 'SLA cumplido' : 'Finalizado' : failed ? 'Plazo vencido' : 'Dentro del plazo',
      remaining: finished ? 'Atención finalizada' : remaining <= 0 ? `Vencido hace ${this.duration(-remaining)}` : `${this.duration(remaining)} restantes`,
      tone: ticket.estadoCodigo === 'CANCELADO' || (finished && ticket.cumplioSlaResolucion == null) ? 'neutral' : failed ? 'red' : 'green' };
  }
  selectTab(tab: 'conversation' | 'attachments' | 'history'): void { this.activeTab = tab; }
  onTabKeydown(event: KeyboardEvent): void {
    const tabs = ['conversation', 'attachments', 'history'] as const;
    let index = tabs.indexOf(this.activeTab);
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault();
    this.activeTab = tabs[index];
    document.getElementById(`staff-${this.activeTab}-tab`)?.focus();
  }
  trackComment(_index: number, comment: TicketComment): number { return comment.id; }
  trackAttachment(_index: number, file: TicketAttachment): number { return file.id; }

  initials(name?: string): string {
    return (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
  }
  commentAuthor(comment: TicketComment): string {
    return comment.usuarioNombre?.trim() || this.getCommentLabel(comment);
  }
  get statusTone(): string {
    return ({ NUEVO: 'cyan', ASIGNADO: 'violet', EN_PROCESO: 'blue', PENDIENTE_CLIENTE: 'amber', RESUELTO: 'green', CERRADO: 'neutral', CANCELADO: 'red' } as Record<string, string>)[this.ticket?.estadoCodigo || ''] || 'neutral';
  }
  get priorityTone(): string {
    const name = this.ticket?.prioridadNombre?.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
    return ({ baja: 'green', media: 'amber', alta: 'orange', critica: 'red' } as Record<string, string>)[name] || 'neutral';
  }
  retryLoad(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) this.loadTicket(id);
  }

  private cancelDetailRead(): void {
    this.detailRequestVersion++;
    this.detailRequest?.unsubscribe();
    this.detailRequest = undefined;
    this.loading = false;
  }

  private flushRealtimeReload(): void {
    if (!this.deferredRealtimeReload || !this.ticket || this.sending || this.savingState || this.assigning) return;
    this.deferredRealtimeReload = false;
    this.loadTicket(this.ticket.id, true);
  }

  private loadTicket(id: number, background = false): void {
    this.cancelDetailRead();
    const version = this.detailRequestVersion;
    this.loading = true;
    if (!background) this.errorMessage = '';
    this.detailRequest = this.ticketService.obtenerPorId(id).subscribe({
      next: res => {
        if (version !== this.detailRequestVersion) return;
        this.loading = false;
        if (res.success && res.data) {
          this.acceptTicket(res.data);
          this.loadPreviews(res.data);
        } else if (!background || !this.ticket) this.errorMessage = res.message || 'No se pudo cargar el ticket.';
      },
      error: err => {
        if (version !== this.detailRequestVersion) return;
        this.loading = false;
        if (!background || !this.ticket) this.errorMessage = err.error?.message || 'No se pudo cargar el ticket.';
      }
    });
  }

  private acceptTicket(ticket: Ticket): void {
    // Realtime refreshes must not erase an unsaved state selection or reply.
    if (!this.ticket || this.selectedStateCode === this.ticket.estadoCodigo) this.selectedStateCode = ticket.estadoCodigo || '';
    if (!this.ticket || this.selectedTechnicianId === (this.ticket.tecnicoId ?? null)) this.selectedTechnicianId = ticket.tecnicoId ?? null;
    this.ticket = { ...ticket, attachments: ticket.attachments ?? [],
      comentarios: (ticket.comentarios ?? []).filter(c => this.mode !== 'client' || !c.esInterno) };
    this.messageAttachments = new Map();
    for (const file of this.ticket.attachments) {
      if (file.comentarioId != null) {
        const group = this.messageAttachments.get(file.comentarioId) || [];
        group.push(file); this.messageAttachments.set(file.comentarioId, group);
      }
    }
    // Las respuestas antiguas no tienen relación verificable: se conservan en Adjuntos.
    this.initialAttachments = this.ticket.attachments.filter(file => file.comentarioId == null &&
      (!file.comentario?.trim() || file.comentario === ticket.descripcion));

  }

  loadStates(): void {
    if (this.mode === 'client' || this.statesLoading) return;
    this.statesLoading = true;
    this.statesError = '';
    this.requests.add(this.http.get<any>('/api/v1/catalogs/states').subscribe({
      next: res => {
        this.statesLoading = false;
        if (!res.success || !Array.isArray(res.data)) { this.statesError = 'No se pudieron cargar los estados.'; return; }
        this.states = res.data.filter((state: StateItem) => state.codigo && state.nombre);
        if (!this.states.length) this.statesError = 'No hay estados disponibles para seleccionar.';
      },
      error: () => { this.statesLoading = false; this.statesError = 'No se pudieron cargar los estados.'; }
    }));
  }

  loadTechnicians(): void {
    if (!this.canAssign || this.techniciansLoading) return;
    this.techniciansLoading = true;
    this.techniciansError = '';
    this.requests.add(this.http.get<any>('/api/v1/contacts?rol=ROLE_TECNICO&size=500').subscribe({
      next: res => {
        this.techniciansLoading = false;
        if (!res.success || !Array.isArray(res.data?.content)) { this.techniciansError = 'No se pudieron cargar los técnicos.'; return; }
        this.technicians = res.data.content.filter((u: TechnicianItem) => u.estado === 'ACTIVO' && u.roles?.includes('ROLE_TECNICO'));
      },
      error: () => { this.techniciansLoading = false; this.techniciansError = 'No se pudieron cargar los técnicos.'; }
    }));
  }

  saveState(afterSave?: () => void): void {
    if (!this.ticket || !this.canChangeState || !this.stateChanged || this.savingState || this.assigning || this.sending || this.statesLoading || !!this.statesError
        || !this.states.some(state => state.codigo === this.selectedStateCode)) return;
    this.cancelDetailRead();
    this.savingState = true;
    this.errorMessage = ''; this.successMessage = '';
    this.requests.add(this.ticketService.cambiarEstado(this.ticket.id, this.selectedStateCode).subscribe({
      next: res => {
        this.savingState = false;
        if (!res.success || !res.data) { this.errorMessage = res.message || 'No se pudo actualizar el estado.'; this.flushRealtimeReload(); return; }
        this.acceptTicket(res.data);
        this.selectedStateCode = res.data.estadoCodigo;
        this.successMessage = 'Estado actualizado correctamente.';
        afterSave?.();
        this.flushRealtimeReload();
      },
      error: err => { this.savingState = false; this.errorMessage = err.error?.message || 'No se pudo actualizar el estado.'; this.flushRealtimeReload(); }
    }));
  }

  goBack(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo && returnTo.startsWith('/')) {
      const params = { ...this.route.snapshot.queryParams };
      delete params['returnTo'];
      const query = new URLSearchParams(
        Object.entries(params).map(([key, value]) => [key, String(value)])
      ).toString();
      this.router.navigateByUrl(`${returnTo}${query ? `?${query}` : ''}`);
      return;
    }
    const target = this.mode === 'admin' ? '/tickets/list' : this.mode === 'technician' ? '/tecnico' : '/cliente/tickets';
    this.router.navigate([target]);
  }

  isClosed(): boolean { return this.ticket?.estadoCodigo === 'CERRADO'; }
  formatTechnician(tech: TechnicianItem): string { return `${tech.nombres ?? ''} ${tech.apellidos ?? ''}`.trim() || tech.username; }

  onTechnicianChange(id: number | null, stateAlreadySaved = false): void {
    if (!this.canAssign || !this.ticket || id === this.ticket.tecnicoId || this.assigning || this.savingState || this.sending) return;
    if (id === null) return;
    this.cancelDetailRead();
    this.assigning = true; this.errorMessage = ''; this.successMessage = '';
    this.requests.add(this.ticketService.asignarTecnico(this.ticket.id, id).subscribe({
      next: res => {
        this.assigning = false;
        if (res.success && res.data) {
          this.acceptTicket(res.data); this.selectedTechnicianId = res.data.tecnicoId ?? id;
          this.successMessage = stateAlreadySaved ? 'Cambios guardados correctamente.' : 'Técnico asignado correctamente.';
        } else { this.selectedTechnicianId = this.ticket?.tecnicoId ?? null; this.errorMessage = (stateAlreadySaved ? 'El estado se guardó, pero no se pudo reasignar. ' : '') + (res.message || 'No se pudo asignar el técnico.'); }
        this.flushRealtimeReload();
      },
      error: err => { this.assigning = false; this.selectedTechnicianId = this.ticket?.tecnicoId ?? null; this.errorMessage = (stateAlreadySaved ? 'El estado se guardó, pero no se pudo reasignar. ' : '') + (err.error?.message || 'No se pudo asignar el técnico.'); this.flushRealtimeReload(); }
    }));
  }

  sendResponse(): void {
    if (this.pendingAttachmentCommentId || !this.ticket || !this.response.trim() || this.isClosed() || this.sending || this.savingState || this.assigning) return;
    if (this.responseMode === 'internal' && (this.mode === 'client' || this.responseFiles.length)) {
      this.errorMessage = 'Las notas internas admiten texto. Envía los archivos en una respuesta al cliente.';
      return;
    }
    this.cancelDetailRead();
    this.sending = true;
    this.errorMessage = '';
    this.successMessage = '';
    const files = [...this.responseFiles];
    this.requests.add(this.ticketService.agregarComentario(this.ticket.id, this.response.trim(), this.responseMode === 'internal').subscribe({
      next: (res) => {
        if (!res.success || !res.data) { this.sending = false; this.errorMessage = res.message || 'No se pudo enviar la respuesta.'; this.flushRealtimeReload(); return; }
        this.acceptTicket(res.data);
        this.response = '';
        if (files.length && !res.data.comentarioCreadoId) {
          this.sending = false; this.errorMessage = 'La respuesta se guardó, pero el servidor no indicó su identificador. Actualiza el backend antes de adjuntar archivos.';
          this.flushRealtimeReload(); return;
        }
        this.pendingAttachmentCommentId = res.data.comentarioCreadoId ?? null;
        this.uploadFiles(res.data.id, files, res.data);
      },
      error: (err) => { this.sending = false; this.errorMessage = err.error?.message || 'No se pudo enviar la respuesta.'; this.flushRealtimeReload(); }
    }));
  }

  private uploadFiles(ticketId: number, files: File[], fallback: Ticket): void {
    if (!files.length) { this.finishResponse(fallback); return; }
    let done = 0;
    const failed: File[] = [];
    const markFileComplete = () => {
      if (++done === files.length) this.reloadAfterResponse(ticketId, fallback, failed);
    };
    files.forEach(file => this.requests.add(this.attachmentService.subirAdjunto(ticketId, file, this.attachmentComment, this.pendingAttachmentCommentId ?? undefined).subscribe({
      next: event => {
        if (event.type === HttpEventType.Response) markFileComplete();
      },
      error: () => { failed.push(file); markFileComplete(); }
    })));
  }

  private reloadAfterResponse(id: number, fallback: Ticket, failed: File[]): void {
    this.requests.add(this.ticketService.obtenerPorId(id).subscribe({ next: res => this.finishResponse(res.success && res.data ? res.data : fallback, failed), error: () => this.finishResponse(fallback, failed) }));
  }
  private finishResponse(ticket: Ticket, failed: File[] = []): void {
    this.acceptTicket(ticket); this.responseFiles = failed; this.sending = false;
    if (!failed.length) {
      this.pendingAttachmentCommentId = null;
      this.successMessage = this.responseMode === 'internal' ? 'Nota interna guardada correctamente.' : 'Respuesta enviada correctamente.';
    } else {
      this.successMessage = '';
      this.errorMessage = 'La respuesta se guardó, pero algunos archivos no se subieron. Puedes reintentar sin duplicar el mensaje.';
    }
    this.loadPreviews(ticket); this.flushRealtimeReload();
  }
  retryAttachments(): void {
    if (!this.ticket || !this.pendingAttachmentCommentId || this.sending || !this.responseFiles.length) return;
    this.cancelDetailRead(); this.sending = true; this.errorMessage = '';
    this.uploadFiles(this.ticket.id, [...this.responseFiles], this.ticket);
  }

  selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || this.isClosed() || this.sending || this.responseMode === 'internal') return;
    const files = Array.from(input.files);
    const invalid = files.map(attachmentFileError).find(Boolean);
    if (invalid) { showAttachmentAlert(invalid); input.value = ''; return; }
    this.responseFiles = [...this.responseFiles, ...files];
    input.value = '';
  }
  removeFile(index: number): void { if (!this.sending && !this.isClosed()) this.responseFiles = this.responseFiles.filter((_, i) => i !== index); if (!this.responseFiles.length) this.pendingAttachmentCommentId = null; }
  formatBytes(bytes: number): string { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
  formatDate(value?: string): string { return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
  formatDateTime(value?: string): string { return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }
  isImage(file: TicketAttachment): boolean { return isRasterAttachment(file); }
  isPdf(file: TicketAttachment | null): boolean { return isPdfAttachment(file); }
  icon(file: TicketAttachment): string { return file.mimeType?.includes('pdf') ? 'picture_as_pdf' : file.mimeType?.includes('sheet') ? 'table_chart' : 'description'; }
  preview(file: TicketAttachment): string { return this.previewUrls.get(file.id) || file.previewUrl || file.downloadUrl; }
  openAttachment(file: TicketAttachment): void {
    const source = (this.isImage(file) || this.isPdf(file)) ? (file.previewUrl || file.downloadUrl) : file.downloadUrl; if (!source) return;
    this.closeAttachmentViewer();
    this.attachmentViewer = file;
    this.attachmentViewerLoading = true;
    this.attachmentViewerSubscription = this.attachmentService.obtenerArchivoBlob(source).subscribe({
      next: blob => {
        this.attachmentViewerUrl = URL.createObjectURL(blob);
        this.attachmentViewerSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.attachmentViewerUrl);
        this.attachmentViewerLoading = false;
      },
      error: err => {
        this.closeAttachmentViewer();
        if (err.status === 404) showAttachmentAlert('El archivo no está disponible. Puede haber sido eliminado o movido del almacenamiento.', 'Archivo no disponible');
        else this.errorMessage = 'No se pudo abrir el archivo adjunto.';
      }
    });
  }
  closeAttachmentViewer(): void {
    this.attachmentViewerSubscription?.unsubscribe();
    if (this.attachmentViewerUrl) URL.revokeObjectURL(this.attachmentViewerUrl);
    this.attachmentViewerUrl = '';
    this.attachmentViewerSafeUrl = null;
    this.attachmentViewer = null;
    this.attachmentViewerLoading = false;
  }
  downloadAttachment(): void {
    if (!this.attachmentViewer || !this.attachmentViewerUrl) return;
    const link = document.createElement('a');
    link.href = this.attachmentViewerUrl;
    link.download = this.attachmentViewer.nombreOriginal || 'adjunto';
    link.click();
  }
  private loadPreviews(ticket: Ticket): void {
    (ticket.attachments ?? []).filter(a => this.isImage(a) && !this.previewUrls.has(a.id)).forEach(a => {
      const source = a.previewUrl || a.downloadUrl;
      if (source) this.requests.add(this.attachmentService.obtenerArchivoBlob(source).subscribe({
        next: blob => {
          const previous = this.previewUrls.get(a.id);
          if (previous) URL.revokeObjectURL(previous);
          this.previewUrls.set(a.id, URL.createObjectURL(blob));
        },
        error: () => { /* The file remains accessible from its preview button. */ }
      }));
    });
  }
  getCommentClass(comment: any): string {
    if (comment.esInterno) return 'thread-internal';
    if (comment.usuarioRol === 'ADMIN' || (this.mode === 'admin' && comment.usuarioId === this.currentUserId)) return 'thread-admin';
    if (comment.usuarioRol === 'TECNICO') return 'thread-tech';
    return this.ticket?.clienteId === comment.usuarioId ? 'thread-client' : 'thread-tech';
  }
  getCommentLabel(comment: any): string {
    if (comment.esInterno) return 'Nota interna';
    if (comment.usuarioRol === 'ADMIN' || (this.mode === 'admin' && comment.usuarioId === this.currentUserId)) return 'Administrador';
    if (comment.usuarioRol === 'TECNICO') return 'Técnico';
    return this.ticket?.clienteId === comment.usuarioId ? 'Cliente' : 'Técnico';
  }
}
