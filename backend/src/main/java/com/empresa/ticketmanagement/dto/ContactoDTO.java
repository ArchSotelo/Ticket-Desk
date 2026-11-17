package com.empresa.ticketmanagement.dto;

import lombok.Builder;
import lombok.Value;
import java.util.List;

/** Datos del directorio de soporte; no incluye permisos ni datos de sesión de la cuenta. */
@Value
@Builder
public class ContactoDTO {
    Long id;
    String username;
    String nombres;
    String apellidos;
    String email;
    String telefono;
    Long empresaId;
    String empresaNombre;
    Long areaId;
    String areaNombre;
    String estado;
    List<String> roles;
}
