package com.empresa.ticketmanagement.dto;

import java.util.List;

public record KanbanColumnDTO(
        String codigo,
        List<KanbanTicketDTO> tickets,
        long total,
        int pagina,
        int tamano,
        boolean hayMas) {
}
