package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.audit.AuditService;
import com.empresa.ticketmanagement.dto.AuthRequest;
import com.empresa.ticketmanagement.dto.AuthResponse;
import com.empresa.ticketmanagement.dto.RefreshTokenRequest;
import com.empresa.ticketmanagement.entity.RefreshToken;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.RefreshTokenRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.security.ApplicationRoles;
import com.empresa.ticketmanagement.security.JwtUtils;
import com.empresa.ticketmanagement.security.RefreshTokenReuseException;
import com.empresa.ticketmanagement.security.SessionSecurityService;
import com.empresa.ticketmanagement.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final AuthenticationManager authenticationManager;
    private final JwtUtils jwtUtils;
    private final UsuarioRepository usuarioRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final AuditService auditService;
    private final SessionSecurityService sessionSecurity;

    @Value("${app.jwt.refresh-expiration-ms}") private long refreshExpirationMs;
    @Value("${app.jwt.expiration-ms}") private long accessExpirationMs;

    @Override
    @Transactional
    public AuthResponse login(AuthRequest request, HttpServletRequest httpRequest) {
        // Bloquear antes de comprobar la contraseña impide usar una copia anterior a un cambio concurrente.
        var account = sessionSecurity.lockByUsername(request.getUsername());
        var authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword()));
        Usuario user = account.orElseThrow(AuthServiceImpl::invalidSession);
        SecurityContextHolder.getContext().setAuthentication(authentication);
        sessionSecurity.invalidate(user); // Cada login reemplaza la única sesión de la cuenta.
        user.setFechaUltimoAcceso(LocalDateTime.now());
        user.setIntentosFallidos(0);
        user.setBloqueadoHasta(null);
        usuarioRepository.save(user);
        auditService.registrar(user.getId(), "LOGIN_EXITOSO", "AUTENTICACION", "Inicio de sesión correcto", httpRequest);
        return issue(user, LocalDateTime.now().plusNanos(refreshExpirationMs * 1_000_000));
    }

    @Override
    @Transactional(noRollbackFor = RefreshTokenReuseException.class)
    public AuthResponse refreshToken(RefreshTokenRequest request) {
        String hash = hash(request.getRefreshToken());
        Long userId = refreshTokenRepository.findUserIdByToken(hash).orElseThrow(AuthServiceImpl::invalidSession);
        // Mismo orden de bloqueo para login, renovación, logout y cambio de contraseña.
        Usuario user = sessionSecurity.lockById(userId).orElseThrow(AuthServiceImpl::invalidSession);
        RefreshToken token = refreshTokenRepository.lockByToken(hash).orElseThrow(AuthServiceImpl::invalidSession);
        if (token.getVersionSesion() != user.getVersionSesion()) throw invalidSession();
        if (!token.getFechaExpiracion().isAfter(LocalDateTime.now())) throw invalidSession();
        if (Boolean.TRUE.equals(token.getRevocado())) {
            // Conservar el token usado permite detectar su reutilización y revocar también su sucesor.
            // La excepción no revierte esta invalidación. Tokens de sesiones anteriores no revocan una nueva.
            sessionSecurity.invalidate(user);
            throw new RefreshTokenReuseException();
        }
        if (!"ACTIVO".equalsIgnoreCase(user.getEstado()) || ApplicationRoles.names(user).isEmpty()
                || (user.getBloqueadoHasta() != null && user.getBloqueadoHasta().isAfter(LocalDateTime.now())))
            throw invalidSession();
        token.setRevocado(true);
        refreshTokenRepository.save(token);
        return issue(user, token.getFechaExpiracion()); // Caducidad absoluta, sin prolongación indefinida.
    }

    private AuthResponse issue(Usuario user, LocalDateTime expiresAt) {
        byte[] random = new byte[32];
        RANDOM.nextBytes(random);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        refreshTokenRepository.save(RefreshToken.builder().usuario(user).token(hash(rawToken))
                .versionSesion(user.getVersionSesion()).fechaExpiracion(expiresAt).build());
        long lifetime = Math.min(accessExpirationMs, Duration.between(LocalDateTime.now(), expiresAt).toMillis());
        if (lifetime <= 0) throw invalidSession();
        return AuthResponse.builder()
                .accessToken(jwtUtils.generateToken(user.getUsername(), user.getVersionSesion(), lifetime))
                .refreshToken(rawToken).tokenType("Bearer").expiresInMs(lifetime)
                .userId(user.getId()).username(user.getUsername()).email(user.getEmail())
                .fullName(user.getNombreCompleto()).roles(ApplicationRoles.names(user))
                .permissions(ApplicationRoles.permissions(user))
                .requiresPasswordChange(Boolean.TRUE.equals(user.getRequiereCambioPassword())).build();
    }

    @Override
    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return;
        String hash = hash(rawToken);
        refreshTokenRepository.findUserIdByToken(hash).ifPresent(id -> {
            Usuario user = sessionSecurity.lockById(id).orElseThrow(AuthServiceImpl::invalidSession);
            refreshTokenRepository.lockByToken(hash).ifPresent(token -> {
                if (token.getVersionSesion() == user.getVersionSesion()) sessionSecurity.invalidate(user);
            });
        });
    }

    private static BadCredentialsException invalidSession() {
        return new BadCredentialsException("La sesión no es válida. Inicia sesión nuevamente.");
    }

    private static String hash(String token) {
        if (token == null || token.isBlank() || token.length() > 512) throw invalidSession();
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
