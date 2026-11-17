package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.security.LoginProtectionService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.AuthRequest;
import com.empresa.ticketmanagement.dto.AuthResponse;
import com.empresa.ticketmanagement.dto.RefreshTokenRequest;
import com.empresa.ticketmanagement.service.AuthService;
import com.empresa.ticketmanagement.audit.AuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Autenticación", description = "Endpoints para inicio de sesión, renovación de tokens y perfil de usuario")
public class AuthController {

    private final AuthService authService;
    private final AuditService auditService;
    private final LoginProtectionService loginProtection;

    @PostMapping("/login")
    @Operation(summary = "Iniciar sesión y obtener tokens JWT")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody AuthRequest request, HttpServletRequest httpRequest) {
        loginProtection.checkRate(httpRequest);
        try {
            AuthResponse response = authService.login(request, httpRequest);
            return ResponseEntity.ok(ApiResponse.ok(response, "Inicio de sesión exitoso."));
        } catch (AuthenticationException exception) {
            if (exception instanceof BadCredentialsException) {
                loginProtection.recordFailure(request.getUsername());
            }
            // El proxy del servicio ya terminó el rollback y liberó su conexión.
            // Confirmar este evento antes del 401, sin esperar una tarea asíncrona.
            try {
                auditService.registrarLoginFallido(request.getUsername(), httpRequest);
            } catch (RuntimeException auditFailure) {
                log.error("No se pudo registrar LOGIN_FALLIDO ({}).", auditFailure.getClass().getSimpleName());
            }
            if (exception instanceof LockedException) {
                return ResponseEntity.status(HttpStatus.LOCKED).body(ApiResponse.error(
                        "Tu cuenta ha sido bloqueada por demasiados intentos de inicio de sesión. "
                                + "Comunícate con el administrador del sistema para solicitar el desbloqueo."));
            }
            throw exception;
        }
    }

    @PostMapping("/refresh-token")
    @Operation(summary = "Renovar el Access Token mediante Refresh Token")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(@Valid @RequestBody RefreshTokenRequest request) {
        try {
            AuthResponse response = authService.refreshToken(request);
            return ResponseEntity.ok(ApiResponse.ok(response, "Token renovado exitosamente."));
        } catch (AuthenticationException exception) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("La sesión expiró. Inicie sesión nuevamente."));
        }
    }

    @PostMapping("/logout")
    @Operation(summary = "Cerrar sesión y revocar Refresh Token")
    public ResponseEntity<ApiResponse<Void>> logout(@RequestBody RefreshTokenRequest request) {
        authService.logout(request.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.ok(null, "Sesión cerrada correctamente."));
    }

    @GetMapping("/me")
    @Operation(summary = "Obtener el usuario autenticado actual")
    public ResponseEntity<ApiResponse<String>> getCurrentUser(Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.ok(authentication.getName(), "Usuario autenticado."));
    }
}
