export interface Empresa {
  id: number;
  razonSocial: string;
  ruc: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  estado: boolean;
  fechaCreacion?: string;
}

export interface EmpresaPayload {
  razonSocial: string;
  ruc: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  estado?: boolean;
}

export interface Area {
  id: number;
  empresaId: number;
  empresaNombre?: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

export interface AreaPayload {
  empresaId: number;
  nombre: string;
  descripcion?: string;
  activo?: boolean;
}

export interface Categoria {
  id: number;
  nombre: string;
  descripcion?: string;
  activa: boolean;
}

export interface CategoriaPayload {
  nombre: string;
  descripcion?: string;
  activa?: boolean;
}

export interface Subcategoria {
  id: number;
  categoriaId: number;
  categoriaNombre?: string;
  nombre: string;
  descripcion?: string;
  activa: boolean;
}

export interface SubcategoriaPayload {
  categoriaId: number;
  nombre: string;
  descripcion?: string;
  activa?: boolean;
}
