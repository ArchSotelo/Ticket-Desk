package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.KanbanBoardDTO;
import com.empresa.ticketmanagement.dto.KanbanColumnDTO;
import com.empresa.ticketmanagement.dto.PageResponseDTO;
import com.empresa.ticketmanagement.dto.TicketCreateDTO;
import com.empresa.ticketmanagement.dto.TicketResponseDTO;
import com.empresa.ticketmanagement.service.TicketService;
import com.empresa.ticketmanagement.service.KanbanService;
import com.empresa.ticketmanagement.util.PaginationPolicy;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Set;

@RestController
@RequestMapping("/tickets")
@RequiredArgsConstructor
@Tag(name = "Tickets", description = "Gestión completa del ciclo de vida de tickets (Help Desk / Service Desk)")
public class TicketController {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "id", "codigo", "titulo", "fechaCreacion", "fechaModificacion",
            "fechaLimiteRespuesta", "fechaLimiteResolucion", "fechaPrimerRespuesta",
            "fechaResolucion", "fechaCierre");

    private final TicketService ticketService;
    private final KanbanService kanbanService;

    @GetMapping("/kanban")
    @Operation(summary = "Obtener el tablero Kanban con tarjetas ligeras y totales por columna")
    public ResponseEntity<ApiResponse<KanbanBoardDTO>> obtenerKanban(
            @RequestParam(required = false) String busqueda,
            @RequestParam(required = false) String prioridad,
            @RequestParam(required = false) String tecnico) {
        return ResponseEntity.ok(ApiResponse.ok(kanbanService.obtenerTablero(busqueda, prioridad, tecnico)));
    }

    @GetMapping("/kanban/{codigoColumna}")
    @Operation(summary = "Cargar otra página de una columna Kanban")
    public ResponseEntity<ApiResponse<KanbanColumnDTO>> cargarColumnaKanban(
            @PathVariable String codigoColumna,
            @RequestParam(required = false) String busqueda,
            @RequestParam(required = false) String prioridad,
            @RequestParam(required = false) String tecnico,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(ApiResponse.ok(kanbanService.cargarColumna(
                codigoColumna, busqueda, prioridad, tecnico, page, size)));
    }

    @PostMapping
    @Operation(summary = "Crear un nuevo ticket de soporte")
    public ResponseEntity<ApiResponse<TicketResponseDTO>> crearTicket(
            @Valid @RequestBody TicketCreateDTO createDTO,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            Authentication authentication
    ) {
        TicketResponseDTO ticket = ticketService.crearTicket(createDTO, authentication.getName(), idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ticket, "Ticket registrado correctamente."));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener detalles de un ticket por ID")
    public ResponseEntity<ApiResponse<TicketResponseDTO>> obtenerPorId(@PathVariable Long id) {
        TicketResponseDTO ticket = ticketService.obtenerPorId(id);
        return ResponseEntity.ok(ApiResponse.ok(ticket));
    }

    @GetMapping("/cliente/{clienteId}")
    @Operation(summary = "Listar tickets generados por un cliente")
    public ResponseEntity<ApiResponse<PageResponseDTO<TicketResponseDTO>>> listarPorCliente(
            @PathVariable Long clienteId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(ApiResponse.ok(PageResponseDTO.from(ticketService.listarTicketsPorCliente(clienteId,
                PageRequest.of(PaginationPolicy.page(page), PaginationPolicy.size(size),
                        Sort.by(Sort.Direction.DESC, "fechaCreacion"))))));
    }

    @GetMapping("/codigo/{codigo}")
    @Operation(summary = "Obtener detalles de un ticket por código (ej. TICK-2026-0001)")
    public ResponseEntity<ApiResponse<TicketResponseDTO>> obtenerPorCodigo(@PathVariable String codigo) {
        TicketResponseDTO ticket = ticketService.obtenerPorCodigo(codigo);
        return ResponseEntity.ok(ApiResponse.ok(ticket));
    }

    @GetMapping
    @Operation(summary = "Listar tickets con paginación y filtros")
    public ResponseEntity<ApiResponse<PageResponseDTO<TicketResponseDTO>>> listar(
            @RequestParam(required = false) String estado,
            @RequestParam(required = false) String prioridad,
            @RequestParam(required = false) Long categoriaId,
            @RequestParam(required = false) String busqueda,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaDesde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaHasta,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "fechaCreacion") String sortBy,
            @RequestParam(defaultValue = "DESC") String sortDir
    ) {
        Sort sort = crearOrden(sortBy, sortDir);
        Page<TicketResponseDTO> tickets = ticketService.listarTickets(
                estado,
                prioridad,
                categoriaId,
                busqueda,
                fechaDesde,
                fechaHasta,
                PageRequest.of(PaginationPolicy.page(page), PaginationPolicy.size(size), sort)
        );
        return ResponseEntity.ok(ApiResponse.ok(PageResponseDTO.from(tickets)));
    }

    @GetMapping("/mine")
    @Operation(summary = "Listar solo los tickets del usuario autenticado")
    public ResponseEntity<ApiResponse<PageResponseDTO<TicketResponseDTO>>> listarMisTickets(
            Authentication authentication,
            @RequestParam(required = false) String estado,
            @RequestParam(required = false) String prioridad,
            @RequestParam(required = false) Long categoriaId,
            @RequestParam(required = false) String busqueda,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaDesde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaHasta,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Page<TicketResponseDTO> tickets = ticketService.listarMisTickets(authentication.getName(), estado, prioridad, categoriaId, busqueda, fechaDesde, fechaHasta,
                PageRequest.of(PaginationPolicy.page(page), PaginationPolicy.size(size),
                        Sort.by("fechaCreacion").descending()));
        return ResponseEntity.ok(ApiResponse.ok(PageResponseDTO.from(tickets)));
    }

    private Sort crearOrden(String sortBy, String sortDir) {
        if (sortBy == null || !ALLOWED_SORT_FIELDS.contains(sortBy)) {
            throw new BusinessException("Campo de ordenamiento no permitido.");
        }
        if (sortDir == null || !(sortDir.equalsIgnoreCase("ASC") || sortDir.equalsIgnoreCase("DESC"))) {
            throw new BusinessException("La dirección de ordenamiento debe ser ASC o DESC.");
        }
        return sortDir.equalsIgnoreCase("ASC") ? Sort.by(sortBy).ascending() : Sort.by(sortBy).descending();
    }

    @PatchMapping("/{id}/estado")
    @Operation(summary = "Cambiar el estado de un ticket (Workflow)")
    public ResponseEntity<ApiResponse<TicketResponseDTO>> cambiarEstado(
            @PathVariable Long id,
            @RequestParam String nuevoEstadoCodigo,
            Authentication authentication
    ) {
        TicketResponseDTO ticket = ticketService.cambiarEstado(id, nuevoEstadoCodigo, authentication.getName());
        return ResponseEntity.ok(ApiResponse.ok(ticket, "Estado del ticket actualizado a " + nuevoEstadoCodigo));
    }

    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('TICKET_ASSIGN')")
    @PatchMapping("/{id}/asignar")
    @Operation(summary = "Reasignar un técnico a un ticket")
    public ResponseEntity<ApiResponse<TicketResponseDTO>> asignarTecnico(
            @PathVariable Long id,
            @RequestParam Long tecnicoId,
            Authentication authentication
    ) {
        TicketResponseDTO ticket = ticketService.asignarTecnico(id, tecnicoId, authentication.getName());
        return ResponseEntity.ok(ApiResponse.ok(ticket, "Técnico asignado correctamente."));
    }

    @PostMapping("/{id}/comentarios")
    @Operation(summary = "Agregar comentario a un ticket")
    public ResponseEntity<ApiResponse<TicketResponseDTO>> agregarComentario(
            @PathVariable Long id,
            @RequestParam String contenido,
            @RequestParam(defaultValue = "false") boolean esInterno,
            Authentication authentication
    ) {
        TicketResponseDTO ticket = ticketService.agregarComentario(id, contenido, esInterno, authentication.getName());
        return ResponseEntity.ok(ApiResponse.ok(ticket, "Comentario agregado correctamente."));
    }
}
