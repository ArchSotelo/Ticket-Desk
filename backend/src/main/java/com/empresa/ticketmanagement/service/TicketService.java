package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.dto.TicketCreateDTO;
import com.empresa.ticketmanagement.dto.TicketResponseDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;

public interface TicketService {
    TicketResponseDTO crearTicket(TicketCreateDTO createDTO, String username, String idempotencyKey);
    TicketResponseDTO obtenerPorId(Long id);
    TicketResponseDTO obtenerPorCodigo(String codigo);
    Page<TicketResponseDTO> listarTickets(String estado, String prioridad, Long categoriaId, String busqueda, LocalDate fechaDesde, LocalDate fechaHasta, Pageable pageable);
    Page<TicketResponseDTO> listarMisTickets(String username, String estado, String prioridad, Long categoriaId, String busqueda, LocalDate fechaDesde, LocalDate fechaHasta, Pageable pageable);
    Page<TicketResponseDTO> listarTicketsPorCliente(Long clienteId, Pageable pageable);
    TicketResponseDTO cambiarEstado(Long id, String nuevoEstadoCodigo, String username);
    TicketResponseDTO asignarTecnico(Long id, Long tecnicoId, String username);
    TicketResponseDTO agregarComentario(Long id, String contenido, boolean esInterno, String username);
}
