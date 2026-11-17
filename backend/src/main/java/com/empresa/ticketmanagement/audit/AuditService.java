package com.empresa.ticketmanagement.audit;

import com.empresa.ticketmanagement.entity.Auditoria;
import com.empresa.ticketmanagement.repository.AuditoriaRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Servicio de auditoría centralizado.
 * La auditoría de una petición es síncrona. Los fallos de login se confirman
 * en una transacción independiente, una vez revertido el intento de autenticación.
 */
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditoriaRepository auditoriaRepository;

    public void registrar(Long usuarioId, String accion, String modulo,
                          String detalle, HttpServletRequest request) {
        String ip = obtenerIp(request);
        String userAgent = request != null ? request.getHeader("User-Agent") : "N/A";

        guardar(usuarioId, accion, modulo, detalle, ip, userAgent);
    }

    /** Se invoca desde el controlador a través del proxy, fuera de la transacción fallida. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void registrarLoginFallido(String username, HttpServletRequest request) {
        registrar(null, "LOGIN_FALLIDO", "AUTENTICACION",
                "Intento fallido para el usuario: " + limitar(username, 50), request);
    }

    private void guardar(Long usuarioId, String accion, String modulo,
                         String detalle, String ip, String userAgent) {
        Auditoria auditoria = Auditoria.builder()
                .usuarioId(usuarioId)
                .accion(accion)
                .modulo(modulo)
                .detalle(detalle)
                .ipOrigen(limitar(ip, 50))
                .userAgent(limitar(userAgent, 255))
                .fechaRegistro(LocalDateTime.now())
                .build();

        auditoriaRepository.save(auditoria);
    }

    @Async
    public void registrar(Long usuarioId, String accion, String modulo, String detalle) {
        guardar(usuarioId, accion, modulo, detalle, "SISTEMA", "N/A");
    }

    private String obtenerIp(HttpServletRequest request) {
        if (request == null) return "SISTEMA";
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            String first = xForwardedFor.split(",", 2)[0].trim();
            if (!first.isEmpty()) return first;
        }
        return request.getRemoteAddr();
    }

    private String limitar(String value, int maximum) {
        if (value == null) return "N/A";
        if (value.length() <= maximum) return value;
        int end = maximum;
        // No cortar un carácter Unicode por la mitad al limitar metadatos HTTP.
        if (Character.isHighSurrogate(value.charAt(end - 1)) && Character.isLowSurrogate(value.charAt(end))) end--;
        return value.substring(0, end);
    }
}
