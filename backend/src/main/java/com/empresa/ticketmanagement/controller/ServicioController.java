package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.ActualizarObservacionesServicioDTO;
import com.empresa.ticketmanagement.dto.CancelarServicioDTO;
import com.empresa.ticketmanagement.dto.ServicioDTO;
import com.empresa.ticketmanagement.dto.ServicioPageDTO;
import com.empresa.ticketmanagement.service.ServicioService;
import com.empresa.ticketmanagement.attachment.AttachmentResponses;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.core.io.Resource;
import java.time.LocalDate;
import java.util.List;

@org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR','TECNICO')")
@RestController @RequestMapping("/services") @RequiredArgsConstructor
@Tag(name = "Servicios", description = "Gestión de servicios, vigencias, renovaciones, archivos e informes. Requiere JWT y rol ADMIN, SUPERVISOR o TECNICO.")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Datos inválidos o regla de negocio incumplida. Los registros inexistentes también se informan con HTTP 400.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Falta el token JWT o la sesión no es válida.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "El rol no tiene acceso al apartado de Servicios.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "Error interno no controlado.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class)))
})
public class ServicioController {
    private final ServicioService service;
    @Operation(summary = "Listar servicios vigentes", description = "Busca por nombre, proveedor, tipo o responsable. Incluye únicamente ACTIVO, POR_VENCER y VENCIDO; los estados se actualizan según la fecha y la configuración de vencimientos. Devuelve paginación y totales calculados sobre todos los resultados filtrados. Para importes comparables, usa totalesPorDivisa.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Página de servicios y totales del conjunto filtrado.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping public ResponseEntity<ApiResponse<ServicioPageDTO>> listar(@Parameter(description = "Texto parcial en nombre, proveedor, tipo o responsable; no distingue mayúsculas.", example = "correo") @RequestParam(defaultValue = "") String busqueda, @Parameter(description = "Estado calculado del listado; vacío incluye los tres estados vigentes.", schema = @Schema(allowableValues = {"ACTIVO", "POR_VENCER", "VENCIDO"})) @RequestParam(defaultValue = "") String estado, @Parameter(description = "Índice de página desde 0; valores negativos se ajustan a 0.", example = "0") @RequestParam(defaultValue = "0") int page, @Parameter(description = "Cantidad de filas; se ajusta al rango de 1 a 100.", example = "8") @RequestParam(defaultValue = "8") int size) { return ResponseEntity.ok(ApiResponse.ok(service.listar(busqueda, estado, page, size))); }
    @Operation(summary = "Consultar un servicio", description = "Devuelve los datos del servicio, su factura y la lista de adjuntos activos. Un ID inexistente devuelve HTTP 400.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Detalle del servicio.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping("/{id}") public ResponseEntity<ApiResponse<ServicioDTO>> obtener(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id) { return ResponseEntity.ok(ApiResponse.ok(service.obtener(id))); }
    @Operation(summary = "Consultar la cadena de renovaciones de un servicio", description = "Devuelve una lista sin paginación: primero el servicio indicado y luego sus períodos anteriores, siguiendo servicioAnteriorId.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Servicio actual y sus períodos anteriores.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping("/{id}/history") public ResponseEntity<ApiResponse<List<ServicioDTO>>> historial(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id) { return ResponseEntity.ok(ApiResponse.ok(service.historial(id))); }
    @Operation(summary = "Consultar el historial general de servicios", description = "Devuelve los servicios FINALIZADO o CANCELADO, ordenados por nombre. La lista no está paginada.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Servicios finalizados y cancelados.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping("/history") public ResponseEntity<ApiResponse<List<ServicioDTO>>> historialGeneral() { return ResponseEntity.ok(ApiResponse.ok(service.historialGeneral())); }
    @Operation(summary = "Crear un servicio", description = "Registra nombre, proveedor, tipo, fechas y costo mensual. El estado se calcula a partir de fechaFin y los días de aviso configurados. La divisa predeterminada es PEN; los archivos se adjuntan mediante sus endpoints específicos.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Servicio creado.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PostMapping public ResponseEntity<ApiResponse<ServicioDTO>> crear(@Valid @RequestBody ServicioDTO dto) { return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.crear(dto), "Servicio creado correctamente.")); }
    @Operation(summary = "Actualizar los datos de un servicio", description = "Actualiza los campos generales y correos de recordatorio. Requiere los mismos datos obligatorios que la creación. Las facturas y los adjuntos se administran por separado.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Servicio actualizado.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PutMapping("/{id}") public ResponseEntity<ApiResponse<ServicioDTO>> actualizar(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Valid @RequestBody ServicioDTO dto) { return ResponseEntity.ok(ApiResponse.ok(service.actualizar(id, dto), "Servicio actualizado correctamente.")); }
    @Operation(summary = "Actualizar las observaciones de un servicio", description = "Recibe el campo observaciones, de hasta 4000 caracteres. Se recortan los espacios; null permite limpiar el texto. No se permite modificar observaciones de servicios CANCELADO o FINALIZADO.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Servicio con las observaciones actualizadas.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PatchMapping("/{id}/notes") public ResponseEntity<ApiResponse<ServicioDTO>> actualizarObservaciones(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Valid @RequestBody ActualizarObservacionesServicioDTO dto) { return ResponseEntity.ok(ApiResponse.ok(service.actualizarObservaciones(id, dto.getObservaciones()), "Observaciones actualizadas correctamente.")); }
    @Operation(summary = "Cambiar el estado manual de un servicio", description = "Admite ACTIVO, INACTIVO o FINALIZADO. Si fechaFin ya pasó, una solicitud de ACTIVO o INACTIVO se guarda como VENCIDO. Para cancelar y registrar un motivo, usa /cancel.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Servicio con el estado resultante.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PatchMapping("/{id}/status") public ResponseEntity<ApiResponse<ServicioDTO>> cambiarEstado(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Parameter(description = "Nuevo estado manual.", required = true, schema = @Schema(allowableValues = {"ACTIVO", "INACTIVO", "FINALIZADO"}), example = "FINALIZADO") @RequestParam String estado) { return ResponseEntity.ok(ApiResponse.ok(service.cambiarEstado(id, estado), "Estado actualizado correctamente.")); }
    @Operation(summary = "Cancelar un servicio", description = "Establece CANCELADO y guarda una observación obligatoria de hasta 2000 caracteres. No elimina el servicio y permite consultarlo en el historial general.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Servicio cancelado y motivo registrado.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PatchMapping("/{id}/cancel") public ResponseEntity<ApiResponse<ServicioDTO>> cancelar(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Valid @RequestBody CancelarServicioDTO dto) { return ResponseEntity.ok(ApiResponse.ok(service.cancelar(id, dto.getObservacionCancelacion()), "Servicio cancelado correctamente.")); }
    @Operation(summary = "Renovar un servicio", description = "Admite dos modalidades: cuerpo JSON con los datos del nuevo período, o los dos parámetros de consulta fechaInicio y fechaFin para conservar los demás datos. Si se envían ambos parámetros, se usa esa modalidad. La fecha final no puede preceder a la inicial. Crea un nuevo servicio enlazado, marca el anterior FINALIZADO y mantiene los archivos en el período anterior. No admite servicios CANCELADO o FINALIZADO.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Nuevo período creado; el período anterior queda finalizado.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PostMapping(value = "/{id}/renew", params = {"fechaInicio", "fechaFin"})
    public ResponseEntity<ApiResponse<ServicioDTO>> renovar(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Parameter(description = "Inicio del nuevo período, formato yyyy-MM-dd. Obligatorio junto con fechaFin en la modalidad por parámetros.", required = false, example = "2027-01-01", schema = @Schema(type = "string", format = "date")) @RequestParam LocalDate fechaInicio, @Parameter(description = "Fin del nuevo período, formato yyyy-MM-dd. Obligatorio junto con fechaInicio en la modalidad por parámetros.", required = false, example = "2027-12-31", schema = @Schema(type = "string", format = "date")) @RequestParam LocalDate fechaFin) {
        return ResponseEntity.ok(ApiResponse.ok(service.renovar(id, fechaInicio, fechaFin), "Servicio renovado correctamente."));
    }
    @Operation(summary = "Renovar un servicio", description = "Admite dos modalidades: cuerpo JSON con los datos del nuevo período, o los dos parámetros de consulta fechaInicio y fechaFin para conservar los demás datos. Si se envían ambos parámetros, se usa esa modalidad. La fecha final no puede preceder a la inicial. Crea un nuevo servicio enlazado, marca el anterior FINALIZADO y mantiene los archivos en el período anterior. No admite servicios CANCELADO o FINALIZADO.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Nuevo período creado; el período anterior queda finalizado.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PostMapping("/{id}/renew")
    public ResponseEntity<ApiResponse<ServicioDTO>> renovarConDatos(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @io.swagger.v3.oas.annotations.parameters.RequestBody(description = "Datos del nuevo período. Se puede omitir únicamente si se envían fechaInicio y fechaFin como parámetros de consulta.", required = false) @Valid @RequestBody ServicioDTO datos) {
        return ResponseEntity.ok(ApiResponse.ok(service.renovar(id, datos), "Servicio renovado correctamente."));
    }
    @Operation(summary = "Adjuntar o reemplazar la factura de un servicio", description = "Envía un archivo no vacío en el campo multipart file. Devuelve el servicio con los metadatos de la factura. No admite servicios CANCELADO o FINALIZADO.", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true, content = @Content(mediaType = "multipart/form-data", schema = @Schema(implementation = FacturaUpload.class))))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Factura almacenada y metadatos del servicio actualizados.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PostMapping("/{id}/invoice") public ResponseEntity<ApiResponse<ServicioDTO>> subirFactura(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Parameter(hidden = true) @RequestParam("file") MultipartFile file) { return ResponseEntity.ok(ApiResponse.ok(service.subirFactura(id, file), "Factura adjuntada correctamente.")); }
    @Operation(summary = "Adjuntar archivos a un servicio", description = "Envía uno o varios archivos usando el campo multipart files, repetido por cada archivo. Se valida el lote completo antes de almacenar: formatos permitidos y máximo 25 MB por archivo. No admite servicios CANCELADO o FINALIZADO.", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true, content = @Content(mediaType = "multipart/form-data", schema = @Schema(implementation = AdjuntosUpload.class))))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Archivos adjuntados; devuelve el servicio con sus adjuntos.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PostMapping("/{id}/attachments") public ResponseEntity<ApiResponse<ServicioDTO>> subirAdjuntos(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Parameter(hidden = true) @RequestParam("files") List<MultipartFile> files) { return ResponseEntity.ok(ApiResponse.ok(service.subirAdjuntos(id, files), "Archivos adjuntados correctamente.")); }
    @Operation(summary = "Abrir la factura de un servicio", description = "Previsualiza únicamente raster/PDF con metadatos coherentes y contenido revalidado. Otros formatos devuelven 415 y disponen de descarga separada. Si el servicio no tiene factura, devuelve HTTP 400.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Contenido binario de la factura.", content = @Content(mediaType = "application/octet-stream", schema = @Schema(type = "string", format = "binary")))
    @GetMapping("/{id}/invoice") public ResponseEntity<Resource> descargarFactura(@PathVariable Long id) {
        Resource resource=service.descargarFactura(id); ServicioDTO meta=service.obtener(id);
        return AttachmentResponses.preview(meta.getFacturaNombre(),meta.getFacturaMime(),resource);
    }
    @Operation(summary="Descargar factura",description="Descarga forzada, también para facturas históricas no previsualizables.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="200",description="Factura para descargar sin ejecución en el navegador.",content=@Content(mediaType="application/octet-stream",schema=@Schema(type="string",format="binary")))
    @GetMapping("/{id}/invoice/download") public ResponseEntity<Resource> descargarFacturaArchivo(@PathVariable Long id) {
        Resource resource=service.descargarFactura(id);
        return AttachmentResponses.download(service.obtener(id).getFacturaNombre(),resource);
    }
    @Operation(summary = "Eliminar la factura de un servicio", description = "Elimina el archivo almacenado y limpia sus metadatos. No admite servicios CANCELADO o FINALIZADO. Devuelve un sobre ApiResponse con data null.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Factura eliminada.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @DeleteMapping("/{id}/invoice") public ResponseEntity<ApiResponse<Void>> eliminarFactura(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id) { service.eliminarFactura(id); return ResponseEntity.ok(ApiResponse.ok(null, "Archivo adjunto eliminado correctamente.")); }
    @Operation(summary = "Descargar un archivo adjunto", description = "El adjunto debe estar activo y pertenecer al servicio indicado. Fuerza descarga con application/octet-stream, nosniff, CSP y no-store.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Archivo adjunto para descargar.", content = @Content(mediaType = "application/octet-stream", schema = @Schema(type = "string", format = "binary")))
    @GetMapping("/{id}/attachments/{attachmentId}/download") public ResponseEntity<Resource> descargarAdjunto(@PathVariable Long id,@PathVariable Long attachmentId) {
        Resource resource=service.descargarAdjunto(id,attachmentId);
        return AttachmentResponses.download(adjuntoMeta(id,attachmentId).getNombreOriginal(),resource);
    }
    @Operation(summary = "Previsualizar un archivo adjunto", description = "El adjunto debe estar activo y pertenecer al servicio indicado. Solo previsualiza raster/PDF con contenido revalidado y cabeceras de protección. Otros tipos devuelven 415.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Contenido binario para visualización en el navegador.", content = @Content(mediaType = "application/octet-stream", schema = @Schema(type = "string", format = "binary")))
    @GetMapping("/{id}/attachments/{attachmentId}/preview") public ResponseEntity<Resource> previsualizarAdjunto(@PathVariable Long id,@PathVariable Long attachmentId) {
        Resource resource=service.descargarAdjunto(id,attachmentId);
        var meta=adjuntoMeta(id,attachmentId);
        return AttachmentResponses.preview(meta.getNombreOriginal(),meta.getMimeType(),resource);
    }
    private com.empresa.ticketmanagement.dto.ServicioAdjuntoDTO adjuntoMeta(Long id,Long attachmentId) {
        return service.obtener(id).getAdjuntos().stream().filter(a->a.getId().equals(attachmentId)).findFirst()
            .orElseThrow(()->new BusinessException("Adjunto no disponible para este servicio."));
    }
    @Operation(summary = "Eliminar un archivo adjunto", description = "El adjunto debe estar activo y pertenecer al servicio indicado. Elimina el archivo y desactiva su registro. No admite servicios CANCELADO o FINALIZADO.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Adjunto eliminado; data es null.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @DeleteMapping("/{id}/attachments/{attachmentId}") public ResponseEntity<ApiResponse<Void>> eliminarAdjunto(@Parameter(description = "ID del servicio.", example = "1") @PathVariable Long id, @Parameter(description = "ID del adjunto asociado a este servicio.", example = "10") @PathVariable Long attachmentId) { service.eliminarAdjunto(id, attachmentId); return ResponseEntity.ok(ApiResponse.ok(null, "Archivo adjunto eliminado correctamente.")); }
    @Operation(summary = "Exportar servicios a CSV", description = "Devuelve servicios ordenados por nombre con sus fechas, costos y correos de recordatorio. Incluye todos los estados y no aplica los filtros del listado. Archivo UTF-8 llamado servicios.csv.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Archivo servicios.csv.", content = @Content(mediaType = "text/csv", schema = @Schema(type = "string", format = "binary")))
    @GetMapping(value = "/export", produces = "text/csv") public ResponseEntity<byte[]> exportar() { return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=servicios.csv").contentType(MediaType.parseMediaType("text/csv; charset=UTF-8")).body(service.exportarCsv()); }
    @Operation(summary = "Exportar servicios vigentes a Excel", description = "Exporta los servicios ACTIVO, POR_VENCER y VENCIDO a servicios.xlsx. No utiliza los filtros del listado. Los totales se presentan por divisa.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Archivo servicios.xlsx.", content = @Content(mediaType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", schema = @Schema(type = "string", format = "binary")))
    @GetMapping(value = "/export/excel", produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") public ResponseEntity<byte[]> exportarExcel() { byte[] data = service.exportarExcel(); return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=servicios.xlsx").contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).contentLength(data.length).body(data); }
    @Schema(name = "FacturaServicioUpload", description = "Formulario multipart de una factura.")
    public static class FacturaUpload {
        @Schema(description = "Archivo de factura no vacío.", type = "string", format = "binary", requiredMode = Schema.RequiredMode.REQUIRED)
        public String file;
    }

    @Schema(name = "AdjuntosServicioUpload", description = "Formulario multipart para adjuntar varios archivos.")
    public static class AdjuntosUpload {
        @ArraySchema(arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED), schema = @Schema(type = "string", format = "binary"), minItems = 1)
        public List<String> files;
    }

}
