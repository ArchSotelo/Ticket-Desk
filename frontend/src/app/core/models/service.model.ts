export interface Servicio {
  id: number;
  nombre: string;
  proveedor: string;
  tipo: string;
  categoriaServicioId?: number;
  categoriaServicioNombre?: string;
  estado: 'ACTIVO' | 'POR_VENCER' | 'INACTIVO' | 'VENCIDO' | 'CANCELADO' | 'FINALIZADO';
  fechaInicio: string;
  fechaFin: string;
  costoMensual: number;
  divisa: string;
  responsable?: string;
  notas?: string;
  observacionCancelacion?: string;
  correosRecordatorio: string[];
  servicioAnteriorId?: number;
  facturaNombre?: string;
  facturaMime?: string;
  facturaUrl?: string;
  facturaTamano?: number;
  adjuntos?: ServicioAdjunto[];
}

export interface ServicioAdjunto {
  id: number;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: number;
  fechaCreacion: string;
  downloadUrl: string;
  previewUrl?: string;
}

export interface CategoriaServicio {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  activa: boolean;
}

export interface ServicioPage {
  content: Servicio[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  totalCostoMensual: number;
  totalesPorDivisa: { [divisa: string]: number };
}
