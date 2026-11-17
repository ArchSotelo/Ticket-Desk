package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.entity.Ticket;
import com.empresa.ticketmanagement.entity.TicketAttachment;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Set;

/** Política común para los servicios de tickets y sus archivos, no solo para la interfaz. */
@Component
@RequiredArgsConstructor
public class TicketAccessPolicy {
    private static final Set<String> STAFF = Set.of("ROLE_ADMIN", "ROLE_SUPERVISOR", "ROLE_TECNICO");
    private final UsuarioRepository users;

    private Authentication authentication() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) deny();
        return auth;
    }

    public static boolean isStaffRole(String role) { return STAFF.contains(role); }

    public boolean hasRole(String role) {
        return authentication().getAuthorities().stream()
                .anyMatch(authority -> role.equals(authority.getAuthority()));
    }

    public boolean isStaff() {
        return authentication().getAuthorities().stream().anyMatch(a -> isStaffRole(a.getAuthority()));
    }

    /** null significa acceso de soporte a la cola completa; un cliente queda limitado por su ID. */
    public Long clientScope() {
        requirePermission("TICKET_READ");
        return roleScope();
    }

    private Long roleScope() {
        if (isStaff()) return null;
        Authentication auth = authentication();
        if (auth.getAuthorities().stream().noneMatch(a -> "ROLE_CLIENTE".equals(a.getAuthority()))) deny();
        return users.findByUsername(auth.getName()).filter(u -> "ACTIVO".equalsIgnoreCase(u.getEstado()))
                .map(u -> u.getId()).orElseThrow(() -> new AccessDeniedException("No tiene acceso a estos tickets."));
    }

    public void requireRead(Ticket ticket) {
        Long owner = clientScope();
        if (owner != null && (ticket.getCliente() == null || !owner.equals(ticket.getCliente().getId()))) deny();
    }

    public void requireClient(Long clientId) {
        Long owner = clientScope();
        if (owner != null && !owner.equals(clientId)) deny();
    }

    public void requireSelf(String username) {
        if (!authentication().getName().equals(username)) deny();
    }

    public void requireCreate() {
        requirePermission("TICKET_CREATE");
        roleScope();
    }

    public void requireUpdate() {
        requirePermission("TICKET_UPDATE");
        requireStaff();
    }

    public void requireAssignment() {
        requirePermission("TICKET_ASSIGN");
        requireStaff();
    }

    public void requireAttachmentUpload() {
        requirePermission("ATTACHMENT_UPLOAD");
        roleScope();
    }

    private void requirePermission(String permission) {
        if (authentication().getAuthorities().stream()
                .noneMatch(authority -> permission.equals(authority.getAuthority()))) deny();
    }

    public void requireStaff() { if (!isStaff()) deny(); }

    public void requireAttachmentDeletion(TicketAttachment attachment) {
        requireRead(attachment.getTicket());
        Long owner = clientScope();
        if (owner != null && (attachment.getUsuarioCreacion() == null
                || !owner.equals(attachment.getUsuarioCreacion().getId()))) deny();
    }

    private static void deny() { throw new AccessDeniedException("No tiene permisos para acceder o modificar este recurso."); }
}
