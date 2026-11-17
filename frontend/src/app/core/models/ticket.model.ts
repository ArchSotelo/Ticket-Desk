export interface TicketAttachment {
  id: number;
  ticketId: number;
  nombreOriginal: string;
  comentario?: string;
  comentarioId?: number;
  extension: string;
  mimeType: string;
  tamanoBytes: number;
  proveedorAlmacenamiento: string;
  usuarioCreacionNombre: string;
  fechaCreacion: string;
  downloadUrl: string;
  previewUrl?: string;
}

export interface TicketComment {
  id: number;
  usuarioId: number;
  usuarioNombre: string;
  usuarioRol?: 'ADMIN' | 'TECNICO' | 'CLIENTE' | 'INTERNO' | 'OTRO';
  contenido: string;
  esInterno: boolean;
  fechaCreacion: string;
}

export interface TicketHistory {
  id: number;
  usuarioNombre: string;
  campoModificado: string;
  valorAnterior?: string;
  valorNuevo?: string;
  fechaCambio: string;
}

export interface Ticket {
  id: number;
  comentarioCreadoId?: number;
  codigo: string;
  titulo: string;
  descripcion: string;
  clienteId: number;
  clienteNombre: string;
  clienteEmail: string;
  tecnicoId?: number;
  tecnicoNombre?: string;
  empresaId: number;
  empresaNombre: string;
  areaId?: number;
  areaNombre?: string;
  categoriaId: number;
  categoriaNombre: string;
  subcategoriaId?: number;
  subcategoriaNombre?: string;
  prioridadId: number;
  prioridadNombre: string;
  prioridadColorHex: string;
  estadoId: number;
  estadoNombre: string;
  estadoCodigo: string;
  estadoColorHex: string;
  fechaCreacion: string;
  fechaModificacion?: string;
  fechaLimiteRespuesta?: string;
  fechaLimiteResolucion?: string;
  fechaResolucion?: string;
  cumplioSlaRespuesta?: boolean;
  cumplioSlaResolucion?: boolean;
  tiempoEstimadoMinutos: number;
  tiempoRegistradoMinutos: number;
  attachments: TicketAttachment[];
  comentarios?: TicketComment[];
  cantidadComentarios: number;
  historialCambios?: TicketHistory[];
}

/** Respuesta reducida usada para pintar tarjetas del tablero Kanban. */
export interface KanbanTicket {
  id: number;
  codigo: string;
  titulo: string;
  clienteNombre: string;
  tecnicoId?: number;
  tecnicoNombre?: string;
  prioridadNombre: string;
  estadoCodigo: string;
  cantidadAdjuntos: number;
}

export interface KanbanColumn {
  codigo: string;
  tickets: KanbanTicket[];
  total: number;
  pagina: number;
  tamano: number;
  hayMas: boolean;
}

export interface KanbanBoard {
  columnas: KanbanColumn[];
  prioridades: string[];
  tecnicos: { id: number; nombre: string }[];
}

export interface TicketCreateDTO {
  titulo: string;
  descripcion: string;
  clienteId?: number;
  empresaId: number;
  areaId?: number;
  categoriaId: number;
  subcategoriaId?: number;
  prioridadId: number;
  /** El servidor lo calcula a partir del SLA de la prioridad. */
  tiempoEstimadoMinutos?: number;
}

export interface DashboardStats {
  fechaDesde?: string;
  fechaHasta?: string;
  descripcionTendencia?: string;
  totalTickets: number;
  ticketsAbiertos: number;
  ticketsEnProceso: number;
  ticketsResueltos: number;
  ticketsCerrados: number;
  ticketsVencidosSla: number;
  porcentajeCumplimientoSla: number;
  ticketsPorEstado: { [key: string]: number };
  ticketsPorPrioridad: { [key: string]: number };
  fechasTendencia: string[];
  ticketsCreadosPorFecha: number[];
  ticketsResueltosPorFecha: number[];
  ticketsPorTecnico: { [key: string]: number };
  ticketsPorCategoria: { [key: string]: number };
  ticketsSlaCumplidos: number;
  ticketsSlaIncumplidos: number;
  ticketsSlaPendientes: number;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages?: number;
  number?: number;
  size?: number;
  first?: boolean;
  last?: boolean;
}
