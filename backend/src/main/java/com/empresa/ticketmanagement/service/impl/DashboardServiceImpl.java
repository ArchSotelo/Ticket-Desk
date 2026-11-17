package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.DashboardStatsDTO;
import com.empresa.ticketmanagement.entity.Ticket;
import com.empresa.ticketmanagement.repository.TicketRepository;
import com.empresa.ticketmanagement.service.DashboardService;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {
    private final TicketRepository ticketRepository;

    @Override
    @Transactional(readOnly = true)
    public DashboardStatsDTO obtenerMetricasGlobales() {
        return obtenerMetricasGlobales(null, null);
    }

    @Override
    @Transactional(readOnly = true)
    public DashboardStatsDTO obtenerMetricasGlobales(LocalDate fechaDesde, LocalDate fechaHasta) {
        validarRango(fechaDesde, fechaHasta);
        // Una única cohorte por fecha de creación para TODOS los agregados.
        // Precargar las relaciones utilizadas por los gráficos dentro de la transacción.
        Specification<Ticket> periodo = (root, query, cb) -> {
            root.fetch("estado", JoinType.LEFT);
            root.fetch("prioridad", JoinType.LEFT);
            root.fetch("categoria", JoinType.LEFT);
            root.fetch("tecnico", JoinType.LEFT);
            List<Predicate> condiciones = new ArrayList<>();
            if (fechaDesde != null) condiciones.add(cb.greaterThanOrEqualTo(root.get("fechaCreacion"), fechaDesde.atStartOfDay()));
            if (fechaHasta != null) {
                if (fechaHasta.equals(LocalDate.of(9999, 12, 31)))
                    condiciones.add(cb.lessThanOrEqualTo(root.get("fechaCreacion"), fechaHasta.atTime(23, 59, 59, 999_999_000)));
                else condiciones.add(cb.lessThan(root.get("fechaCreacion"), fechaHasta.plusDays(1).atStartOfDay()));
            }
            return cb.and(condiciones.toArray(Predicate[]::new));
        };
        List<Ticket> tickets = ticketRepository.findAll(periodo);
        long total = tickets.size();
        Map<String, Long> porEstado = new LinkedHashMap<>();
        Map<String, Long> porPrioridad = new LinkedHashMap<>();
        Map<String, Long> porTecnico = new LinkedHashMap<>();
        Map<String, Long> porCategoria = new LinkedHashMap<>();
        long abiertos = 0, enProceso = 0, resueltos = 0, cerrados = 0;
        long cumplidos = 0, incumplidos = 0, pendientes = 0;
        for (Ticket ticket : tickets) {
            String codigo = ticket.getEstado() == null ? "" : ticket.getEstado().getCodigo();
            if ("NUEVO".equals(codigo)) abiertos++;
            if ("EN_PROCESO".equals(codigo)) enProceso++;
            if ("RESUELTO".equals(codigo)) resueltos++;
            if ("CERRADO".equals(codigo)) cerrados++;
            porEstado.merge(nombre(ticket.getEstado() == null ? null : ticket.getEstado().getNombre(), "Sin estado"), 1L, Long::sum);
            porPrioridad.merge(nombre(ticket.getPrioridad() == null ? null : ticket.getPrioridad().getNombre(), "Sin prioridad"), 1L, Long::sum);
            String tecnico = ticket.getTecnico() == null ? null
                    : (nombre(ticket.getTecnico().getNombres(), "") + " " + nombre(ticket.getTecnico().getApellidos(), "")).trim();
            porTecnico.merge(nombre(tecnico, "Sin asignar"), 1L, Long::sum);
            porCategoria.merge(nombre(ticket.getCategoria() == null ? null : ticket.getCategoria().getNombre(), "Sin categoría"), 1L, Long::sum);
            if (Boolean.TRUE.equals(ticket.getCumplioSlaResolucion())) cumplidos++;
            else if (Boolean.FALSE.equals(ticket.getCumplioSlaResolucion())) incumplidos++;
            else pendientes++;
        }

        LocalDate hoy = LocalDate.now(ZoneId.of("America/Lima"));
        boolean filtrado = fechaDesde != null || fechaHasta != null;
        LocalDate fin = fechaHasta != null ? fechaHasta : (fechaDesde != null && fechaDesde.isAfter(hoy) ? fechaDesde : hoy);
        LocalDate inicio = fechaDesde != null ? fechaDesde : fin.minusDays(6);
        // Sin filtro conservar la tendencia de los últimos siete días.
        long dias = ChronoUnit.DAYS.between(inicio, fin) + 1;
        long intervalo = Math.max(1, (dias + 6) / 7);
        DateTimeFormatter formato = DateTimeFormatter.ofPattern("dd/MM");
        List<String> fechas = new ArrayList<>();
        List<Long> creados = new ArrayList<>();
        List<Long> solucionados = new ArrayList<>();
        for (LocalDate desde = inicio; !desde.isAfter(fin); desde = desde.plusDays(intervalo)) {
            LocalDate hasta = desde.plusDays(Math.min(intervalo - 1, ChronoUnit.DAYS.between(desde, fin)));
            final LocalDate limiteDesde = desde;
            final LocalDate limiteHasta = hasta;
            fechas.add(desde.equals(hasta) ? desde.format(formato) : desde.format(formato) + "–" + hasta.format(formato));
            creados.add(tickets.stream().filter(t -> dentro(t.getFechaCreacion() == null ? null : t.getFechaCreacion().toLocalDate(), limiteDesde, limiteHasta)).count());
            solucionados.add(tickets.stream().filter(t -> dentro(t.getFechaResolucion() == null ? null : t.getFechaResolucion().toLocalDate(), limiteDesde, limiteHasta)).count());
        }
        String descripcion = !filtrado ? "Últimos 7 días · independiente del historial general."
                : intervalo == 1 ? "Datos diarios del periodo seleccionado."
                : "Periodo seleccionado agrupado en intervalos de hasta " + intervalo + " días.";

        return DashboardStatsDTO.builder()
                .fechaDesde(fechaDesde).fechaHasta(fechaHasta).descripcionTendencia(descripcion)
                .totalTickets(total).ticketsAbiertos(abiertos).ticketsEnProceso(enProceso)
                .ticketsResueltos(resueltos).ticketsCerrados(cerrados).ticketsVencidosSla(incumplidos)
                // Mantener la definición existente del porcentaje general.
                .porcentajeCumplimientoSla(total > 0 ? Math.round((double) (total - incumplidos) / total * 10000.0) / 100.0 : 100.0)
                .ticketsPorEstado(porEstado).ticketsPorPrioridad(porPrioridad)
                .ticketsPorTecnico(porTecnico).ticketsPorCategoria(porCategoria)
                .ticketsSlaCumplidos(cumplidos).ticketsSlaIncumplidos(incumplidos).ticketsSlaPendientes(pendientes)
                .fechasTendencia(fechas).ticketsCreadosPorFecha(creados).ticketsResueltosPorFecha(solucionados)
                .build();
    }

    private void validarRango(LocalDate desde, LocalDate hasta) {
        if ((desde != null && (desde.getYear() < 1000 || desde.getYear() > 9999))
                || (hasta != null && (hasta.getYear() < 1000 || hasta.getYear() > 9999)))
            throw new BusinessException("Las fechas deben estar entre los años 1000 y 9999.");
        if (desde != null && hasta != null && desde.isAfter(hasta))
            throw new BusinessException("La fecha desde no puede ser posterior a la fecha hasta.");
    }
    private boolean dentro(LocalDate fecha, LocalDate desde, LocalDate hasta) {
        return fecha != null && !fecha.isBefore(desde) && !fecha.isAfter(hasta);
    }
    private String nombre(String valor, String defecto) { return valor == null || valor.isBlank() ? defecto : valor.trim(); }
}
