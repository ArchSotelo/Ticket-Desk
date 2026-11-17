package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.controller.NotificacionController;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = NotificacionController.class, properties = "spring.jackson.time-zone=America/Lima")
@Import(SecurityConfig.class)
class NotificationSecurityTest {

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtUtils jwtUtils;
    @MockitoBean private UserDetailsServiceCustom userDetailsService;
    @MockitoBean private NotificacionService notificacionService;
    @MockitoBean private UsuarioRepository usuarioRepository;

    @Test
    void unaSolicitudSinTokenDevuelve401ConMensaje() throws Exception {
        mvc.perform(get("/notifications/unread"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").isNotEmpty());
        verifyNoInteractions(notificacionService);
    }

    @Test
    void unTokenExpiradoDevuelve401EnLugarDe403() throws Exception {
        when(jwtUtils.validateJwtToken("expired")).thenReturn(false);
        mvc.perform(get("/notifications/unread").header(HttpHeaders.AUTHORIZATION, "Bearer expired"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(notificacionService);
    }

    @Test
    void unClienteAutenticadoPuedeConsultarSusNotificaciones() throws Exception {
        autenticar("ROLE_CLIENTE");
        when(usuarioRepository.findByUsername("cliente"))
                .thenReturn(Optional.of(Usuario.builder().id(7L).username("cliente").build()));
        when(notificacionService.obtenerNoLeidasDto(7L)).thenReturn(List.of());
        mvc.perform(get("/notifications/unread").header(HttpHeaders.AUTHORIZATION, "Bearer valid"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray());
        verify(notificacionService).obtenerNoLeidasDto(7L);
    }

    @Test
    void laConfiguracionSigueDevolviendo403SinPermiso() throws Exception {
        autenticar("ROLE_CLIENTE");
        mvc.perform(get("/notifications/settings").header(HttpHeaders.AUTHORIZATION, "Bearer valid"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(notificacionService);
    }

    @Test
    void elPermisoServiceConfigManagePermiteConsultarLaConfiguracion() throws Exception {
        autenticar("ROLE_ADMIN", "SERVICE_CONFIG_MANAGE");
        mvc.perform(get("/notifications/settings").header(HttpHeaders.AUTHORIZATION, "Bearer valid"))
                .andExpect(status().isOk());
        verify(notificacionService).obtenerConfiguracion();
    }

    @Test
    void unUsuarioDeshabilitadoNoSeAutenticaConUnTokenValido() throws Exception {
        when(jwtUtils.validateJwtToken("valid")).thenReturn(true);
        when(jwtUtils.getUserNameFromJwtToken("valid")).thenReturn("cliente");
        when(userDetailsService.loadUserByUsername("cliente"))
                .thenReturn(User.withUsername("cliente").password("unused")
                        .authorities("ROLE_CLIENTE").disabled(true).build());
        mvc.perform(get("/notifications/unread").header(HttpHeaders.AUTHORIZATION, "Bearer valid"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(notificacionService);
    }

    @Test
    void elPreflightPermiteLaCabeceraDeIdempotencia() throws Exception {
        mvc.perform(options("/tickets")
                        .header(HttpHeaders.ORIGIN, "http://localhost:4200")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization,Content-Type,Idempotency-Key"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:4200"));
    }

    private void autenticar(String... authorities) {
        when(jwtUtils.validateJwtToken("valid")).thenReturn(true);
        when(jwtUtils.getUserNameFromJwtToken("valid")).thenReturn("cliente");
        when(userDetailsService.loadUserByUsername("cliente"))
                .thenReturn(User.withUsername("cliente").password("unused").authorities(authorities).build());
    }
}
