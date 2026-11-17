package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.TicketAttachmentDTO;
import com.empresa.ticketmanagement.service.AttachmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping
@RequiredArgsConstructor
@Tag(name = "Adjuntos & Evidencias", description = "Endpoints para la gestión de archivos adjuntos en tickets")
public class AttachmentController {

    private final AttachmentService attachmentService;

    @PostMapping("/tickets/{ticketId}/attachments")
    @Operation(summary = "Subir un archivo o evidencia a un ticket (Drag & Drop / Clipboard)")
    public ResponseEntity<ApiResponse<TicketAttachmentDTO>> subirAdjunto(
            @PathVariable Long ticketId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "comentario", required = false) String comentario,
            @RequestParam(value = "comentarioId", required = false) Long comentarioId,
            Authentication authentication
    ) {
        TicketAttachmentDTO dto = comentarioId == null
                ? attachmentService.subirAdjunto(ticketId, file, comentario, authentication.getName())
                : attachmentService.subirAdjunto(ticketId, file, comentario, authentication.getName(), comentarioId);
        return ResponseEntity.ok(ApiResponse.ok(dto, "Archivo adjuntado correctamente."));
    }

    @GetMapping("/tickets/{ticketId}/attachments")
    @Operation(summary = "Listar todos los archivos adjuntos de un ticket")
    public ResponseEntity<ApiResponse<List<TicketAttachmentDTO>>> listarAdjuntosTicket(@PathVariable Long ticketId) {
        List<TicketAttachmentDTO> list = attachmentService.obtenerAdjuntosTicket(ticketId);
        return ResponseEntity.ok(ApiResponse.ok(list));
    }

    @GetMapping("/attachments/{id}")
    @Operation(summary = "Obtener metadatos de un archivo adjunto")
    public ResponseEntity<ApiResponse<TicketAttachmentDTO>> obtenerMetadatos(@PathVariable Long id) {
        TicketAttachmentDTO dto = attachmentService.obtenerMetadatos(id);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @GetMapping("/attachments/{id}/download")
    @Operation(summary = "Descargar un archivo adjunto por ID")
    public ResponseEntity<Resource> descargarAdjunto(@PathVariable Long id) {
        TicketAttachmentDTO meta = attachmentService.obtenerMetadatos(id);
        Resource resource = attachmentService.descargarAdjunto(id);

        return com.empresa.ticketmanagement.attachment.AttachmentResponses.download(meta.getNombreOriginal(), resource);
    }

    @GetMapping("/attachments/{id}/preview")
    @Operation(summary = "Previsualizar imágenes raster o PDF validados; otros formatos solo se descargan")
    public ResponseEntity<Resource> previsualizarAdjunto(@PathVariable Long id) {
        TicketAttachmentDTO meta = attachmentService.obtenerMetadatos(id);
        if (!com.empresa.ticketmanagement.attachment.AttachmentTypePolicy.canPreview(meta.getNombreOriginal(), meta.getMimeType()))
            return ResponseEntity.status(415).header("X-Content-Type-Options", "nosniff").build();
        Resource resource = attachmentService.descargarAdjunto(id);
        return com.empresa.ticketmanagement.attachment.AttachmentResponses.preview(meta.getNombreOriginal(), meta.getMimeType(), resource);
    }

    @DeleteMapping("/attachments/{id}")
    @Operation(summary = "Eliminar (desactivar) un archivo adjunto")
    public ResponseEntity<ApiResponse<Void>> eliminarAdjunto(@PathVariable Long id, Authentication authentication) {
        attachmentService.eliminarAdjunto(id, authentication.getName());
        return ResponseEntity.ok(ApiResponse.ok(null, "Archivo eliminado correctamente."));
    }
}
