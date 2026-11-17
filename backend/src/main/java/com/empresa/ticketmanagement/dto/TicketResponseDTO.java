package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class TicketResponseDTO {

    private Long id;
    // Se devuelve únicamente al crear un comentario para vincular sus archivos sin ambigüedad.
    private Long comentarioCreadoId;
    private String codigo;
    private String titulo;
    private String descripcion;

    // Cliente
    private Long clienteId;
    private String clienteNombre;
    private String clienteEmail;

    // Técnico
    private Long tecnicoId;
    private String tecnicoNombre;

    // Empresa & Área
    private Long empresaId;
    private String empresaNombre;
    private Long areaId;
    private String areaNombre;

    // Categoría & Subcategoría
    private Long categoriaId;
    private String categoriaNombre;
    private Long subcategoriaId;
    private String subcategoriaNombre;

    // Prioridad
    private Long prioridadId;
    private String prioridadNombre;
    private String prioridadColorHex;

    // Estado
    private Long estadoId;
    private String estadoNombre;
    private String estadoCodigo;
    private String estadoColorHex;

    // Fechas & SLA
    private Long slaId;
    private LocalDateTime fechaCreacion;
    private LocalDateTime fechaModificacion;
    private LocalDateTime fechaLimiteRespuesta;
    private LocalDateTime fechaLimiteResolucion;
    private LocalDateTime fechaPrimerRespuesta;
    private LocalDateTime fechaResolucion;
    private LocalDateTime fechaCierre;
    private Boolean cumplioSlaRespuesta;
    private Boolean cumplioSlaResolucion;

    // Tiempos
    private Integer tiempoEstimadoMinutos;
    private Integer tiempoRegistradoMinutos;

    // Adjuntos y comentarios count
    private List<TicketAttachmentDTO> attachments;
    private List<ComentarioDTO> comentarios;
    private Integer cantidadComentarios;
    private List<HistorialCambioDTO> historialCambios;
}
