package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class UsuarioUpdateDTO {
    @Size(min = 3, max = 50)
    private String username;

    @Size(min = 8, message = "La contraseña debe tener al menos 8 caracteres")
    private String password;

    private String nombres;
    private String apellidos;

    @Email(message = "Formato de email inválido")
    private String email;

    private String telefono;
    private Long empresaId;
    private Long areaId;
    private String cargo;
    private List<String> roles;
}
