package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "sla")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Sla {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String nombre;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "prioridad_id", nullable = false)
    private Prioridad prioridad;

    @Column(name = "tiempo_respuesta_minutos", nullable = false)
    private Integer tiempoRespuestaMinutos;

    @Column(name = "tiempo_resolucion_minutos", nullable = false)
    private Integer tiempoResolucionMinutos;

    @Column(name = "horario_atencion", nullable = false, length = 100)
    @Builder.Default
    private String horarioAtencion = "24x7";

    @Column(nullable = false)
    @Builder.Default
    private Boolean activo = true;
}
