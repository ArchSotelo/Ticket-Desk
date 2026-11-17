package com.empresa.ticketmanagement.notification;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.entity.Notificacion;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.dto.NotificacionDTO;
import com.empresa.ticketmanagement.repository.NotificacionRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.repository.ConfiguracionNotificacionRepository;
import com.empresa.ticketmanagement.entity.ConfiguracionNotificacion;
import com.empresa.ticketmanagement.dto.ConfiguracionNotificacionDTO;
import com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Servicio de notificaciones: genera notificaciones internas
 * y envía correos de forma asíncrona.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NotificacionService {

    private final NotificacionRepository notificacionRepository;
    private final UsuarioRepository usuarioRepository;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final RealtimeWebSocketHandler realtimeHandler;
    private final ConfiguracionNotificacionRepository configuracionRepository;
    @Value("${app.mail.enabled:false}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${spring.mail.host:}")
    private String mailHost;

    public boolean isMailEnabled() {
        return mailEnabled;
    }

    public boolean isMailConfigured() {
        return mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
    }

    /**
     * Crea una notificación interna para un usuario.
     */
    @Async
    public void notificar(Long usuarioId, String titulo, String mensaje,
                          String tipo, String urlDestino) {
        notificar(usuarioId, titulo, mensaje, tipo, urlDestino, null);
    }

    @Async
    public void notificar(Long usuarioId, String titulo, String mensaje,
                          String tipo, String urlDestino, String evento) {
        notificar(usuarioId, titulo, mensaje, tipo, urlDestino, evento, null, null, null);
    }

    @Async
    public void notificar(Long usuarioId, String titulo, String mensaje,
                          String tipo, String urlDestino, String evento,
                          String codigoTicket, String tituloTicket, String nombreCliente) {
        usuarioRepository.findById(usuarioId).ifPresent(usuario -> {
            Notificacion n = Notificacion.builder()
                    .usuario(usuario)
                    .titulo(titulo)
                    .mensaje(mensaje)
                    .tipo(tipo)
                    .urlDestino(urlDestino)
                    .fechaCreacion(LocalDateTime.now())
                    .build();
            Notificacion saved = notificacionRepository.save(n);
            realtimeHandler.publish("notification", usuarioId, null, mapToDTO(saved));
            if (eventoPermitido(evento)) {
                enviarEmailConPlantilla(usuario.getEmail(), titulo, mensaje,
                        codigoTicket, tituloTicket, nombreCliente, evento);
            }
        });
    }

    public ConfiguracionNotificacionDTO obtenerConfiguracion() {
        return toDto(obtenerConfiguracionEntidad());
    }

    @Transactional
    public ConfiguracionNotificacionDTO actualizarConfiguracion(ConfiguracionNotificacionDTO dto) {
        ConfiguracionNotificacion config = obtenerConfiguracionEntidad();
        config.setEnabled(Boolean.TRUE.equals(dto.getEnabled()));
        config.setOnTicketCreated(Boolean.TRUE.equals(dto.getOnTicketCreated()));
        config.setOnAssigned(Boolean.TRUE.equals(dto.getOnAssigned()));
        config.setOnStatusChanged(Boolean.TRUE.equals(dto.getOnStatusChanged()));
        config.setOnReply(Boolean.TRUE.equals(dto.getOnReply()));
        config.setOnAttachment(Boolean.TRUE.equals(dto.getOnAttachment()));
        config.setOnSla(Boolean.TRUE.equals(dto.getOnSla()));
        if (dto.getEmailSubject() != null && !dto.getEmailSubject().isBlank()) {
            config.setEmailSubject(dto.getEmailSubject());
        }
        if (dto.getEmailBody() != null && !dto.getEmailBody().isBlank()) {
            config.setEmailBody(dto.getEmailBody());
        }
        actualizarPlantillas(config, dto);
        return toDto(configuracionRepository.save(config));
    }

    private void actualizarPlantillas(ConfiguracionNotificacion config, ConfiguracionNotificacionDTO dto) {
        if (dto.getTicketCreatedSubject() != null && !dto.getTicketCreatedSubject().isBlank()) config.setTicketCreatedSubject(dto.getTicketCreatedSubject());
        if (dto.getTicketCreatedBody() != null && !dto.getTicketCreatedBody().isBlank()) config.setTicketCreatedBody(dto.getTicketCreatedBody());
        if (dto.getAssignedSubject() != null && !dto.getAssignedSubject().isBlank()) config.setAssignedSubject(dto.getAssignedSubject());
        if (dto.getAssignedBody() != null && !dto.getAssignedBody().isBlank()) config.setAssignedBody(dto.getAssignedBody());
        if (dto.getStatusChangedSubject() != null && !dto.getStatusChangedSubject().isBlank()) config.setStatusChangedSubject(dto.getStatusChangedSubject());
        if (dto.getStatusChangedBody() != null && !dto.getStatusChangedBody().isBlank()) config.setStatusChangedBody(dto.getStatusChangedBody());
        if (dto.getReplySubject() != null && !dto.getReplySubject().isBlank()) config.setReplySubject(dto.getReplySubject());
        if (dto.getReplyBody() != null && !dto.getReplyBody().isBlank()) config.setReplyBody(dto.getReplyBody());
        if (dto.getAttachmentSubject() != null && !dto.getAttachmentSubject().isBlank()) config.setAttachmentSubject(dto.getAttachmentSubject());
        if (dto.getAttachmentBody() != null && !dto.getAttachmentBody().isBlank()) config.setAttachmentBody(dto.getAttachmentBody());
        if (dto.getSlaSubject() != null && !dto.getSlaSubject().isBlank()) config.setSlaSubject(dto.getSlaSubject());
        if (dto.getSlaBody() != null && !dto.getSlaBody().isBlank()) config.setSlaBody(dto.getSlaBody());
    }

    private boolean eventoPermitido(String evento) {
        if (evento == null || !mailEnabled) return false;
        ConfiguracionNotificacion config = obtenerConfiguracionEntidad();
        if (!Boolean.TRUE.equals(config.getEnabled())) return false;
        return switch (evento) {
            case "TICKET_CREATED" -> Boolean.TRUE.equals(config.getOnTicketCreated());
            case "ASSIGNED" -> Boolean.TRUE.equals(config.getOnAssigned());
            case "STATUS_CHANGED" -> Boolean.TRUE.equals(config.getOnStatusChanged());
            case "REPLY" -> Boolean.TRUE.equals(config.getOnReply());
            case "ATTACHMENT" -> Boolean.TRUE.equals(config.getOnAttachment());
            case "SLA" -> Boolean.TRUE.equals(config.getOnSla());
            default -> false;
        };
    }

    private ConfiguracionNotificacion obtenerConfiguracionEntidad() {
        return configuracionRepository.findFirstByOrderByIdAsc()
                .orElseGet(() -> configuracionRepository.save(ConfiguracionNotificacion.builder().build()));
    }

    private ConfiguracionNotificacionDTO toDto(ConfiguracionNotificacion entity) {
        ConfiguracionNotificacionDTO dto = new ConfiguracionNotificacionDTO();
        dto.setEnabled(entity.getEnabled());
        dto.setOnTicketCreated(entity.getOnTicketCreated());
        dto.setOnAssigned(entity.getOnAssigned());
        dto.setOnStatusChanged(entity.getOnStatusChanged());
        dto.setOnReply(entity.getOnReply());
        dto.setOnAttachment(entity.getOnAttachment());
        dto.setOnSla(entity.getOnSla());
        dto.setEmailSubject(entity.getEmailSubject());
        dto.setEmailBody(entity.getEmailBody());
        dto.setTicketCreatedSubject(entity.getTicketCreatedSubject()); dto.setTicketCreatedBody(entity.getTicketCreatedBody());
        dto.setAssignedSubject(entity.getAssignedSubject()); dto.setAssignedBody(entity.getAssignedBody());
        dto.setStatusChangedSubject(entity.getStatusChangedSubject()); dto.setStatusChangedBody(entity.getStatusChangedBody());
        dto.setReplySubject(entity.getReplySubject()); dto.setReplyBody(entity.getReplyBody());
        dto.setAttachmentSubject(entity.getAttachmentSubject()); dto.setAttachmentBody(entity.getAttachmentBody());
        dto.setSlaSubject(entity.getSlaSubject()); dto.setSlaBody(entity.getSlaBody());
        return dto;
    }

    private void enviarEmailConPlantilla(String destinatario, String asuntoFallback,
                                         String mensaje, String codigoTicket,
                                         String tituloTicket, String nombreCliente, String evento) {
        ConfiguracionNotificacion config = obtenerConfiguracionEntidad();
        Map<String, String> variables = Map.of(
                "{{ticket.codigo}}", valor(codigoTicket, "N/D"),
                "{{ticket.titulo}}", valor(tituloTicket, asuntoFallback),
                "{{cliente.nombre}}", valor(nombreCliente, "usuario"),
                "{{mensaje}}", valor(mensaje, "")
        );
        String asunto = reemplazar(valor(plantillaAsunto(config, evento), config.getEmailSubject()), variables);
        String cuerpo = reemplazar(valor(plantillaCuerpo(config, evento), config.getEmailBody()), variables);
        enviarEmail(destinatario, asunto, cuerpo);
    }

    private String plantillaAsunto(ConfiguracionNotificacion config, String evento) {
        return switch (evento) {
            case "TICKET_CREATED" -> config.getTicketCreatedSubject();
            case "ASSIGNED" -> config.getAssignedSubject();
            case "STATUS_CHANGED" -> config.getStatusChangedSubject();
            case "REPLY" -> config.getReplySubject();
            case "ATTACHMENT" -> config.getAttachmentSubject();
            case "SLA" -> config.getSlaSubject();
            default -> config.getEmailSubject();
        };
    }

    private String plantillaCuerpo(ConfiguracionNotificacion config, String evento) {
        return switch (evento) {
            case "TICKET_CREATED" -> config.getTicketCreatedBody();
            case "ASSIGNED" -> config.getAssignedBody();
            case "STATUS_CHANGED" -> config.getStatusChangedBody();
            case "REPLY" -> config.getReplyBody();
            case "ATTACHMENT" -> config.getAttachmentBody();
            case "SLA" -> config.getSlaBody();
            default -> config.getEmailBody();
        };
    }

    private String reemplazar(String plantilla, Map<String, String> variables) {
        String resultado = plantilla == null ? "" : plantilla;
        for (Map.Entry<String, String> variable : variables.entrySet()) {
            resultado = resultado.replace(variable.getKey(), variable.getValue());
        }
        return resultado;
    }

    private String valor(String valor, String porDefecto) {
        return valor == null || valor.isBlank() ? porDefecto : valor;
    }

    /**
     * Envía un correo electrónico simple de forma asíncrona.
     */
    @Async
    public void enviarEmail(String destinatario, String asunto, String cuerpo) {
        if (!mailEnabled) {
            log.info("Envío de correo deshabilitado. No se envía email a {}", destinatario);
            return;
        }

        try {
            enviarMensajeSmtp(destinatario, asunto, cuerpo);
            log.info("📧 Correo enviado a: {}", destinatario);
        } catch (Exception e) {
            log.error("Error al enviar correo a {}: {}", destinatario, e.getMessage());
        }
    }

    public void probarEmail() {
        if (!mailEnabled) {
            throw new IllegalStateException("El envío de correo está deshabilitado. Configure APP_MAIL_ENABLED=true.");
        }
        if (!isMailConfigured()) {
            throw new IllegalStateException("El SMTP no está configurado en el servidor.");
        }

        try {
            enviarMensajeSmtp(mailUsername,
                    "Prueba de configuración SMTP",
                    "Este es un correo de prueba de ServiceDesk Pro.\n\nLa configuración SMTP funciona correctamente.");
        } catch (Exception exception) {
            log.error("Error en la prueba SMTP: {}", exception.getMessage());
            throw new IllegalStateException("No se pudo enviar el correo. Verifique el host, puerto, usuario, contraseña y seguridad SMTP.", exception);
        }
    }

    private void enviarMensajeSmtp(String destinatario, String asunto, String cuerpo) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            throw new IllegalStateException("No hay un JavaMailSender disponible.");
        }

        SimpleMailMessage message = new SimpleMailMessage();
        if (mailUsername != null && !mailUsername.isBlank()) {
            message.setFrom(mailUsername);
        }
        message.setTo(destinatario);
        message.setSubject("[ServiceDesk Pro] " + asunto);
        message.setText(cuerpo);
        mailSender.send(message);
    }

    /**
     * Notifica al técnico asignado sobre un nuevo ticket.
     */
    @Async
    public void notificarAsignacion(Long tecnicoId, String codigoTicket, String titulo) {
        notificar(tecnicoId,
                "Nuevo ticket asignado: " + codigoTicket,
                "Se te ha asignado el ticket: " + titulo,
                "INFO",
                "/tickets/list", "ASSIGNED", codigoTicket, titulo, null);
    }

    /**
     * Alerta sobre incumplimiento de SLA inminente.
     */
    @Async
    public void alertarSlaProximo(Long tecnicoId, String codigoTicket, int minutosRestantes) {
        notificar(tecnicoId,
                "⚠️ SLA próximo a vencer: " + codigoTicket,
                "El ticket " + codigoTicket + " vence en " + minutosRestantes + " minutos.",
                "ALERTA",
                "/tickets/list", "SLA");
    }

    /**
     * Obtiene las notificaciones no leídas de un usuario.
     */
    public List<Notificacion> obtenerNoLeidas(Long usuarioId) {
        return notificacionRepository.findByUsuarioIdAndLeidoFalse(usuarioId);
    }

    public List<NotificacionDTO> obtenerNoLeidasDto(Long usuarioId) {
        return notificacionRepository.findByUsuarioIdAndLeidoFalse(usuarioId)
                .stream().map(this::mapToDTO).toList();
    }

    /**
     * Obtiene el conteo de no leídas.
     */
    public long contarNoLeidas(Long usuarioId) {
        return notificacionRepository.countByUsuarioIdAndLeidoFalse(usuarioId);
    }

    /**
     * Marca todas las notificaciones de un usuario como leídas.
     */
    public void marcarTodasLeidas(Long usuarioId) {
        List<Notificacion> noLeidas = notificacionRepository.findByUsuarioIdAndLeidoFalse(usuarioId);
        noLeidas.forEach(n -> n.setLeido(true));
        notificacionRepository.saveAll(noLeidas);
    }

    public void marcarLeida(Long usuarioId, Long notificacionId) {
        Notificacion n = notificacionRepository.findById(notificacionId)
                .orElseThrow(() -> new BusinessException("Notificación no encontrada"));
        if (!n.getUsuario().getId().equals(usuarioId)) {
            throw new org.springframework.security.access.AccessDeniedException("No tienes permiso para modificar esta notificación");
        }
        n.setLeido(true);
        notificacionRepository.save(n);
    }

    private NotificacionDTO mapToDTO(Notificacion n) {
        return NotificacionDTO.builder()
                .id(n.getId())
                .titulo(n.getTitulo())
                .mensaje(n.getMensaje())
                .leido(n.getLeido())
                .tipo(n.getTipo())
                .urlDestino(n.getUrlDestino())
                .fechaCreacion(n.getFechaCreacion())
                .build();
    }
}
