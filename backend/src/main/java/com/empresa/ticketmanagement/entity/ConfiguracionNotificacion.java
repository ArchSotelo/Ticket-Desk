package com.empresa.ticketmanagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.*;

@Entity
@Table(name = "configuracion_notificaciones")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConfiguracionNotificacion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    @Builder.Default
    private Boolean enabled = true;

    @Column(name = "on_ticket_created", nullable = false)
    @Builder.Default
    private Boolean onTicketCreated = true;

    @Column(name = "on_assigned", nullable = false)
    @Builder.Default
    private Boolean onAssigned = true;

    @Column(name = "on_status_changed", nullable = false)
    @Builder.Default
    private Boolean onStatusChanged = true;

    @Column(name = "on_reply", nullable = false)
    @Builder.Default
    private Boolean onReply = true;

    @Column(name = "on_attachment", nullable = false)
    @Builder.Default
    private Boolean onAttachment = false;

    @Column(name = "on_sla", nullable = false)
    @Builder.Default
    private Boolean onSla = true;

    @Column(name = "email_subject", nullable = false, length = 255)
    @Builder.Default
    private String emailSubject = "Actualización de ticket {{ticket.codigo}} - {{ticket.titulo}}";

    @Column(name = "email_body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String emailBody = "Hola {{cliente.nombre}},\n\nEl ticket {{ticket.codigo}} ha sido actualizado.\n\n{{ticket.titulo}}\n\n{{mensaje}}";

    @Column(name = "ticket_created_subject", nullable = false, length = 255)
    @Builder.Default private String ticketCreatedSubject = "Ticket creado: {{ticket.codigo}} - {{ticket.titulo}}";
    @Column(name = "ticket_created_body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String ticketCreatedBody = "Hola {{cliente.nombre}},\n\nSe creó un nuevo ticket.\n\nCódigo: {{ticket.codigo}}\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}";
    @Column(name = "assigned_subject", nullable = false, length = 255)
    @Builder.Default private String assignedSubject = "Ticket asignado: {{ticket.codigo}}";
    @Column(name = "assigned_body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String assignedBody = "Hola,\n\nSe te asignó el ticket {{ticket.codigo}}.\n\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}";
    @Column(name = "status_changed_subject", nullable = false, length = 255)
    @Builder.Default private String statusChangedSubject = "Estado actualizado: {{ticket.codigo}}";
    @Column(name = "status_changed_body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String statusChangedBody = "Hola {{cliente.nombre}},\n\nEl estado de tu ticket cambió.\n\nCódigo: {{ticket.codigo}}\nTítulo: {{ticket.titulo}}\nEstado actual: {{mensaje}}\n\nPuedes consultar el detalle desde el sistema.";
    @Column(name = "reply_subject", nullable = false, length = 255)
    @Builder.Default private String replySubject = "Nueva respuesta: {{ticket.codigo}}";
    @Column(name = "reply_body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String replyBody = "Hola {{cliente.nombre}},\n\nSe agregó una respuesta a tu ticket.\n\nCódigo: {{ticket.codigo}}\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}";
    @Column(name = "attachment_subject", nullable = false, length = 255)
    @Builder.Default private String attachmentSubject = "Nuevo archivo adjunto: {{ticket.codigo}}";
    @Column(name = "attachment_body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String attachmentBody = "Hola {{cliente.nombre}},\n\nSe agregó un archivo al ticket {{ticket.codigo}}.\n\nTítulo: {{ticket.titulo}}\n\n{{mensaje}}";
    @Column(name = "sla_subject", nullable = false, length = 255)
    @Builder.Default private String slaSubject = "Alerta SLA: {{ticket.codigo}}";
    @Column(name = "sla_body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default private String slaBody = "Alerta de SLA.\n\nEl ticket {{ticket.codigo}} está próximo a vencer.\n\n{{mensaje}}";
}
