package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.CatalogCategoriaDTO;
import com.empresa.ticketmanagement.dto.CatalogSubcategoriaDTO;
import com.empresa.ticketmanagement.entity.Categoria;
import com.empresa.ticketmanagement.entity.Estado;
import com.empresa.ticketmanagement.entity.Prioridad;
import com.empresa.ticketmanagement.repository.CategoriaRepository;
import com.empresa.ticketmanagement.repository.EstadoRepository;
import com.empresa.ticketmanagement.repository.PrioridadRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/catalogs")
@RequiredArgsConstructor
@Tag(name = "Catálogos Base", description = "Listado de categorías, prioridades y estados del sistema")
public class CatalogController {

    private final CategoriaRepository categoriaRepository;
    private final PrioridadRepository prioridadRepository;
    private final EstadoRepository estadoRepository;

    @GetMapping("/categories")
    @Operation(summary = "Listar categorías y subcategorías de tickets")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<CatalogCategoriaDTO>>> listarCategorias() {
        List<CatalogCategoriaDTO> categorias = categoriaRepository.findByActivaTrue().stream()
                .map(this::mapCategoria)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(categorias));
    }

    @GetMapping("/priorities")
    @Operation(summary = "Listar prioridades del sistema")
    public ResponseEntity<ApiResponse<List<Prioridad>>> listarPrioridades() {
        return ResponseEntity.ok(ApiResponse.ok(prioridadRepository.findAll()));
    }

    @GetMapping("/states")
    @Operation(summary = "Listar estados del workflow")
    public ResponseEntity<ApiResponse<List<Estado>>> listarEstados() {
        return ResponseEntity.ok(ApiResponse.ok(estadoRepository.findAll()));
    }

    private CatalogCategoriaDTO mapCategoria(Categoria categoria) {
        List<CatalogSubcategoriaDTO> subcategorias = categoria.getSubcategorias() == null ? List.of() :
                categoria.getSubcategorias().stream()
                        .filter(Subcategoria -> Boolean.TRUE.equals(Subcategoria.getActiva()))
                        .map(subcategoria -> CatalogSubcategoriaDTO.builder()
                                .id(subcategoria.getId())
                                .nombre(subcategoria.getNombre())
                                .build())
                        .toList();

        return CatalogCategoriaDTO.builder()
                .id(categoria.getId())
                .nombre(categoria.getNombre())
                .descripcion(categoria.getDescripcion())
                .subcategorias(subcategorias)
                .build();
    }
}
