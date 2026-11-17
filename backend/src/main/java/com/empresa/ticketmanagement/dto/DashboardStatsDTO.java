package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;
import java.util.List;
import java.time.LocalDate;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class DashboardStatsDTO {
    private LocalDate fechaDesde;
    private LocalDate fechaHasta;
    private String descripcionTendencia;
    private Long totalTickets;
    private Long ticketsAbiertos;
    private Long ticketsEnProceso;
    private Long ticketsResueltos;
    private Long ticketsCerrados;
    private Long ticketsVencidosSla;
    private Double porcentajeCumplimientoSla;
    private Map<String, Long> ticketsPorEstado;
    private Map<String, Long> ticketsPorPrioridad;
    private List<String> fechasTendencia;
    private List<Long> ticketsCreadosPorFecha;
    private List<Long> ticketsResueltosPorFecha;
    private Map<String, Long> ticketsPorTecnico;
    private Map<String, Long> ticketsPorCategoria;
    private Long ticketsSlaCumplidos;
    private Long ticketsSlaIncumplidos;
    private Long ticketsSlaPendientes;
}
