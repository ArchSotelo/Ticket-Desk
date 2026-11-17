package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.PageResponseDTO;
import com.empresa.ticketmanagement.dto.ArticuloKbDTO;
import com.empresa.ticketmanagement.service.impl.ArticuloKbServiceImpl;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/knowledge-base")
@RequiredArgsConstructor
@Tag(name = "Base de Conocimiento", description = "Artículos de ayuda, guías y documentación interna")
public class ArticuloKbController {

    private final ArticuloKbServiceImpl articuloKbService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'TECNICO', 'SUPERVISOR')")
    @Operation(summary = "Crear un nuevo artículo en la Base de Conocimiento")
    public ResponseEntity<ApiResponse<ArticuloKbDTO>> crear(
            @Valid @RequestBody ArticuloKbDTO dto, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(articuloKbService.crear(dto, auth.getName()), "Artículo creado."));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener artículo por ID (incrementa contador de vistas)")
    public ResponseEntity<ApiResponse<ArticuloKbDTO>> obtenerPorId(@PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(articuloKbService.obtenerPorId(id, esPersonal(auth))));
    }

    @GetMapping
    @Operation(summary = "Buscar artículos por texto y/o categoría")
    public ResponseEntity<ApiResponse<PageResponseDTO<ArticuloKbDTO>>> buscar(
            @RequestParam(required = false) String busqueda,
            @RequestParam(required = false) Long categoriaId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size, Authentication auth) {
        boolean incluirPrivados = esPersonal(auth);
        Page<ArticuloKbDTO> result = articuloKbService.buscar(busqueda, categoriaId,
                PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 200)), Sort.by("vistas").descending().and(Sort.by("id").descending())), incluirPrivados);
        return ResponseEntity.ok(ApiResponse.ok(PageResponseDTO.from(result)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'TECNICO', 'SUPERVISOR')")
    @Operation(summary = "Actualizar un artículo existente")
    public ResponseEntity<ApiResponse<ArticuloKbDTO>> actualizar(
            @PathVariable Long id, @RequestBody ArticuloKbDTO dto) {
        return ResponseEntity.ok(ApiResponse.ok(articuloKbService.actualizar(id, dto), "Artículo actualizado."));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'TECNICO', 'SUPERVISOR')")
    @Operation(summary = "Eliminar un artículo")
    public ResponseEntity<ApiResponse<Void>> eliminar(@PathVariable Long id) {
        articuloKbService.eliminar(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Artículo eliminado."));
    }
    private boolean esPersonal(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(authority ->
                java.util.Set.of("ROLE_ADMIN", "ROLE_TECNICO", "ROLE_SUPERVISOR")
                        .contains(authority.getAuthority()));
    }

}
