package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.SubcategoriaDTO;
import com.empresa.ticketmanagement.dto.SubcategoriaRequestDTO;
import com.empresa.ticketmanagement.entity.Categoria;
import com.empresa.ticketmanagement.entity.Subcategoria;
import com.empresa.ticketmanagement.repository.CategoriaRepository;
import com.empresa.ticketmanagement.repository.SubcategoriaRepository;
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
@RequestMapping("/subcategorias")
@RequiredArgsConstructor
@Tag(name = "Subcategorias", description = "Gestion de subcategorias asociadas a categorias")
public class SubcategoriaController {
    private final SubcategoriaRepository subcategoriaRepository;
    private final CategoriaRepository categoriaRepository;

    @GetMapping
    @Operation(summary = "Listar subcategorias, opcionalmente filtradas por categoria")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<SubcategoriaDTO>>> listar(@RequestParam(required = false) Long categoriaId) {
        List<Subcategoria> items = categoriaId == null ? subcategoriaRepository.findAll() : subcategoriaRepository.findByCategoriaIdAndActivaTrue(categoriaId);
        return ResponseEntity.ok(ApiResponse.ok(items.stream().sorted(Comparator.comparing(Subcategoria::getId).reversed()).map(this::toDTO).toList()));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener una subcategoria por ID")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<SubcategoriaDTO>> obtener(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(toDTO(subcategoriaRepository.findById(id).orElseThrow(() -> new BusinessException("Subcategoría no encontrada")))));
    }

    @PostMapping
    @Operation(summary = "Crear una nueva subcategoria")
    @Transactional
    public ResponseEntity<ApiResponse<SubcategoriaDTO>> crear(@Valid @RequestBody SubcategoriaRequestDTO dto) {
        Categoria categoria = categoriaRepository.findById(dto.getCategoriaId()).orElseThrow(() -> new BusinessException("Categoría no encontrada"));
        validarNombre(dto.getCategoriaId(), dto.getNombre(), null);
        Subcategoria item = Subcategoria.builder().categoria(categoria).nombre(dto.getNombre().trim()).descripcion(dto.getDescripcion()).activa(dto.getActiva() == null || dto.getActiva()).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(toDTO(subcategoriaRepository.save(item)), "Subcategoría creada correctamente."));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualizar una subcategoria")
    @Transactional
    public ResponseEntity<ApiResponse<SubcategoriaDTO>> actualizar(@PathVariable Long id, @Valid @RequestBody SubcategoriaRequestDTO dto) {
        Subcategoria item = subcategoriaRepository.findById(id).orElseThrow(() -> new BusinessException("Subcategoría no encontrada"));
        Categoria categoria = categoriaRepository.findById(dto.getCategoriaId()).orElseThrow(() -> new BusinessException("Categoría no encontrada"));
        validarNombre(dto.getCategoriaId(), dto.getNombre(), id);
        item.setCategoria(categoria); item.setNombre(dto.getNombre().trim()); item.setDescripcion(dto.getDescripcion()); item.setActiva(dto.getActiva() == null || dto.getActiva());
        return ResponseEntity.ok(ApiResponse.ok(toDTO(subcategoriaRepository.save(item)), "Subcategoría actualizada correctamente."));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Desactivar una subcategoria")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> eliminar(@PathVariable Long id) {
        Subcategoria item = subcategoriaRepository.findById(id).orElseThrow(() -> new BusinessException("Subcategoría no encontrada"));
        item.setActiva(false); subcategoriaRepository.save(item);
        return ResponseEntity.ok(ApiResponse.ok(null, "Subcategoría desactivada correctamente."));
    }

    private SubcategoriaDTO toDTO(Subcategoria s) { return SubcategoriaDTO.builder().id(s.getId()).categoriaId(s.getCategoria().getId()).categoriaNombre(s.getCategoria().getNombre()).nombre(s.getNombre()).descripcion(s.getDescripcion()).activa(s.getActiva()).build(); }
    private void validarNombre(Long categoriaId, String nombre, Long id) {
        subcategoriaRepository.findAll().stream().filter(s -> s.getCategoria() != null && s.getCategoria().getId().equals(categoriaId)).filter(s -> s.getNombre().equalsIgnoreCase(nombre.trim())).filter(s -> id == null || !s.getId().equals(id)).findFirst().ifPresent(s -> { throw new BusinessException("Ya existe una subcategoría con ese nombre en la categoría seleccionada"); });
    }
}
