package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.controller.UsuarioController;
import com.empresa.ticketmanagement.dto.PasswordChangeDTO;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.service.UsuarioService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class UsuarioPasswordTest {
    private final UsuarioRepository users = mock(UsuarioRepository.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final com.empresa.ticketmanagement.security.SessionSecurityService sessions = mock(com.empresa.ticketmanagement.security.SessionSecurityService.class);
    private final UsuarioServiceImpl service = new UsuarioServiceImpl(users, mock(RolRepository.class),
            mock(EmpresaRepository.class), mock(AreaRepository.class), encoder, sessions);
    private Usuario user;
    private String oldHash;

    @BeforeEach void setup() {
        oldHash = encoder.encode("Anterior123!");
        user = Usuario.builder().username("tecnico").passwordHash(oldHash).requiereCambioPassword(true).build();
        when(sessions.lockByUsername("tecnico")).thenReturn(Optional.of(user));
    }

    @Test void checksCurrentPasswordAndStoresOnlyTheNewHash() {
        service.cambiarPassword("tecnico", "Anterior123!", "Nueva123!");
        assertThat(user.getPasswordHash()).isNotEqualTo("Nueva123!").isNotEqualTo(oldHash);
        assertThat(encoder.matches("Nueva123!", user.getPasswordHash())).isTrue();
        assertThat(encoder.matches("Anterior123!", user.getPasswordHash())).isFalse();
        assertThat(user.getRequiereCambioPassword()).isFalse();
        assertThat(user.getFechaModificacion()).isNotNull();
        verify(users).save(user);
        verify(sessions).invalidate(user);
    }

    @Test void wrongCurrentPasswordNeverModifiesTheAccount() {
        assertThatThrownBy(() -> service.cambiarPassword("tecnico", "Incorrecta123!", "Nueva123!"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("actual es incorrecta");
        assertThat(user.getPasswordHash()).isEqualTo(oldHash);
        verify(users, never()).save(any());
        verify(sessions, never()).invalidate(any());
    }

    @Test void rejectsRepeatedShortBlankAndOversizedPasswords() {
        for (String password : new String[]{"Anterior123!", "corta", "        ", "a".repeat(73), "á".repeat(40)}) {
            assertThatThrownBy(() -> service.cambiarPassword("tecnico", "Anterior123!", password))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(user.getPasswordHash()).isEqualTo(oldHash);
        verify(users, never()).save(any());
        verify(sessions, never()).invalidate(any());
    }

    @Test void controllerUsesAuthenticatedUsername() {
        UsuarioService mockService = mock(UsuarioService.class);
        PasswordChangeDTO dto = new PasswordChangeDTO();
        dto.setCurrentPassword("Anterior123!"); dto.setNewPassword("Nueva123!");
        new UsuarioController(mockService).cambiarPassword(
                new UsernamePasswordAuthenticationToken("tecnico", null), dto);
        verify(mockService).cambiarPassword("tecnico", "Anterior123!", "Nueva123!");
    }

    @Test void validatesRequestBeforeChangingThePassword() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            var dto = new PasswordChangeDTO();
            assertThat(validator.validate(dto)).isNotEmpty();
            dto.setCurrentPassword("Anterior123!"); dto.setNewPassword("corta");
            assertThat(validator.validate(dto)).isNotEmpty();
            dto.setNewPassword("Nueva123!");
            assertThat(validator.validate(dto)).isEmpty();
        }
    }
}
