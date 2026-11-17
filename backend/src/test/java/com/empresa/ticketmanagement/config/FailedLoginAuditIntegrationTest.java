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
                "spring.datasource.url=jdbc:h2:mem:failed-login-audit;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
                "spring.datasource.password=", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
                "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never",
                "spring.datasource.hikari.maximum-pool-size=1", "spring.datasource.hikari.minimum-idle=1",
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
                "APP_SEED_CLIENT_PASSWORD=test-only-client-password", "logging.level.root=WARN"
        })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FailedLoginAuditIntegrationTest {
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

    @Autowired com.empresa.ticketmanagement.repository.AuditoriaRepository audits;
    @Autowired com.empresa.ticketmanagement.repository.UsuarioRepository users;
    @Autowired com.empresa.ticketmanagement.repository.RefreshTokenRepository refreshTokens;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @org.junit.jupiter.api.BeforeEach void resetFailures() {
        jdbc.update("update usuarios set intentos_fallidos=0, bloqueado_hasta=null where username='admin'");
    }

    long lastId() { return audits.findAll().stream().mapToLong(a -> a.getId()).max().orElse(0); }
    java.util.List<com.empresa.ticketmanagement.entity.Auditoria> failuresAfter(long id) {
        return audits.findAll().stream().filter(a -> a.getId()>id && "LOGIN_FALLIDO".equals(a.getAccion())).toList();
    }
    HttpResponse<byte[]> attempt(String username,String password,String agent,String ip) throws Exception {
        var body=mapper.writeValueAsString(java.util.Map.of("username",username,"password",password));
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/v1/auth/login"))
                .timeout(Duration.ofSeconds(10)).header("Content-Type","application/json")
                .header("User-Agent",agent).header("X-Forwarded-For",ip).POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return http.send(request,HttpResponse.BodyHandlers.ofByteArray());
    }

    @Test void consecutiveWrongPasswordsPersistOneSpecificEventEachBeforeThe401Returns() throws Exception {
        long before=lastId(),tokensBefore=refreshTokens.count();
        var previous=users.findByUsername("admin").orElseThrow();
        for(int i=0;i<3;i++) {
            String password="test-only-incorrect-password-"+i;
            var response=attempt("admin",password,"test-login-browser","203.0.113.25, 10.0.0.1");
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(new String(response.body(),java.nio.charset.StandardCharsets.UTF_8))
                    .doesNotContain(password,"accessToken","refreshToken");
            assertThat(failuresAfter(before)).hasSize(i+1);
        }
        for(var event:failuresAfter(before)) {
            assertThat(event.getModulo()).isEqualTo("AUTENTICACION");
            assertThat(event.getUsuarioId()).isNull();
            assertThat(event.getDetalle()).isEqualTo("Intento fallido para el usuario: admin");
            assertThat(event.getIpOrigen()).isEqualTo("203.0.113.25");
            assertThat(event.getUserAgent()).isEqualTo("test-login-browser");
            assertThat(event.getFechaRegistro()).isNotNull();
        }
        assertThat(refreshTokens.count()).isEqualTo(tokensBefore);
        var after=users.findByUsername("admin").orElseThrow();
        assertThat(after.getPasswordHash()).isEqualTo(previous.getPasswordHash());
        assertThat(after.getFechaUltimoAcceso()).isEqualTo(previous.getFechaUltimoAcceso());
        assertThat(audits.findAll().stream().filter(a->a.getId()>before && "LOGIN_EXITOSO".equals(a.getAccion()))).isEmpty();
    }

    @Test void unknownUserIsAuditedWithoutCreatingAnAccountOrRevealingItsExistence() throws Exception {
        long before=lastId(),userCount=users.count();
        var known=attempt("admin","test-only-incorrect","browser","203.0.113.1");
        var unknown=attempt("nonexistent-audit-user","test-only-incorrect","browser","203.0.113.1");
        assertThat(unknown.statusCode()).isEqualTo(401);
        assertThat(mapper.readTree(unknown.body()).path("message").asText()).isEqualTo(mapper.readTree(known.body()).path("message").asText());
        assertThat(failuresAfter(before)).hasSize(2);
        assertThat(failuresAfter(before)).anySatisfy(event->assertThat(event.getDetalle()).contains("nonexistent-audit-user"));
        assertThat(users.count()).isEqualTo(userCount);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans={false,true})
    void disabledAndLockedAccountsAlsoReturn401AndKeepTheFailureEvent(boolean locked) throws Exception {
        var tx=new org.springframework.transaction.support.TransactionTemplate(transactions);
        tx.executeWithoutResult(status->{var user=users.findByUsername("tecnico1").orElseThrow();
            user.setEstado(locked?"ACTIVO":"INACTIVO");user.setBloqueadoHasta(locked?java.time.LocalDateTime.now().plusMinutes(5):null);users.save(user);});
        long before=lastId();
        try {
            var response=attempt("tecnico1","test-only-technician-password","browser","203.0.113.1");
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(failuresAfter(before)).hasSize(1);
            assertThat(failuresAfter(before).getFirst().getDetalle()).contains("tecnico1");
        } finally {
            tx.executeWithoutResult(status->{var user=users.findByUsername("tecnico1").orElseThrow();
                user.setEstado("ACTIVO");user.setBloqueadoHasta(null);users.save(user);});
        }
    }

    @Test void successfulLoginAfterAFailureKeepsTheTwoKindsOfEventSeparate() throws Exception {
        long before=lastId();
        assertThat(attempt("admin","test-only-incorrect","browser","203.0.113.1").statusCode()).isEqualTo(401);
        var success=attempt("admin","test-only-admin-password","browser","203.0.113.1");
        assertThat(success.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(success.body()).at("/data/accessToken").asText()).isNotBlank();
        assertThat(failuresAfter(before)).hasSize(1);
        assertThat(audits.findAll().stream().filter(a->a.getId()>before && "LOGIN_EXITOSO".equals(a.getAccion())).count()).isEqualTo(1);
    }

    @Test void validationErrorsDoNotBecomeAuthenticationAttempts() throws Exception {
        long before=lastId();
        assertThat(request("POST","/auth/login",null,"{\"username\":\"\",\"password\":\"\"}").statusCode()).isEqualTo(400);
        assertThat(failuresAfter(before)).isEmpty();
    }

    @Test void oversizedHeadersAndUnknownUsernameDoNotPreventTheAuditCommit() throws Exception {
        long before=lastId();String username="u".repeat(100);
        assertThat(attempt(username,"test-only-incorrect","A".repeat(500),"x".repeat(200)).statusCode()).isEqualTo(401);
        assertThat(failuresAfter(before)).hasSize(1);
        var event=failuresAfter(before).getFirst();
        assertThat(event.getIpOrigen()).hasSize(50);assertThat(event.getUserAgent()).hasSize(255);
        assertThat(event.getDetalle()).isEqualTo("Intento fallido para el usuario: "+"u".repeat(50));
    }

    @Test void unavailableSpecificAndGenericAuditWritesDoNotReplaceThe401() throws Exception {
        long before=lastId();
        // Solo esta base H2: simular un fallo real de persistencia sin afectar al lector de cuentas.
        jdbc.execute("ALTER TABLE auditoria ADD CONSTRAINT test_reject_failed_audit CHECK (id <= "+before+" OR accion NOT IN ('LOGIN_FALLIDO','POST_ERROR'))");
        try {
            var response=attempt("admin","test-only-incorrect","browser","203.0.113.1");
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(mapper.readTree(response.body()).path("success").asBoolean()).isFalse();
            assertThat(failuresAfter(before)).isEmpty();
        } finally {jdbc.execute("ALTER TABLE auditoria DROP CONSTRAINT test_reject_failed_audit");}
    }
}
