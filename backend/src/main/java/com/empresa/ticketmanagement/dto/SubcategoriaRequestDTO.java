package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SubcategoriaRequestDTO {

    @NotNull(message = "La categoría es obligatoria")
    private Long categoriaId;

    @NotBlank(message = "El nombre de la subcategoría es obligatorio")
    private String nombre;

    private String descripcion;

    private Boolean activa;
}
