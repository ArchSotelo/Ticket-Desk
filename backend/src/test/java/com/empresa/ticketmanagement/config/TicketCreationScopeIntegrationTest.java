package com.empresa.ticketmanagement.config;

import com.empresa.ticketmanagement.TicketApplication;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/** Arranca todos los componentes con el application.yml real y un H2 desechable. */
@SpringBootTest(classes = TicketApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.datasource.url=jdbc:h2:mem:ticket-creation-scope;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
                "spring.datasource.password=", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
                "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never",
                "APP_TIMEZONE=America/Lima", "APP_MAIL_ENABLED=false", "SPRING_MAIL_HOST=localhost",
                "SPRING_MAIL_PORT=2525", "SPRING_MAIL_USERNAME=", "SPRING_MAIL_PASSWORD=",
                "SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=false",
                "SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=false",
                "APP_JWT_SECRET=test-only-boot4-compatibility-signing-key-never-use-in-production",
                "APP_STORAGE_PROVIDER=LOCAL", "APP_STORAGE_LOCAL_UPLOAD_DIR=${java.io.tmpdir}/ticket-creation-scope-test",
                "APP_STORAGE_MINIO_ENDPOINT=http://127.0.0.1:9000", "APP_STORAGE_MINIO_ACCESS_KEY=",
                "APP_STORAGE_MINIO_SECRET_KEY=", "APP_STORAGE_MINIO_BUCKET_NAME=test-attachments",
                "APP_SEED_ADMIN_PASSWORD=test-only-admin-password", "APP_SEED_TECHNICIAN_PASSWORD=test-only-technician-password",
                "APP_SEED_CLIENT_PASSWORD=test-only-client-password", "logging.level.root=WARN", "app.security.login.requests-per-minute=1000"
        })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TicketCreationScopeIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    HttpResponse<byte[]> request(String method, String path, String token, String body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1" + path))
                .timeout(Duration.ofSeconds(20));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    JsonNode json(HttpResponse<byte[]> response, int status) {
        assertThat(response.statusCode()).as("Estado HTTP").isEqualTo(status);
        return mapper.readTree(response.body());
    }

    @Autowired com.empresa.ticketmanagement.repository.RolRepository roles;
    @Autowired com.empresa.ticketmanagement.repository.UsuarioRepository users;
    @Autowired com.empresa.ticketmanagement.repository.SubcategoriaRepository subcategories;
    @Autowired com.empresa.ticketmanagement.repository.PrioridadRepository priorities;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;

    JsonNode login(String username, String password) throws Exception {
        return json(request("POST", "/auth/login", null, mapper.writeValueAsString(java.util.Map.of("username",username,"password",password))),200).path("data");
    }


    @Autowired com.empresa.ticketmanagement.repository.EmpresaRepository companies;
    @Autowired com.empresa.ticketmanagement.repository.AreaRepository areas;
    @Autowired com.empresa.ticketmanagement.repository.TicketRepository tickets;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    private static final java.util.concurrent.atomic.AtomicInteger SEQUENCE = new java.util.concurrent.atomic.AtomicInteger();
    private final java.util.Map<String, Boolean> roleStates = new java.util.HashMap<>();
    private java.util.Set<Long> originalClientRoles;
    private String adminToken;
    private String clientToken;
    private long clientId;
    private long clientCompanyId;
    private Long clientAreaId;
    private long otherClientId;
    private long otherCompanyId;
    private long otherAreaId;
    private long alternativeAreaId;
    private java.util.Map<String, Object> fields;

    @BeforeEach
    void prepareDistinctClientOrganizations() throws Exception {
        int sequence = SEQUENCE.incrementAndGet();
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            roles.findAll().forEach(role -> roleStates.put(role.getNombre(), role.getActivo()));
            var client = users.findByUsername("cliente1").orElseThrow();
            clientId = client.getId();
            clientCompanyId = client.getEmpresa().getId();
            clientAreaId = client.getArea().getId();
            originalClientRoles = client.getRoles().stream().map(r -> r.getId()).collect(java.util.stream.Collectors.toSet());
            var otherCompany = companies.save(com.empresa.ticketmanagement.entity.Empresa.builder()
                    .razonSocial("Empresa destino " + sequence).ruc(Long.toString(20000001000L + sequence)).build());
            otherCompanyId = otherCompany.getId();
            var otherArea = areas.save(com.empresa.ticketmanagement.entity.Area.builder()
                    .nombre("Area destino " + sequence).empresa(otherCompany).build());
            otherAreaId = otherArea.getId();
            alternativeAreaId = areas.save(com.empresa.ticketmanagement.entity.Area.builder()
                    .nombre("Otra area de origen " + sequence).empresa(client.getEmpresa()).build()).getId();
            otherClientId = users.save(com.empresa.ticketmanagement.entity.Usuario.builder()
                    .username("scope-client-" + sequence).passwordHash(encoder.encode("test-only-target-password"))
                    .nombres("Cliente").apellidos("Destino").email("scope-" + sequence + "@example.test")
                    .empresa(otherCompany).area(otherArea).roles(new java.util.HashSet<>(java.util.Set.of(
                            roles.findByNombre("ROLE_CLIENTE").orElseThrow()))).build()).getId();
        });
        adminToken = login("admin", "test-only-admin-password").path("accessToken").asText();
        var client = login("cliente1", "test-only-client-password");
        clientToken = client.path("accessToken").asText();
        assertThat(client.path("permissions").toString()).contains("TICKET_CREATE");
        var sub = subcategories.findAll().getFirst();
        fields = java.util.Map.of("titulo", "Solicitud de prueba", "descripcion", "Alcance autorizado",
                "categoriaId", sub.getCategoria().getId(), "subcategoriaId", sub.getId(),
                "prioridadId", priorities.findAll().getFirst().getId());
    }

    @AfterEach
    void restoreOriginalClientAndRoleStates() {
        if (originalClientRoles == null) return;
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            for (var role : roles.findAll()) {
                if (roleStates.containsKey(role.getNombre())) role.setActivo(roleStates.get(role.getNombre()));
                roles.save(role);
            }
            var client = users.findById(clientId).orElseThrow();
            client.setEmpresa(companies.findById(clientCompanyId).orElseThrow());
            client.setArea(areas.findById(clientAreaId).orElseThrow());
            client.setRoles(originalClientRoles.stream().map(id -> roles.findById(id).orElseThrow())
                    .collect(java.util.stream.Collectors.toSet()));
            users.saveAndFlush(client);
        });
    }

    private java.util.Map<String, Object> ownPayload() {
        var payload = new java.util.LinkedHashMap<>(fields);
        payload.put("empresaId", clientCompanyId);
        payload.put("areaId", clientAreaId);
        return payload;
    }

    private java.util.Map<String, Object> selectedPayload() {
        var payload = new java.util.LinkedHashMap<>(fields);
        payload.put("clienteId", otherClientId);
        payload.put("empresaId", otherCompanyId);
        payload.put("areaId", otherAreaId);
        return payload;
    }

    private String staffToken(String role) throws Exception {
        if ("ROLE_ADMIN".equals(role)) return adminToken;
        if ("ROLE_TECNICO".equals(role))
            return login("tecnico1", "test-only-technician-password").path("accessToken").asText();
        if (!users.existsByUsername("scope-supervisor")) {
            json(request("POST", "/users", adminToken, mapper.writeValueAsString(java.util.Map.of(
                    "username", "scope-supervisor", "password", "test-only-supervisor-password",
                    "nombres", "Supervisor", "apellidos", "Ejemplo", "email", "scope-supervisor@example.test",
                    "roles", java.util.List.of("ROLE_SUPERVISOR")))), 201);
            String initial = login("scope-supervisor", "test-only-supervisor-password").path("accessToken").asText();
            json(request("PUT", "/users/me/password", initial,
                    "{\"currentPassword\":\"test-only-supervisor-password\",\"newPassword\":\"test-only-supervisor-updated-password\"}"), 200);
        }
        return login("scope-supervisor", "test-only-supervisor-updated-password").path("accessToken").asText();
    }

    private JsonNode create(String token, java.util.Map<String, Object> payload) throws Exception {
        return json(request("POST", "/tickets", token, mapper.writeValueAsString(payload)), 201).path("data");
    }

    private void rejected(String token, java.util.Map<String, Object> payload, int expectedStatus) throws Exception {
        long before = tickets.count();
        json(request("POST", "/tickets", token, mapper.writeValueAsString(payload)), expectedStatus);
        assertThat(tickets.count()).isEqualTo(before);
    }

    private void assertStoredScope(JsonNode ticket, long owner, long company, Long area) {
        var row = jdbc.queryForMap("SELECT cliente_id, empresa_id, area_id FROM tickets WHERE id=?", ticket.path("id").asLong());
        assertThat(((Number) row.get("cliente_id")).longValue()).isEqualTo(owner);
        assertThat(((Number) row.get("empresa_id")).longValue()).isEqualTo(company);
        if (area == null) assertThat(row.get("area_id")).isNull();
        else assertThat(((Number) row.get("area_id")).longValue()).isEqualTo(area);
    }

    private void changeUser(long id, java.util.function.Consumer<com.empresa.ticketmanagement.entity.Usuario> change) {
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            var user = users.findById(id).orElseThrow();
            change.accept(user);
            users.saveAndFlush(user);
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO"})
    void allActiveSupportRolesCreateForTheSelectedClientOrganization(String role) throws Exception {
        String token = staffToken(role);
        var result = create(token, selectedPayload());
        assertStoredScope(result, otherClientId, otherCompanyId, otherAreaId);
        assertThat(result.path("empresaNombre").asText()).startsWith("Empresa destino");
        json(request("GET", "/tickets/" + result.path("id").asLong(), token, null), 200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO"})
    void supportMustSelectAClientInsteadOfFallingBackToTheirOwnProfile(String role) throws Exception {
        rejected(staffToken(role), ownPayload(), 400);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO"})
    void anInactiveSupportRoleDoesNotLetAnActiveClientSelectSomeoneElse(String inactiveRole) throws Exception {
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            var role = roles.findByNombre(inactiveRole).orElseThrow();
            role.setActivo(false);
            roles.saveAndFlush(role);
            var client = users.findById(clientId).orElseThrow();
            client.getRoles().add(role);
            users.saveAndFlush(client);
        });
        assertThat(json(request("GET", "/users/me", clientToken, null), 200)
                .at("/data/roles").toString()).isEqualTo("[\"ROLE_CLIENTE\"]");
        rejected(clientToken, selectedPayload(), 403);
        var own = create(clientToken, ownPayload());
        assertStoredScope(own, clientId, clientCompanyId, clientAreaId);
        for (var notification : json(request("GET", "/notifications/unread", clientToken, null), 200).path("data")) {
            assertThat(notification.path("titulo").asText()).doesNotContain(own.path("codigo").asText());
        }
        var replied = json(request("POST", "/tickets/" + own.path("id").asLong()
                + "/comentarios?contenido=RespuestaPropia", clientToken, null), 200).path("data");
        assertThat(replied.path("tecnicoId").isMissingNode()).isTrue();
        assertThat(replied.path("comentarios").get(0).path("usuarioRol").asText()).isEqualTo("CLIENTE");
    }

    @ParameterizedTest
    @ValueSource(strings = {"company", "area", "unknown-company", "unknown-area", "another-own-company-area"})
    void aClientCannotOverrideTheirOrganizationUsingSubmittedIdentifiers(String field) throws Exception {
        var payload = ownPayload();
        switch (field) {
            case "company" -> payload.put("empresaId", otherCompanyId);
            case "area" -> payload.put("areaId", otherAreaId);
            case "unknown-company" -> payload.put("empresaId", Long.MAX_VALUE);
            case "unknown-area" -> payload.put("areaId", Long.MAX_VALUE);
            default -> payload.put("areaId", alternativeAreaId);
        }
        rejected(clientToken, payload, 403);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void organizationIsDerivedEvenWhenRedundantRequestIdentifiersAreOmitted(boolean includeIds) throws Exception {
        var payload = includeIds ? ownPayload() : new java.util.LinkedHashMap<>(fields);
        assertStoredScope(create(clientToken, payload), clientId, clientCompanyId, clientAreaId);
    }

    @Test
    void supportCannotOverrideTheSelectedClientCompanyOrArea() throws Exception {
        var payload = selectedPayload();
        payload.put("empresaId", clientCompanyId);
        payload.put("areaId", clientAreaId);
        rejected(adminToken, payload, 403);
    }

    @ParameterizedTest
    @ValueSource(strings = {"INACTIVO", "BLOQUEADO"})
    void anUnavailableClientCannotBeSelected(String state) throws Exception {
        changeUser(otherClientId, user -> user.setEstado(state));
        rejected(adminToken, selectedPayload(), 400);
    }

    @Test
    void aClientRoleMustBeActiveEvenWhenTheSelectedAccountHasAnotherActiveRole() throws Exception {
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            var selected = users.findById(otherClientId).orElseThrow();
            selected.getRoles().add(roles.findByNombre("ROLE_TECNICO").orElseThrow());
            users.saveAndFlush(selected);
            var clientRole = roles.findByNombre("ROLE_CLIENTE").orElseThrow();
            clientRole.setActivo(false);
            roles.saveAndFlush(clientRole);
        });
        rejected(adminToken, selectedPayload(), 400);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void aMissingCompanyCannotBeReplacedByAnIdentifierInTheRequest(boolean selectedClient) throws Exception {
        changeUser(selectedClient ? otherClientId : clientId, user -> user.setEmpresa(null));
        rejected(selectedClient ? adminToken : clientToken, selectedClient ? selectedPayload() : ownPayload(), 400);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void aProfileAreaFromAnotherCompanyIsRejectedEvenWhenTheRequestMatchesIt(boolean selectedClient) throws Exception {
        long wrongArea = selectedClient ? clientAreaId : otherAreaId;
        changeUser(selectedClient ? otherClientId : clientId, user -> user.setArea(areas.findById(wrongArea).orElseThrow()));
        var payload = selectedClient ? selectedPayload() : ownPayload();
        payload.put("areaId", wrongArea);
        rejected(selectedClient ? adminToken : clientToken, payload, 400);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void aClientWithoutAnAreaCanStillCreateWithTheirAssignedCompany(boolean selectedClient) throws Exception {
        changeUser(selectedClient ? otherClientId : clientId, user -> user.setArea(null));
        var payload = selectedClient ? selectedPayload() : ownPayload();
        payload.remove("areaId");
        assertStoredScope(create(selectedClient ? adminToken : clientToken, payload),
                selectedClient ? otherClientId : clientId, selectedClient ? otherCompanyId : clientCompanyId, null);
    }

    @Test
    void theRequestCannotInventAnAreaWhenTheProfileHasNone() throws Exception {
        changeUser(clientId, user -> user.setArea(null));
        rejected(clientToken, ownPayload(), 403);
    }
}
