package com.empresa.ticketmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class TicketCreateDTO {

    @NotBlank(message = "El título del ticket es obligatorio")
    private String titulo;

    @NotBlank(message = "La descripción del ticket es obligatoria")
    private String descripcion;

    /** Cliente para tickets creados por administrador, supervisor o técnico activos. */
    private Long clienteId;

    /** Opcional por compatibilidad; si se envía, debe coincidir con la empresa del solicitante. */
    private Long empresaId;

    /** Opcional por compatibilidad; el área se obtiene del perfil del solicitante. */
    private Long areaId;

    @NotNull(message = "La categoría es obligatoria")
    private Long categoriaId;

    @NotNull(message = "La subcategoría es obligatoria")
    private Long subcategoriaId;

    @NotNull(message = "La prioridad es obligatoria")
    private Long prioridadId;

    /** Compatibilidad con clientes anteriores: el servidor calcula este valor desde el SLA. */
    private Integer tiempoEstimadoMinutos;
}
