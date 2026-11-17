package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.audit.AuditQueryService;
import com.empresa.ticketmanagement.entity.Auditoria;
import com.empresa.ticketmanagement.entity.Usuario;
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

@DataJpaTest(showSql = false, properties = { "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect", "logging.level.root=WARN" })
@ActiveProfiles("test")
@Import(AuditQueryService.class)
class AuditQueryTest {
    @Autowired TestEntityManager em;
    @Autowired AuditQueryService service;
    Long exampleUserId;
    final LocalDate day = LocalDate.of(2026, 10, 27);
    @BeforeEach void seed() {
        exampleUserId = em.persist(Usuario.builder().username("usuario-ejemplo").nombres("Usuario").apellidos("Ejemplo")
                .email("usuario@example.test").passwordHash("test-only").build()).getId();
        for (int i = 0; i < 14; i++) event(null, "PUT", "Ticket", "PUT /tickets/1 ejecutado correctamente", day.atTime(12, i));
        event(exampleUserId, "LOGIN_EXITOSO", "AUTENTICACION", "Inicio de sesión correcto", day.atStartOfDay());
        event(exampleUserId, "POST", "Auth", "POST /api/v1/auth/login ejecutado correctamente", day.atTime(23, 59, 59));
        event(null, "LOGIN_FALLIDO", "AUTENTICACION", "Inicio de sesión fallido", day.plusDays(1).atStartOfDay());
        em.flush();
    }
    void event(Long user, String action, String module, String detail, LocalDateTime date) {
        em.persist(Auditoria.builder().usuarioId(user).accion(action).modulo(module).detalle(detail)
                .ipOrigen(user == null ? "10.0.0.1" : "127.0.0.1").fechaRegistro(date).build());
    }
    @Test void searchesUserBeforePaginationAndPreservesFilteredTotals() {
        var page = service.listar(0, 1, " USUARIO EJEMPLO ", "", "", null, null, "desc");
        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getTotalPages()).isEqualTo(2);
        assertThat(page.getContent().getFirst().getAccion()).isEqualTo("POST");
        assertThat(page.getContent().getFirst().getUsuarioNombre()).isEqualTo("Usuario Ejemplo");
        assertThat(service.listar(1, 1, "ejemplo", "", "", null, null, "desc").getContent().getFirst().getAccion()).isEqualTo("LOGIN_EXITOSO");
    }
    @Test void combinesGroupActionDatesAndIncludesEntireEndDate() {
        var page = service.listar(0, 8, "", "accesos", "", day, day, "asc");
        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting("accion").containsExactly("LOGIN_EXITOSO", "POST");
        assertThat(service.listar(0, 8, "", "accesos", "POST", day, day, "desc").getTotalElements()).isEqualTo(1);
        assertThat(service.listar(0, 8, "", "actividad", "", null, null, "desc").getTotalElements()).isEqualTo(14);
    }
    @Test void searchesIpActionDetailAndUnknownUserWithoutWildcards() {
        assertThat(service.listar(0, 8, "127.0.0.1", "", "", null, null, "desc").getTotalElements()).isEqualTo(2);
        assertThat(service.listar(0, 8, "no identificado", "", "", null, null, "desc").getTotalElements()).isEqualTo(15);
        assertThat(service.listar(0, 8, "/tickets/1", "", "", null, null, "desc").getTotalElements()).isEqualTo(14);
        assertThat(service.listar(0, 8, "LOGIN_FALLIDO", "", "", null, null, "desc").getTotalElements()).isEqualTo(1);
        assertThat(service.listar(0, 8, "%", "", "", null, null, "desc").getTotalElements()).isZero();
    }
    @Test void searchesLongDescriptionsBeyondTheFirst255Characters() {
        event(exampleUserId, "POST", "Ticket", "x".repeat(300) + " descripción localizable", day.atTime(22, 0));
        em.flush();
        assertThat(service.listar(0, 8, "localizable", "", "", null, null, "desc").getTotalElements()).isEqualTo(1);
    }
    @Test void ordersTiedDatesByIdAndReturnsAllRecordsAcrossPages() {
        var same = day.atTime(22, 0);
        event(exampleUserId, "POST", "Ticket", "Primero", same);
        event(exampleUserId, "POST", "Ticket", "Segundo", same);
        em.flush();
        var page = service.listar(0, 3, "", "", "", null, null, "desc");
        assertThat(page.getTotalElements()).isEqualTo(19);
        assertThat(page.getContent()).extracting("detalle").containsExactly("Inicio de sesión fallido", "POST /api/v1/auth/login ejecutado correctamente", "Segundo");
        assertThat(service.listar(6, 3, "", "", "", null, null, "desc").getContent()).hasSize(1);
    }
    @Test void rejectsInvalidDatesGroupOrOrderAndBoundsPageSize() {
        assertThatThrownBy(() -> service.listar(0, 8, "", "", "", day.plusDays(1), day, "desc")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.listar(0, 8, "", "invalid", "", null, null, "desc")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.listar(0, 8, "", "", "", null, null, "invalid")).isInstanceOf(IllegalArgumentException.class);
        var page = service.listar(-1, 500, "", "", "", null, null, "desc");
        assertThat(page.getNumber()).isZero(); assertThat(page.getSize()).isEqualTo(100);
    }
}
