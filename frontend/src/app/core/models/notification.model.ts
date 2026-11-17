export interface Notificacion {
  id: number;
  titulo: string;
  mensaje: string;
  leido: boolean;
  tipo: string;
  urlDestino?: string;
  fechaCreacion: string;
}
