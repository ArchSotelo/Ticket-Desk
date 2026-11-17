package com.empresa.ticketmanagement.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import com.empresa.ticketmanagement.dto.*;
import com.empresa.ticketmanagement.entity.ConfiguracionServicio;
import com.empresa.ticketmanagement.repository.ConfiguracionServicioRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@org.springframework.security.access.prepost.PreAuthorize("hasAuthority('SERVICE_CONFIG_MANAGE')")
@RestController @RequestMapping("/service-settings") @RequiredArgsConstructor
@Tag(name = "Configuración de servicios", description = "Parámetros globales y plantillas de recordatorios de vencimiento. Requiere autenticación JWT.")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Datos inválidos o regla de negocio incumplida. Los registros inexistentes también se informan con HTTP 400.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Falta el token JWT o la sesión no es válida.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "Error interno no controlado.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class)))
})
public class ConfiguracionServicioController {
    private final ConfiguracionServicioRepository repository;
    @Operation(summary = "Consultar la configuración de servicios", description = "Devuelve la primera configuración registrada. Si no existe, crea y devuelve la configuración predeterminada.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Configuración global de servicios.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping public ResponseEntity<ApiResponse<ConfiguracionServicioDTO>> obtener() { return ResponseEntity.ok(ApiResponse.ok(toDto(config()))); }
    @Operation(summary = "Actualizar la configuración de servicios", description = "Reemplaza los parámetros y plantillas globales. diasPorVencer admite de 1 a 365 días. asuntoRecordatorio y plantillaRecordatorio son obligatorios; las demás plantillas corresponden a los avisos por vencer y vencidos.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Configuración guardada.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @PutMapping public ResponseEntity<ApiResponse<ConfiguracionServicioDTO>> actualizar(@Valid @RequestBody ConfiguracionServicioDTO dto) { ConfiguracionServicio item = config(); item.setDiasPorVencer(dto.getDiasPorVencer()); item.setRecordatorioVencido(Boolean.TRUE.equals(dto.getRecordatorioVencido())); item.setAsuntoRecordatorio(dto.getAsuntoRecordatorio()); item.setPlantillaRecordatorio(dto.getPlantillaRecordatorio()); item.setAsuntoPorVencer(dto.getAsuntoPorVencer()); item.setPlantillaPorVencer(dto.getPlantillaPorVencer()); item.setAsuntoVencido(dto.getAsuntoVencido()); item.setPlantillaVencido(dto.getPlantillaVencido()); return ResponseEntity.ok(ApiResponse.ok(toDto(repository.save(item)), "Configuración de servicios actualizada correctamente.")); }
    private ConfiguracionServicio config() { return repository.findFirstByOrderByIdAsc().orElseGet(() -> repository.save(ConfiguracionServicio.builder().build())); }
    private ConfiguracionServicioDTO toDto(ConfiguracionServicio i) { return ConfiguracionServicioDTO.builder().diasPorVencer(i.getDiasPorVencer()).recordatorioVencido(i.getRecordatorioVencido()).asuntoRecordatorio(i.getAsuntoRecordatorio()).plantillaRecordatorio(i.getPlantillaRecordatorio()).asuntoPorVencer(i.getAsuntoPorVencer()).plantillaPorVencer(i.getPlantillaPorVencer()).asuntoVencido(i.getAsuntoVencido()).plantillaVencido(i.getPlantillaVencido()).build(); }
}
