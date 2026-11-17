package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.CategoriaDTO;
import com.empresa.ticketmanagement.dto.CategoriaRequestDTO;
import com.empresa.ticketmanagement.entity.Categoria;
import com.empresa.ticketmanagement.repository.CategoriaRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;

@org.springframework.security.access.prepost.PreAuthorize("hasAuthority('CATEGORY_MANAGE')")
@RestController
@RequestMapping("/categorias")
@RequiredArgsConstructor
@Tag(name = "Categorias", description = "Gestion de categorias de tickets")
public class CategoriaController {
    private final CategoriaRepository categoriaRepository;

    @GetMapping
    @Operation(summary = "Listar categorias")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<CategoriaDTO>>> listar() {
        List<CategoriaDTO> data = categoriaRepository.findAll().stream()
                .sorted(Comparator.comparing(Categoria::getId, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .map(this::toDTO).toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener una categoria por ID")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<CategoriaDTO>> obtener(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(toDTO(categoriaRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Categoría no encontrada")))));
    }

    @PostMapping
    @Operation(summary = "Crear una nueva categoria")
    @Transactional
    public ResponseEntity<ApiResponse<CategoriaDTO>> crear(@Valid @RequestBody CategoriaRequestDTO dto) {
        validarNombre(dto.getNombre(), null);
        Categoria categoria = Categoria.builder().nombre(dto.getNombre().trim()).descripcion(dto.getDescripcion())
                .activa(dto.getActiva() == null || dto.getActiva()).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(toDTO(categoriaRepository.save(categoria)), "Categoría creada correctamente."));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualizar una categoria")
    @Transactional
    public ResponseEntity<ApiResponse<CategoriaDTO>> actualizar(@PathVariable Long id, @Valid @RequestBody CategoriaRequestDTO dto) {
        Categoria categoria = categoriaRepository.findById(id).orElseThrow(() -> new BusinessException("Categoría no encontrada"));
        validarNombre(dto.getNombre(), id);
        categoria.setNombre(dto.getNombre().trim());
        categoria.setDescripcion(dto.getDescripcion());
        categoria.setActiva(dto.getActiva() == null || dto.getActiva());
        return ResponseEntity.ok(ApiResponse.ok(toDTO(categoriaRepository.save(categoria)), "Categoría actualizada correctamente."));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Desactivar una categoria")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> eliminar(@PathVariable Long id) {
        Categoria categoria = categoriaRepository.findById(id).orElseThrow(() -> new BusinessException("Categoría no encontrada"));
        categoria.setActiva(false);
        categoriaRepository.save(categoria);
        return ResponseEntity.ok(ApiResponse.ok(null, "Categoría desactivada correctamente."));
    }

    private CategoriaDTO toDTO(Categoria c) { return CategoriaDTO.builder().id(c.getId()).nombre(c.getNombre()).descripcion(c.getDescripcion()).activa(c.getActiva()).build(); }
    private void validarNombre(String nombre, Long id) {
        categoriaRepository.findAll().stream().filter(c -> c.getNombre().equalsIgnoreCase(nombre.trim()))
                .filter(c -> id == null || !c.getId().equals(id)).findFirst()
                .ifPresent(c -> { throw new BusinessException("Ya existe una categoría con ese nombre"); });
    }
}
