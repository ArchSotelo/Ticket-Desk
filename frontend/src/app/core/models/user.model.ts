export interface UsuarioProfile {
  id: number;
  username: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono?: string;
  empresaId?: number;
  empresaNombre?: string;
  areaId?: number;
  areaNombre?: string;
  cargo?: string;
  estado?: string;
  requiereCambioPassword?: boolean;
  fechaUltimoAcceso?: string;
  fechaCreacion?: string;
  roles?: string[];
  permissions?: string[];
}

export interface UsuarioProfileUpdate {
  nombres: string;
  apellidos: string;
  email: string;
  telefono?: string;
  cargo?: string;
}
