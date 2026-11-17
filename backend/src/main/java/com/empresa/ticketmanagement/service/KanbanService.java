package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.dto.KanbanBoardDTO;
import com.empresa.ticketmanagement.dto.KanbanColumnDTO;
import com.empresa.ticketmanagement.dto.KanbanTechnicianOptionDTO;
import com.empresa.ticketmanagement.dto.KanbanTicketDTO;
import com.empresa.ticketmanagement.exception.BusinessException;
import com.empresa.ticketmanagement.repository.TicketRepository;
import com.empresa.ticketmanagement.security.TicketAccessPolicy;
import com.empresa.ticketmanagement.util.PaginationPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class KanbanService {

    private static final int INITIAL_PAGE_SIZE = 50;
    private static final String UNASSIGNED = "unassigned";
    private static final List<ColumnDefinition> COLUMNS = List.of(
            new ColumnDefinition("NUEVO", List.of("NUEVO", "ASIGNADO")),
            new ColumnDefinition("EN_PROCESO", List.of("EN_PROCESO", "PENDIENTE_CLIENTE")),
            new ColumnDefinition("RESUELTO", List.of("RESUELTO")),
            new ColumnDefinition("CERRADO", List.of("CERRADO")));
    private static final List<String> ALL_STATES = COLUMNS.stream()
            .flatMap(column -> column.states().stream()).toList();

    private final TicketRepository ticketRepository;
    private final TicketAccessPolicy accessPolicy;

    @Transactional(readOnly = true)
    public KanbanBoardDTO obtenerTablero(String busqueda, String prioridad, String tecnico) {
        Long clienteId = accessPolicy.clientScope();
        Filters filters = filters(busqueda, prioridad, tecnico);
        Map<String, Long> counts = contar(clienteId, ALL_STATES, filters);

        List<KanbanColumnDTO> columns = COLUMNS.stream()
                .map(column -> cargarColumna(clienteId, column, filters, 0, INITIAL_PAGE_SIZE, counts))
                .toList();
        List<String> priorities = ticketRepository.opcionesPrioridadKanban(clienteId);
        List<KanbanTechnicianOptionDTO> technicians = ticketRepository.opcionesTecnicoKanban(clienteId)
                .stream().sorted(Comparator.comparing(KanbanTechnicianOptionDTO::nombre,
                        String.CASE_INSENSITIVE_ORDER)).toList();
        return new KanbanBoardDTO(columns, priorities, technicians);
    }

    @Transactional(readOnly = true)
    public KanbanColumnDTO cargarColumna(String codigo, String busqueda, String prioridad,
            String tecnico, int pagina, int tamano) {
        Long clienteId = accessPolicy.clientScope();
        ColumnDefinition column = COLUMNS.stream().filter(value -> value.code().equals(codigo))
                .findFirst().orElseThrow(() -> new BusinessException("Columna Kanban no válida."));
        Filters filters = filters(busqueda, prioridad, tecnico);
        Map<String, Long> counts = contar(clienteId, column.states(), filters);
        return cargarColumna(clienteId, column, filters, PaginationPolicy.page(pagina),
                PaginationPolicy.size(tamano), counts);
    }

    private KanbanColumnDTO cargarColumna(Long clienteId, ColumnDefinition column, Filters filters,
            int pagina, int tamano, Map<String, Long> counts) {
        long total = column.states().stream().mapToLong(state -> counts.getOrDefault(state, 0L)).sum();
        List<KanbanTicketDTO> tickets = ticketRepository.buscarTarjetasKanban(
                clienteId, column.states(), filters.priority(), filters.search(),
                filters.filterTechnician(), filters.unassigned(), filters.technicianId(),
                PageRequest.of(pagina, tamano));
        boolean hasMore = (long) (pagina + 1) * tamano < total;
        return new KanbanColumnDTO(column.code(), tickets, total, pagina, tamano, hasMore);
    }

    private Map<String, Long> contar(Long clienteId, List<String> states, Filters filters) {
        Map<String, Long> result = new HashMap<>();
        for (Object[] row : ticketRepository.contarEstadosKanban(clienteId, states,
                filters.priority(), filters.search(), filters.filterTechnician(),
                filters.unassigned(), filters.technicianId())) {
            result.put((String) row[0], ((Number) row[1]).longValue());
        }
        return result;
    }

    private Filters filters(String search, String priority, String technician) {
        String searchTerm = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        if (searchTerm.length() > 100) throw new BusinessException("La búsqueda no puede superar 100 caracteres.");
        if (!searchTerm.isEmpty()) {
            searchTerm = searchTerm.replace("$", "$$").replace("%", "$%").replace("_", "$_");
            searchTerm = "%" + searchTerm + "%";
        }

        String priorityFilter = priority == null ? "" : priority.trim().toLowerCase(Locale.ROOT);
        if (priorityFilter.length() > 100) throw new BusinessException("La prioridad no es válida.");

        String technicianFilter = technician == null ? "" : technician.trim();
        if (technicianFilter.isEmpty()) return new Filters(searchTermOrNull(searchTerm), emptyOrNull(priorityFilter), false, false, null);
        if (UNASSIGNED.equalsIgnoreCase(technicianFilter)) {
            return new Filters(searchTermOrNull(searchTerm), emptyOrNull(priorityFilter), true, true, null);
        }
        try {
            long id = Long.parseLong(technicianFilter);
            if (id <= 0) throw new NumberFormatException();
            return new Filters(searchTermOrNull(searchTerm), emptyOrNull(priorityFilter), true, false, id);
        } catch (NumberFormatException exception) {
            throw new BusinessException("El técnico seleccionado no es válido.");
        }
    }

    private String searchTermOrNull(String value) { return value == null || value.isEmpty() ? null : value; }
    private String emptyOrNull(String value) { return value == null || value.isEmpty() ? null : value; }

    private record ColumnDefinition(String code, List<String> states) {}
    private record Filters(String search, String priority, boolean filterTechnician,
            boolean unassigned, Long technicianId) {}
}
