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
                "spring.datasource.url=jdbc:h2:mem:session-security;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
                "spring.datasource.password=", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
                "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never",
                "spring.datasource.hikari.maximum-pool-size=5", "spring.datasource.hikari.minimum-idle=1",
                "spring.datasource.hikari.connection-timeout=1500",
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
class SessionSecurityIntegrationTest {
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

    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
    static final String PASSWORD = "test-only-admin-password";
    static final String NEW_PASSWORD = "test-only-updated-password";
    static final java.util.concurrent.atomic.AtomicInteger SEQUENCE = new java.util.concurrent.atomic.AtomicInteger();

    @org.junit.jupiter.api.BeforeEach void resetAdmin() {
        jdbc.update("update usuarios set password_hash=?, requiere_cambio_password=false, intentos_fallidos=0, bloqueado_hasta=null, version_sesion=version_sesion+1 where username='admin'", encoder.encode(PASSWORD));
    }
    JsonNode login(String user, String password) throws Exception {
        return json(request("POST", "/auth/login", null, mapper.writeValueAsString(java.util.Map.of("username", user, "password", password))), 200).path("data");
    }
    JsonNode login() throws Exception { return login("admin", PASSWORD); }
    HttpResponse<byte[]> refresh(JsonNode session) throws Exception {
        return request("POST", "/auth/refresh-token", null, mapper.writeValueAsString(java.util.Map.of("refreshToken", session.path("refreshToken").asText())));
    }
    String access(JsonNode session) { return session.path("accessToken").asText(); }
    HttpResponse<byte[]> profile(JsonNode session) throws Exception { return request("GET", "/users/me", access(session), null); }
    HttpResponse<byte[]> password(JsonNode session, String oldPassword, String newPassword) throws Exception {
        return request("PUT", "/users/me/password", access(session), mapper.writeValueAsString(java.util.Map.of("currentPassword", oldPassword, "newPassword", newPassword)));
    }

    @Test void accessTokensWithoutASignedSessionVersionAreRejected() throws Exception {
        var key = io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                "test-only-boot4-compatibility-signing-key-never-use-in-production".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var old = io.jsonwebtoken.Jwts.builder().subject("admin")
                .expiration(new java.util.Date(System.currentTimeMillis() + 60000))
                .signWith(key).compact();
        json(request("GET", "/users/me", old, null), 401);
        json(request("GET", "/auth/me", null, null), 401);
    }

    @Test void fifthFailureLocksForFifteenMinutesWithoutExtendingTheLockAndExpiredLockResets() throws Exception {
        for (int i = 1; i <= 5; i++) {
            json(request("POST", "/auth/login", null, "{\"username\":\"admin\",\"password\":\"incorrect-test-password\"}"), 401);
            assertThat(jdbc.queryForObject("select intentos_fallidos from usuarios where username='admin'", Integer.class)).isEqualTo(i);
        }
        var lockedUntil = jdbc.queryForObject("select bloqueado_hasta from usuarios where username='admin'", java.sql.Timestamp.class);
        assertThat(lockedUntil.toLocalDateTime()).isBetween(java.time.LocalDateTime.now().plusMinutes(14), java.time.LocalDateTime.now().plusMinutes(16));
        json(request("POST", "/auth/login", null, mapper.writeValueAsString(java.util.Map.of("username", "admin", "password", PASSWORD))), 423);
        assertThat(jdbc.queryForObject("select bloqueado_hasta from usuarios where username='admin'", java.sql.Timestamp.class)).isEqualTo(lockedUntil);
        jdbc.update("update usuarios set bloqueado_hasta=? where username='admin'", java.sql.Timestamp.valueOf(java.time.LocalDateTime.now().minusSeconds(1)));
        json(profile(login()), 200);
        assertThat(jdbc.queryForObject("select intentos_fallidos from usuarios where username='admin'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select bloqueado_hasta from usuarios where username='admin'", java.sql.Timestamp.class)).isNull();
    }

    @Test void newLoginReplacesThePreviousSessionButOldRefreshAndLogoutCannotRevokeTheNewOne() throws Exception {
        var old = login(); var current = login();
        assertThat(access(current)).isNotEqualTo(access(old));
        json(profile(old), 401); json(refresh(old), 401); json(profile(current), 200);
        json(request("POST", "/auth/logout", null, mapper.writeValueAsString(java.util.Map.of("refreshToken", old.path("refreshToken").asText()))), 200);
        json(profile(current), 200);
    }

    @Test void rotationStoresOnlyHashesAndReuseRevokesTheSuccessorAndAccessImmediately() throws Exception {
        var initial = login();
        var next = json(refresh(initial), 200).path("data");
        assertThat(next.path("refreshToken").asText()).isNotEqualTo(initial.path("refreshToken").asText());
        assertThat(access(next)).isNotEqualTo(access(initial));
        var hashes = jdbc.queryForList("select token from refresh_tokens", String.class);
        assertThat(hashes).allMatch(hash -> hash.matches("[0-9a-f]{64}"))
                .doesNotContain(initial.path("refreshToken").asText(), next.path("refreshToken").asText());
        json(profile(next), 200);
        json(refresh(initial), 401); // La invalidación debe confirmarse pese a esta respuesta.
        json(profile(initial), 401); json(profile(next), 401); json(refresh(next), 401);
    }

    @Test void simultaneousUseOfTheSameRefreshDetectsReuseAndCannotLeaveAnActiveSuccessor() throws Exception {
        var initial = login();
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> refresh(initial));
            var second = executor.submit(() -> refresh(initial));
            var responses = java.util.List.of(first.get(15, java.util.concurrent.TimeUnit.SECONDS), second.get(15, java.util.concurrent.TimeUnit.SECONDS));
            assertThat(responses.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(200, 401);
            var next = json(responses.stream().filter(r -> r.statusCode() == 200).findFirst().orElseThrow(), 200).path("data");
            json(profile(next), 401); json(refresh(next), 401);
        }
    }

    @Test void expiredRefreshIsRejectedAndCurrentLogoutRevokesBothTokens() throws Exception {
        var initial = login();
        jdbc.update("update refresh_tokens set fecha_expiracion=? where usuario_id=(select id from usuarios where username='admin')", java.sql.Timestamp.valueOf(java.time.LocalDateTime.now().minusMinutes(1)));
        json(refresh(initial), 401);
        var current = login();
        json(request("POST", "/auth/logout", null, mapper.writeValueAsString(java.util.Map.of("refreshToken", current.path("refreshToken").asText()))), 200);
        json(profile(current), 401); json(refresh(current), 401);
    }

    @Test void passwordChangeRevokesTokensAndRequiresTheNewPassword() throws Exception {
        var session = login();
        json(password(session, PASSWORD, NEW_PASSWORD), 200);
        json(profile(session), 401); json(refresh(session), 401);
        json(request("POST", "/auth/login", null, mapper.writeValueAsString(java.util.Map.of("username", "admin", "password", PASSWORD))), 401);
        json(profile(login("admin", NEW_PASSWORD)), 200);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO", "ROLE_CLIENTE"})
    void allRolesMustChangeInitialPasswordBeforeBusinessAccess(String role) throws Exception {
        var admin = login();
        String username = "initial-user-" + SEQUENCE.incrementAndGet();
        json(request("POST", "/users", access(admin), mapper.writeValueAsString(java.util.Map.of(
                "username", username, "password", PASSWORD, "nombres", "Usuario", "apellidos", "Ejemplo",
                "email", username + "@example.test", "roles", java.util.List.of(role)))), 201);
        var limited = login(username, PASSWORD);
        assertThat(limited.path("requiresPasswordChange").asBoolean()).isTrue();
        json(profile(limited), 200); json(request("GET", "/auth/me", access(limited), null), 200);
        for (String path : java.util.List.of("/audit", "/users", "/tickets", "/tickets/999/attachments", "/service-settings", "/ws/updates")) {
            var denied = json(request("GET", path, access(limited), null), 403);
            assertThat(denied.path("errors").toString()).contains("PASSWORD_CHANGE_REQUIRED");
        }
        json(request("POST", "/categories", access(limited), "{}"), 403);
        var rotated = json(refresh(limited), 200).path("data");
        assertThat(rotated.path("requiresPasswordChange").asBoolean()).isTrue();
        json(password(rotated, PASSWORD, NEW_PASSWORD), 200);
        json(profile(rotated), 401); json(refresh(rotated), 401);
        var ready = login(username, NEW_PASSWORD);
        assertThat(ready.path("requiresPasswordChange").asBoolean()).isFalse();
        json(profile(ready), 200);
    }

    @Test void adminResetRequiresAnotherPasswordChangeAndRevokesTheTargetsSession() throws Exception {
        var admin = login();
        var target = login("tecnico1", "test-only-technician-password");
        long id = target.path("userId").asLong();
        json(request("PUT", "/users/" + id, access(admin), "{\"password\":\"test-only-reset-password\"}"), 200);
        json(profile(target), 401); json(refresh(target), 401);
        var limited = login("tecnico1", "test-only-reset-password");
        assertThat(limited.path("requiresPasswordChange").asBoolean()).isTrue();
        assertThat(json(request("GET", "/tickets", access(limited), null), 403).path("errors").toString()).contains("PASSWORD_CHANGE_REQUIRED");
    }

    @Test void sessionReplacementAndPasswordChangeCloseExistingWebSockets() throws Exception {
        var closed = new java.util.concurrent.CountDownLatch(1);
        var first = login();
        var socket = http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                .buildAsync(URI.create("ws://localhost:" + port + "/api/v1/ws/updates?access_token=" + access(first)), new java.net.http.WebSocket.Listener() {
                    public java.util.concurrent.CompletionStage<?> onClose(java.net.http.WebSocket ws, int code, String reason) { closed.countDown(); return null; }
                }).get(10, java.util.concurrent.TimeUnit.SECONDS);
        var current = login();
        assertThat(closed.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        var passwordClosed = new java.util.concurrent.CountDownLatch(1);
        var currentSocket = http.newWebSocketBuilder().buildAsync(URI.create("ws://localhost:" + port + "/api/v1/ws/updates?access_token=" + access(current)), new java.net.http.WebSocket.Listener() {
            public java.util.concurrent.CompletionStage<?> onClose(java.net.http.WebSocket ws, int code, String reason) { passwordClosed.countDown(); return null; }
        }).get(10, java.util.concurrent.TimeUnit.SECONDS);
        json(password(current, PASSWORD, NEW_PASSWORD), 200);
        assertThat(passwordClosed.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        socket.abort(); currentSocket.abort();
    }
}
