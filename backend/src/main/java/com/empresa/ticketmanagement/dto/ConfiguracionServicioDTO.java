package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.*;
import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Configuración global de avisos y plantillas de servicios. Envía todas las plantillas al actualizar por PUT.")
public class ConfiguracionServicioDTO {

    @NotNull
    @Min(1)
    @Max(365)
    @Schema(description = "Días de anticipación para clasificar un servicio como POR_VENCER; entre 1 y 365.", example = "5", minimum = "1", maximum = "365")
    private Integer diasPorVencer;

    @Schema(description = "Habilita recordatorios para servicios vencidos. En PUT, omitirlo equivale a false.", example = "true")
    private Boolean recordatorioVencido;

    @NotBlank
    @Schema(description = "Asunto general del recordatorio. Admite variables del servicio.", example = "Recordatorio: {{servicio.nombre}}")
    private String asuntoRecordatorio;

    @NotBlank
    @Schema(description = "Cuerpo general del recordatorio.", example = "El servicio {{servicio.nombre}} vence el {{servicio.fechaFin}}.")
    private String plantillaRecordatorio;
    @Schema(description = "Asunto de aviso previo al vencimiento.", example = "Servicio por vencer: {{servicio.nombre}}", requiredMode = Schema.RequiredMode.REQUIRED)
    private String asuntoPorVencer;
    @Schema(description = "Cuerpo del aviso previo al vencimiento.", example = "El servicio {{servicio.nombre}} vencerá el {{servicio.fechaFin}}.", requiredMode = Schema.RequiredMode.REQUIRED)
    private String plantillaPorVencer;
    @Schema(description = "Asunto del aviso de servicio vencido.", example = "Servicio vencido: {{servicio.nombre}}", requiredMode = Schema.RequiredMode.REQUIRED)
    private String asuntoVencido;
    @Schema(description = "Cuerpo del aviso de servicio vencido.", example = "El servicio {{servicio.nombre}} venció el {{servicio.fechaFin}}.", requiredMode = Schema.RequiredMode.REQUIRED)
    private String plantillaVencido;
}
