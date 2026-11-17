package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
@Schema(description = "Categoría del catálogo de servicios.")
public class CategoriaServicioDTO {
    @Schema(description = "Identificador de la categoría.", example = "1", accessMode = Schema.AccessMode.READ_ONLY)
    private Long id;
    @NotBlank @Schema(description = "Nombre obligatorio y único sin distinguir mayúsculas.", example = "Correo corporativo")
    private String nombre;
    @Schema(description = "Descripción de la categoría.", example = "Servicios de correo y licencias de buzones.")
    private String descripcion;
    @Schema(description = "Nombre de un icono Material. category si está vacío; en actualización, omitirlo conserva el icono actual.", example = "mail")
    private String icono;
    @Schema(description = "Disponibilidad de la categoría. Por defecto true al crear; omitirlo en PUT conserva el estado.", example = "true")
    private Boolean activa;
}
