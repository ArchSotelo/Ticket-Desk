# Despliegue con Docker

Esta carpeta contiene una plantilla para desplegar TicketDesk en un servidor Linux con Docker Compose. La plantilla está separada del `docker-compose.yml` de la raíz, que publica todos los puertos y sirve mejor para desarrollo local.

## Qué incluye

- `docker-compose.prod.yml`: servicios de producción en la red privada de Docker. Solo publica el frontend en `127.0.0.1:4200` para que un Nginx instalado en el servidor pueda enviarle tráfico.
- `.env.docker.example`: plantilla de variables. Debe copiarse a `.env` en la raíz del proyecto y completarse con secretos propios.
- `nginx-reverse-proxy.conf.example`: ejemplo del Nginx del servidor para HTTPS y WebSocket.

## Requisitos

- Servidor Linux con Docker Engine y el complemento Docker Compose.
- Un dominio que apunte al servidor y certificados TLS para ese dominio.
- Puertos 80 y 443 permitidos en el firewall del servidor o del proveedor.

## Preparar el servidor

1. Clona el repositorio en una carpeta privada del servidor.
2. Desde la raíz del proyecto, crea la configuración privada:

   ```bash
   cp docker/.env.docker.example .env
   ```

3. Edita `.env`. Usa contraseñas largas y diferentes para MySQL y MinIO. Genera el secreto JWT con:

   ```bash
   openssl rand -hex 32
   ```

   Pega el resultado en `APP_JWT_SECRET`. No publiques ni compartas `.env`.

4. En `.env`, asigna a `MINIO_IMAGE` una etiqueta de versión concreta que hayas revisado. No uses `latest`, porque una actualización inesperada puede cambiar el comportamiento del servicio.

## Iniciar o actualizar

Ejecuta estos comandos desde la raíz del repositorio:

```bash
docker compose --env-file .env -f docker/docker-compose.prod.yml config
docker compose --env-file .env -f docker/docker-compose.prod.yml up -d --build
docker compose --env-file .env -f docker/docker-compose.prod.yml ps
```

La primera orden muestra la configuración final antes de iniciar los servicios. Revisa que no exponga MySQL, MinIO ni el backend. El único puerto publicado por esta plantilla es `127.0.0.1:4200`.

Para revisar los registros:

```bash
docker compose --env-file .env -f docker/docker-compose.prod.yml logs -f backend frontend
```

Para detener los contenedores sin borrar datos:

```bash
docker compose --env-file .env -f docker/docker-compose.prod.yml down
```

No uses `down -v` para una detención normal: elimina los volúmenes de datos de MySQL y MinIO.

## Configurar HTTPS con Nginx del servidor

1. Instala Nginx en el servidor y obtén un certificado TLS para el dominio.
2. Copia `nginx-reverse-proxy.conf.example` a la configuración de sitios de Nginx.
3. Sustituye `tickets.example.com` por tu dominio y las rutas de certificado por las rutas reales.
4. Activa el sitio, valida la configuración con `sudo nginx -t` y recarga Nginx.
5. Mantén abiertos públicamente solo los puertos 80 y 443. El puerto 80 se usa para redirigir a HTTPS y completar la renovación del certificado.

El Nginx del contenedor frontend reenvía `/api/v1/` al backend y admite la actualización de conexión para WebSocket. Por eso el proxy del servidor envía el tráfico del dominio al puerto local `4200`.

## Base de datos y archivos

- MySQL y MinIO no publican puertos en el host; backend accede a ellos mediante la red interna de Compose.
- El esquema SQL montado en `/docker-entrypoint-initdb.d` se ejecuta únicamente cuando MySQL inicializa un volumen vacío. Los cambios posteriores de esquema deben aplicarse mediante migraciones o procedimientos de actualización; recrear el contenedor no vuelve a ejecutar el script.
- Los volúmenes `mysql_data` y `minio_data` persisten los datos al actualizar contenedores. Incluye ambos en una política de copias de seguridad y prueba la restauración.
- El ejemplo reutiliza las credenciales raíz de MinIO para la aplicación, tal como espera la configuración actual del proyecto. Antes de un despliegue de alta seguridad, crea una identidad MinIO de aplicación con permisos limitados al bucket y configura esas credenciales en `APP_STORAGE_MINIO_ACCESS_KEY` y `APP_STORAGE_MINIO_SECRET_KEY`.

## Puertos

| Puerto | Acceso esperado |
|---|---|
| 80 y 443 | Público, en el Nginx del servidor |
| 4200 | Solo local (`127.0.0.1`), entre Nginx del servidor y frontend |
| 8080 | Solo red interna de Docker, backend |
| 3306 | Solo red interna de Docker, MySQL |
| 9000 y 9001 | Solo red interna de Docker, MinIO API y consola |

No abras 3306, 8080, 9000 ni 9001 en el firewall público. El panel de MinIO tampoco debe publicarse directamente.

