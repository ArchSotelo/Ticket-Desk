package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.dto.TicketAttachmentDTO;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface AttachmentService {
    default TicketAttachmentDTO subirAdjunto(Long ticketId, MultipartFile file, String comentario, String username) {
        return subirAdjunto(ticketId, file, comentario, username, null);
    }
    TicketAttachmentDTO subirAdjunto(Long ticketId, MultipartFile file, String comentario, String username, Long comentarioId);
    List<TicketAttachmentDTO> obtenerAdjuntosTicket(Long ticketId);
    Resource descargarAdjunto(Long attachmentId);
    TicketAttachmentDTO obtenerMetadatos(Long attachmentId);
    void eliminarAdjunto(Long attachmentId, String username);
}
