package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;

// H2 desechable, sin acceso a la base de datos real.
@DataJpaTest(showSql = false, properties = { "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect", "logging.level.root=WARN" })
@ActiveProfiles("test")
@Import({UsuarioServiceImpl.class, com.empresa.ticketmanagement.security.SessionSecurityService.class})
class UsuarioDirectoryTest {
    @Autowired TestEntityManager em;
    @Autowired UsuarioServiceImpl service;
    @MockitoBean PasswordEncoder encoder;
    Empresa company, other;
    Rol client, technician, admin;
    @BeforeEach void seed() {
        company = em.persist(Empresa.builder().razonSocial("Empresa A").ruc("12345678901").build());
        other = em.persist(Empresa.builder().razonSocial("Empresa B").ruc("12345678902").build());
        client = em.persist(Rol.builder().nombre("ROLE_CLIENTE").build());
        technician = em.persist(Rol.builder().nombre("ROLE_TECNICO").build());
        admin = em.persist(Rol.builder().nombre("ROLE_ADMIN").build());
        for (int i = 0; i < 24; i++) user("user" + i, String.format("Persona %02d", i), "Apellido", company, "ACTIVO", Set.of(client));
    }
    Usuario user(String username, String names, String surnames, Empresa company, String status, Set<Rol> roles) {
        return em.persist(Usuario.builder().username(username).nombres(names).apellidos(surnames).passwordHash("test-only").email(username + "@example.test").empresa(company).estado(status).roles(roles).build());
    }
    PageRequest page(int index, int size) { return PageRequest.of(index, size, Sort.by("nombres", "id")); }
    @Test void searchIsAppliedBeforePaginationAndCountsOnlyMatchingUsers() {
        user("target", "Zulema", "Destino", other, "ACTIVO", Set.of(technician));
        var result = service.listar("  zulema destino  ", null, null, null, page(0, 5));
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getTotalPages()).isEqualTo(1);
        assertThat(result.getContent()).extracting("username").containsExactly("target");
    }
    @Test void emailAndUsernameAreCaseInsensitiveAndWildcardsAreLiteral() {
        user("special_%", "Especial", "Literal", other, "ACTIVO", Set.of(client));
        assertThat(service.listar("SPECIAL_%", page(0, 5)).getTotalElements()).isEqualTo(1);
        assertThat(service.listar("TARGET@EXAMPLE.TEST", page(0, 5)).getTotalElements()).isZero();
        assertThat(service.listar("user20@EXAMPLE.TEST", page(0, 5)).getTotalElements()).isEqualTo(1);
        assertThat(service.listar("%", page(0, 5)).getTotalElements()).isEqualTo(1);
    }
    @Test void combinesRoleCompanyStatusAndSearchIncludingInactiveUsers() {
        user("target", "Ana", "Torres", other, "INACTIVO", Set.of(technician));
        user("active", "Ana", "Otra", other, "ACTIVO", Set.of(technician));
        var result = service.listar("ana", "ROLE_TECNICO", other.getId(), "INACTIVO", page(0, 5));
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent().getFirst().getUsername()).isEqualTo("target");
        assertThat(service.listar(null, "ROLE_TECNICO", company.getId(), "INACTIVO", page(0, 5)).getTotalElements()).isZero();
    }
    @Test void multipleRolesDoNotDuplicateUsersOrCounts() {
        user("multi", "Ana", "Varios", other, "ACTIVO", Set.of(technician, admin));
        var result = service.listar(null, "ROLE_TECNICO", null, null, page(0, 5));
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent().getFirst().getRoles()).containsExactlyInAnyOrder("ROLE_TECNICO", "ROLE_ADMIN");
        assertThat(service.listar(null, page(0, 5)).getTotalElements()).isEqualTo(25);
    }
    @Test void totalsAndPageBoundariesDescribeTheFilteredSet() {
        var first = service.listar("Persona", "ROLE_CLIENTE", company.getId(), "ACTIVO", page(0, 5));
        var last = service.listar("Persona", "ROLE_CLIENTE", company.getId(), "ACTIVO", page(4, 5));
        assertThat(first.getTotalElements()).isEqualTo(24); assertThat(first.getTotalPages()).isEqualTo(5);
        assertThat(first.getContent()).hasSize(5); assertThat(last.getContent()).hasSize(4);
        assertThat(first.getContent()).extracting("id").doesNotContainAnyElementsOf(last.getContent().stream().map(u -> u.getId()).toList());
    }
    @Test void handlesBlockedAndUsersWithoutCompanyWithoutRestrictingUnfilteredResults() {
        user("blocked", "Ana", "Sin empresa", null, "BLOQUEADO", Set.of(client));
        assertThat(service.listar(null, null, null, "BLOQUEADO", page(0, 8)).getTotalElements()).isEqualTo(1);
        assertThat(service.listar(null, null, company.getId(), null, page(0, 8)).getTotalElements()).isEqualTo(24);
        assertThat(service.listar(null, null, null, null, page(0, 8)).getTotalElements()).isEqualTo(25);
    }
    @Test void invalidStatusIsRejectedAndUnknownRoleReturnsNoMatches() {
        assertThatThrownBy(() -> service.listar(null, null, null, "INVALID", page(0, 8))).isInstanceOf(IllegalArgumentException.class);
        assertThat(service.listar(null, "UNKNOWN", null, null, page(0, 8)).getTotalElements()).isZero();
    }
}
