-- ============================================================================
-- SISTEMA DE GESTIÓN DE TICKETS EMPRESARIAL (TIPO JIRA)
-- Script de Creación de Esquema DDL para MySQL 8.x (InnoDB / utf8mb4)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS TicketDeskDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE TicketDeskDB;

-- 1. TABLA ROLES
CREATE TABLE IF NOT EXISTS roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255) NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. TABLA PERMISOS
CREATE TABLE IF NOT EXISTS permisos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(100) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. TABLA ROLES_PERMISOS
CREATE TABLE IF NOT EXISTS roles_permisos (
    rol_id BIGINT NOT NULL,
    permiso_id BIGINT NOT NULL,
    PRIMARY KEY (rol_id, permiso_id),
    CONSTRAINT FK_roles_permisos_rol FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_roles_permisos_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. TABLA EMPRESAS
CREATE TABLE IF NOT EXISTS empresas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    razon_social VARCHAR(150) NOT NULL,
    ruc VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(100) NULL,
    telefono VARCHAR(30) NULL,
    direccion VARCHAR(255) NULL,
    estado BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. TABLA AREAS
CREATE TABLE IF NOT EXISTS areas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id BIGINT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT FK_areas_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. TABLA USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    telefono VARCHAR(30) NULL,
    empresa_id BIGINT NULL,
    area_id BIGINT NULL,
    cargo VARCHAR(100) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    requiere_cambio_password BOOLEAN NOT NULL DEFAULT FALSE,
    intentos_fallidos INT NOT NULL DEFAULT 0,
    bloqueado_hasta DATETIME NULL,
    version_sesion BIGINT NOT NULL DEFAULT 0,
    fecha_ultimo_acceso DATETIME NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion DATETIME NULL,
    CONSTRAINT FK_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    CONSTRAINT FK_usuarios_area FOREIGN KEY (area_id) REFERENCES areas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. TABLA USUARIOS_ROLES
CREATE TABLE IF NOT EXISTS usuarios_roles (
    usuario_id BIGINT NOT NULL,
    rol_id BIGINT NOT NULL,
    PRIMARY KEY (usuario_id, rol_id),
    CONSTRAINT FK_usuarios_roles_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT FK_usuarios_roles_rol FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. TABLA REFRESH_TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE, -- SHA-256 del refresh token; no guardar el valor enviado al navegador.
    version_sesion BIGINT NOT NULL DEFAULT 0,
    fecha_expiracion DATETIME NOT NULL,
    revocado BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_refresh_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. TABLA CATEGORIAS
CREATE TABLE IF NOT EXISTS categorias (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255) NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. TABLA SUBCATEGORIAS
CREATE TABLE IF NOT EXISTS subcategorias (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    categoria_id BIGINT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT FK_subcategorias_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. TABLA PRIORIDADES
CREATE TABLE IF NOT EXISTS prioridades (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    nivel INT NOT NULL UNIQUE,
    color_hex VARCHAR(10) NOT NULL DEFAULT '#007BFF',
    tiempo_respuesta_hrs INT NOT NULL DEFAULT 24,
    tiempo_resolucion_hrs INT NOT NULL DEFAULT 48
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. TABLA ESTADOS
CREATE TABLE IF NOT EXISTS estados (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    color_hex VARCHAR(10) NOT NULL DEFAULT '#6C757D',
    es_inicial BOOLEAN NOT NULL DEFAULT FALSE,
    es_final BOOLEAN NOT NULL DEFAULT FALSE,
    orden INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. TABLA SLA
CREATE TABLE IF NOT EXISTS sla (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    prioridad_id BIGINT NOT NULL,
    tiempo_respuesta_minutos INT NOT NULL,
    tiempo_resolucion_minutos INT NOT NULL,
    horario_atencion VARCHAR(100) NOT NULL DEFAULT '24x7',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT FK_sla_prioridad FOREIGN KEY (prioridad_id) REFERENCES prioridades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. TABLA TICKETS
-- `id` es AUTO_INCREMENT y proporciona el número único usado por la aplicación
-- para formar TICK-año-ID. No se necesita una tabla de secuencias adicional.
CREATE TABLE IF NOT EXISTS tickets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    idempotency_key VARCHAR(64) NULL,
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    cliente_id BIGINT NOT NULL,
    tecnico_id BIGINT NULL,
    empresa_id BIGINT NOT NULL,
    area_id BIGINT NULL,
    categoria_id BIGINT NOT NULL,
    subcategoria_id BIGINT NULL,
    prioridad_id BIGINT NOT NULL,
    estado_id BIGINT NOT NULL,
    sla_id BIGINT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion DATETIME NULL,
    fecha_limite_respuesta DATETIME NULL,
    fecha_limite_resolucion DATETIME NULL,
    fecha_primer_respuesta DATETIME NULL,
    fecha_resolucion DATETIME NULL,
    fecha_cierre DATETIME NULL,
    cumplio_sla_respuesta BOOLEAN NULL,
    cumplio_sla_resolucion BOOLEAN NULL,
    tiempo_estimado_minutos INT NULL DEFAULT 0,
    tiempo_registrado_minutos INT NULL DEFAULT 0,
    CONSTRAINT FK_tickets_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios(id),
    CONSTRAINT FK_tickets_tecnico FOREIGN KEY (tecnico_id) REFERENCES usuarios(id),
    CONSTRAINT FK_tickets_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    CONSTRAINT FK_tickets_area FOREIGN KEY (area_id) REFERENCES areas(id),
    CONSTRAINT FK_tickets_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
    CONSTRAINT FK_tickets_subcategoria FOREIGN KEY (subcategoria_id) REFERENCES subcategorias(id),
    CONSTRAINT FK_tickets_prioridad FOREIGN KEY (prioridad_id) REFERENCES prioridades(id),
    CONSTRAINT FK_tickets_estado FOREIGN KEY (estado_id) REFERENCES estados(id),
    CONSTRAINT FK_tickets_sla FOREIGN KEY (sla_id) REFERENCES sla(id),
    CONSTRAINT uk_tickets_idempotency_key UNIQUE (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. TABLA COMENTARIOS
CREATE TABLE IF NOT EXISTS comentarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    contenido TEXT NOT NULL,
    es_interno BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_comentarios_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT FK_comentarios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. TABLA TICKET_ATTACHMENT
CREATE TABLE IF NOT EXISTS ticket_attachment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    comentario_id BIGINT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    nombre_fisico VARCHAR(255) NOT NULL,
    extension VARCHAR(20) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    tamano_bytes BIGINT NOT NULL,
    ruta VARCHAR(500) NOT NULL,
    proveedor_almacenamiento VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
    hash_sha256 VARCHAR(64) NULL,
    comentario TEXT NULL,
    usuario_creacion BIGINT NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT FK_attachment_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT FK_attachment_comentario FOREIGN KEY (comentario_id) REFERENCES comentarios(id),
    CONSTRAINT FK_attachment_usuario FOREIGN KEY (usuario_creacion) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. TABLA HISTORIAL
CREATE TABLE IF NOT EXISTS historial (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    campo_modificado VARCHAR(100) NOT NULL,
    valor_anterior TEXT NULL,
    valor_nuevo TEXT NULL,
    fecha_cambio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_historial_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT FK_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. TABLA ARTICULOS_KB
-- `vistas` inicia en cero. La aplicación lo incrementa con una operación SQL
-- atómica (vistas = vistas + 1), por lo que no requiere tabla ni columna adicional.
CREATE TABLE IF NOT EXISTS articulos_kb (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    contenido_markdown LONGTEXT NOT NULL,
    categoria_id BIGINT NOT NULL,
    autor_id BIGINT NOT NULL,
    vistas INT NOT NULL DEFAULT 0,
    es_publico BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion DATETIME NULL,
    CONSTRAINT FK_kb_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
    CONSTRAINT FK_kb_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. TABLA NOTIFICACIONES
CREATE TABLE IF NOT EXISTS notificaciones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    mensaje VARCHAR(500) NOT NULL,
    leido BOOLEAN NOT NULL DEFAULT FALSE,
    tipo VARCHAR(50) NOT NULL DEFAULT 'INFO',
    url_destino VARCHAR(255) NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_notificaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. TABLA AUDITORIA
CREATE TABLE IF NOT EXISTS auditoria (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT NULL,
    ip_origen VARCHAR(50) NULL,
    user_agent VARCHAR(255) NULL,
    accion VARCHAR(100) NOT NULL,
    modulo VARCHAR(100) NOT NULL,
    detalle TEXT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- INDICES
CREATE INDEX IX_tickets_cliente_id ON tickets(cliente_id);
CREATE INDEX IX_tickets_tecnico_id ON tickets(tecnico_id);
CREATE INDEX IX_tickets_estado_id ON tickets(estado_id);
CREATE INDEX IX_tickets_codigo ON tickets(codigo);
CREATE INDEX IX_ticket_attachment_ticket_id ON ticket_attachment(ticket_id);
CREATE INDEX IX_auditoria_fecha ON auditoria(fecha_registro);

-- 21. TABLA CONFIGURACION_NOTIFICACIONES
CREATE TABLE IF NOT EXISTS configuracion_notificaciones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    on_ticket_created BOOLEAN NOT NULL DEFAULT TRUE,
    on_assigned BOOLEAN NOT NULL DEFAULT TRUE,
    on_status_changed BOOLEAN NOT NULL DEFAULT TRUE,
    on_reply BOOLEAN NOT NULL DEFAULT TRUE,
    on_attachment BOOLEAN NOT NULL DEFAULT FALSE,
    on_sla BOOLEAN NOT NULL DEFAULT TRUE,
    email_subject VARCHAR(255) NOT NULL,
    email_body TEXT NOT NULL,
    ticket_created_subject VARCHAR(255) NOT NULL DEFAULT 'Ticket creado: {{ticket.codigo}} - {{ticket.titulo}}',
    ticket_created_body TEXT NOT NULL,
    assigned_subject VARCHAR(255) NOT NULL DEFAULT 'Ticket asignado: {{ticket.codigo}}',
    assigned_body TEXT NOT NULL,
    status_changed_subject VARCHAR(255) NOT NULL DEFAULT 'Estado actualizado: {{ticket.codigo}}',
    status_changed_body TEXT NOT NULL,
    reply_subject VARCHAR(255) NOT NULL DEFAULT 'Nueva respuesta: {{ticket.codigo}}',
    reply_body TEXT NOT NULL,
    attachment_subject VARCHAR(255) NOT NULL DEFAULT 'Nuevo archivo adjunto: {{ticket.codigo}}',
    attachment_body TEXT NOT NULL,
    sla_subject VARCHAR(255) NOT NULL DEFAULT 'Alerta SLA: {{ticket.codigo}}',
    sla_body TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. TABLA CATEGORIAS_SERVICIO
CREATE TABLE IF NOT EXISTS categorias_servicio (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255) NULL,
    icono VARCHAR(60) NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 23. TABLA CONFIGURACION_SERVICIOS
CREATE TABLE IF NOT EXISTS configuracion_servicios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    dias_por_vencer INT NOT NULL DEFAULT 5,
    recordatorio_vencido BOOLEAN NOT NULL DEFAULT TRUE,
    asunto_recordatorio VARCHAR(255) NOT NULL,
    plantilla_recordatorio TEXT NOT NULL,
    asunto_por_vencer VARCHAR(255) NOT NULL DEFAULT 'Recordatorio: servicio por vencer - {{servicio.nombre}}',
    plantilla_por_vencer TEXT NOT NULL,
    asunto_vencido VARCHAR(255) NOT NULL DEFAULT 'Servicio vencido: {{servicio.nombre}}',
    plantilla_vencido TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 24. TABLA SERVICIOS
CREATE TABLE IF NOT EXISTS servicios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    proveedor VARCHAR(200) NOT NULL,
    tipo VARCHAR(80) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    costo_mensual DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    divisa VARCHAR(3) NOT NULL DEFAULT 'PEN',
    servicio_anterior_id BIGINT NULL,
    factura_nombre VARCHAR(255) NULL,
    factura_ruta VARCHAR(500) NULL,
    factura_mime VARCHAR(100) NULL,
    factura_tamano BIGINT NULL,
    alerta_proxima_enviada BOOLEAN NOT NULL DEFAULT FALSE,
    alerta_vencida_enviada BOOLEAN NOT NULL DEFAULT FALSE,
    responsable VARCHAR(150) NULL,
    notas TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion DATETIME NULL,
    observacion_cancelacion TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IX_servicios_estado ON servicios(estado);
CREATE INDEX IX_servicios_fecha_fin ON servicios(fecha_fin);
CREATE INDEX IX_servicios_anterior_id ON servicios(servicio_anterior_id);

-- 25. TABLA SERVICIO_RECORDATORIOS
CREATE TABLE IF NOT EXISTS servicio_recordatorios (
    servicio_id BIGINT NOT NULL,
    correo VARCHAR(254) NOT NULL,
    PRIMARY KEY (servicio_id, correo),
    CONSTRAINT FK_servicio_recordatorios_servicio
        FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 26. TABLA SERVICIO_ADJUNTO
CREATE TABLE IF NOT EXISTS servicio_adjunto (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    servicio_id BIGINT NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    nombre_fisico VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    tamano_bytes BIGINT NOT NULL,
    ruta VARCHAR(500) NOT NULL,
    proveedor_almacenamiento VARCHAR(50) NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT FK_servicio_adjunto_servicio
        FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IX_servicio_adjunto_servicio_id ON servicio_adjunto(servicio_id);

-- 27. POLÍTICA DE BLOQUEO Y LÍMITE DE INICIO DE SESIÓN
CREATE TABLE IF NOT EXISTS politica_acceso (
    id INT NOT NULL PRIMARY KEY,
    max_intentos INT NOT NULL,
    duracion_bloqueo_minutos INT NOT NULL,
    limite_login_por_minuto INT NOT NULL,
    actualizado_por VARCHAR(50) NOT NULL,
    fecha_actualizacion DATETIME NOT NULL,
    entity_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_politica_acceso_id CHECK (id = 1),
    CONSTRAINT chk_politica_acceso_intentos CHECK (max_intentos BETWEEN 3 AND 20),
    CONSTRAINT chk_politica_acceso_duracion CHECK (duracion_bloqueo_minutos BETWEEN 1 AND 1440),
    CONSTRAINT chk_politica_acceso_ip CHECK (limite_login_por_minuto BETWEEN 5 AND 300)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
