package com.empresa.ticketmanagement.audit;

import com.empresa.ticketmanagement.repository.UsuarioRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Registra automaticamente las operaciones que modifican informacion mediante la API.
 */
@Aspect
@Component
@RequiredArgsConstructor
@Slf4j
public class AuditAspect {

    private final AuditService auditService;
    private final UsuarioRepository usuarioRepository;

    @Around("execution(public * com.empresa.ticketmanagement.controller..*(..))")
    public Object auditarOperacion(ProceedingJoinPoint joinPoint) throws Throwable {
        HttpServletRequest request = obtenerRequest();
        String method = request != null ? request.getMethod() : "SISTEMA";

        if ("GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method) || "OPTIONS".equalsIgnoreCase(method)) {
            return joinPoint.proceed();
        }

        String modulo = joinPoint.getTarget().getClass().getSimpleName().replace("Controller", "");
        String endpoint = request != null ? request.getRequestURI() : joinPoint.getSignature().getName();
        Long usuarioId = obtenerUsuarioIdSeguro();

        Object result;
        try {
            result = joinPoint.proceed();
        } catch (Throwable error) {
            String detalle = method + " " + endpoint + " fallo: " +
                    (error.getMessage() != null ? limitar(error.getMessage(), 500) : error.getClass().getSimpleName());
            registrarSeguro(usuarioId, method + "_ERROR", modulo, detalle, request);
            throw error;
        }
        registrarSeguro(usuarioId, method, modulo, method + " " + endpoint + " ejecutado correctamente", request);
        return result;
    }

    private void registrarSeguro(Long usuarioId, String accion, String modulo, String detalle, HttpServletRequest request) {
        try {
            auditService.registrar(usuarioId, accion, modulo, detalle, request);
        } catch (RuntimeException auditFailure) {
            // La indisponibilidad de auditoría no debe sustituir el resultado real de la operación.
            log.error("No se pudo guardar un evento de auditoría ({}).", auditFailure.getClass().getSimpleName());
        }
    }

    private Long obtenerUsuarioIdSeguro() {
        try {
            return obtenerUsuarioId();
        } catch (RuntimeException lookupFailure) {
            log.warn("No se pudo obtener la identidad para auditoría ({}).", lookupFailure.getClass().getSimpleName());
            return null;
        }
    }

    private HttpServletRequest obtenerRequest() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        return attributes != null ? attributes.getRequest() : null;
    }

    private Long obtenerUsuarioId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getName())) {
            return null;
        }
        return usuarioRepository.findByUsername(authentication.getName()).map(usuario -> usuario.getId()).orElse(null);
    }

    private String limitar(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
