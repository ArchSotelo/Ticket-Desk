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
                "spring.datasource.url=jdbc:h2:mem:ticket-operation-permissions;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
                "spring.datasource.password=", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
                "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never",
                "APP_TIMEZONE=America/Lima", "APP_MAIL_ENABLED=false", "SPRING_MAIL_HOST=localhost",
                "SPRING_MAIL_PORT=2525", "SPRING_MAIL_USERNAME=", "SPRING_MAIL_PASSWORD=",
                "SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=false",
                "SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=false",
                "APP_JWT_SECRET=test-only-boot4-compatibility-signing-key-never-use-in-production",
                "APP_STORAGE_PROVIDER=LOCAL", "APP_STORAGE_LOCAL_UPLOAD_DIR=${java.io.tmpdir}/ticket-operation-permissions-test",
                "APP_STORAGE_MINIO_ENDPOINT=http://127.0.0.1:9000", "APP_STORAGE_MINIO_ACCESS_KEY=",
                "APP_STORAGE_MINIO_SECRET_KEY=", "APP_STORAGE_MINIO_BUCKET_NAME=test-attachments",
                "APP_SEED_ADMIN_PASSWORD=test-only-admin-password", "APP_SEED_TECHNICIAN_PASSWORD=test-only-technician-password",
                "APP_SEED_CLIENT_PASSWORD=test-only-client-password", "logging.level.root=WARN", "app.security.login.requests-per-minute=1000"
        })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TicketOperationPermissionsIntegrationTest {
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


    @Autowired com.empresa.ticketmanagement.repository.PermisoRepository permissions;
    @Autowired com.empresa.ticketmanagement.repository.TicketRepository tickets;
    @Autowired com.empresa.ticketmanagement.repository.TicketAttachmentRepository attachments;
    @Autowired com.empresa.ticketmanagement.repository.ComentarioRepository comments;

    private final java.util.Map<String, Boolean> originalGrants = new java.util.LinkedHashMap<>();
    private String clientToken;
    private String adminToken;
    private long clientId;
    private long ticketId;
    private long attachmentId;
    private String ticketCode;
    private java.util.Map<String, Object> ticketPayload;

    @BeforeEach
    void prepareOwnedTicketAndFile() throws Exception {
        var admin = login("admin", "test-only-admin-password");
        var client = login("cliente1", "test-only-client-password");
        adminToken = admin.path("accessToken").asText();
        clientToken = client.path("accessToken").asText();
        clientId = client.path("userId").asLong();
        var owner = users.findByUsername("cliente1").orElseThrow();
        var sub = subcategories.findAll().getFirst();
        ticketPayload = java.util.Map.of("titulo", "Permisos por operacion", "descripcion", "Prueba aislada",
                "empresaId", owner.getEmpresa().getId(), "categoriaId", sub.getCategoria().getId(),
                "subcategoriaId", sub.getId(), "prioridadId", priorities.findAll().getFirst().getId());
        var created = json(request("POST", "/tickets", clientToken, mapper.writeValueAsString(ticketPayload)), 201).path("data");
        ticketId = created.path("id").asLong();
        ticketCode = created.path("codigo").asText();
        attachmentId = json(upload(ticketId, clientToken), 200).at("/data/id").asLong();
    }

    private HttpResponse<byte[]> upload(long id, String token) throws Exception {
        String boundary = "operation-permissions-test-boundary";
        String body = "--" + boundary
                + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"prueba.pdf\""
                + "\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n%%EOF\r\n--" + boundary + "--\r\n";
        return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port
                        + "/api/v1/tickets/" + id + "/attachments"))
                .timeout(Duration.ofSeconds(20)).header("Authorization", "Bearer " + token)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private void grant(String roleName, String permissionCode, boolean enabled) {
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            var role = roles.findByNombre(roleName).orElseThrow();
            originalGrants.putIfAbsent(roleName + ":" + permissionCode,
                    role.getPermisos().stream().anyMatch(p -> permissionCode.equals(p.getCodigo())));
            var permission = permissions.findByCodigo(permissionCode).orElseThrow();
            if (enabled) role.getPermisos().add(permission);
            else role.getPermisos().removeIf(p -> permissionCode.equals(p.getCodigo()));
            roles.saveAndFlush(role);
        });
    }

    @AfterEach
    void restoreGrants() {
        for (var entry : originalGrants.entrySet()) {
            String[] key = entry.getKey().split(":");
            grant(key[0], key[1], entry.getValue());
        }
        originalGrants.clear();
    }

    private String staffToken(String role) throws Exception {
        if ("ROLE_ADMIN".equals(role)) return adminToken;
        if ("ROLE_TECNICO".equals(role))
            return login("tecnico1", "test-only-technician-password").path("accessToken").asText();
        if (!users.existsByUsername("operation-supervisor")) {
            json(request("POST", "/users", adminToken, mapper.writeValueAsString(java.util.Map.of(
                    "username", "operation-supervisor", "password", "test-only-supervisor-password",
                    "nombres", "Supervisor", "apellidos", "Ejemplo", "email", "operation-supervisor@example.test",
                    "roles", java.util.List.of("ROLE_SUPERVISOR")))), 201);
            String initial = login("operation-supervisor", "test-only-supervisor-password").path("accessToken").asText();
            json(request("PUT", "/users/me/password", initial,
                    "{\"currentPassword\":\"test-only-supervisor-password\",\"newPassword\":\"test-only-supervisor-updated-password\"}"), 200);
        }
        return login("operation-supervisor", "test-only-supervisor-updated-password").path("accessToken").asText();
    }

    @Test
    void createPermissionIsIndependentFromReadAndIsRevokedWithAnExistingToken() throws Exception {
        long before = tickets.count();
        grant("ROLE_CLIENTE", "TICKET_CREATE", false);
        assertThat(json(request("GET", "/users/me", clientToken, null), 200)
                .at("/data/permissions").toString()).doesNotContain("TICKET_CREATE");
        assertThat(request("POST", "/tickets", clientToken, mapper.writeValueAsString(ticketPayload)).statusCode()).isEqualTo(403);
        assertThat(tickets.count()).isEqualTo(before);
        json(request("GET", "/tickets", clientToken, null), 200);
        json(request("GET", "/tickets/mine", clientToken, null), 200);
        grant("ROLE_CLIENTE", "TICKET_CREATE", true);
        json(request("POST", "/tickets", clientToken, mapper.writeValueAsString(ticketPayload)), 201);
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "mine", "owner", "id", "code", "files", "metadata", "download", "preview"})
    void readPermissionProtectsEveryTicketAndAttachmentReadRoute(String route) throws Exception {
        String path = switch (route) {
            case "list" -> "/tickets";
            case "mine" -> "/tickets/mine";
            case "owner" -> "/tickets/cliente/" + clientId;
            case "id" -> "/tickets/" + ticketId;
            case "code" -> "/tickets/codigo/" + ticketCode;
            case "files" -> "/tickets/" + ticketId + "/attachments";
            case "metadata" -> "/attachments/" + attachmentId;
            case "download" -> "/attachments/" + attachmentId + "/download";
            default -> "/attachments/" + attachmentId + "/preview";
        };
        grant("ROLE_CLIENTE", "TICKET_READ", false);
        assertThat(request("GET", path, clientToken, null).statusCode()).as(path).isEqualTo(403);
        grant("ROLE_CLIENTE", "TICKET_READ", true);
        assertThat(request("GET", path, clientToken, null).statusCode()).as(path).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO"})
    void staffRolesDoNotBypassARevokedReadPermission(String role) throws Exception {
        String token = staffToken(role);
        grant(role, "TICKET_READ", false);
        assertThat(request("GET", "/tickets/" + ticketId, token, null).statusCode()).isEqualTo(403);
        assertThat(request("GET", "/tickets", token, null).statusCode()).isEqualTo(403);
        grant(role, "TICKET_READ", true);
        json(request("GET", "/tickets/" + ticketId, token, null), 200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_CLIENTE", "ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO"})
    void uploadPermissionIsCheckedBeforeSavingAndReadAccessRemainsAvailable(String role) throws Exception {
        String token = "ROLE_CLIENTE".equals(role) ? clientToken : staffToken(role);
        long before = attachments.count();
        grant(role, "ATTACHMENT_UPLOAD", false);
        assertThat(upload(ticketId, token).statusCode()).isEqualTo(403);
        assertThat(attachments.count()).isEqualTo(before);
        json(request("GET", "/attachments/" + attachmentId, token, null), 200);
        grant(role, "ATTACHMENT_UPLOAD", true);
        json(upload(ticketId, token), 200);
        assertThat(attachments.count()).isEqualTo(before + 1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO"})
    void stateChangesAndStaffRepliesNeedUpdateWithoutBypassingTheRuleThroughComments(String role) throws Exception {
        String token = staffToken(role);
        grant(role, "TICKET_UPDATE", false);
        long beforeComments = comments.count();
        var before = json(request("GET", "/tickets/" + ticketId, token, null), 200).path("data");
        assertThat(request("PATCH", "/tickets/" + ticketId + "/estado?nuevoEstadoCodigo=EN_PROCESO", token, null).statusCode()).isEqualTo(403);
        assertThat(request("POST", "/tickets/" + ticketId + "/comentarios?contenido=SinPermiso", token, null).statusCode()).isEqualTo(403);
        var after = json(request("GET", "/tickets/" + ticketId, token, null), 200).path("data");
        assertThat(after.path("estadoCodigo")).isEqualTo(before.path("estadoCodigo"));
        assertThat(after.path("tecnicoId")).isEqualTo(before.path("tecnicoId"));
        assertThat(comments.count()).isEqualTo(beforeComments);
        grant(role, "TICKET_UPDATE", true);
        json(request("PATCH", "/tickets/" + ticketId + "/estado?nuevoEstadoCodigo=EN_PROCESO", token, null), 200);
        json(request("POST", "/tickets/" + ticketId + "/comentarios?contenido=ConPermiso", token, null), 200);
    }

    @Test
    void clientWithAnUpdateOrAssignmentPermissionStillCannotManageTickets() throws Exception {
        grant("ROLE_CLIENTE", "TICKET_UPDATE", true);
        grant("ROLE_CLIENTE", "TICKET_ASSIGN", true);
        assertThat(request("PATCH", "/tickets/" + ticketId + "/estado?nuevoEstadoCodigo=EN_PROCESO", clientToken, null).statusCode()).isEqualTo(403);
        long technicianId = users.findByUsername("tecnico1").orElseThrow().getId();
        assertThat(request("PATCH", "/tickets/" + ticketId + "/asignar?tecnicoId=" + technicianId, clientToken, null).statusCode()).isEqualTo(403);
    }

    @Test
    void losingReadPermissionAlsoPreventsWritesThatWouldReturnExistingTicketDetails() throws Exception {
        grant("ROLE_CLIENTE", "TICKET_READ", false);
        long before = attachments.count();
        long beforeComments = comments.count();
        assertThat(upload(ticketId, clientToken).statusCode()).isEqualTo(403);
        assertThat(request("POST", "/tickets/" + ticketId + "/comentarios?contenido=SinLectura", clientToken, null).statusCode()).isEqualTo(403);
        assertThat(attachments.count()).isEqualTo(before);
        assertThat(comments.count()).isEqualTo(beforeComments);
        grant("ROLE_ADMIN", "TICKET_READ", false);
        assertThat(request("PATCH", "/tickets/" + ticketId + "/estado?nuevoEstadoCodigo=EN_PROCESO", adminToken, null).statusCode()).isEqualTo(403);
        long technicianId = users.findByUsername("tecnico1").orElseThrow().getId();
        assertThat(request("PATCH", "/tickets/" + ticketId + "/asignar?tecnicoId=" + technicianId, adminToken, null).statusCode()).isEqualTo(403);
    }

    @Test
    void clientRepliesRemainAllowedWithoutAnAdministrativeUpdatePermission() throws Exception {
        json(request("POST", "/tickets/" + ticketId + "/comentarios?contenido=RespuestaCliente", clientToken, null), 200);
        assertThat(request("POST", "/tickets/" + ticketId + "/comentarios?contenido=Nota&esInterno=true", clientToken, null).statusCode()).isEqualTo(403);
    }
}
