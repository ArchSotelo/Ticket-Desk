package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.dto.DashboardStatsDTO;
import com.empresa.ticketmanagement.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import java.time.LocalDate;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.*;

// Base H2 desechable: nunca utiliza la base de datos de la aplicación.
@DataJpaTest(showSql = false, properties = { "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect", "logging.level.root=WARN" })
@ActiveProfiles("test")
@Import(DashboardServiceImpl.class)
class DashboardPeriodTest {
    @Autowired TestEntityManager em;
    @Autowired DashboardServiceImpl service;
    private Estado nuevo, cerrado;
    private Prioridad prioridad;
    private Categoria categoria;
    private Empresa empresa;
    private Usuario cliente;

    @BeforeEach void seed() {
        empresa = em.persist(Empresa.builder().razonSocial("Empresa de prueba").ruc("12345678901").build());
        cliente = em.persist(Usuario.builder().username("cliente").passwordHash("test-hash").nombres("Ana").apellidos("Torres").email("ana@demo.test").empresa(empresa).build());
        nuevo = em.persist(Estado.builder().codigo("NUEVO").nombre("Nuevo").build());
        cerrado = em.persist(Estado.builder().codigo("CERRADO").nombre("Cerrado").build());
        prioridad = em.persist(Prioridad.builder().nombre("Alta").nivel(3).build());
        categoria = em.persist(Categoria.builder().nombre("Redes").build());
    }
    private void ticket(String codigo, String created, Estado estado, Boolean sla, String resolved) {
        em.persist(Ticket.builder().codigo(codigo).titulo("Ticket prueba").descripcion("Descripción")
                .cliente(cliente).empresa(empresa).estado(estado).prioridad(prioridad).categoria(categoria)
                .fechaCreacion(LocalDateTime.parse(created)).cumplioSlaResolucion(sla)
                .fechaResolucion(resolved == null ? null : LocalDateTime.parse(resolved)).build());
        em.flush(); em.clear();
    }
    @Test void inclusiveDateBoundariesApplyToEveryAggregateAndTrend() {
        ticket("BEFORE", "2026-10-07T23:59:59", cerrado, false, "2026-10-08T10:00:00");
        ticket("START", "2026-10-08T00:00:00", nuevo, null, null);
        ticket("END", "2026-10-14T23:59:59.999999", cerrado, true, "2026-10-14T23:59:59.999999");
        ticket("AFTER", "2026-10-15T00:00:00", cerrado, false, "2026-10-15T09:00:00");
        DashboardStatsDTO result = service.obtenerMetricasGlobales(LocalDate.parse("2026-10-08"), LocalDate.parse("2026-10-14"));
        assertThat(result.getTotalTickets()).isEqualTo(2);
        assertThat(result.getTicketsAbiertos()).isEqualTo(1);
        assertThat(result.getTicketsCerrados()).isEqualTo(1);
        assertThat(result.getTicketsPorEstado()).containsEntry("Nuevo", 1L).containsEntry("Cerrado", 1L);
        assertThat(result.getTicketsPorPrioridad()).containsEntry("Alta", 2L);
        assertThat(result.getTicketsPorCategoria()).containsEntry("Redes", 2L);
        assertThat(result.getTicketsPorTecnico()).containsEntry("Sin asignar", 2L);
        assertThat(result.getTicketsSlaCumplidos()).isEqualTo(1);
        assertThat(result.getTicketsSlaIncumplidos()).isZero();
        assertThat(result.getTicketsSlaPendientes()).isEqualTo(1);
        assertThat(result.getTicketsCreadosPorFecha()).containsExactly(1L,0L,0L,0L,0L,0L,1L);
        assertThat(result.getTicketsResueltosPorFecha()).containsExactly(0L,0L,0L,0L,0L,0L,1L);
        assertThat(result.getFechaDesde()).isEqualTo(LocalDate.parse("2026-10-08"));
        assertThat(result.getFechaHasta()).isEqualTo(LocalDate.parse("2026-10-14"));
    }
    @Test void aSingleDayIncludesOnlyThatDayAndNotNextMidnight() {
        ticket("ONE", "2026-10-14T00:00:00", cerrado, false, "2026-10-15T01:00:00");
        ticket("TWO", "2026-10-15T00:00:00", nuevo, null, null);
        var result = service.obtenerMetricasGlobales(LocalDate.parse("2026-10-14"), LocalDate.parse("2026-10-14"));
        assertThat(result.getTotalTickets()).isEqualTo(1);
        assertThat(result.getPorcentajeCumplimientoSla()).isZero();
        assertThat(result.getFechasTendencia()).containsExactly("14/10");
        assertThat(result.getTicketsResueltosPorFecha()).containsExactly(0L);
    }
    @Test void noBoundsKeepsAllHistoryAndEmptyRangeHasRealZeroes() {
        ticket("OLD", "2025-01-01T10:00:00", cerrado, false, null);
        ticket("NEW", "2026-10-14T10:00:00", nuevo, null, null);
        assertThat(service.obtenerMetricasGlobales().getTotalTickets()).isEqualTo(2);
        var empty = service.obtenerMetricasGlobales(LocalDate.parse("2026-06-01"), LocalDate.parse("2026-06-30"));
        assertThat(empty.getTotalTickets()).isZero();
        assertThat(empty.getTicketsPorEstado()).isEmpty();
        assertThat(empty.getTicketsSlaCumplidos()).isZero();
        assertThat(empty.getTicketsCreadosPorFecha()).allMatch(value -> value == 0L);
    }
    @Test void longAndCrossYearRangesAreBoundedAndRetainAllCounts() {
        ticket("YEAR-ONE", "2025-12-31T23:59:00", cerrado, true, "2026-01-01T12:00:00");
        ticket("YEAR-TWO", "2026-10-14T11:00:00", nuevo, null, null);
        var result = service.obtenerMetricasGlobales(LocalDate.parse("2025-01-01"), LocalDate.parse("2026-12-31"));
        assertThat(result.getFechasTendencia()).hasSizeLessThanOrEqualTo(7);
        assertThat(result.getTicketsCreadosPorFecha().stream().mapToLong(Long::longValue).sum()).isEqualTo(2);
        assertThat(result.getTicketsResueltosPorFecha().stream().mapToLong(Long::longValue).sum()).isEqualTo(1);
    }
    @Test void validatesInvertedAndUnsupportedDates() {
        assertThatThrownBy(() -> service.obtenerMetricasGlobales(LocalDate.parse("2026-10-15"), LocalDate.parse("2026-10-14"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.obtenerMetricasGlobales(LocalDate.of(999, 1, 1), null)).isInstanceOf(IllegalArgumentException.class);
    }
}
