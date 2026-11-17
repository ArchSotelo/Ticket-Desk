package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class TicketAttachmentDTO {
    private Long id;
    private Long ticketId;
    private Long comentarioId;
    private String nombreOriginal;
    private String comentario;
    private String extension;
    private String mimeType;
    private Long tamanoBytes;
    private String proveedorAlmacenamiento;
    private String usuarioCreacionNombre;
    private LocalDateTime fechaCreacion;
    private String downloadUrl;
    private String previewUrl;
}
