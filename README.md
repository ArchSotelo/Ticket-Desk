# ServiceDesk Pro

Sistema de gestión de tickets con backend Spring Boot 4.1, frontend Angular y MySQL.
Incluye espacios de trabajo para cliente, técnico, supervisor y administrador, tablero
Kanban, archivos adjuntos, base de conocimiento, servicios, notificaciones, auditoría y
reportes.

## Requisitos

- Java 21 y Maven 3.9.x.
- Node.js 22.12 o posterior de la rama 22 y npm; también se admiten las versiones indicadas en `frontend/package.json`.
- MySQL 8.x (los scripts incluidos están preparados para MySQL 8).
- Docker Compose es una alternativa opcional, no un requisito para trabajar en local.

El repositorio mantiene `backend/`, `frontend/` y `database/` juntos. Cada aplicación
se ejecuta por separado. El backend usa una única configuración en
`backend/src/main/resources/application.yml`, sin selección de perfiles dev/prod.

## Ejecución local 

### 1. Preparar MySQL

Inicia MySQL y utiliza una base y un usuario propios para la aplicación. El usuario
debe tener permisos para crear y actualizar las tablas dentro de esa base.
Para crear la estructura incluida, en una base nueva:

```bash
mysql -u TU_USUARIO_ADMINISTRADOR -p < database/01_schema_mysql.sql
```

Este script crea la base `TicketDeskDB`. Si eliges otro nombre, ajusta sus instrucciones
`CREATE DATABASE` y `USE`. Para una base existente, respalda los datos antes de iniciar
la aplicación: Hibernate usa `ddl-auto: update` para sincronizar parte del esquema,
pero el proyecto todavía no cuenta con un sistema de migraciones versionadas.

### 2. Preparar el entorno privado

Desde la carpeta `backend`, si todavía no tienes un `.env`:

```bash
cp ../.env.example .env
chmod 600 .env
```

Completa `DB_USER`, `DB_PASSWORD`, `APP_JWT_SECRET` y las tres contraseñas
`APP_SEED_*` para el primer arranque de una base vacía. Ajusta el host y el puerto
si MySQL no está en `localhost:3306`. La plantilla incluye todas las variables que
referencia `application.yml`; algunas admiten un valor vacío cuando el servicio no se utiliza.

Genera una clave JWT privada con:

```bash
openssl rand -hex 32
```

Guarda el resultado únicamente en tu `.env`. Mantén la clave entre reinicios.
Cambiarla invalida los tokens de sesión anteriores.

No reemplaces un `.env` que ya tengas configurado. Mantén el archivo privado y no lo
compartas; contiene credenciales y claves de tu instalación.

### 3. Iniciar el backend

En una terminal, desde `backend`:

```bash
set -a
source ./.env
set +a
mvn spring-boot:run
```

Spring no lee `.env` automáticamente. Cada terminal nueva debe cargar las variables.
En IntelliJ IDEA, selecciona Java 21, usa `backend` como carpeta de trabajo, carga
`backend/.env` en la configuración de ejecución y deja vacío el campo Active profiles.
Si tu versión de IntelliJ no permite cargar un archivo, configura las variables en
Environment variables.

El backend escucha en `http://localhost:8080/api/v1`. El valor `BACKEND_PORT` de la
plantilla se usa solo con Docker; no modifica el puerto de la ejecución con Maven.

### 4. Iniciar el frontend

En otra terminal:

```bash
cd frontend
npm ci --legacy-peer-deps
npm start -- --port 4205
```

Abre `http://localhost:4205`. El proxy de Angular envía `/api/v1` al backend en el
puerto 8080. El frontend no necesita un `.env` con credenciales privadas.

### Cuentas iniciales y datos de ejemplo

Si no hay roles en la base, el backend inicializa datos de demostración y las cuentas
`admin`, `tecnico1` y `cliente1`, con las contraseñas privadas definidas en `APP_SEED_*`.
Estas variables no cambian las contraseñas de cuentas existentes. Se admiten contraseñas
de al menos 8 caracteres y como máximo 72 bytes UTF-8.

`database/02_seed_mysql.sql` carga datos iniciales de ejemplo de forma manual: exige
definir previamente, en la misma sesión SQL, `@SEED_ADMIN_PASSWORD_HASH`,
`@SEED_TECHNICIAN_PASSWORD_HASH` y `@SEED_CLIENT_PASSWORD_HASH` con hashes BCrypt de
contraseñas privadas. No lo combines con la inicialización automática del backend sobre
la misma base. Está pensado para una instalación nueva; no lo ejecutes repetidamente ni
sobre una base con datos reales.

### Adjuntos y correo

Con `APP_STORAGE_PROVIDER=LOCAL`, los adjuntos se guardan en `backend/uploads` si
inicias desde `backend` y mantienes `APP_STORAGE_LOCAL_UPLOAD_DIR=uploads`.
Con `MINIO`, configura endpoint, claves y bucket. Mantén los archivos subidos en el
almacenamiento configurado y fuera del código fuente.

Con `APP_MAIL_ENABLED=false`, no se envían notificaciones por correo. Para activarlas,
configura los campos SMTP según tu servidor. No guardes secretos en el frontend ni
en `application.yml`.

## Ejecución opcional con Docker Compose

Desde la raíz, copia `.env.example` a `.env` solo si no existe. Completa el secreto JWT,
las contraseñas iniciales, `MYSQL_ROOT_PASSWORD`, `MINIO_ROOT_USER` y `MINIO_ROOT_PASSWORD`.
Mantén `MYSQL_DATABASE=TicketDeskDB` si utilizas el esquema incluido sin modificarlo.

```bash
docker compose up -d --build
```

Por defecto: frontend `http://localhost:4200`, backend `http://localhost:8080/api/v1`,
MySQL publicado en `localhost:3307`, API MinIO en `localhost:9000` y consola MinIO en
`localhost:9001`. Compose carga `.env` desde la raíz, configura las conexiones internas
y monta únicamente el esquema SQL. El backend genera los datos iniciales.

Los volúmenes `mysql_data` y `minio_data` conservan los datos. Para detener sin borrarlos:

```bash
docker compose down
```

Este Compose de la raíz está pensado para desarrollo local: publica puertos de MySQL y
MinIO en el host. No lo expongas directamente en Internet.

Para un servidor, `docker/docker-compose.prod.yml` mantiene los servicios de datos en la
red interna y publica el frontend en `127.0.0.1`; requiere un proxy HTTPS externo. La
configuración y variables se describen en [`docker/README.md`](docker/README.md).

## Guía de uso

### Inicio de sesión y perfiles

Usa el nombre de usuario y la contraseña configurados para tu instalación. Una cuenta
nueva puede requerir cambio de contraseña en el primer ingreso. Una cuenta bloqueada por
intentos fallidos debe ser desbloqueada por un administrador.

El sistema tiene cuatro roles:

- **Cliente:** crea tickets, revisa sus solicitudes, conversa con soporte, adjunta
  evidencias y consulta la base de conocimiento en modo de lectura.
- **Técnico:** atiende tickets asignados, responde al cliente, adjunta archivos y cambia
  el estado según el avance. También puede consultar contactos y reportes si tiene esos
  permisos.
- **Supervisor:** organiza y asigna tickets, consulta contactos, reportes y auditoría.
  No administra usuarios ni la configuración global.
- **Administrador:** administra usuarios, roles, empresas, áreas, categorías, ajustes de
  seguridad, servicios y configuración general.

Las opciones disponibles dependen de los permisos de la cuenta. El backend valida los
permisos y la pertenencia de cada ticket; ocultar una opción en pantalla no concede ni
retira acceso por sí solo.

### Atender un ticket

1. Crea una solicitud con un título, una descripción y la clasificación disponible.
2. Abre el detalle para leer la conversación y revisar los archivos adjuntos.
3. Responde desde el editor de mensajes. El personal autorizado también puede usar una
   nota interna, visible solo para el equipo de soporte.
4. El técnico actualiza el estado y puede adjuntar evidencia a su respuesta.
5. El cliente revisa la respuesta y continúa la conversación desde el mismo ticket.

El tablero Kanban agrupa los casos en nuevos, en proceso, resueltos y cerrados. Sus
filtros permiten buscar por código, título, cliente, prioridad o técnico. La lista de
tickets ofrece una vista tabular y opciones de exportación.

### Base de conocimiento y reportes

La base de conocimiento permite buscar artículos por texto y categoría. Cada apertura
de un artículo incrementa su contador de vistas. Los clientes pueden consultar el
contenido publicado, pero no crear ni editar artículos.

En **Reportes** se consultan KPIs y gráficos de tickets por estado, prioridad, categoría,
técnico y resultado de SLA. Se puede elegir un periodo, exportar los gráficos como PNG,
preparar un informe PDF desde la ventana de impresión y descargar listados en Excel o
CSV.

### Seguridad y operación

La política inicial bloquea una cuenta tras cinco contraseñas incorrectas durante 15
minutos y limita el login a 30 solicitudes por minuto por dirección de conexión. El
administrador puede ajustar estos límites y desbloquear cuentas. Se permite una sesión
activa por cuenta; un nuevo inicio de sesión reemplaza la anterior. Cambiar la contraseña
invalida las sesiones existentes.

Swagger está disponible en `http://localhost:8080/api/v1/swagger-ui/index.html`; sus
operaciones requieren autenticación JWT. Desde una instalación expuesta en Internet,
utiliza HTTPS, limita CORS y el origen de WebSocket a los dominios autorizados y mantén
MySQL, MinIO y el backend en una red privada.
