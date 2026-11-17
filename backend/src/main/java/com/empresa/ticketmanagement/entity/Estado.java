package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "estados")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Estado {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String nombre;

    @Column(nullable = false, unique = true, length = 50)
    private String codigo;

    @Column(name = "color_hex", nullable = false, length = 10)
    @Builder.Default
    private String colorHex = "#6C757D";

    @Column(name = "es_inicial", nullable = false)
    @Builder.Default
    private Boolean esInicial = false;

    @Column(name = "es_final", nullable = false)
    @Builder.Default
    private Boolean esFinal = false;

    @Column(nullable = false)
    @Builder.Default
    private Integer orden = 0;
}
