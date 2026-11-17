package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
@Schema(description = "Metadatos de un archivo adjunto activo; los binarios se consultan mediante sus URLs.")
public class ServicioAdjuntoDTO {
    @Schema(description = "Identificador del adjunto.", example = "10", accessMode = Schema.AccessMode.READ_ONLY)
    private Long id;
    @Schema(description = "Nombre original del archivo.", example = "contrato.pdf", accessMode = Schema.AccessMode.READ_ONLY)
    private String nombreOriginal;
    @Schema(description = "Tipo MIME registrado.", example = "application/pdf", accessMode = Schema.AccessMode.READ_ONLY)
    private String mimeType;
    @Schema(description = "Tamaño en bytes.", example = "204800", accessMode = Schema.AccessMode.READ_ONLY)
    private Long tamanoBytes;
    @Schema(description = "Fecha local de creación del adjunto.", example = "2026-10-28T15:30:00", accessMode = Schema.AccessMode.READ_ONLY)
    private LocalDateTime fechaCreacion;
    @Schema(description = "URL de descarga del archivo.", example = "/api/v1/services/1/attachments/10/download", accessMode = Schema.AccessMode.READ_ONLY)
    private String downloadUrl;
    @Schema(description = "URL de previsualización del archivo.", example = "/api/v1/services/1/attachments/10/preview", accessMode = Schema.AccessMode.READ_ONLY)
    private String previewUrl;
}
