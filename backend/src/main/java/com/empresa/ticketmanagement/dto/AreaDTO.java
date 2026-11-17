package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AreaDTO {
    private Long id;
    private Long empresaId;
    private String empresaNombre;
    private String nombre;
    private String descripcion;
    private Boolean activo;
}
