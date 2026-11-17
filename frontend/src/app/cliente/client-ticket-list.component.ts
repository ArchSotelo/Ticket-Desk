import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { Ticket, TicketAttachment } from '../core/models/ticket.model';
import { AuthService } from '../core/services/auth.service';
import { showAttachmentAlert } from '../core/services/attachment-alert';
import { attachmentFileError, isRasterAttachment } from '../core/services/attachment-policy';
import { AttachmentService } from '../core/services/attachment.service';
import { FilterStateService } from '../core/services/filter-state.service';
import { TicketService } from '../core/services/ticket.service';
import { RichReplyEditorComponent } from '../shared/rich-text/rich-reply-editor.component';
import { TicketMessagePipe } from '../shared/rich-text/ticket-message-format.service';

// ============================================================
// Interfaces
// ============================================================

interface ConversationEntry {
  author: string;
  isClient: boolean;
  isTechnician: boolean;
  fechaCreacion: string;
  contenido: string;
  attachments: TicketAttachment[];
}

interface CatalogItem {
  id: number;
  nombre: string;
  descripcion?: string;
}

interface TicketFilters {
  busqueda: string;
  estadoSeleccionado: string;
  prioridadSeleccionada: string;
  categoriaSeleccionada: number | '';
  fechaDesde: string;
  fechaHasta: string;
  pageIndex: number;
  pageSize: number;
  filtersOpen: boolean;
}

// ============================================================
// Component
// ============================================================

@Component({
  selector: 'app-client-ticket-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatTableModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RichReplyEditorComponent,
    TicketMessagePipe
  ],
  templateUrl: './client-ticket-list.component.html',
  styleUrls: ['./client-ticket-list.component.scss', './client-ticket-list-redesign.component.scss']
})
export class ClientTicketListComponent implements OnInit, OnDestroy {
  // ============================================================
  // Tickets
  // ============================================================

  tickets: Ticket[] = [];

  displayedColumns: string[] = [
    'titulo',
    'prioridad',
    'estado',
    'fecha',
    'acciones'
  ];

  // ============================================================
  // Filtros
  // ============================================================

  busqueda = '';
  estadoSeleccionado = '';
  prioridadSeleccionada = '';
  categoriaSeleccionada: number | '' = '';
  fechaDesde = '';
  fechaHasta = '';

  categorias: CatalogItem[] = [];
  prioridades: CatalogItem[] = [];

  filtersOpen = false;
  readonly statusTabs = [
    { codigo: '', nombre: 'Todos' },
    { codigo: 'NUEVO', nombre: 'Nuevos' },
    { codigo: 'EN_PROCESO', nombre: 'En proceso' },
    { codigo: 'RESUELTO', nombre: 'Resueltos' },
    { codigo: 'CERRADO', nombre: 'Cerrados' }
  ];
  statusCounts: Record<string, number | null> = {};
  countsLoading = false;
  listError = '';
  filterError = '';
  private countsKey = '';
  private readonly destroy$ = new Subject<void>();
  private readonly listCancel$ = new Subject<void>();
  private readonly countsCancel$ = new Subject<void>();

  // ============================================================
  // Paginación
  // ============================================================

  pageIndex = 0;
  pageSize = 8;

  pageSizeOptions = [5, 8, 12, 20];

  totalElements = 0;
  totalPages = 0;

  // ============================================================
  // Estado general
  // ============================================================

  loadingTickets = false;
  loadingDetail = false;

  successMessage = '';
  errorMessage = '';

  // ============================================================
  // Ticket seleccionado
  // ============================================================

  showModal = false;
  ticketSeleccionado: Ticket | null = null;

  // ============================================================
  // Respuesta
  // ============================================================

  replyText = '';
  replyAttachments: File[] = [];
  replyDragging = false;
  replyComposerOpen = false;
  sendingReply = false;

  // ============================================================
  // Usuario
  // ============================================================

  currentUserId: number | null =
    this.authService.currentUserSignal()?.userId ?? null;

  // ============================================================
  // Previews de adjuntos
  // ============================================================

  private attachmentPreviewUrls =
    new Map<number, string>();

  // ============================================================
  // Constructor
  // ============================================================

  constructor(
    private ticketService: TicketService,
    private attachmentService: AttachmentService,
    private authService: AuthService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private filterState: FilterStateService
  ) {}

  // ============================================================
  // Lifecycle
  // ============================================================

  ngOnInit(): void {
    this.restaurarFiltros();
    this.cargarCatalogos();
    this.cargarTickets();
    this.procesarTicketDesdeQueryParams();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.listCancel$.complete();
    this.countsCancel$.complete();
    this.limpiarPreviewsAdjuntos();
  }

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
    this.persistirFiltros();
  }

  seleccionarEstado(codigo: string): void {
    if (this.loadingTickets) return;
    this.estadoSeleccionado = codigo;
    this.aplicarFiltros();
  }

  get hasActiveFilters(): boolean {
    return !!(this.busqueda.trim() || this.estadoSeleccionado || this.prioridadSeleccionada
      || this.categoriaSeleccionada !== '' || this.fechaDesde || this.fechaHasta);
  }

  priorityTone(nombre: string): string {
    const priority = (nombre || '').toUpperCase();
    return priority === 'BAJA' ? 'low' : priority === 'MEDIA' ? 'medium'
      : priority === 'ALTA' ? 'high' : priority.includes('CR') || priority === 'URGENTE' ? 'critical' : 'neutral';
  }

  statusTone(codigo: string): string {
    return ({ NUEVO: 'new', ASIGNADO: 'assigned', EN_PROCESO: 'progress',
      PENDIENTE_CLIENTE: 'waiting', RESUELTO: 'resolved', CERRADO: 'closed' } as Record<string, string>)[codigo] || 'neutral';
  }

  abrirCalendario(input: HTMLInputElement): void {
    input.focus();
    try { input.showPicker?.(); } catch { /* El campo nativo sigue siendo editable. */ }
  }

  private filtrosActuales() {
    return {
      estado: this.estadoSeleccionado || undefined,
      prioridad: this.prioridadSeleccionada || undefined,
      categoriaId: this.categoriaSeleccionada === '' ? undefined : Number(this.categoriaSeleccionada),
      fechaDesde: this.fechaDesde || undefined,
      fechaHasta: this.fechaHasta || undefined
    };
  }

  private cargarContadores(): void {
    const { estado, ...filtros } = this.filtrosActuales();
    const busqueda = this.busqueda.trim();
    const key = JSON.stringify({ busqueda, ...filtros });
    if (this.countsKey === key) return;
    this.countsCancel$.next();
    this.countsKey = key;
    this.countsLoading = true;
    this.statusCounts = {};
    // size=1 obtiene el total paginado real sin descargar todos los tickets.
    forkJoin(this.statusTabs.map(tab => this.ticketService.listarMisTickets(0, 1, busqueda,
      { ...filtros, estado: tab.codigo || undefined })))
      .pipe(takeUntil(this.countsCancel$), takeUntil(this.destroy$))
      .subscribe({
        next: responses => {
          this.statusTabs.forEach((tab, index) => {
            this.statusCounts[tab.codigo] = responses[index].success
              ? responses[index].data?.totalElements ?? null : null;
          });
          if (responses.some(response => !response.success)) this.countsKey = '';
          this.countsLoading = false;
        },
        error: () => {
          this.countsLoading = false;
          this.countsKey = '';
          this.statusCounts = {};
        }
      });
  }

  // ============================================================
  // Catálogos
  // ============================================================

  cargarCatalogos(): void {
    this.cargarCategorias();
    this.cargarPrioridades();
  }

  private cargarCategorias(): void {
    this.http
      .get<any>('/api/v1/catalogs/categories')
      .subscribe({
        next: response => {
          if (response.success) {
            this.categorias =
              response.data ?? [];
          }
        }
      });
  }

  private cargarPrioridades(): void {
    this.http
      .get<any>('/api/v1/catalogs/priorities')
      .subscribe({
        next: response => {
          if (response.success) {
            this.prioridades =
              response.data ?? [];
          }
        }
      });
  }

  // ============================================================
  // Tickets
  // ============================================================

  cargarTickets(
    page = this.pageIndex
  ): void {
    if (this.fechaDesde && this.fechaHasta && this.fechaDesde > this.fechaHasta) {
      this.filterError = 'La fecha desde no puede ser posterior a la fecha hasta.';
      this.filtersOpen = true;
      return;
    }
    this.filterError = '';
    this.persistirFiltros(page);
    this.listCancel$.next();
    this.loadingTickets = true;
    this.listError = '';
    this.cargarContadores();

    this.ticketService
      .listarMisTickets(
        page,
        this.pageSize,
        this.busqueda.trim(),
        {
          estado:
            this.estadoSeleccionado ||
            undefined,

          prioridad:
            this.prioridadSeleccionada ||
            undefined,

          categoriaId:
            this.categoriaSeleccionada === ''
              ? undefined
              : Number(
                  this.categoriaSeleccionada
                ),

          fechaDesde:
            this.fechaDesde || undefined,

          fechaHasta:
            this.fechaHasta || undefined
        }
      )
      .pipe(takeUntil(this.listCancel$), takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.loadingTickets = false;

          if (!response.success) {
            this.listError = response.message || 'No se pudieron cargar tus tickets.';
            this.tickets = [];
            this.totalElements = 0;
            this.totalPages = 0;
            return;
          }

          const pageData = response.data;

          this.tickets =
            pageData?.content ?? [];

          this.pageIndex =
            pageData?.number ?? page;

          this.pageSize =
            pageData?.size ?? this.pageSize;

          this.totalElements =
            pageData?.totalElements ??
            this.tickets.length;

          this.totalPages =
            pageData?.totalPages ?? 0;
        },

        error: () => {
          this.loadingTickets = false;
          this.listError = 'No se pudieron cargar tus tickets. Inténtalo de nuevo.';
          this.tickets = [];
          this.totalElements = 0;
          this.totalPages = 0;
        }
      });
  }

  buscarTickets(): void {
    this.pageIndex = 0;
    this.cargarTickets(0);
  }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    this.cargarTickets(0);
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.estadoSeleccionado = '';
    this.prioridadSeleccionada = '';
    this.categoriaSeleccionada = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.pageIndex = 0;

    this.filterState.clear(
      'client-tickets'
    );

    this.cargarTickets(0);
  }

  limpiarBusqueda(): void {
    if (!this.busqueda.trim()) {
      this.cargarTickets(0);
      return;
    }

    this.busqueda = '';
    this.cargarTickets(0);
  }

  // ============================================================
  // Persistencia de filtros
  // ============================================================

  private restaurarFiltros(): void {
    const defaults: TicketFilters = {
      busqueda: '',
      estadoSeleccionado: '',
      prioridadSeleccionada: '',
      categoriaSeleccionada: '',
      fechaDesde: '',
      fechaHasta: '',
      pageIndex: 0,
      pageSize: 8,
      filtersOpen: false
    };

    const filters =
      this.filterState.load(
        'client-tickets',
        defaults
      );

    Object.assign(this, filters);
  }

  private persistirFiltros(
    page = this.pageIndex
  ): void {
    this.filterState.save(
      'client-tickets',
      {
        busqueda: this.busqueda,
        estadoSeleccionado:
          this.estadoSeleccionado,
        prioridadSeleccionada:
          this.prioridadSeleccionada,
        categoriaSeleccionada:
          this.categoriaSeleccionada,
        fechaDesde: this.fechaDesde,
        fechaHasta: this.fechaHasta,
        pageIndex: page,
        pageSize: this.pageSize,
        filtersOpen: this.filtersOpen
      }
    );
  }

  // ============================================================
  // Paginación
  // ============================================================

  irAPagina(page: number): void {
    if (
      page < 0 ||
      page >= this.totalPages ||
      this.loadingTickets
    ) {
      return;
    }

    this.cargarTickets(page);
  }

  visiblePages(): number[] {
    if (!this.totalPages) {
      return [];
    }

    const maxButtons = 5;

    const start = Math.max(
      0,
      Math.min(
        this.totalPages - maxButtons,
        this.pageIndex - 2
      )
    );

    const end = Math.min(
      this.totalPages,
      start + maxButtons
    );

    return Array.from(
      { length: end - start },
      (_, index) =>
        start + index
    );
  }

  get firstItemIndex(): number {
    return this.totalElements
      ? this.pageIndex *
          this.pageSize +
          1
      : 0;
  }

  get lastItemIndex(): number {
    return this.totalElements
      ? Math.min(
          (this.pageIndex + 1) *
            this.pageSize,
          this.totalElements
        )
      : 0;
  }

  cambiarTamanoPagina(
    tamano: number
  ): void {
    const nuevoTamano =
      Number(tamano);

    if (
      !nuevoTamano ||
      nuevoTamano === this.pageSize
    ) {
      return;
    }

    this.pageSize = nuevoTamano;
    this.pageIndex = 0;

    this.cargarTickets(0);
  }

  // ============================================================
  // Query params
  // ============================================================

  private procesarTicketDesdeQueryParams(): void {
    const ticketIdParam =
      this.route.snapshot.queryParamMap
        .get('ticketId');

    if (!ticketIdParam) {
      return;
    }

    const ticketId =
      Number(ticketIdParam);

    if (Number.isNaN(ticketId)) {
      return;
    }

    this.router.navigate(
      ['/cliente/tickets', ticketId],
      {
        replaceUrl: true
      }
    );
  }

  // ============================================================
  // Modal de ticket
  // ============================================================

  abrirModal(ticketId: number): void {
    this.showModal = true;
    this.loadingDetail = true;

    this.clearMessages();

    this.replyText = '';
    this.replyComposerOpen = false;

    this.ticketService
      .obtenerPorId(ticketId)
      .subscribe({
        next: response => {
          this.loadingDetail = false;

          if (
            response.success &&
            response.data
          ) {
            this.ticketSeleccionado =
              response.data;

            this.cargarPreviewsAdjuntos(
              response.data
            );

            this.actualizarQueryParam(
              ticketId
            );

            return;
          }

          this.errorMessage =
            response.message ||
            'No se pudo cargar el ticket.';
        },

        error: error => {
          this.loadingDetail = false;

          this.errorMessage =
            error.error?.message ||
            'No se pudo cargar el ticket.';
        }
      });
  }

  cerrarModal(): void {
    this.showModal = false;
    this.ticketSeleccionado = null;

    this.replyText = '';
    this.replyAttachments = [];
    this.replyDragging = false;
    this.replyComposerOpen = false;

    this.clearMessages();
    this.limpiarPreviewsAdjuntos();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true
    });
  }

  private actualizarQueryParam(
    ticketId: number
  ): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ticketId },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  // ============================================================
  // Estado del ticket
  // ============================================================

  isTicketClosed(
    ticket: Ticket | null
  ): boolean {
    return ticket?.estadoCodigo === 'CERRADO';
  }

  // ============================================================
  // Conversación
  // ============================================================

  conversationEntries(
    ticket: Ticket | null
  ): ConversationEntry[] {
    if (!ticket) {
      return [];
    }

    const attachments =
      ticket.attachments ?? [];

    const conversation: ConversationEntry[] =
      [];

    (ticket.comentarios ?? [])
      .filter(
        comment => !comment.esInterno
      )
      .forEach(comment => {
        const isClient =
          comment.usuarioId ===
          this.currentUserId;

        conversation.push({
          author:
            comment.usuarioNombre ||
            (isClient
              ? 'Tú'
              : 'Técnico'),

          isClient,
          isTechnician: !isClient,

          fechaCreacion:
            comment.fechaCreacion,

          contenido:
            comment.contenido,

          attachments:
            attachments.filter(
              attachment =>
                attachment.comentarioId === comment.id
            )
        });
      });

    return conversation;
  }

  matchesAttachmentContent(
    comentario: string | undefined,
    contenido: string
  ): boolean {
    return (
      (comentario ?? '').trim() ===
      contenido.trim()
    );
  }

  // ============================================================
  // Adjuntos
  // ============================================================

  isImageAttachment(
    attachment: TicketAttachment
  ): boolean {
    return isRasterAttachment(attachment);
  }

  fileIcon(
    mimeType?: string
  ): string {
    if (!mimeType) {
      return 'description';
    }

    if (mimeType.includes('pdf')) {
      return 'picture_as_pdf';
    }

    if (
      mimeType.includes('word') ||
      mimeType.includes('document')
    ) {
      return 'description';
    }

    if (
      mimeType.includes('sheet') ||
      mimeType.includes('excel')
    ) {
      return 'table_chart';
    }

    if (
      mimeType.includes('zip') ||
      mimeType.includes('compressed')
    ) {
      return 'folder_zip';
    }

    if (mimeType.startsWith('text/')) {
      return 'article';
    }

    return 'description';
  }

  formatBytes(
    bytes?: number
  ): string {
    if (
      !bytes &&
      bytes !== 0
    ) {
      return '-';
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }

  attachmentDisplayUrl(
    attachment: TicketAttachment
  ): string {
    return (
      this.attachmentPreviewUrls.get(
        attachment.id
      ) ||
      attachment.previewUrl ||
      attachment.downloadUrl
    );
  }

  // ============================================================
  // Previews de imágenes
  // ============================================================

  private cargarPreviewsAdjuntos(
    ticket: Ticket
  ): void {
    this.limpiarPreviewsAdjuntos();

    const attachments =
      ticket.attachments ?? [];

    attachments
      .filter(attachment =>
        this.isImageAttachment(
          attachment
        )
      )
      .forEach(attachment => {
        const source =
          attachment.previewUrl ||
          attachment.downloadUrl;

        if (!source) {
          return;
        }

        this.attachmentService
          .obtenerArchivoBlob(source)
          .subscribe({
            next: blob => {
              const objectUrl =
                URL.createObjectURL(blob);

              const previous =
                this.attachmentPreviewUrls.get(
                  attachment.id
                );

              if (previous) {
                URL.revokeObjectURL(
                  previous
                );
              }

              this.attachmentPreviewUrls.set(
                attachment.id,
                objectUrl
              );
            }
          });
      });
  }

  private limpiarPreviewsAdjuntos(): void {
    this.attachmentPreviewUrls.forEach(
      url => URL.revokeObjectURL(url)
    );

    this.attachmentPreviewUrls.clear();
  }

  abrirAdjunto(
    attachment: TicketAttachment
  ): void {
    const url =
      this.isImageAttachment(attachment) ? (attachment.previewUrl || attachment.downloadUrl) : attachment.downloadUrl;

    if (!url) {
      return;
    }

    this.attachmentService
      .obtenerArchivoBlob(url)
      .subscribe({
        next: blob => {
          const objectUrl =
            URL.createObjectURL(blob);

          if (
            this.isImageAttachment(
              attachment
            )
          ) {
            this.abrirImagen(
              objectUrl
            );
          } else {
            this.descargarArchivo(
              objectUrl,
              attachment.nombreOriginal ||
                'adjunto'
            );
          }

          if (
            !this.isImageAttachment(
              attachment
            )
          ) {
            setTimeout(
              () =>
                URL.revokeObjectURL(
                  objectUrl
                ),
              4000
            );
          }
        },

        error: () => {
          this.errorMessage =
            'No se pudo abrir el adjunto.';
        }
      });
  }

  private abrirImagen(
    objectUrl: string
  ): void {
    const win = window.open(
      objectUrl,
      '_blank',
      'noopener,noreferrer'
    );

    if (win) {
      return;
    }

    const link =
      document.createElement('a');

    link.href = objectUrl;
    link.target = '_blank';
    link.rel =
      'noopener noreferrer';

    link.click();
  }

  private descargarArchivo(
    objectUrl: string,
    fileName: string
  ): void {
    const link =
      document.createElement('a');

    link.href = objectUrl;
    link.download = fileName;
    link.click();
  }

  // ============================================================
  // Archivos de respuesta
  // ============================================================

  onReplyFilesSelected(
    event: Event
  ): void {
    const input =
      event.target as HTMLInputElement;

    if (!input.files?.length) {
      return;
    }

    const files = Array.from(input.files);
    const invalid = files.map(attachmentFileError).find(Boolean);
    if (invalid) { showAttachmentAlert(invalid); input.value = ''; return; }
    this.replyAttachments = [...this.replyAttachments, ...files];

    input.value = '';
  }

  onReplyDragOver(
    event: DragEvent
  ): void {
    event.preventDefault();

    if (
      !this.isTicketClosed(
        this.ticketSeleccionado
      )
    ) {
      this.replyDragging = true;
    }
  }

  onReplyDragLeave(
    event: DragEvent
  ): void {
    event.preventDefault();
    this.replyDragging = false;
  }

  onReplyDrop(
    event: DragEvent
  ): void {
    event.preventDefault();
    this.replyDragging = false;

    if (
      this.isTicketClosed(
        this.ticketSeleccionado
      )
    ) {
      return;
    }

    if (
      event.dataTransfer?.files?.length
    ) {
      const files = Array.from(event.dataTransfer.files);
      const invalid = files.map(attachmentFileError).find(Boolean);
      if (invalid) { showAttachmentAlert(invalid); return; }
      this.replyAttachments = [...this.replyAttachments, ...files];
    }
  }

  removeReplyFile(
    index: number
  ): void {
    this.replyAttachments =
      this.replyAttachments.filter(
        (_, currentIndex) =>
          currentIndex !== index
      );
  }

  formatReplySize(
    bytes: number
  ): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }

  // ============================================================
  // Respuesta al ticket
  // ============================================================

  enviarRespuesta(): void {
    const replyContent =
      this.replyText.trim();

    if (
      !this.ticketSeleccionado ||
      !replyContent
    ) {
      return;
    }

    if (
      this.isTicketClosed(
        this.ticketSeleccionado
      )
    ) {
      this.errorMessage =
        'Este ticket ya está cerrado y no admite nuevos comentarios.';
      return;
    }

    this.sendingReply = true;
    this.clearMessages();

    this.ticketService
      .agregarComentario(
        this.ticketSeleccionado.id,
        replyContent,
        false
      )
      .subscribe({
        next: response => {
          this.sendingReply = false;

          if (
            response.success &&
            response.data
          ) {
            this.ticketSeleccionado =
              response.data;

            this.replyText = '';

            this.uploadReplyAttachments(
              this.ticketSeleccionado.id,
              response.data,
              replyContent
            );

            return;
          }

          this.errorMessage =
            response.message ||
            'No se pudo enviar la respuesta.';
        },

        error: error => {
          this.sendingReply = false;

          this.errorMessage =
            error.error?.message ||
            'No se pudo enviar la respuesta.';
        }
      });
  }

  // ============================================================
  // Adjuntos de la respuesta
  // ============================================================

  private uploadReplyAttachments(
    ticketId: number,
    updatedTicket: Ticket,
    comentario: string
  ): void {
    const files = [
      ...this.replyAttachments
    ];

    if (!files.length) {
      this.refrescarTicket(
        ticketId,
        updatedTicket,
        'Respuesta enviada correctamente.'
      );
      return;
    }

    if (!updatedTicket.comentarioCreadoId) {
      this.errorMessage = 'La respuesta se guardó, pero no se pudieron vincular los archivos. Actualiza el backend.';
      return;
    }

    let uploaded = 0;
    let hasError = false;

    const total = files.length;

    files.forEach(file => {
      this.attachmentService
        .subirAdjunto(
          ticketId,
          file,
          comentario,
          updatedTicket.comentarioCreadoId
        )
        .subscribe({
          next: () => {
            uploaded++;

            if (
              uploaded === total
            ) {
              this.finalizarCargaAdjuntos(
                ticketId,
                updatedTicket,
                total,
                hasError
              );
            }
          },

          error: () => {
            uploaded++;
            hasError = true;

            if (
              uploaded === total
            ) {
              this.finalizarCargaAdjuntos(
                ticketId,
                updatedTicket,
                total,
                hasError
              );
            }
          }
        });
    });
  }

  private finalizarCargaAdjuntos(
    ticketId: number,
    ticket: Ticket,
    total: number,
    hasError: boolean
  ): void {
    const message = hasError
      ? 'Respuesta enviada correctamente, pero algunos archivos no pudieron subirse.'
      : `Respuesta enviada correctamente y ${total} archivo(s) adjuntado(s).`;

    this.refrescarTicket(
      ticketId,
      ticket,
      message
    );
  }

  private refrescarTicket(
    ticketId: number,
    fallback: Ticket,
    mensaje: string
  ): void {
    this.replyAttachments = [];

    this.ticketService
      .obtenerPorId(ticketId)
      .subscribe({
        next: response => {
          this.ticketSeleccionado =
            response.success &&
            response.data
              ? response.data
              : fallback;

          if (
            response.success &&
            response.data
          ) {
            this.cargarPreviewsAdjuntos(
              response.data
            );
          }

          this.successMessage = mensaje;
          this.cargarTickets();
        },

        error: () => {
          this.ticketSeleccionado =
            fallback;

          this.cargarPreviewsAdjuntos(
            fallback
          );

          this.successMessage = mensaje;
          this.cargarTickets();
        }
      });
  }

  // ============================================================
  // Fechas
  // ============================================================

  formatDate(
    value?: string
  ): string {
    if (!value) {
      return '-';
    }

    return new Date(
      value
    ).toLocaleDateString(
      'es-PE',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }
    );
  }

  formatDateTime(
    value?: string
  ): string {
    if (!value) {
      return '-';
    }

    return new Date(
      value
    ).toLocaleString(
      'es-PE',
      {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }
    );
  }

  // ============================================================
  // Utilidades
  // ============================================================

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }
}
