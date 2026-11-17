package com.empresa.ticketmanagement.config;

import com.empresa.ticketmanagement.TicketApplication;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
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
                "spring.datasource.url=jdbc:h2:mem:access-permissions;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
                "spring.datasource.password=", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
                "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never",
                "APP_TIMEZONE=America/Lima", "APP_MAIL_ENABLED=false", "SPRING_MAIL_HOST=localhost",
                "SPRING_MAIL_PORT=2525", "SPRING_MAIL_USERNAME=", "SPRING_MAIL_PASSWORD=",
                "SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=false",
                "SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=false",
                "APP_JWT_SECRET=test-only-boot4-compatibility-signing-key-never-use-in-production",
                "APP_STORAGE_PROVIDER=LOCAL", "APP_STORAGE_LOCAL_UPLOAD_DIR=${java.io.tmpdir}/ticket-boot4-test",
                "APP_STORAGE_MINIO_ENDPOINT=http://127.0.0.1:9000", "APP_STORAGE_MINIO_ACCESS_KEY=",
                "APP_STORAGE_MINIO_SECRET_KEY=", "APP_STORAGE_MINIO_BUCKET_NAME=test-attachments",
                "APP_SEED_ADMIN_PASSWORD=test-only-admin-password", "APP_SEED_TECHNICIAN_PASSWORD=test-only-technician-password",
                "APP_SEED_CLIENT_PASSWORD=test-only-client-password", "logging.level.root=WARN", "app.security.login.requests-per-minute=1000"
        })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AccessPermissionsIntegrationTest {
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

    @Test void fourRolesUseDatabasePermissionsAndKeepTheClientAndSupportFlows() throws Exception {
        assertThat(roles.findAll()).extracting(r -> r.getNombre()).containsExactlyInAnyOrder("ROLE_ADMIN","ROLE_SUPERVISOR","ROLE_TECNICO","ROLE_CLIENTE");
        var admin=login("admin","test-only-admin-password");
        var client=login("cliente1","test-only-client-password");
        var technician=login("tecnico1","test-only-technician-password");
        String at=admin.path("accessToken").asText(), ct=client.path("accessToken").asText(), tt=technician.path("accessToken").asText();
        assertThat(admin.path("roles").toString()).isEqualTo("[\"ROLE_ADMIN\"]");
        assertThat(admin.path("permissions").toString()).contains("USER_MANAGE","CATEGORY_MANAGE","SERVICE_CONFIG_MANAGE");
        assertThat(client.path("permissions").toString()).doesNotContain("USER_MANAGE","AUDIT_VIEW","CONTACT_READ");
        for(String token:java.util.List.of(ct,tt)) {
            for(String path:java.util.List.of("/users","/users/1","/audit","/empresas","/areas","/categorias","/subcategorias","/service-settings"))
                assertThat(request("GET",path,token,null).statusCode()).as(path).isEqualTo(403);
            assertThat(request("POST","/categorias",token,"{\"nombre\":\"No permitida\"}").statusCode()).isEqualTo(403);
            json(request("GET","/users/me",token,null),200);
        }
        assertThat(request("GET","/contacts",ct,null).statusCode()).isEqualTo(403);
        var directory=json(request("GET","/contacts",tt,null),200).at("/data/content");
        assertThat(directory.size()).isEqualTo(1);
        assertThat(directory.get(0).has("permissions")).isFalse();
        assertThat(directory.get(0).has("fechaUltimoAcceso")).isFalse();
        assertThat(request("GET","/contacts/1",tt,null).statusCode()).isEqualTo(403);
        assertThat(request("GET","/contacts?rol=ROLE_ADMIN",tt,null).statusCode()).isEqualTo(400);
        assertThat(json(request("GET","/contacts?rol=ROLE_TECNICO",tt,null),200).at("/data/content/0/username").asText()).isEqualTo("tecnico1");
        json(request("GET","/catalogs/categories",ct,null),200);
        json(request("GET","/service-categories",tt,null),200);
        json(request("POST","/users",at,"{\"username\":\"supervisor-test\",\"password\":\"test-only-supervisor-password\",\"nombres\":\"Supervisor\",\"apellidos\":\"Prueba\",\"email\":\"supervisor@example.test\",\"roles\":[\"ROLE_SUPERVISOR\"]}"),201);
        var initialSupervisor=login("supervisor-test","test-only-supervisor-password");
        json(request("PUT", "/users/me/password", initialSupervisor.path("accessToken").asText(),
                "{\"currentPassword\":\"test-only-supervisor-password\",\"newPassword\":\"test-only-supervisor-updated-password\"}"), 200);
        var supervisor=login("supervisor-test","test-only-supervisor-updated-password");
        String st=supervisor.path("accessToken").asText();
        assertThat(supervisor.path("permissions").toString()).contains("AUDIT_VIEW","CONTACT_READ","TICKET_ASSIGN").doesNotContain("USER_MANAGE","SERVICE_CONFIG_MANAGE");
        json(request("GET","/audit",st,null),200);
        json(request("GET","/contacts",st,null),200);
        assertThat(request("GET","/users",st,null).statusCode()).isEqualTo(403);
        assertThat(request("GET","/service-settings",st,null).statusCode()).isEqualTo(403);
        var clientEntity=users.findByUsername("cliente1").orElseThrow();
        var sub=subcategories.findAll().getFirst();
        var payload=java.util.Map.of("titulo","Flujo con cuatro roles","descripcion","Prueba de permisos",
                "empresaId",clientEntity.getEmpresa().getId(),"categoriaId",sub.getCategoria().getId(),
                "subcategoriaId",sub.getId(),"prioridadId",priorities.findAll().getFirst().getId());
        long ticketId=json(request("POST","/tickets",ct,mapper.writeValueAsString(payload)),201).at("/data/id").asLong();
        long technicianId=users.findByUsername("tecnico1").orElseThrow().getId();
        String assignment="/tickets/"+ticketId+"/asignar?tecnicoId="+technicianId;
        assertThat(request("PATCH",assignment,tt,null).statusCode()).isEqualTo(403);
        json(request("PATCH",assignment,st,null),200);
        // El JWT existente no conserva un permiso retirado de la tabla.
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            var role=roles.findByNombre("ROLE_SUPERVISOR").orElseThrow();
            role.getPermisos().removeIf(p -> "AUDIT_VIEW".equals(p.getCodigo()));roles.saveAndFlush(role);
        });
        assertThat(request("GET","/audit",st,null).statusCode()).isEqualTo(403);
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            var role=roles.findByNombre("ROLE_SUPERVISOR").orElseThrow();role.setActivo(false);roles.saveAndFlush(role);
        });
        assertThat(request("GET","/users/me",st,null).statusCode()).isEqualTo(401);
        assertThat(request("POST","/auth/refresh-token",null,mapper.writeValueAsString(java.util.Map.of("refreshToken",supervisor.path("refreshToken").asText()))).statusCode()).isEqualTo(401);
        assertThat(request("POST","/users",at,"{\"username\":\"retired-role-test\",\"password\":\"test-only-password\",\"nombres\":\"Prueba\",\"apellidos\":\"Roles\",\"email\":\"retired@example.test\",\"roles\":[\"ROLE_HELPDESK\"]}").statusCode()).isEqualTo(400);
        assertThat(users.existsByUsername("retired-role-test")).isFalse();
    }
}
