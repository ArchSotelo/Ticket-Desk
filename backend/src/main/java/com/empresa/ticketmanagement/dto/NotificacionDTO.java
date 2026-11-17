package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificacionDTO {
    private Long id;
    private String titulo;
    private String mensaje;
    private Boolean leido;
    private String tipo;
    private String urlDestino;
    private LocalDateTime fechaCreacion;
}
