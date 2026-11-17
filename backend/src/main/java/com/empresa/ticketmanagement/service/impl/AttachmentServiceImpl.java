package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.attachment.StorageFactory;
import com.empresa.ticketmanagement.attachment.StorageProvider;
import com.empresa.ticketmanagement.dto.TicketAttachmentDTO;
import com.empresa.ticketmanagement.entity.Ticket;
import com.empresa.ticketmanagement.entity.TicketAttachment;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.TicketAttachmentRepository;
import com.empresa.ticketmanagement.repository.TicketRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.service.AttachmentService;
import com.empresa.ticketmanagement.security.TicketAccessPolicy;
import org.springframework.security.access.AccessDeniedException;
import com.empresa.ticketmanagement.notification.NotificacionService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.DigestUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AttachmentServiceImpl implements AttachmentService {

    private final com.empresa.ticketmanagement.repository.ComentarioRepository comentarioRepository;
    private final StorageFactory storageFactory;
    private final TicketAccessPolicy accessPolicy;
    private final com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler realtimeHandler;
    private final TicketAttachmentRepository attachmentRepository;
    private final TicketRepository ticketRepository;
    private final UsuarioRepository usuarioRepository;
    private final NotificacionService notificacionService;

    @Override
    @Transactional
    public TicketAttachmentDTO subirAdjunto(Long ticketId, MultipartFile file, String comentario, String username, Long comentarioId) {
        accessPolicy.requireSelf(username);
        accessPolicy.requireAttachmentUpload();
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new BusinessException("Ticket no encontrado con ID: " + ticketId));
        accessPolicy.requireRead(ticket);
        Usuario usuario = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado: " + username));

        com.empresa.ticketmanagement.entity.Comentario mensaje = null;
        if (comentarioId != null) {
            mensaje = comentarioRepository.findById(comentarioId)
                    .orElseThrow(() -> new AccessDeniedException("Mensaje no disponible para adjuntar archivos."));
            if (!mensaje.getTicket().getId().equals(ticketId)
                    || !mensaje.getUsuario().getId().equals(usuario.getId())
                    || Boolean.TRUE.equals(mensaje.getEsInterno())) {
                throw new AccessDeniedException("Solo puedes adjuntar archivos a tus respuestas públicas de este ticket.");
            }
        }

        String validatedMime = com.empresa.ticketmanagement.attachment.AttachmentTypePolicy.validate(file);
        String nombreOriginal = file.getOriginalFilename();
        String extension = "";
        if (nombreOriginal != null && nombreOriginal.contains(".")) {
            extension = nombreOriginal.substring(nombreOriginal.lastIndexOf("."));
        }

        String nombreFisico = UUID.randomUUID().toString() + extension;
        StorageProvider provider = storageFactory.getStorageProvider();
        String rutaAlmacenamiento = provider.storeFile(file, nombreFisico);

        String sha256Hash = "";
        try (InputStream is = file.getInputStream()) {
            sha256Hash = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(is.readAllBytes()));
        } catch (Exception ignored) {}

        TicketAttachment attachment = TicketAttachment.builder()
                .ticket(ticket)
                .mensaje(mensaje)
                .nombreOriginal(nombreOriginal != null ? nombreOriginal : "adjunto")
                .nombreFisico(nombreFisico)
                .extension(extension)
                .mimeType(validatedMime)
                .tamanoBytes(file.getSize())
                .ruta(rutaAlmacenamiento)
                .proveedorAlmacenamiento(provider.getProviderName())
                .hashSha256(sha256Hash)
                .comentario(comentario)
                .usuarioCreacion(usuario)
                .fechaCreacion(LocalDateTime.now())
                .activo(true)
                .build();

        TicketAttachment saved = attachmentRepository.save(attachment);
        Usuario destinatario = usuario.getId().equals(ticket.getCliente().getId())
                ? ticket.getTecnico()
                : ticket.getCliente();
        if (destinatario != null) {
            notificacionService.notificar(
                    destinatario.getId(),
                    "Nuevo archivo en " + ticket.getCodigo(),
                    usuario.getNombreCompleto() + " adjuntó el archivo " + attachment.getNombreOriginal(),
                    "INFO",
                    "/tickets/" + ticket.getId(),
                    "ATTACHMENT",
                    ticket.getCodigo(), ticket.getTitulo(), ticket.getCliente().getNombreCompleto()
            );
        }
        realtimeHandler.publish("ticket-updated", null, ticketId, java.util.Map.of("ticketId", ticketId));
        return mapToDTO(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TicketAttachmentDTO> obtenerAdjuntosTicket(Long ticketId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new BusinessException("Ticket no encontrado"));
        accessPolicy.requireRead(ticket);
        return attachmentRepository.findByTicketIdAndActivoTrue(ticketId)
                .stream().map(this::mapToDTO).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Resource descargarAdjunto(Long attachmentId) {
        TicketAttachment attachment = authorizedAttachment(attachmentId);
        StorageProvider provider = storageFactory.getStorageProvider();
        return provider.loadFileAsResource(attachment.getRuta());
    }

    @Override
    @Transactional(readOnly = true)
    public TicketAttachmentDTO obtenerMetadatos(Long attachmentId) {
        TicketAttachment attachment = authorizedAttachment(attachmentId);
        return mapToDTO(attachment);
    }

    @Override
    @Transactional
    public void eliminarAdjunto(Long attachmentId, String username) {
        accessPolicy.requireSelf(username);
        TicketAttachment attachment = authorizedAttachment(attachmentId);
        accessPolicy.requireAttachmentDeletion(attachment);
        attachment.setActivo(false);
        attachmentRepository.save(attachment);
        Long ticketId = attachment.getTicket().getId();
        realtimeHandler.publish("ticket-updated", null, ticketId, java.util.Map.of("ticketId", ticketId));
    }

    private TicketAttachment authorizedAttachment(Long attachmentId) {
        TicketAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new com.empresa.ticketmanagement.exception.AttachmentNotFoundException());
        accessPolicy.requireRead(attachment.getTicket());
        if (!Boolean.TRUE.equals(attachment.getActivo()))
            throw new AccessDeniedException("El adjunto no está disponible.");
        return attachment;
    }

    private TicketAttachmentDTO mapToDTO(TicketAttachment attachment) {
        return TicketAttachmentDTO.builder()
                .id(attachment.getId())
                .ticketId(attachment.getTicket().getId())
                .comentarioId(attachment.getMensaje() != null ? attachment.getMensaje().getId() : null)
                .nombreOriginal(attachment.getNombreOriginal())
                .comentario(attachment.getComentario())
                .extension(attachment.getExtension())
                .mimeType(attachment.getMimeType())
                .tamanoBytes(attachment.getTamanoBytes())
                .proveedorAlmacenamiento(attachment.getProveedorAlmacenamiento())
                .usuarioCreacionNombre(attachment.getUsuarioCreacion().getNombreCompleto())
                .fechaCreacion(attachment.getFechaCreacion())
                .downloadUrl("/api/v1/attachments/" + attachment.getId() + "/download")
                .previewUrl("/api/v1/attachments/" + attachment.getId() + "/preview")
                .build();
    }
}
