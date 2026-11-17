package com.empresa.ticketmanagement.realtime;

import com.empresa.ticketmanagement.security.SessionRevokedEvent;
import com.empresa.ticketmanagement.security.SessionUserDetails;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;

import com.empresa.ticketmanagement.security.JwtUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.core.JacksonException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
@Slf4j
public class RealtimeWebSocketHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final RealtimeAuthorizationService authorization;
    private final JwtUtils jwtUtils;
    private final Clock websocketClock;
    // Estado privado del servidor: ningún mensaje modifica la identidad ni los atributos de sesión.
    private final Map<WebSocketSession, Connection> connections = new ConcurrentHashMap<>();
    private record Subscription(Long ticketId, String scope) {}
    private static final class ExpiredSession extends AccessDeniedException {
        ExpiredSession() { super("SESSION_EXPIRED"); }
    }
    private static final class RevokedSession extends AccessDeniedException {
        RevokedSession() { super("SESSION_REVOKED"); }
    }
    private static final class Connection {
        final Principal principal;
        final Long userId;
        final Instant expiresAt;
        Subscription subscription = new Subscription(null, null);
        Connection(Principal principal, Long userId, Instant expiresAt) {
            this.principal = principal; this.userId = userId; this.expiresAt = expiresAt;
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sessionRevoked(SessionRevokedEvent event) {
        connections.forEach((session, connection) -> {
            if (event.userId().equals(connection.userId)) {
                long version = connection.principal instanceof Authentication auth
                        && auth.getPrincipal() instanceof SessionUserDetails details
                        ? details.sessionVersion() : 0;
                if (version < event.validVersion()) {
                    synchronized (connection) { reject(session, new RevokedSession()); }
                }
            }
        });
    }

    @Override public void afterConnectionEstablished(WebSocketSession session) {
        try {
            Principal principal = session.getPrincipal();
            var identity = authorization.requireIdentity(principal);
            String token = token(session);
            if (token == null || !jwtUtils.validateJwtToken(token)
                    || !identity.username().equals(jwtUtils.getUserNameFromJwtToken(token))) throw denied();
            Date expiration = jwtUtils.getExpirationFromJwtToken(token);
            if (expiration == null) throw denied();
            if (!expiration.toInstant().isAfter(websocketClock.instant())) throw new ExpiredSession();
            connections.put(session, new Connection(principal, identity.userId(), expiration.toInstant()));
        } catch (Exception ex) { reject(session, ex); }
    }

    @Override public void handleTextMessage(WebSocketSession session, TextMessage message) {
        Connection connection = connections.get(session);
        if (connection == null) { reject(session); return; }
        synchronized (connection) {
            if (connections.get(session) != connection) return;
            try {
                var identity = currentIdentity(connection);
                JsonNode data = objectMapper.readTree(message.getPayload());
                if (data == null || !data.isObject() || !"subscribe".equals(data.path("type").asText())) throw denied();
                // Compatibilidad con clientes anteriores: se acepta solo si coincide, nunca se usa para enrutar.
                if (data.hasNonNull("userId") && !connection.userId.equals(positiveId(data.get("userId")))) throw denied();
                Long ticketId = data.hasNonNull("ticketId") ? positiveId(data.get("ticketId")) : null;
                String scope = null;
                if (data.hasNonNull("scope")) {
                    if (!data.get("scope").isTextual() || !"KANBAN".equals(data.get("scope").asText())) throw denied();
                    authorization.requireBoard(identity);
                    scope = "KANBAN";
                }
                if (ticketId != null) authorization.requireTicket(identity, ticketId);
                // Sustitución atómica tras validar TODO el mensaje; omitir campos cancela esos canales.
                connection.subscription = new Subscription(ticketId, scope);
            } catch (Exception ex) { reject(session, ex); }
        }
    }

    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { connections.remove(session); }
    @Override public void handleTransportError(WebSocketSession session, Throwable exception) { reject(session); }

    public void publish(String type, Long userId, Long ticketId, Object payload) {
        if (userId == null && ticketId == null) return;
        Map<String, Object> event = new HashMap<>();
        event.put("type", type); event.put("userId", userId); event.put("ticketId", ticketId); event.put("payload", payload);
        publishEvent(event, userId, ticketId, false, false);
    }

    public void publishBoard(String type, Object payload) {
        Map<String, Object> event = new HashMap<>();
        event.put("type", type); event.put("scope", "KANBAN"); event.put("payload", payload);
        publishEvent(event, null, null, true, false);
    }

    /** Las notas internas actualizan a soporte sin notificar al canal de clientes. */
    public void publishStaffTicket(String type, Long ticketId, Object payload) {
        if (ticketId == null) return;
        Map<String, Object> event = new HashMap<>();
        event.put("type", type); event.put("ticketId", ticketId); event.put("payload", payload);
        publishEvent(event, null, ticketId, false, true);
    }

    private void publishEvent(Map<String, Object> event, Long userId, Long ticketId, boolean board, boolean staffOnly) {
        final String json;
        try { json = objectMapper.writeValueAsString(event); }
        catch (JacksonException ex) { log.warn("No se pudo serializar un evento WebSocket."); return; }
        // Serializar ahora captura el evento; enviarlo solo cuando su transacción sea visible.
        Runnable delivery = () -> deliver(json, userId, ticketId, board, staffOnly);
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { delivery.run(); }
            });
        } else delivery.run();
    }

    private void deliver(String json, Long userId, Long ticketId, boolean board, boolean staffOnly) {
        connections.forEach((session, connection) -> {
            synchronized (connection) {
                if (connections.get(session) != connection) return;
                Subscription subscription = connection.subscription;
                // Un destinatario de usuario es PRIVADO aunque el evento también indique un ticket.
                boolean candidate = board ? "KANBAN".equals(subscription.scope())
                        : userId != null ? userId.equals(connection.userId)
                        : ticketId.equals(subscription.ticketId());
                if (!candidate) return;
                if (!session.isOpen()) { connections.remove(session); return; }
                try {
                    var identity = currentIdentity(connection);
                    if (staffOnly && !identity.staff()) return;
                    if (board) authorization.requireBoard(identity);
                    else if (userId == null) authorization.requireTicket(identity, ticketId);
                    // Serializar los envíos por conexión evita escrituras concurrentes al socket.
                    session.sendMessage(new TextMessage(json));
                } catch (Exception ex) { reject(session, ex); }
            }
        });
    }

    private RealtimeAuthorizationService.Identity currentIdentity(Connection connection) {
        if (!connection.expiresAt.isAfter(websocketClock.instant())) throw new ExpiredSession();
        var current = authorization.requireIdentity(connection.principal);
        if (!connection.userId.equals(current.userId())) throw denied();
        return current;
    }

    private static Long positiveId(JsonNode node) {
        if (!node.isIntegralNumber() || !node.canConvertToLong() || node.longValue() <= 0) throw denied();
        return node.longValue();
    }

    private static String token(WebSocketSession session) {
        String header = session.getHandshakeHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith("Bearer ")) return header.substring(7);
        if (session.getUri() == null) return null;
        String value = UriComponentsBuilder.fromUri(session.getUri()).build().getQueryParams().getFirst("access_token");
        return value == null ? null : UriUtils.decode(value, StandardCharsets.UTF_8);
    }

    private void reject(WebSocketSession session) { reject(session, null); }

    private void reject(WebSocketSession session, Exception cause) {
        connections.remove(session);
        CloseStatus status = cause instanceof ExpiredSession ? new CloseStatus(1008, "SESSION_EXPIRED")
                : cause instanceof RevokedSession ? new CloseStatus(1008, "SESSION_REVOKED") : CloseStatus.POLICY_VIOLATION;
        try { session.close(status); }
        catch (IOException | IllegalStateException ignored) { /* La conexión ya puede estar cerrada. */ }
        // No registrar tokens, mensajes ni datos privados del cliente.
        log.debug("Conexión WebSocket cerrada por política o transporte.");
    }

    private static AccessDeniedException denied() { return new AccessDeniedException("Suscripción no autorizada."); }
}
