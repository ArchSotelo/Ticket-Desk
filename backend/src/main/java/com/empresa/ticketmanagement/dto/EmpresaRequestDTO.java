package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class EmpresaRequestDTO {
    @NotBlank(message = "La razón social es obligatoria")
    @Size(max = 150, message = "La razón social no puede superar 150 caracteres")
    private String razonSocial;

    @NotBlank(message = "El RUC es obligatorio")
    @Size(max = 20, message = "El RUC no puede superar 20 caracteres")
    private String ruc;

    @Size(max = 100, message = "El correo no puede superar 100 caracteres")
    private String email;

    @Size(max = 30, message = "El teléfono no puede superar 30 caracteres")
    private String telefono;

    @Size(max = 255, message = "La dirección no puede superar 255 caracteres")
    private String direccion;

    private Boolean estado = true;
}
