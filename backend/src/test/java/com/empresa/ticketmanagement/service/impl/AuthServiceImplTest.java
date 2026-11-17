package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.dto.*;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.security.JwtUtils;
import com.empresa.ticketmanagement.audit.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthServiceImpl — Pruebas Unitarias")
class AuthServiceImplTest {

    @Mock private AuthenticationManager authenticationManager;
    @Mock private JwtUtils jwtUtils;
    @Mock private UsuarioRepository usuarioRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private AuditService auditService;
    @Mock private com.empresa.ticketmanagement.security.SessionSecurityService sessions;
    @Mock private HttpServletRequest httpRequest;

    @InjectMocks private AuthServiceImpl authService;

    private Usuario usuarioMock;

    @BeforeEach
    void setUp() {
        org.springframework.test.util.ReflectionTestUtils.setField(authService, "refreshExpirationMs", 18000000L);
        org.springframework.test.util.ReflectionTestUtils.setField(authService, "accessExpirationMs", 18000000L);
        Rol rolAdmin = Rol.builder().id(1L).nombre("ROLE_ADMIN").build();

        Empresa empresa = Empresa.builder()
                .id(1L).razonSocial("Demo S.A.C.").build();

        usuarioMock = Usuario.builder()
                .id(1L)
                .username("admin")
                .passwordHash("$2a$10$hash")
                .nombres("Administrador")
                .apellidos("General")
                .email("admin@demo.com")
                .estado("ACTIVO")
                .empresa(empresa)
                .roles(Set.of(rolAdmin))
                .intentosFallidos(0)
                .requiereCambioPassword(false)
                .fechaCreacion(LocalDateTime.now())
                .build();
    }

    @Test
    @DisplayName("Login exitoso devuelve AuthResponse con accessToken")
    void login_exitoso_devuelve_tokens() {
        // Arrange
        AuthRequest request = new AuthRequest();
        request.setUsername("admin");
        request.setPassword("Admin123!");

        Authentication auth = mock(Authentication.class);
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenReturn(auth);
        when(jwtUtils.generateToken(eq("admin"), anyLong(), anyLong())).thenReturn("mock.jwt.token");
        when(sessions.lockByUsername("admin")).thenReturn(Optional.of(usuarioMock));
        when(refreshTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Act
        AuthResponse response = authService.login(request, httpRequest);

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.getAccessToken()).isEqualTo("mock.jwt.token");
        assertThat(response.getUsername()).isEqualTo("admin");
        assertThat(response.getEmail()).isEqualTo("admin@demo.com");
        assertThat(response.isRequiresPasswordChange()).isFalse();
        verify(usuarioRepository, times(1)).save(usuarioMock);
    }

    @Test
    @DisplayName("Refresh token inválido lanza RuntimeException")
    void refresh_token_invalido_lanza_excepcion() {
        // Arrange
        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("token-invalido");
        when(refreshTokenRepository.findUserIdByToken(anyString())).thenReturn(Optional.empty());

        // Act & Assert
        assertThatThrownBy(() -> authService.refreshToken(request))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("La sesión no es válida");
    }

    @Test
    @DisplayName("Logout revoca el refresh token correctamente")
    void logout_revoca_refresh_token() {
        // Arrange
        RefreshToken tokenMock = RefreshToken.builder()
                .id(1L).token("mi-refresh-token").revocado(false)
                .usuario(usuarioMock).fechaExpiracion(LocalDateTime.now().plusDays(7))
                .build();
        when(refreshTokenRepository.findUserIdByToken(anyString())).thenReturn(Optional.of(1L));
        when(sessions.lockById(1L)).thenReturn(Optional.of(usuarioMock));
        when(refreshTokenRepository.lockByToken(anyString())).thenReturn(Optional.of(tokenMock));

        // Act
        authService.logout("mi-refresh-token");

        // Assert
        verify(sessions).invalidate(usuarioMock);
    }
}
