package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "servicios")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Servicio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String nombre;

    @Column(nullable = false, length = 200)
    private String proveedor;

    @Column(nullable = false, length = 80)
    private String tipo;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String estado = "ACTIVO";

    @Column(name = "fecha_inicio", nullable = false)
    private LocalDate fechaInicio;

    @Column(name = "fecha_fin", nullable = false)
    private LocalDate fechaFin;

    @Column(name = "costo_mensual", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal costoMensual = BigDecimal.ZERO;

    @Column(nullable = false, length = 3)
    @Builder.Default
    private String divisa = "PEN";

    @Column(name = "servicio_anterior_id")
    private Long servicioAnteriorId;

    @Column(name = "factura_nombre", length = 255)
    private String facturaNombre;

    @Column(name = "factura_ruta", length = 500)
    private String facturaRuta;

    @Column(name = "factura_mime", length = 100)
    private String facturaMime;

    @Column(name = "factura_tamano")
    private Long facturaTamano;

    @Column(name = "alerta_proxima_enviada", nullable = false)
    @Builder.Default
    private Boolean alertaProximaEnviada = false;

    @Column(name = "alerta_vencida_enviada", nullable = false)
    @Builder.Default
    private Boolean alertaVencidaEnviada = false;

    @Column(length = 150)
    private String responsable;

    @Column(columnDefinition = "TEXT")
    private String notas;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "servicio_recordatorios", joinColumns = @JoinColumn(name = "servicio_id"))
    @Column(name = "correo", length = 254)
    @Builder.Default
    private List<String> correosRecordatorio = new ArrayList<>();

    @Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime fechaCreacion;

    @Column(name = "fecha_modificacion")
    private LocalDateTime fechaModificacion;

    @Column(name = "observacion_cancelacion", columnDefinition = "TEXT")
    private String observacionCancelacion;

    @PrePersist
    void prePersist() { fechaCreacion = LocalDateTime.now(); fechaModificacion = fechaCreacion; }

    @PreUpdate
    void preUpdate() { fechaModificacion = LocalDateTime.now(); }
}
