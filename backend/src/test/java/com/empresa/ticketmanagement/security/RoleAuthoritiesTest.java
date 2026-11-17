package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RoleAuthoritiesTest {
    @Test void authoritiesComeFromActiveSupportedRolesAndTheirStoredPermissions() {
        var repository=mock(UsuarioRepository.class);
        var user=Usuario.builder().username("actor").passwordHash("test-only-hash").roles(Set.of(
                Rol.builder().nombre("ROLE_SUPERVISOR").permisos(Set.of(Permiso.builder().codigo("AUDIT_VIEW").build())).build(),
                Rol.builder().nombre("ROLE_ADMIN").activo(false).permisos(Set.of(Permiso.builder().codigo("USER_MANAGE").build())).build(),
                Rol.builder().nombre("ROLE_HELPDESK").permisos(Set.of(Permiso.builder().codigo("CATEGORY_MANAGE").build())).build())).build();
        when(repository.findByUsername("actor")).thenReturn(Optional.of(user));
        var details=new UserDetailsServiceCustom(repository).loadUserByUsername("actor");
        assertThat(details.isEnabled()).isTrue();
        assertThat(details.getAuthorities()).extracting(a->a.getAuthority()).containsExactlyInAnyOrder("ROLE_SUPERVISOR","AUDIT_VIEW");
    }
    @Test void retiredRolesDoNotCreateAnAuthenticatedAccountEvenIfTheyHavePermissions() {
        for(String role:Set.of("ROLE_HELPDESK","ROLE_INVITADO","ROLE_UNKNOWN")) {
            var repository=mock(UsuarioRepository.class);
            when(repository.findByUsername("old")).thenReturn(Optional.of(Usuario.builder().username("old").passwordHash("test-only-hash")
                    .roles(Set.of(Rol.builder().nombre(role).permisos(Set.of(Permiso.builder().codigo("USER_MANAGE").build())).build())).build()));
            var details=new UserDetailsServiceCustom(repository).loadUserByUsername("old");
            assertThat(details.isEnabled()).isFalse();assertThat(details.getAuthorities()).isEmpty();
        }
    }
}
