package com.empresa.ticketmanagement.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springdoc.core.customizers.OpenApiCustomizer;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        final String securitySchemeName = "bearerAuth";
        return new OpenAPI()
                .addSecurityItem(new SecurityRequirement().addList(securitySchemeName))
                .components(new Components()
                        .addSecuritySchemes(securitySchemeName, new SecurityScheme()
                                .name(securitySchemeName)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .info(new Info()
                        .title("ServiceDesk Pro — API REST")
                        .description("API completa del Sistema de Gestión de Tickets Empresarial (Tipo Jira). " +
                                "Incluye autenticación JWT, gestión de tickets, SLA, adjuntos, reportes y auditoría.")
                        .version("1.0.0")
                        .contact(new Contact()
                                .name("Equipo de Desarrollo")
                                .email("dev@empresa.com")));
    }
    /**
     * Springdoc combina los dos handlers de renovación en una sola operación.
     * Sus fechas de consulta y su JSON son alternativas, no requisitos simultáneos.
     * Esta corrección afecta solo a la documentación, no a los bindings de Spring MVC.
     */
    @Bean
    public OpenApiCustomizer serviceRenewalDocumentation() {
        return openApi -> {
            if (openApi.getPaths() == null) return;
            var path = openApi.getPaths().get("/services/{id}/renew");
            if (path == null || path.getPost() == null) return;
            var operation = path.getPost();
            operation.setOperationId("renovarServicio");
            if (operation.getParameters() != null) {
                operation.getParameters().stream()
                        .filter(parameter -> "query".equals(parameter.getIn())
                                && ("fechaInicio".equals(parameter.getName()) || "fechaFin".equals(parameter.getName())))
                        .forEach(parameter -> parameter.setRequired(false));
            }
            if (operation.getRequestBody() != null) operation.getRequestBody().setRequired(false);
        };
    }

}
