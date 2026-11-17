package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "configuracion_servicios")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConfiguracionServicio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dias_por_vencer", nullable = false)
    @Builder.Default
    private Integer diasPorVencer = 5;

    @Column(name = "recordatorio_vencido", nullable = false)
    @Builder.Default
    private Boolean recordatorioVencido = true;

    @Column(name = "asunto_recordatorio", nullable = false, length = 255)
    @Builder.Default
    private String asuntoRecordatorio = "Recordatorio de servicio: {{servicio.nombre}}";

    @Column(name = "plantilla_recordatorio", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String plantillaRecordatorio = "Hola,\n\nEl servicio {{servicio.nombre}} vence el {{servicio.fechaFin}}.\nEstado: {{servicio.estado}}.\n\nPor favor, revisa su renovación.";

    @Column(name = "asunto_por_vencer", nullable = false, length = 255)
    @Builder.Default private String asuntoPorVencer = "Recordatorio: servicio por vencer - {{servicio.nombre}}";
    @Column(name = "plantilla_por_vencer", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String plantillaPorVencer = "Hola,\n\nEl servicio {{servicio.nombre}} vencerá el {{servicio.fechaFin}}.\nEstado: {{servicio.estado}}.\n\nPor favor, revisa su renovación.";
    @Column(name = "asunto_vencido", nullable = false, length = 255)
    @Builder.Default private String asuntoVencido = "Servicio vencido: {{servicio.nombre}}";
    @Column(name = "plantilla_vencido", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String plantillaVencido = "Hola,\n\nEl servicio {{servicio.nombre}} venció el {{servicio.fechaFin}}.\nEstado: {{servicio.estado}}.\n\nRevisa la renovación o regularización del servicio.";
}
