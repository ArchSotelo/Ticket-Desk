package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.audit.AuditQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.PageResponseDTO;
import com.empresa.ticketmanagement.dto.AuditoriaDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.time.LocalDate;

@org.springframework.security.access.prepost.PreAuthorize("hasAuthority('AUDIT_VIEW')")
@RestController
@RequestMapping("/audit")
@RequiredArgsConstructor
@Tag(name = "Auditoría", description = "Consulta de accesos y operaciones registradas del sistema. Requiere autenticación JWT.")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Datos inválidos o regla de negocio incumplida. Los registros inexistentes también se informan con HTTP 400.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Falta el token JWT o la sesión no es válida.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "Error interno no controlado.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class)))
})
public class AuditoriaController {
    private final AuditQueryService queryService;

    @Operation(summary = "Buscar eventos de auditoría", description = "Aplica los filtros antes de paginar. Las fechas son inclusivas y se interpretan en la zona horaria de la aplicación (America/Lima). Ordena por fecha de registro y por ID como desempate. Un rango de fechas invertido, grupo u orden inválido devuelve HTTP 400.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Página de eventos y total de coincidencias.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping
    public ResponseEntity<ApiResponse<PageResponseDTO<AuditoriaDTO>>> listar(
            @Parameter(description = "Índice de página desde 0. Los valores negativos se ajustan a 0.", example = "0")
            @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Filas por página. Se ajusta al rango de 1 a 100.", example = "25")
            @RequestParam(defaultValue = "25") int size,
            @Parameter(description = "Texto en nombre o username del usuario, dirección IP, acción, módulo o detalle. Búsqueda parcial sin distinguir mayúsculas; los caracteres % y _ se interpretan literalmente.", example = "Carlos")
            @RequestParam(defaultValue = "") String busqueda,
            @Parameter(description = "Vacío incluye todo. accesos incluye módulos Auth/AUTENTICACION y acciones LOGIN_/LOGOUT; actividad incluye el resto.", example = "accesos", schema = @Schema(allowableValues = {"", "accesos", "actividad"}))
            @RequestParam(defaultValue = "") String grupo,
            @Parameter(description = "Código exacto del evento. Vacío incluye cualquier acción.", example = "LOGIN_EXITOSO")
            @RequestParam(defaultValue = "") String accion,
            @Parameter(description = "Fecha inicial inclusiva, en formato yyyy-MM-dd.", example = "2026-10-01", schema = @Schema(type = "string", format = "date"))
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @Parameter(description = "Fecha final inclusiva: incluye todo ese día. Debe ser igual o posterior a desde.", example = "2026-10-28", schema = @Schema(type = "string", format = "date"))
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta,
            @Parameter(description = "desc para los eventos más recientes; asc para los más antiguos.", example = "desc", schema = @Schema(allowableValues = {"asc", "desc"}))
            @RequestParam(defaultValue = "desc") String orden) {
        return ResponseEntity.ok(ApiResponse.ok(PageResponseDTO.from(queryService.listar(page, size, busqueda, grupo, accion, desde, hasta, orden))));
    }
}
