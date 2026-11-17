package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "tickets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Ticket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String codigo;

    /**
     * Identifica de forma única un intento de creación enviado por el cliente.
     * Permite devolver el ticket existente cuando se repite la misma petición.
     */
    @Column(name = "idempotency_key", unique = true, length = 64)
    private String idempotencyKey;

    @Column(nullable = false, length = 200)
    private String titulo;

    @Lob
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String descripcion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    private Usuario cliente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tecnico_id")
    private Usuario tecnico;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "empresa_id", nullable = false)
    private Empresa empresa;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "area_id")
    private Area area;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "categoria_id", nullable = false)
    private Categoria categoria;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subcategoria_id")
    private Subcategoria subcategoria;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "prioridad_id", nullable = false)
    private Prioridad prioridad;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "estado_id", nullable = false)
    private Estado estado;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sla_id")
    private Sla sla;

    @Column(name = "fecha_creacion", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime fechaCreacion = LocalDateTime.now();

    @Column(name = "fecha_modificacion")
    private LocalDateTime fechaModificacion;

    @Column(name = "fecha_limite_respuesta")
    private LocalDateTime fechaLimiteRespuesta;

    @Column(name = "fecha_limite_resolucion")
    private LocalDateTime fechaLimiteResolucion;

    @Column(name = "fecha_primer_respuesta")
    private LocalDateTime fechaPrimerRespuesta;

    @Column(name = "fecha_resolucion")
    private LocalDateTime fechaResolucion;

    @Column(name = "fecha_cierre")
    private LocalDateTime fechaCierre;

    @Column(name = "cumplio_sla_respuesta")
    private Boolean cumplioSlaRespuesta;

    @Column(name = "cumplio_sla_resolucion")
    private Boolean cumplioSlaResolucion;

    @Column(name = "tiempo_estimado_minutos")
    @Builder.Default
    private Integer tiempoEstimadoMinutos = 0;

    @Column(name = "tiempo_registrado_minutos")
    @Builder.Default
    private Integer tiempoRegistradoMinutos = 0;
}
