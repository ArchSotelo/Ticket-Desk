package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CatalogCategoriaDTO {
    private Long id;
    private String nombre;
    private String descripcion;
    private List<CatalogSubcategoriaDTO> subcategorias;
}
