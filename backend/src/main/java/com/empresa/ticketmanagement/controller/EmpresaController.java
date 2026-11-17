package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.EmpresaDTO;
import com.empresa.ticketmanagement.dto.EmpresaRequestDTO;
import com.empresa.ticketmanagement.entity.Empresa;
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
@RequestMapping("/empresas")
@RequiredArgsConstructor
@Tag(name = "Empresas", description = "Gestion y administracion de empresas")
public class EmpresaController {

    private final EmpresaRepository empresaRepository;

    @GetMapping
    @Operation(summary = "Listar empresas registradas")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<EmpresaDTO>>> listar() {
        List<EmpresaDTO> data = empresaRepository.findAll().stream()
                .sorted(Comparator.comparing(Empresa::getFechaCreacion, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .map(this::toDTO)
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener una empresa por ID")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<EmpresaDTO>> obtener(@PathVariable Long id) {
        Empresa empresa = empresaRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Empresa no encontrada"));
        return ResponseEntity.ok(ApiResponse.ok(toDTO(empresa)));
    }

    @PostMapping
    @Operation(summary = "Crear una nueva empresa")
    @Transactional
    public ResponseEntity<ApiResponse<EmpresaDTO>> crear(@Valid @RequestBody EmpresaRequestDTO dto) {
        validarRucUnico(dto.getRuc(), null);
        Empresa empresa = Empresa.builder()
                .razonSocial(dto.getRazonSocial())
                .ruc(dto.getRuc())
                .email(dto.getEmail())
                .telefono(dto.getTelefono())
                .direccion(dto.getDireccion())
                .estado(dto.getEstado() == null || dto.getEstado())
                .build();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(toDTO(empresaRepository.save(empresa)), "Empresa creada correctamente."));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualizar una empresa")
    @Transactional
    public ResponseEntity<ApiResponse<EmpresaDTO>> actualizar(@PathVariable Long id, @Valid @RequestBody EmpresaRequestDTO dto) {
        Empresa empresa = empresaRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Empresa no encontrada"));
        validarRucUnico(dto.getRuc(), id);
        empresa.setRazonSocial(dto.getRazonSocial());
        empresa.setRuc(dto.getRuc());
        empresa.setEmail(dto.getEmail());
        empresa.setTelefono(dto.getTelefono());
        empresa.setDireccion(dto.getDireccion());
        empresa.setEstado(dto.getEstado() == null || dto.getEstado());
        return ResponseEntity.ok(ApiResponse.ok(toDTO(empresaRepository.save(empresa)), "Empresa actualizada correctamente."));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Desactivar una empresa")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> eliminar(@PathVariable Long id) {
        Empresa empresa = empresaRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Empresa no encontrada"));
        empresa.setEstado(false);
        empresaRepository.save(empresa);
        return ResponseEntity.ok(ApiResponse.ok(null, "Empresa desactivada correctamente."));
    }

    private EmpresaDTO toDTO(Empresa empresa) {
        return EmpresaDTO.builder()
                .id(empresa.getId())
                .razonSocial(empresa.getRazonSocial())
                .ruc(empresa.getRuc())
                .email(empresa.getEmail())
                .telefono(empresa.getTelefono())
                .direccion(empresa.getDireccion())
                .estado(empresa.getEstado())
                .fechaCreacion(empresa.getFechaCreacion())
                .build();
    }

    private void validarRucUnico(String ruc, Long idActual) {
        empresaRepository.findAll().stream()
                .filter(empresa -> empresa.getRuc() != null && empresa.getRuc().equalsIgnoreCase(ruc))
                .filter(empresa -> idActual == null || !empresa.getId().equals(idActual))
                .findFirst()
                .ifPresent(empresa -> {
                    throw new BusinessException("Ya existe una empresa con ese RUC");
                });
    }
}
