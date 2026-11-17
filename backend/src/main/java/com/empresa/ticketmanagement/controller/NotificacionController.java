package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.NotificacionDTO;
import com.empresa.ticketmanagement.dto.ConfiguracionNotificacionDTO;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
@Tag(name = "Notificaciones", description = "Centro de notificaciones internas del sistema")
public class NotificacionController {

    private final NotificacionService notificacionService;
    private final UsuarioRepository usuarioRepository;

    @GetMapping("/unread")
    @Operation(summary = "Obtener notificaciones no leídas del usuario autenticado")
    public ResponseEntity<ApiResponse<List<NotificacionDTO>>> noLeidas(Authentication auth) {
        Long userId = getUsuarioId(auth);
        return ResponseEntity.ok(ApiResponse.ok(notificacionService.obtenerNoLeidasDto(userId)));
    }

    @GetMapping("/unread/count")
    @Operation(summary = "Cantidad de notificaciones no leídas")
    public ResponseEntity<ApiResponse<Map<String, Long>>> contarNoLeidas(Authentication auth) {
        Long userId = getUsuarioId(auth);
        long count = notificacionService.contarNoLeidas(userId);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("count", count)));
    }

    @PostMapping("/mark-all-read")
    @Operation(summary = "Marcar todas las notificaciones como leídas")
    public ResponseEntity<ApiResponse<Void>> marcarTodasLeidas(Authentication auth) {
        Long userId = getUsuarioId(auth);
        notificacionService.marcarTodasLeidas(userId);
        return ResponseEntity.ok(ApiResponse.ok(null, "Notificaciones marcadas como leídas."));
    }

    @PostMapping("/{id}/read")
    @Operation(summary = "Marcar una notificación como leída")
    public ResponseEntity<ApiResponse<Void>> marcarLeida(
            @PathVariable Long id,
            Authentication auth) {
        Long userId = getUsuarioId(auth);
        notificacionService.marcarLeida(userId, id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Notificación marcada como leída."));
    }

    @PostMapping("/email/test")
    @PreAuthorize("hasAuthority('SERVICE_CONFIG_MANAGE')")
    @Operation(summary = "Enviar un correo de prueba SMTP")
    public ResponseEntity<ApiResponse<Void>> probarEmail() {
        notificacionService.probarEmail();
        return ResponseEntity.ok(ApiResponse.ok(null, "Correo de prueba enviado correctamente."));
    }

    @GetMapping("/email/status")
    @PreAuthorize("hasAuthority('SERVICE_CONFIG_MANAGE')")
    @Operation(summary = "Consultar el estado de la configuración SMTP")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> estadoEmail() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "enabled", notificacionService.isMailEnabled(),
                "configured", notificacionService.isMailConfigured()
        )));
    }

    @GetMapping("/settings")
    @PreAuthorize("hasAuthority('SERVICE_CONFIG_MANAGE')")
    @Operation(summary = "Obtener configuración global de notificaciones")
    public ResponseEntity<ApiResponse<ConfiguracionNotificacionDTO>> obtenerConfiguracion() {
        return ResponseEntity.ok(ApiResponse.ok(notificacionService.obtenerConfiguracion()));
    }

    @PutMapping("/settings")
    @PreAuthorize("hasAuthority('SERVICE_CONFIG_MANAGE')")
    @Operation(summary = "Actualizar configuración global de notificaciones")
    public ResponseEntity<ApiResponse<ConfiguracionNotificacionDTO>> actualizarConfiguracion(
            @RequestBody ConfiguracionNotificacionDTO request) {
        return ResponseEntity.ok(ApiResponse.ok(
                notificacionService.actualizarConfiguracion(request),
                "Preferencias globales guardadas correctamente."));
    }

    private Long getUsuarioId(Authentication auth) {
        return usuarioRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new BusinessException("Usuario no encontrado"))
                .getId();
    }
}
