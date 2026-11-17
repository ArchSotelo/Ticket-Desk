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
                "spring.datasource.url=jdbc:h2:mem:boot4-compatibility;DB_CLOSE_DELAY=-1",
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
                "APP_SEED_CLIENT_PASSWORD=test-only-client-password", "logging.level.root=WARN"
        })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ApplicationCompatibilityTest {
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

    @Test
    void fullApplicationKeepsAuthenticationJsonSwaggerAndExcelContracts() throws Exception {
        var denied = json(request("GET", "/tickets", null, null), 401);
        assertThat(denied.path("success").asBoolean()).isFalse();
        assertThat(denied.path("timestamp").asText()).matches("\\d{4}-\\d{2}-\\d{2}T.*");
        var login = json(request("POST", "/auth/login", null,
                "{\"username\":\"admin\",\"password\":\"test-only-admin-password\"}"), 200).path("data");
        String token = login.path("accessToken").asText();
        assertThat(token.split("\\.")).hasSize(3);
        assertThat(login.path("tokenType").asText()).isEqualTo("Bearer");
        assertThat(login.path("roles").toString()).contains("ROLE_ADMIN");
        var profile = json(request("GET", "/users/me", token, null), 200).path("data");
        assertThat(profile.path("username").asText()).isEqualTo("admin");
        assertThat(profile.has("passwordHash")).isFalse();
        var page = json(request("GET", "/tickets?page=0&size=10", token, null), 200).path("data");
        assertThat(page.path("content").isArray()).isTrue();
        assertThat(page.path("totalElements").isIntegralNumber()).isTrue();
        var dashboard = json(request("GET", "/dashboard/stats?fechaDesde=2026-10-01&fechaHasta=2026-10-31", token, null), 200);
        assertThat(dashboard.at("/data/fechaDesde").asText()).isEqualTo("2026-10-01");
        assertThat(dashboard.at("/data/fechaHasta").asText()).isEqualTo("2026-10-31");
        var openapi = json(request("GET", "/v3/api-docs", token, null), 200);
        assertThat(openapi.path("paths").has("/auth/login")).isTrue();
        assertThat(request("GET", "/swagger-ui/index.html", token, null).statusCode()).isEqualTo(200);
        var excel = request("GET", "/reports/tickets/excel", token, null);
        assertThat(excel.statusCode()).isEqualTo(200);
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(excel.body()))) {
            assertThat(workbook.getSheet("Reporte de Tickets")).isNotNull();
        }
        var refreshed = json(request("POST", "/auth/refresh-token", null,
                mapper.writeValueAsString(java.util.Map.of("refreshToken", login.path("refreshToken").asText()))), 200);
        assertThat(refreshed.at("/data/accessToken").asText()).isNotBlank();
        json(request("PUT", "/users/me/password", token,
                "{\"currentPassword\":\"test-only-admin-password\",\"newPassword\":\"test-only-updated-password\"}"), 200);
        var changed = json(request("POST", "/auth/login", null,
                "{\"username\":\"admin\",\"password\":\"test-only-updated-password\"}"), 200);
        assertThat(changed.at("/data/requiresPasswordChange").asBoolean()).isFalse();
    }
}
