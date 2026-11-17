package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.AreaDTO;
import com.empresa.ticketmanagement.dto.AreaRequestDTO;
import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.entity.Area;
import com.empresa.ticketmanagement.entity.Empresa;
import com.empresa.ticketmanagement.repository.AreaRepository;
import com.empresa.ticketmanagement.repository.EmpresaRepository;
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

@org.springframework.security.access.prepost.PreAuthorize("hasAuthority('ORGANIZATION_MANAGE')")
@RestController
@RequestMapping("/areas")
@RequiredArgsConstructor
@Tag(name = "Areas", description = "Gestion y administracion de areas por empresa")
public class AreaController {

    private final AreaRepository areaRepository;
    private final EmpresaRepository empresaRepository;

    @GetMapping
    @Operation(summary = "Listar areas, opcionalmente filtradas por empresa")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<AreaDTO>>> listar(@RequestParam(required = false) Long empresaId) {
        List<Area> areas = empresaId != null
                ? areaRepository.findByEmpresaIdAndActivoTrue(empresaId)
                : areaRepository.findAll();
        List<AreaDTO> data = areas.stream()
                .sorted(Comparator.comparing(Area::getId, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .map(this::toDTO)
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener un area por ID")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<AreaDTO>> obtener(@PathVariable Long id) {
        Area area = areaRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Área no encontrada"));
        return ResponseEntity.ok(ApiResponse.ok(toDTO(area)));
    }

    @PostMapping
    @Operation(summary = "Crear una nueva area")
    @Transactional
    public ResponseEntity<ApiResponse<AreaDTO>> crear(@Valid @RequestBody AreaRequestDTO dto) {
        Empresa empresa = empresaRepository.findById(dto.getEmpresaId())
                .orElseThrow(() -> new BusinessException("Empresa no encontrada"));
        validarNombreUnico(dto.getEmpresaId(), dto.getNombre(), null);
        Area area = Area.builder()
                .empresa(empresa)
                .nombre(dto.getNombre())
                .descripcion(dto.getDescripcion())
                .activo(dto.getActivo() == null || dto.getActivo())
                .build();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(toDTO(areaRepository.save(area)), "Área creada correctamente."));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualizar un area")
    @Transactional
    public ResponseEntity<ApiResponse<AreaDTO>> actualizar(@PathVariable Long id, @Valid @RequestBody AreaRequestDTO dto) {
        Area area = areaRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Área no encontrada"));
        Empresa empresa = empresaRepository.findById(dto.getEmpresaId())
                .orElseThrow(() -> new BusinessException("Empresa no encontrada"));
        validarNombreUnico(dto.getEmpresaId(), dto.getNombre(), id);
        area.setEmpresa(empresa);
        area.setNombre(dto.getNombre());
        area.setDescripcion(dto.getDescripcion());
        area.setActivo(dto.getActivo() == null || dto.getActivo());
        return ResponseEntity.ok(ApiResponse.ok(toDTO(areaRepository.save(area)), "Área actualizada correctamente."));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Desactivar un area")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> eliminar(@PathVariable Long id) {
        Area area = areaRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Área no encontrada"));
        area.setActivo(false);
        areaRepository.save(area);
        return ResponseEntity.ok(ApiResponse.ok(null, "Área desactivada correctamente."));
    }

    private AreaDTO toDTO(Area area) {
        return AreaDTO.builder()
                .id(area.getId())
                .empresaId(area.getEmpresa() != null ? area.getEmpresa().getId() : null)
                .empresaNombre(area.getEmpresa() != null ? area.getEmpresa().getRazonSocial() : null)
                .nombre(area.getNombre())
                .descripcion(area.getDescripcion())
                .activo(area.getActivo())
                .build();
    }

    private void validarNombreUnico(Long empresaId, String nombre, Long idActual) {
        areaRepository.findAll().stream()
                .filter(area -> area.getEmpresa() != null && area.getEmpresa().getId().equals(empresaId))
                .filter(area -> area.getNombre() != null && area.getNombre().equalsIgnoreCase(nombre))
                .filter(area -> idActual == null || !area.getId().equals(idActual))
                .findFirst()
                .ifPresent(area -> {
                    throw new BusinessException("Ya existe un área con ese nombre en la empresa seleccionada");
                });
    }
}
