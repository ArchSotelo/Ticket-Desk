package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "historial")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Historial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ticket_id", nullable = false)
    private Ticket ticket;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Column(name = "campo_modificado", nullable = false, length = 100)
    private String campoModificado;

    @Lob
    @Column(name = "valor_anterior", columnDefinition = "LONGTEXT")
    private String valorAnterior;

    @Lob
    @Column(name = "valor_nuevo", columnDefinition = "LONGTEXT")
    private String valorNuevo;

    @Column(name = "fecha_cambio", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime fechaCambio = LocalDateTime.now();
}
