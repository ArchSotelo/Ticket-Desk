package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AreaRequestDTO {
    @NotNull(message = "La empresa es obligatoria")
    private Long empresaId;

    @NotBlank(message = "El nombre es obligatorio")
    @Size(max = 100, message = "El nombre no puede superar 100 caracteres")
    private String nombre;

    @Size(max = 255, message = "La descripción no puede superar 255 caracteres")
    private String descripcion;

    private Boolean activo = true;
}
