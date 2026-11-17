package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import com.empresa.ticketmanagement.dto.*;
import com.empresa.ticketmanagement.entity.CategoriaServicio;
import com.empresa.ticketmanagement.repository.CategoriaServicioRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController @RequestMapping("/service-categories") @RequiredArgsConstructor
@Tag(name = "Categorías de servicios", description = "Catálogo de tipos de servicio, sus iconos y su disponibilidad. Requiere autenticación JWT.")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Datos inválidos o regla de negocio incumplida. Los registros inexistentes también se informan con HTTP 400.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Falta el token JWT o la sesión no es válida.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "Error interno no controlado.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class)))
})
public class CategoriaServicioController {
    private final CategoriaServicioRepository repository;
    @Operation(summary = "Listar categorías de servicios", description = "Devuelve todas las categorías, incluidas las inactivas, ordenadas por nombre ascendente. No utiliza paginación.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Listado de categorías.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR','TECNICO')")
    @GetMapping public ResponseEntity<ApiResponse<List<CategoriaServicioDTO>>> listar() { return ResponseEntity.ok(ApiResponse.ok(repository.findAllByOrderByNombreAsc().stream().map(this::toDto).toList())); }
    @Operation(summary = "Crear una categoría de servicio", description = "El nombre es obligatorio, se recortan sus espacios y debe ser único sin distinguir mayúsculas. Si no se indica icono, se usa category; si no se indica activa, se usa true.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Categoría creada.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('CATEGORY_MANAGE')")
    @PostMapping public ResponseEntity<ApiResponse<CategoriaServicioDTO>> crear(@Valid @RequestBody CategoriaServicioDTO dto) { validarNombre(dto.getNombre(), null); CategoriaServicio item = CategoriaServicio.builder().nombre(dto.getNombre().trim()).descripcion(dto.getDescripcion()).icono(normalizarIcono(dto.getIcono())).activa(dto.getActiva() == null || dto.getActiva()).build(); return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(toDto(repository.save(item)), "Categoría de servicio creada correctamente.")); }
    @Operation(summary = "Actualizar una categoría de servicio", description = "Actualiza nombre y descripción. Si icono o activa se omiten, conserva sus valores actuales. Un nombre duplicado o un ID inexistente devuelve HTTP 400.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Categoría actualizada.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('CATEGORY_MANAGE')")
    @PutMapping("/{id}") public ResponseEntity<ApiResponse<CategoriaServicioDTO>> actualizar(@Parameter(description = "ID de la categoría de servicio.", example = "1") @PathVariable Long id, @Valid @RequestBody CategoriaServicioDTO dto) { CategoriaServicio item = repository.findById(id).orElseThrow(() -> new BusinessException("Categoría de servicio no encontrada.")); validarNombre(dto.getNombre(), id); item.setNombre(dto.getNombre().trim()); item.setDescripcion(dto.getDescripcion()); if (dto.getIcono() != null) item.setIcono(normalizarIcono(dto.getIcono())); if (dto.getActiva() != null) item.setActiva(dto.getActiva()); return ResponseEntity.ok(ApiResponse.ok(toDto(repository.save(item)), "Categoría de servicio actualizada correctamente.")); }
    @Operation(summary = "Activar o desactivar una categoría", description = "Cambia únicamente su disponibilidad. No elimina la categoría ni modifica los servicios existentes.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Disponibilidad de la categoría actualizada.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('CATEGORY_MANAGE')")
    @PatchMapping("/{id}/status") public ResponseEntity<ApiResponse<CategoriaServicioDTO>> cambiarEstado(@Parameter(description = "ID de la categoría de servicio.", example = "1") @PathVariable Long id, @Parameter(description = "true para activar; false para desactivar.", example = "true", schema = @Schema(type = "boolean")) @RequestParam Boolean activa) { CategoriaServicio item = repository.findById(id).orElseThrow(() -> new BusinessException("Categoría de servicio no encontrada.")); item.setActiva(activa); return ResponseEntity.ok(ApiResponse.ok(toDto(repository.save(item)), "Estado actualizado correctamente.")); }
    private CategoriaServicioDTO toDto(CategoriaServicio i) { return CategoriaServicioDTO.builder().id(i.getId()).nombre(i.getNombre()).descripcion(i.getDescripcion()).icono(normalizarIcono(i.getIcono())).activa(i.getActiva()).build(); }
    private String normalizarIcono(String icono) { return icono == null || icono.isBlank() ? "category" : icono.trim(); }
    private void validarNombre(String nombre, Long id) { repository.findAll().stream().filter(i -> i.getNombre().equalsIgnoreCase(nombre.trim()) && (id == null || !i.getId().equals(id))).findFirst().ifPresent(i -> { throw new BusinessException("Ya existe una categoría con ese nombre."); }); }
}
