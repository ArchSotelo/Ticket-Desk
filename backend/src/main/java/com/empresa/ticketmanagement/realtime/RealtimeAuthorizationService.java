package com.empresa.ticketmanagement.realtime;

import com.empresa.ticketmanagement.security.SessionUserDetails;

import com.empresa.ticketmanagement.repository.TicketRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.security.TicketAccessPolicy;
import com.empresa.ticketmanagement.security.ApplicationRoles;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.Principal;
import java.time.LocalDateTime;

/** El hilo de publicación puede ser asíncrono: no depende de SecurityContextHolder. */
@Service
@RequiredArgsConstructor
public class RealtimeAuthorizationService {
    private final UsuarioRepository users;
    private final TicketRepository tickets;

    public record Identity(Long userId, String username, boolean staff, boolean client) {}

    @Transactional(readOnly = true)
    public Identity requireIdentity(Principal principal) {
        if (!(principal instanceof Authentication auth) || !auth.isAuthenticated()
                || auth instanceof AnonymousAuthenticationToken) throw denied();
        var user = users.findByUsername(auth.getName()).orElseThrow(RealtimeAuthorizationService::denied);
        if (!"ACTIVO".equalsIgnoreCase(user.getEstado()) || user.getId() == null
                || (user.getBloqueadoHasta() != null && user.getBloqueadoHasta().isAfter(LocalDateTime.now()))) throw denied();
        long version = auth.getPrincipal() instanceof SessionUserDetails details
                ? details.sessionVersion() : 0;
        if (user.getVersionSesion() != version || Boolean.TRUE.equals(user.getRequiereCambioPassword())) throw denied();
        // Consultar roles actuales permite revocar el canal sin esperar a una reconexión.
        boolean staff = user.getRoles().stream().filter(ApplicationRoles::isActive).anyMatch(role -> TicketAccessPolicy.isStaffRole(role.getNombre()));
        boolean client = user.getRoles().stream().filter(ApplicationRoles::isActive).anyMatch(role -> "ROLE_CLIENTE".equals(role.getNombre()));
        if (!staff && !client) throw denied();
        return new Identity(user.getId(), user.getUsername(), staff, client);
    }

    @Transactional(readOnly = true)
    public void requireTicket(Identity identity, Long ticketId) {
        var ticket = tickets.findById(ticketId).orElseThrow(RealtimeAuthorizationService::denied);
        if (!identity.staff() && (!identity.client() || ticket.getCliente() == null
                || !identity.userId().equals(ticket.getCliente().getId()))) throw denied();
    }

    public void requireBoard(Identity identity) { if (!identity.staff()) throw denied(); }

    private static AccessDeniedException denied() { return new AccessDeniedException("Suscripción no autorizada."); }
}
