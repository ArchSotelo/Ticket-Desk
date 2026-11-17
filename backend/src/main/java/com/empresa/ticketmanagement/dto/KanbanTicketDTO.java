package com.empresa.ticketmanagement.dto;

/** Campos mínimos necesarios para pintar una tarjeta del tablero. */
public record KanbanTicketDTO(
        Long id,
        String codigo,
        String titulo,
        String clienteNombre,
        Long tecnicoId,
        String tecnicoNombre,
        String prioridadNombre,
        String estadoCodigo,
        Long cantidadAdjuntos) {
}
