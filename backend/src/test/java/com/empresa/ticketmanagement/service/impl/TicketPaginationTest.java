package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

// H2 desechable: comprueba filtros y paginación sin conectarse al MySQL del usuario.
@DataJpaTest(showSql = false, properties = { "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "logging.level.root=WARN" })
@ActiveProfiles("test")
@Import(TicketServiceImpl.class)
class TicketPaginationTest {
    @MockitoBean com.empresa.ticketmanagement.security.TicketAccessPolicy accessPolicy;
    @Autowired TestEntityManager em;
    @Autowired TicketServiceImpl service;
    @MockitoBean NotificacionService notifications;
    @MockitoBean RealtimeWebSocketHandler realtime;
    @MockitoBean HistorialRepository history;
    @MockitoBean TicketAttachmentRepository attachments;
    @MockitoBean ComentarioRepository comments;
    private Usuario ana, otro;
    private Empresa empresa;
    private Categoria categoria;
    private Prioridad prioridad;
    private Estado nuevo, cerrado;

    @BeforeEach void seed() {
        when(accessPolicy.clientScope()).thenReturn(null);
        empresa = em.persist(Empresa.builder().razonSocial("Pruebas").ruc("12345678901").build());
        ana = em.persist(Usuario.builder().username("ana").passwordHash("test-only-hash").nombres("Ana")
                .apellidos("Torres").email("ana@example.test").empresa(empresa).build());
        otro = em.persist(Usuario.builder().username("otro").passwordHash("test-only-hash").nombres("Otro")
                .apellidos("Cliente").email("otro@example.test").empresa(empresa).build());
        categoria = em.persist(Categoria.builder().nombre("Redes").build());
        prioridad = em.persist(Prioridad.builder().nombre("Alta").nivel(3).build());
        nuevo = em.persist(Estado.builder().codigo("NUEVO").nombre("Nuevo").build());
        cerrado = em.persist(Estado.builder().codigo("CERRADO").nombre("Cerrado").build());
        add("A", ana, nuevo, "2026-10-01T00:00:00", "Inicio", "Descripción normal");
        add("B", ana, nuevo, "2026-10-01T23:59:59", "Fin", "Problema especial de VPN");
        add("C", otro, cerrado, "2026-10-02T00:00:00", "Uso 100%", "Descripción normal");
        add("D", otro, nuevo, "2026-10-02T00:00:00", "Usuario_A", "Descripción normal");
        em.flush(); em.clear();
    }
    private void add(String code, Usuario client, Estado state, String date, String title, String description) {
        em.persist(Ticket.builder().codigo(code).cliente(client).tecnico(otro).empresa(empresa)
                .categoria(categoria).prioridad(prioridad).estado(state).fechaCreacion(LocalDateTime.parse(date))
                .titulo(title).descripcion(description).build());
    }
    @Test void onlyRequestedPageLoadsHistoryAttachmentsAndComments() {
        var page = service.listarTickets(null,null,null,null,null,null,PageRequest.of(1,2));
        assertThat(page.getTotalElements()).isEqualTo(4);
        assertThat(page.getContent()).extracting("codigo").containsExactly("B","A");
        verify(history,times(2)).findByTicketIdOrderByFechaCambioDesc(anyLong());
        verify(attachments,times(2)).findByTicketIdAndActivoTrue(anyLong());
        verify(comments,times(2)).findByTicketIdOrderByFechaCreacionAsc(anyLong());
        verify(comments,never()).countByTicketId(anyLong());
    }
    @Test void filtersApplyBeforePaginationWithInclusiveDatesAndCaseInsensitiveNames() {
        var page=service.listarTickets("nuevo","alta",categoria.getId(),"ANA TORRES",
                LocalDate.parse("2026-10-01"),LocalDate.parse("2026-10-01"),PageRequest.of(0,1));
        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting("codigo").containsExactly("B");
    }
    @Test void descriptionSearchAndLikeCharactersRemainLiteral() {
        assertThat(service.listarTickets(null,null,null,"especial",null,null,PageRequest.of(0,10)).getContent())
                .extracting("codigo").containsExactly("B");
        assertThat(service.listarTickets(null,null,null,"%",null,null,PageRequest.of(0,10)).getContent())
                .extracting("codigo").containsExactly("C");
        assertThat(service.listarTickets(null,null,null,"_",null,null,PageRequest.of(0,10)).getContent())
                .extracting("codigo").containsExactly("D");
    }
    @Test void clientScopeTotalsEmptyPagesAndExplicitSortingArePreserved() {
        var page=service.listarMisTickets("ana",null,null,null,null,null,null,
                PageRequest.of(0,1, Sort.by("codigo").ascending()));
        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting("codigo").containsExactly("A");
        assertThat(service.listarTicketsPorCliente(ana.getId(),PageRequest.of(0,1)).getTotalElements()).isEqualTo(2);
        var empty=service.listarTickets(null,null,null,null,null,null,PageRequest.of(10,2));
        assertThat(empty.getContent()).isEmpty();
        assertThat(empty.getTotalElements()).isEqualTo(4);
    }
    @Test void personalSearchKeepsTechnicianAndStateNames() {
        var page=service.listarMisTickets("otro",null,null,null,"cerrado",null,null,PageRequest.of(0,10));
        assertThat(page.getContent()).extracting("codigo").containsExactly("C");
        assertThat(service.listarMisTickets("ana",null,null,null,"otro cliente",null,null,
                PageRequest.of(0,10)).getTotalElements()).isEqualTo(2);
    }
}
