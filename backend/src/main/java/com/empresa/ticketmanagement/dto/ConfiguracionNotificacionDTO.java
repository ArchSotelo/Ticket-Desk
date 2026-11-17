package com.empresa.ticketmanagement.dto;

import lombok.Data;

@Data
public class ConfiguracionNotificacionDTO {
    private Boolean enabled;
    private Boolean onTicketCreated;
    private Boolean onAssigned;
    private Boolean onStatusChanged;
    private Boolean onReply;
    private Boolean onAttachment;
    private Boolean onSla;
    private String emailSubject;
    private String emailBody;
    private String ticketCreatedSubject;
    private String ticketCreatedBody;
    private String assignedSubject;
    private String assignedBody;
    private String statusChangedSubject;
    private String statusChangedBody;
    private String replySubject;
    private String replyBody;
    private String attachmentSubject;
    private String attachmentBody;
    private String slaSubject;
    private String slaBody;
}
