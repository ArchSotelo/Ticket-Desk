package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PasswordChangeDTO {
    @NotBlank(message = "Ingresa tu contraseña actual.")
    private String currentPassword;

    @NotBlank(message = "Ingresa una nueva contraseña.")
    @Size(min = 8, max = 72, message = "La nueva contraseña debe tener entre 8 y 72 caracteres.")
    private String newPassword;
}
