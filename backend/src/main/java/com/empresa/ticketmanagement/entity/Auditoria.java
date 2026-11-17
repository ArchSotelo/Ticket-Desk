package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "auditoria")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(name = "ip_origen", length = 50)
    private String ipOrigen;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @Column(nullable = false, length = 100)
    private String accion;

    @Column(nullable = false, length = 100)
    private String modulo;

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String detalle;

    @Column(name = "fecha_registro", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime fechaRegistro = LocalDateTime.now();
}
