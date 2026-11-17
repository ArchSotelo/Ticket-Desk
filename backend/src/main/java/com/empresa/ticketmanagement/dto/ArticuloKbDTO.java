package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ArticuloKbDTO {
    private Long id;

    @NotBlank(message = "El título es obligatorio")
    private String titulo;

    @NotBlank(message = "El contenido es obligatorio")
    private String contenidoMarkdown;

    @NotNull(message = "La categoría es obligatoria")
    private Long categoriaId;
    private String categoriaNombre;

    private Long autorId;
    private String autorNombre;
    private Integer vistas;
    private Boolean esPublico;
    private String fechaCreacion;
    private String fechaModificacion;
}
