-- ============================================================================
-- SISTEMA DE GESTIÓN DE TICKETS EMPRESARIAL (TIPO JIRA)
-- Script de Datos Iniciales (Seed Data) para MySQL 8.x
-- ============================================================================

USE TicketDeskDB;

-- Política inicial de acceso; no modifica una política existente.
INSERT INTO politica_acceso
    (id, max_intentos, duracion_bloqueo_minutos, limite_login_por_minuto,
     actualizado_por, fecha_actualizacion, entity_version)
VALUES (1, 5, 15, 30, 'SISTEMA', CURRENT_TIMESTAMP, 0)
ON DUPLICATE KEY UPDATE id = VALUES(id);

-- 1. INSERTAR ROLES
INSERT INTO roles (nombre, descripcion, activo) VALUES
('ROLE_ADMIN', 'Administrador General del Sistema con acceso total', TRUE),
('ROLE_SUPERVISOR', 'Supervisor de Mesa de Ayuda y Gestión de SLA', TRUE),
('ROLE_TECNICO', 'Técnico Especialista asignado a resolver tickets', TRUE),
('ROLE_CLIENTE', 'Usuario Cliente que reporta incidencias', TRUE);

-- 2. INSERTAR PERMISOS BASE
INSERT INTO permisos (codigo, nombre, modulo, descripcion) VALUES
('TICKET_CREATE', 'Crear Tickets', 'TICKETS', 'Permite registrar nuevos tickets'),
('TICKET_READ', 'Ver Tickets', 'TICKETS', 'Permite consultar tickets'),
('TICKET_UPDATE', 'Modificar Tickets', 'TICKETS', 'Permite editar tickets existentes'),
('TICKET_DELETE', 'Eliminar Tickets', 'TICKETS', 'Permite borrar tickets'),
('TICKET_ASSIGN', 'Asignar Técnico', 'TICKETS', 'Permite reasignar técnicos'),
('USER_MANAGE', 'Gestionar Usuarios', 'USUARIOS', 'CRUD completo de usuarios y roles'),
('REPORT_VIEW', 'Ver Reportes', 'REPORTES', 'Acceso a tableros y descarga de reportes'),
('ATTACHMENT_UPLOAD', 'Subir Adjuntos', 'ADJUNTOS', 'Permite adjuntar evidencias a tickets'),
('ORGANIZATION_MANAGE', 'Gestionar empresas y áreas', 'ORGANIZACION', 'Administración de empresas y áreas'),
('CATEGORY_MANAGE', 'Gestionar categorías', 'CATALOGOS', 'Administración de categorías y subcategorías de tickets y servicios'),
('SERVICE_CONFIG_MANAGE', 'Gestionar ajustes globales', 'CONFIGURACION', 'Configuración de servicios y notificaciones'),
('AUDIT_VIEW', 'Consultar auditoría', 'AUDITORIA', 'Consulta de eventos globales de auditoría'),
('CONTACT_READ', 'Consultar contactos', 'CONTACTOS', 'Directorio de clientes y técnicos para soporte');

-- ASIGNAR POR NOMBRE/CÓDIGO: los identificadores no se presuponen.
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE (r.nombre = 'ROLE_ADMIN')
   OR (r.nombre = 'ROLE_SUPERVISOR' AND p.codigo IN
       ('TICKET_CREATE','TICKET_READ','TICKET_UPDATE','TICKET_ASSIGN','REPORT_VIEW','ATTACHMENT_UPLOAD','AUDIT_VIEW','CONTACT_READ'))
   OR (r.nombre = 'ROLE_TECNICO' AND p.codigo IN
       ('TICKET_CREATE','TICKET_READ','TICKET_UPDATE','REPORT_VIEW','ATTACHMENT_UPLOAD','CONTACT_READ'))
   OR (r.nombre = 'ROLE_CLIENTE' AND p.codigo IN ('TICKET_CREATE','TICKET_READ','ATTACHMENT_UPLOAD'));

-- CONFIGURACION INICIAL DE NOTIFICACIONES Y SERVICIOS
INSERT INTO configuracion_notificaciones
    (enabled, on_ticket_created, on_assigned, on_status_changed, on_reply, on_attachment, on_sla, email_subject, email_body,
     ticket_created_subject, ticket_created_body, assigned_subject, assigned_body, status_changed_subject, status_changed_body,
     reply_subject, reply_body, attachment_subject, attachment_body, sla_subject, sla_body)
VALUES
    (TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE,
     'Actualización de ticket {{ticket.codigo}} - {{ticket.titulo}}', 'Hola {{cliente.nombre}},\n\nEl ticket {{ticket.codigo}} ha sido actualizado.\n\n{{ticket.titulo}}\n\n{{mensaje}}',
     'Ticket creado: {{ticket.codigo}} - {{ticket.titulo}}', 'Hola {{cliente.nombre}},\n\nSe creó un nuevo ticket.\n\nCódigo: {{ticket.codigo}}\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}',
     'Ticket asignado: {{ticket.codigo}}', 'Hola,\n\nSe te asignó el ticket {{ticket.codigo}}.\n\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}',
     'Estado actualizado: {{ticket.codigo}}', 'Hola {{cliente.nombre}},\n\nEl estado de tu ticket cambió.\n\nCódigo: {{ticket.codigo}}\nTítulo: {{ticket.titulo}}\nEstado actual: {{mensaje}}',
     'Nueva respuesta: {{ticket.codigo}}', 'Hola {{cliente.nombre}},\n\nSe agregó una respuesta a tu ticket.\n\nCódigo: {{ticket.codigo}}\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}',
     'Nuevo archivo adjunto: {{ticket.codigo}}', 'Hola {{cliente.nombre}},\n\nSe agregó un archivo al ticket {{ticket.codigo}}.\n\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}',
     'Alerta SLA: {{ticket.codigo}}', 'Alerta de SLA.\n\nEl ticket {{ticket.codigo}} está próximo a vencer.\n\n{{mensaje}}');

INSERT INTO configuracion_servicios
    (dias_por_vencer, recordatorio_vencido, asunto_recordatorio, plantilla_recordatorio, asunto_por_vencer, plantilla_por_vencer, asunto_vencido, plantilla_vencido)
VALUES
    (5, TRUE,
     'Recordatorio de servicio: {{servicio.nombre}}',
     'Hola,\n\nEl servicio {{servicio.nombre}} vence el {{servicio.fechaFin}}.\nEstado: {{servicio.estado}}.\n\nPor favor, revisa su renovación.',
     'Recordatorio: servicio por vencer - {{servicio.nombre}}', 'Hola,\n\nEl servicio {{servicio.nombre}} vencerá el {{servicio.fechaFin}}.\nEstado: {{servicio.estado}}.\n\nPor favor, revisa su renovación.',
     'Servicio vencido: {{servicio.nombre}}', 'Hola,\n\nEl servicio {{servicio.nombre}} venció el {{servicio.fechaFin}}.\nEstado: {{servicio.estado}}.\n\nRevisa la renovación o regularización del servicio.');

INSERT INTO categorias_servicio (nombre, descripcion, icono, activa) VALUES
('Correo', 'Servicios de correo corporativo y mensajería.', 'mail', TRUE),
('Hosting', 'Alojamiento web y servidores administrados.', 'cloud', TRUE),
('Licencia', 'Licencias y suscripciones de software.', 'verified', TRUE),
('Dominio', 'Dominios y certificados asociados.', 'language', TRUE),
('Servidor', 'Servidores, infraestructura y servicios cloud.', 'dns', TRUE);

-- 3. INSERTAR EMPRESA Y AREA INICIAL
INSERT INTO empresas (razon_social, ruc, email, telefono, direccion, estado) VALUES
('Corporación Demo S.A.C.', '20123456789', 'contacto@demo.com', '+51 1 555-0100', 'Av. Principal 123, Lima', TRUE);

INSERT INTO areas (empresa_id, nombre, descripcion, activo) VALUES
(1, 'Tecnología de la Información (TI)', 'Infraestructura y soporte de software', TRUE),
(1, 'Recursos Humanos', 'Gestión de personal', TRUE),
(1, 'Operaciones', 'Atención operativa y logística', TRUE);

-- 4. INSERTAR USUARIOS INICIALES
-- Antes de ejecutar este archivo, establece en ESTA MISMA sesión SQL:
-- @SEED_ADMIN_PASSWORD_HASH, @SEED_TECHNICIAN_PASSWORD_HASH y @SEED_CLIENT_PASSWORD_HASH.
-- Usa hashes BCrypt generados con contraseñas privadas; no guardes los valores en Git.
-- Sin estas variables, password_hash NOT NULL impide crear las cuentas.
INSERT INTO usuarios (username, password_hash, nombres, apellidos, email, telefono, empresa_id, area_id, cargo, estado, requiere_cambio_password) VALUES
('admin', @SEED_ADMIN_PASSWORD_HASH, 'Administrador', 'General', 'admin@demo.com', '+51 999 888 777', 1, 1, 'Chief Information Officer', 'ACTIVO', FALSE),
('tecnico1', @SEED_TECHNICIAN_PASSWORD_HASH, 'Carlos', 'Mendoza', 'carlos.mendoza@demo.com', '+51 987 654 321', 1, 1, 'Soporte Senior TI', 'ACTIVO', FALSE),
('cliente1', @SEED_CLIENT_PASSWORD_HASH, 'Ana', 'Torres', 'ana.torres@cliente.com', '+51 912 345 678', 1, 2, 'Analista de RRHH', 'ACTIVO', FALSE);

-- VINCULAR USUARIOS Y ROLES
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u JOIN roles r
ON (u.username = 'admin' AND r.nombre = 'ROLE_ADMIN')
OR (u.username = 'tecnico1' AND r.nombre = 'ROLE_TECNICO')
OR (u.username = 'cliente1' AND r.nombre = 'ROLE_CLIENTE');

-- 5. INSERTAR PRIORIDADES
INSERT INTO prioridades (nombre, nivel, color_hex, tiempo_respuesta_hrs, tiempo_resolucion_hrs) VALUES
('Baja', 1, '#28A745', 24, 72),
('Media', 2, '#FFC107', 12, 48),
('Alta', 3, '#FD7E14', 4, 24),
('Crítica', 4, '#DC3545', 1, 4);

-- 6. INSERTAR ESTADOS DE WORKFLOW
INSERT INTO estados (nombre, codigo, color_hex, es_inicial, es_final, orden) VALUES
('Nuevo', 'NUEVO', '#17A2B8', TRUE, FALSE, 1),
('Asignado', 'ASIGNADO', '#6F42C1', FALSE, FALSE, 2),
('En Proceso', 'EN_PROCESO', '#007BFF', FALSE, FALSE, 3),
('Pendiente Cliente', 'PENDIENTE_CLIENTE', '#FFC107', FALSE, FALSE, 4),
('Resuelto', 'RESUELTO', '#28A745', FALSE, FALSE, 5),
('Cerrado', 'CERRADO', '#343A40', FALSE, TRUE, 6),
('Cancelado', 'CANCELADO', '#DC3545', FALSE, TRUE, 7);

-- 7. INSERTAR CATEGORIAS Y SUBCATEGORIAS
INSERT INTO categorias (nombre, descripcion, activa) VALUES
('Hardware & Equipos', 'Laptops, Monitores, Impresoras y Periféricos', TRUE),
('Software & Aplicaciones', 'Licencias, ERP, Correo y Herramientas', TRUE),
('Redes & Conectividad', 'VPN, Wi-Fi, Router y Servidores', TRUE),
('Accesos & Seguridad', 'Creación de cuentas, Reset de password y Permisos', TRUE);

INSERT INTO subcategorias (categoria_id, nombre, descripcion, activa) VALUES
(1, 'Falla de Pantalla / Monitor', 'Problemas de despliegue visual', TRUE),
(1, 'Teclado o Mouse averiado', 'Fallo físico de periférico', TRUE),
(2, 'Error en Sistema ERP', 'Falla de ejecución o reporte', TRUE),
(2, 'Configuración de Correo', 'Problemas en Outlook / Webmail', TRUE),
(3, 'Falla de VPN', 'No se logra conectar a la red corporativa', TRUE),
(4, 'Restablecimiento de Contraseña', 'Olvido o bloqueo de clave', TRUE);

-- 8. INSERTAR REGLAS DE SLA
INSERT INTO sla (nombre, prioridad_id, tiempo_respuesta_minutos, tiempo_resolucion_minutos, horario_atencion, activo) VALUES
('SLA Estándar Baja', 1, 1440, 4320, '24x7', TRUE),
('SLA Estándar Media', 2, 720, 2880, '24x7', TRUE),
('SLA Urgente Alta', 3, 240, 1440, '24x7', TRUE),
('SLA Crítico VIP', 4, 60, 240, '24x7', TRUE);

-- 9. TICKETS DE PRUEBA
-- Estos códigos identifican datos de ejemplo. Los tickets creados por la aplicación
-- usan el ID AUTO_INCREMENT de `tickets`, asignado de forma atómica por MySQL.
INSERT INTO tickets (codigo, titulo, descripcion, cliente_id, tecnico_id, empresa_id, area_id, categoria_id, subcategoria_id, prioridad_id, estado_id, sla_id, fecha_limite_respuesta, fecha_limite_resolucion) VALUES
('TICK-2026-0001', 'No puedo conectar la VPN desde mi domicilio', 'Al ingresar las credenciales en la VPN corporativa aparece error de tiempo de espera agotado.', 3, 2, 1, 2, 3, 5, 3, 3, 3, DATE_ADD(NOW(), INTERVAL 4 HOUR), DATE_ADD(NOW(), INTERVAL 24 HOUR)),
('TICK-2026-0002', 'Pantalla azul recurrente en Laptop HP ProBook', 'La laptop se reinicia inesperadamente mostrando pantalla azul de error en el driver gráfico.', 3, 2, 1, 2, 1, 1, 2, 1, 2, DATE_ADD(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 48 HOUR));

-- No se insertan artículos de ejemplo: `articulos_kb.vistas` ya queda inicializado
-- en cero por el DEFAULT del esquema y cada apertura se suma con una operación atómica.
