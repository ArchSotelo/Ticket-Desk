package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class PoliticaAccesoDTO {
    @NotNull @Min(3) @Max(20)
    private Integer maxIntentos;
    @NotNull @Min(1) @Max(1440)
    private Integer duracionBloqueoMinutos;
    @NotNull @Min(5) @Max(300)
    private Integer limiteLoginPorMinuto;
    private String actualizadoPor;
    private java.time.LocalDateTime fechaActualizacion;
}
