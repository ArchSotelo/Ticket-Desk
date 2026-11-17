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
public class ComentarioDTO {
    private Long id;
    private Long usuarioId;
    private String usuarioNombre;
    private String usuarioRol;
    private String contenido;
    private Boolean esInterno;
    private LocalDateTime fechaCreacion;
}
