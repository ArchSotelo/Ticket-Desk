package com.empresa.ticketmanagement.documentation;

import com.empresa.ticketmanagement.audit.AuditQueryService;
import com.empresa.ticketmanagement.config.OpenApiConfig;
import com.empresa.ticketmanagement.controller.*;
import com.empresa.ticketmanagement.repository.CategoriaServicioRepository;
import com.empresa.ticketmanagement.repository.ConfiguracionServicioRepository;
import com.empresa.ticketmanagement.service.ServicioService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration;
import org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration;
import org.springframework.boot.security.autoconfigure.SecurityAutoConfiguration;
import org.springframework.boot.security.autoconfigure.web.servlet.ServletWebSecurityAutoConfiguration;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Contexto aislado: solo genera OpenAPI, sin base de datos, archivos ni servicios reales.
@SpringBootTest(classes = ControllerOpenApiTest.DocumentationApplication.class, properties = {
        "spring.profiles.active=test", "spring.sql.init.mode=never", "server.servlet.context-path=",
        "springdoc.api-docs.path=/v3/api-docs", "springdoc.swagger-ui.enabled=false",
        "spring.jackson.time-zone=America/Lima",
        "spring.autoconfigure.exclude=org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration" })
@AutoConfigureMockMvc
class ControllerOpenApiTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = { DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            DataJpaRepositoriesAutoConfiguration.class, SecurityAutoConfiguration.class, ServletWebSecurityAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class })
    @Import({ OpenApiConfig.class, ServicioController.class, ConfiguracionServicioController.class,
            CategoriaServicioController.class, AuditoriaController.class })
    static class DocumentationApplication {}

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean ServicioService services;
    @MockitoBean AuditQueryService audit;
    @MockitoBean CategoriaServicioRepository categories;
    @MockitoBean ConfiguracionServicioRepository settings;

    @Test void generatedDocumentDescribesAllOperationsAndTheirRealContracts() throws Exception {
        var result = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn();
        var json = mapper.readTree(result.getResponse().getContentAsByteArray());
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target/openapi-documented-controllers.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(json));
        int operations = 0;
        var paths = json.path("paths").properties().iterator();
        while (paths.hasNext()) {
            var path = paths.next();
            if (!(path.getKey().startsWith("/services") || path.getKey().startsWith("/service-settings")
                    || path.getKey().startsWith("/service-categories") || path.getKey().equals("/audit"))) continue;
            var methods = path.getValue().properties().iterator();
            while (methods.hasNext()) {
                var method = methods.next();
                if (!List.of("get", "post", "put", "patch", "delete").contains(method.getKey())) continue;
                operations++;
                var op = method.getValue();
                assertThat(op.path("summary").asText()).as(path.getKey()).isNotBlank();
                assertThat(op.path("description").asText()).as(path.getKey()).isNotBlank();
                assertThat(op.path("tags").toString()).doesNotContain("-controller");
                assertThat(op.path("responses").has("401")).isTrue();
                assertThat(op.path("responses").has("400")).isTrue();
                assertThat(op.path("responses").has("500")).isTrue();
                assertThat(op.path("summary").asText()).doesNotContain("Ã");
                String success = op.path("responses").has("201") ? "201" : "200";
                boolean binary = path.getKey().equals("/services/export") || path.getKey().equals("/services/export/excel")
                        || (method.getKey().equals("get") && (path.getKey().endsWith("/invoice") || path.getKey().endsWith("/download") || path.getKey().endsWith("/preview")));
                if (!binary) assertThat(op.path("responses").path(success).path("content").has("application/json")).as(path.getKey()).isTrue();
            }
        }
        assertThat(operations).isEqualTo(27);
        assertThat(json.at("/components/securitySchemes/bearerAuth/scheme").asText()).isEqualTo("bearer");
        assertThat(json.path("security").toString()).contains("bearerAuth");
        var auditOp = json.path("paths").path("/audit").path("get");
        for (String name : List.of("page", "size", "busqueda", "grupo", "accion", "desde", "hasta", "orden")) {
            assertThat(parameter(auditOp, name).path("description").asText()).isNotBlank();
        }
        assertThat(parameter(auditOp, "desde").path("schema").path("format").asText()).isEqualTo("date");
        assertThat(parameter(auditOp, "orden").path("schema").path("enum").toString()).contains("asc", "desc");
        for (String path : List.of("/services/{id}/invoice", "/services/{id}/attachments")) {
            var body = json.path("paths").path(path).path("post").path("requestBody");
            assertThat(body.path("required").asBoolean()).isTrue();
            assertThat(body.path("content").has("multipart/form-data")).as(path).isTrue();
        }
        assertThat(json.at("/components/schemas/FacturaServicioUpload/properties/file/format").asText()).isEqualTo("binary");
        assertThat(json.at("/components/schemas/AdjuntosServicioUpload/properties/files/items/format").asText()).isEqualTo("binary");
        for (String path : List.of("/services/{id}/invoice", "/services/{id}/invoice/download", "/services/{id}/attachments/{attachmentId}/download", "/services/{id}/attachments/{attachmentId}/preview")) {
            assertThat(json.path("paths").path(path).path("get").path("responses").path("200").path("content")
                    .path("application/octet-stream").path("schema").path("format").asText()).isEqualTo("binary");
        }
        assertThat(json.path("paths").path("/services/export").path("get").path("responses").path("200").path("content").has("text/csv")).isTrue();
        assertThat(json.path("paths").path("/services/export/excel").path("get").path("responses").path("200").path("content")
                .has("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).isTrue();
        var renewal = json.path("paths").path("/services/{id}/renew").path("post");
        assertThat(renewal.path("description").asText()).contains("dos modalidades");
        assertThat(parameter(renewal, "fechaInicio").path("required").asBoolean()).isFalse();
        assertThat(parameter(renewal, "fechaFin").path("required").asBoolean()).isFalse();
        assertThat(renewal.path("requestBody").path("required").asBoolean()).isFalse();
        assertThat(renewal.path("requestBody").path("content").has("application/json")).isTrue();
        assertThat(json.at("/components/schemas/ServicioDTO/properties/id/readOnly").asBoolean()).isTrue();
        assertThat(json.at("/components/schemas/ConfiguracionServicioDTO/properties/diasPorVencer/maximum").asInt()).isEqualTo(365);
        verifyNoInteractions(services, audit, categories, settings);
    }

    private JsonNode parameter(JsonNode operation, String name) {
        for (JsonNode parameter : operation.path("parameters")) if (name.equals(parameter.path("name").asText())) return parameter;
        throw new AssertionError("No se documentó el parámetro " + name);
    }
}
