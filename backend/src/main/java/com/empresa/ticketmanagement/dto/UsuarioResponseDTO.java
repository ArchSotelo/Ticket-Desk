package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class UsuarioResponseDTO {
    private Long id;
    private String username;
    private String nombres;
    private String apellidos;
    private String email;
    private String telefono;
    private Long empresaId;
    private String empresaNombre;
    private Long areaId;
    private String areaNombre;
    private String cargo;
    private String estado;
    private Boolean requiereCambioPassword;
    private LocalDateTime fechaUltimoAcceso;
    private LocalDateTime fechaCreacion;
    private List<String> roles;
    private List<String> permissions;
}
