package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
@Schema(description = "Evento registrado del sistema, con usuario, origen y fecha local de la aplicación.")
public class AuditoriaDTO {
    @Schema(description = "Identificador del evento.", example = "123")
    private Long id;
    @Schema(description = "Usuario asociado; puede ser null si no se identificó un usuario.", example = "8", nullable = true)
    private Long usuarioId;
    @Schema(description = "Nombre del usuario o la etiqueta No identificado / Usuario no disponible.", example = "Usuario Ejemplo")
    private String usuarioNombre;
    @Schema(description = "Dirección IP registrada o SISTEMA para operaciones internas.", example = "127.0.0.1")
    private String ipOrigen;
    @Schema(description = "User-Agent registrado, truncado a un máximo de 255 caracteres; N/A si no está disponible.", example = "Mozilla/5.0 (X11; Linux x86_64) Chrome/156.0.0.0")
    private String userAgent;
    @Schema(description = "Código original del evento; POST es una operación registrada y no equivale por sí solo a LOGIN_EXITOSO.", example = "LOGIN_EXITOSO")
    private String accion;
    @Schema(description = "Módulo que originó el evento.", example = "AUTENTICACION")
    private String modulo;
    @Schema(description = "Descripción registrada de la operación.", example = "Inicio de sesión correcto")
    private String detalle;
    @Schema(description = "Fecha y hora locales del registro en la zona de la aplicación (America/Lima).", example = "2026-10-28T15:30:00")
    private LocalDateTime fechaRegistro;
}
