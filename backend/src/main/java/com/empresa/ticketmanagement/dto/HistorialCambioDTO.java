package com.empresa.ticketmanagement.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class HistorialCambioDTO {
    private Long id;
    private String usuarioNombre;
    private String campoModificado;
    private String valorAnterior;
    private String valorNuevo;
    private LocalDateTime fechaCambio;
}
