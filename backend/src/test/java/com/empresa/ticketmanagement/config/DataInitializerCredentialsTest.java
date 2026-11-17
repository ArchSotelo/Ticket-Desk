package com.empresa.ticketmanagement.config;

import com.empresa.ticketmanagement.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DataInitializerCredentialsTest {
    @Mock RolRepository roles;
    @Mock PermisoRepository permissions;
    @Mock EmpresaRepository companies;
    @Mock AreaRepository areas;
    @Mock UsuarioRepository users;
    @Mock PrioridadRepository priorities;
    @Mock EstadoRepository states;
    @Mock CategoriaRepository categories;
    @Mock SubcategoriaRepository subcategories;
    @Mock SlaRepository slas;
    @Mock PasswordEncoder encoder;
    @InjectMocks DataInitializer initializer;

    @Test void missingPrivatePasswordsFailBeforeWritingAnyData() {
        assertThatThrownBy(() -> initializer.run()).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("APP_SEED_ADMIN_PASSWORD");
        verify(roles).count();
        verifyNoMoreInteractions(roles);
        verifyNoInteractions(permissions, companies, areas, users, priorities, states, categories, subcategories, slas, encoder);
    }

    @Test void existingDatabaseDoesNotRequireOrResetInitialPasswords() throws Exception {
        when(roles.count()).thenReturn(1L);
        initializer.run();
        verifyNoInteractions(users, encoder, permissions, companies, areas, priorities, states, categories, subcategories, slas);
    }

    @Test void oversizedUtf8PasswordFailsBeforeWritingAnyData() {
        ReflectionTestUtils.setField(initializer, "adminPassword", "á".repeat(40));
        ReflectionTestUtils.setField(initializer, "technicianPassword", "test-only-technician");
        ReflectionTestUtils.setField(initializer, "clientPassword", "test-only-client");
        assertThatThrownBy(() -> initializer.run()).isInstanceOf(IllegalStateException.class);
        verify(roles).count();
        verifyNoMoreInteractions(roles);
        verifyNoInteractions(users, encoder, permissions, companies, areas, priorities, states, categories, subcategories, slas);
    }
}
