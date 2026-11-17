package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "Motivo obligatorio para cancelar un servicio.")
public class CancelarServicioDTO {
    @NotBlank(message = "La observación de cancelación es obligatoria.")
    @Size(max = 2000, message = "La observación no puede superar los 2000 caracteres.")
    @Schema(description = "Justificación no vacía de hasta 2000 caracteres.", example = "Se reemplazará por un nuevo proveedor.", maxLength = 2000)
    private String observacionCancelacion;
}
