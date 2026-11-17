package com.empresa.ticketmanagement.dto;

import java.util.List;

public record KanbanBoardDTO(
        List<KanbanColumnDTO> columnas,
        List<String> prioridades,
        List<KanbanTechnicianOptionDTO> tecnicos) {
}
