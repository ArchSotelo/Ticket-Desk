package com.empresa.ticketmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "ticket_attachment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TicketAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ticket_id", nullable = false)
    private Ticket ticket;

    // Nulo para archivos del ticket sin mensaje asociado (incluidos los históricos).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comentario_id")
    private Comentario mensaje;

    @Column(name = "nombre_original", nullable = false, length = 255)
    private String nombreOriginal;

    @Column(name = "nombre_fisico", nullable = false, length = 255)
    private String nombreFisico;

    @Column(nullable = false, length = 20)
    private String extension;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "tamano_bytes", nullable = false)
    private Long tamanoBytes;

    @Column(nullable = false, length = 500)
    private String ruta;

    @Column(name = "proveedor_almacenamiento", nullable = false, length = 50)
    @Builder.Default
    private String proveedorAlmacenamiento = "LOCAL"; // LOCAL, MINIO, S3, AZURE

    @Column(name = "hash_sha256", length = 64)
    private String hashSha256;

    @Column(columnDefinition = "TEXT")
    private String comentario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "usuario_creacion", nullable = false)
    private Usuario usuarioCreacion;

    @Column(name = "fecha_creacion", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime fechaCreacion = LocalDateTime.now();

    @Column(nullable = false)
    @Builder.Default
    private Boolean activo = true;
}
