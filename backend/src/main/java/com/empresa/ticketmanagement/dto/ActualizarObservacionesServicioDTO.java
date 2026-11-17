package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "Actualización de las observaciones sin modificar otros datos del servicio.")
public class ActualizarObservacionesServicioDTO {
    @Size(max = 4000, message = "Las observaciones no pueden superar los 4000 caracteres.")
    @Schema(description = "Texto de hasta 4000 caracteres; null limpia las observaciones.", example = "Pendiente de confirmar la renovación.", maxLength = 4000, nullable = true)
    private String observaciones;
}
