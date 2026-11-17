package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.dto.TicketCreateDTO;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.Optional;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TicketSubcategoryValidationTest {
    @Mock TicketRepository ticketRepository;
    @Mock UsuarioRepository usuarioRepository;
    @Mock CategoriaRepository categoriaRepository;
    @Mock SubcategoriaRepository subcategoriaRepository;
    @Mock PrioridadRepository prioridadRepository;
    @Mock SlaRepository slaRepository;
    @Mock EstadoRepository estadoRepository;
    @Mock TicketAttachmentRepository attachmentRepository;
    @Mock ComentarioRepository comentarioRepository;
    @Mock HistorialRepository historialRepository;
    @Mock NotificacionService notificacionService;
    @Mock RealtimeWebSocketHandler realtimeHandler;
    @Mock private com.empresa.ticketmanagement.security.TicketAccessPolicy accessPolicy;

    @InjectMocks TicketServiceImpl service;

    private TicketCreateDTO validDTO() {
        TicketCreateDTO dto = new TicketCreateDTO();
        dto.setTitulo("Problema de correo");
        dto.setDescripcion("No puedo acceder a mi correo");
        dto.setEmpresaId(1L);
        dto.setCategoriaId(2L);
        dto.setSubcategoriaId(3L);
        dto.setPrioridadId(1L);
        return dto;
    }

    private Categoria prepareCategory() {
        Categoria categoria = Categoria.builder().id(2L).nombre("Software").build();
        when(usuarioRepository.findByUsername("cliente"))
                .thenReturn(Optional.of(Usuario.builder().id(1L).empresa(Empresa.builder().id(1L).build()).roles(Set.of()).build()));
        when(categoriaRepository.findById(2L)).thenReturn(Optional.of(categoria));
        return categoria;
    }

    @Test void requestValidationRequiresSubcategory() {
        TicketCreateDTO dto = validDTO();
        dto.setSubcategoriaId(null);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var violations = factory.getValidator().validate(dto);
            assertThat(violations).hasSize(1);
            assertThat(violations.iterator().next().getMessage()).isEqualTo("La subcategoría es obligatoria");
            dto.setSubcategoriaId(3L);
            assertThat(factory.getValidator().validate(dto)).isEmpty();
        }
    }

    @Test void serviceRejectsMissingSubcategoryWithoutSaving() {
        TicketCreateDTO dto = validDTO();
        dto.setSubcategoriaId(null);
        assertThatThrownBy(() -> service.crearTicket(dto, "cliente", "test-key"))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("La subcategoría es obligatoria");
        verify(ticketRepository, never()).save(any());
    }

    @Test void serviceRejectsUnknownSubcategoryInsteadOfSavingNull() {
        prepareCategory();
        assertThatThrownBy(() -> service.crearTicket(validDTO(), "cliente", "test-key"))
                .hasMessage("Subcategoría no encontrada");
        verify(ticketRepository, never()).save(any());
    }

    @Test void serviceRejectsSubcategoryFromAnotherCategory() {
        prepareCategory();
        when(subcategoriaRepository.findById(3L)).thenReturn(Optional.of(Subcategoria.builder()
                .id(3L).categoria(Categoria.builder().id(99L).build()).build()));
        assertThatThrownBy(() -> service.crearTicket(validDTO(), "cliente", "test-key"))
                .hasMessage("La subcategoría no pertenece a la categoría seleccionada");
        verify(ticketRepository, never()).save(any());
    }

    @Test void serviceRejectsInactiveSubcategory() {
        Categoria categoria = prepareCategory();
        when(subcategoriaRepository.findById(3L)).thenReturn(Optional.of(Subcategoria.builder()
                .id(3L).categoria(categoria).activa(false).build()));
        assertThatThrownBy(() -> service.crearTicket(validDTO(), "cliente", "test-key"))
                .hasMessage("La subcategoría seleccionada no está activa");
        verify(ticketRepository, never()).save(any());
    }
}
