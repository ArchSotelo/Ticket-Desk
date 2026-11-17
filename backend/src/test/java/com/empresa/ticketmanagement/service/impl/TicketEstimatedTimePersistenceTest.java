package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.dto.TicketCreateDTO;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.*;

// Base H2 desechable: verifica la columna real sin acceder a MySQL de producción.
@DataJpaTest(showSql = false, properties = { "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect", "logging.level.root=WARN" })
@ActiveProfiles("test")
@Import(TicketServiceImpl.class)
class TicketEstimatedTimePersistenceTest {
    @MockitoBean com.empresa.ticketmanagement.security.TicketAccessPolicy accessPolicy;
    @Autowired TestEntityManager em;
    @Autowired TicketServiceImpl service;
    @MockitoBean NotificacionService notifications;
    @MockitoBean RealtimeWebSocketHandler realtime;
    Prioridad priority;
    TicketCreateDTO dto;

    @BeforeEach void setup() {
        Empresa company = em.persist(Empresa.builder().razonSocial("Empresa de prueba").ruc("12345678901").build());
        em.persist(Usuario.builder().username("cliente").nombres("Ana").apellidos("Torres")
                .email("ana@example.test").passwordHash("test-only").empresa(company).build());
        Categoria category = em.persist(Categoria.builder().nombre("Soporte").build());
        Subcategoria subcategory = em.persist(Subcategoria.builder().nombre("Correo").categoria(category).build());
        priority = em.persist(Prioridad.builder().nombre("Media").nivel(2).tiempoRespuestaHrs(12).tiempoResolucionHrs(48).build());
        em.persist(Estado.builder().nombre("Nuevo").codigo("NUEVO").esInicial(true).build());
        dto = new TicketCreateDTO(); dto.setTitulo("Falla en el correo"); dto.setDescripcion("No puedo acceder a mi cuenta de correo.");
        dto.setEmpresaId(company.getId()); dto.setCategoriaId(category.getId()); dto.setSubcategoriaId(subcategory.getId()); dto.setPrioridadId(priority.getId());
        em.flush();
    }

    @Test void storesResolutionMinutesFromAssignedSlaInTheDatabaseColumn() {
        em.persist(Sla.builder().nombre("SLA específico").prioridad(priority).tiempoRespuestaMinutos(15).tiempoResolucionMinutos(90).build());
        em.flush();
        // El valor enviado no puede reemplazar el cálculo automático del servidor.
        dto.setTiempoEstimadoMinutos(7);
        var result = service.crearTicket(dto, "cliente", "sla-specific");
        em.flush(); em.clear();
        Number stored = (Number) em.getEntityManager().createNativeQuery(
                "SELECT tiempo_estimado_minutos FROM tickets WHERE id = :id").setParameter("id", result.getId()).getSingleResult();
        assertThat(stored.intValue()).isEqualTo(90);
        assertThat(result.getTiempoEstimadoMinutos()).isEqualTo(90);
        assertThat(result.getFechaLimiteResolucion()).isEqualTo(result.getFechaCreacion().plusMinutes(90));
        // Repetir la misma creación es idempotente y conserva la estimación original.
        var retry = service.crearTicket(dto, "cliente", "sla-specific");
        assertThat(retry.getId()).isEqualTo(result.getId());
        assertThat(retry.getTiempoEstimadoMinutos()).isEqualTo(90);
    }

    @Test void createsMissingSlaAndPersistsPriorityHoursAsMinutes() {
        var result = service.crearTicket(dto, "cliente", "sla-from-priority");
        em.flush(); em.clear();
        Ticket stored = em.find(Ticket.class, result.getId());
        assertThat(stored.getTiempoEstimadoMinutos()).isEqualTo(2880);
        assertThat(stored.getSla().getTiempoResolucionMinutos()).isEqualTo(2880);
        assertThat(result.getTiempoEstimadoMinutos()).isEqualTo(2880);
        assertThat(result.getFechaLimiteResolucion()).isEqualTo(result.getFechaCreacion().plusHours(48));
    }
}
