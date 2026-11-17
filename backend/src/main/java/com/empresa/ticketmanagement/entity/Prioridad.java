package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "prioridades")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Prioridad {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String nombre;

    @Column(nullable = false, unique = true)
    private Integer nivel; // 1: Baja, 2: Media, 3: Alta, 4: Crítica

    @Column(name = "color_hex", nullable = false, length = 10)
    @Builder.Default
    private String colorHex = "#007BFF";

    @Column(name = "tiempo_respuesta_hrs", nullable = false)
    @Builder.Default
    private Integer tiempoRespuestaHrs = 24;

    @Column(name = "tiempo_resolucion_hrs", nullable = false)
    @Builder.Default
    private Integer tiempoResolucionHrs = 48;
}
