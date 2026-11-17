package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SubcategoriaDTO {
    private Long id;
    private Long categoriaId;
    private String categoriaNombre;
    private String nombre;
    private String descripcion;
    private Boolean activa;
}
