package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.dto.TicketCreateDTO;
import com.empresa.ticketmanagement.dto.TicketResponseDTO;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TicketServiceImpl — Pruebas Unitarias")
class TicketServiceImplTest {

    @Mock private TicketRepository ticketRepository;
    @Mock private UsuarioRepository usuarioRepository;
    @Mock private CategoriaRepository categoriaRepository;
    @Mock private SubcategoriaRepository subcategoriaRepository;
    @Mock private PrioridadRepository prioridadRepository;
    @Mock private SlaRepository slaRepository;
    @Mock private EstadoRepository estadoRepository;
    @Mock private TicketAttachmentRepository attachmentRepository;
    @Mock private ComentarioRepository comentarioRepository;
    @Mock private HistorialRepository historialRepository;
    @Mock private com.empresa.ticketmanagement.notification.NotificacionService notificacionService;
    @Mock private com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler realtimeHandler;

    @Mock private com.empresa.ticketmanagement.security.TicketAccessPolicy accessPolicy;

    @InjectMocks private TicketServiceImpl ticketService;

    private Usuario cliente;
    private Empresa empresa;
    private Categoria categoria;
    private Prioridad prioridad;
    private Estado estadoInicial;

    @BeforeEach
    void setUp() {
        empresa = Empresa.builder().id(1L).razonSocial("Demo S.A.C.").build();
        cliente = Usuario.builder().id(2L).username("cliente1")
                .nombres("Ana").apellidos("Torres")
                .email("ana@demo.com").empresa(empresa).estado("ACTIVO")
                .roles(Set.of()).fechaCreacion(LocalDateTime.now()).build();
        categoria = Categoria.builder().id(1L).nombre("Hardware").build();
        prioridad = Prioridad.builder().id(2L).nombre("Media").nivel(2)
                .colorHex("#FFC107").tiempoRespuestaHrs(12).tiempoResolucionHrs(48).build();
        estadoInicial = Estado.builder().id(1L).nombre("Nuevo").codigo("NUEVO")
                .colorHex("#17A2B8").esInicial(true).esFinal(false).orden(1).build();
    }

    @Test
    @DisplayName("Crear ticket válido devuelve TicketResponseDTO con código generado")
    void crear_ticket_valido_devuelve_dto() {
        // Arrange
        TicketCreateDTO dto = new TicketCreateDTO();
        dto.setTitulo("Falla en laptop");
        dto.setDescripcion("La pantalla parpadea constantemente");
        dto.setEmpresaId(1L);
        dto.setCategoriaId(1L);
        dto.setSubcategoriaId(1L);
        dto.setPrioridadId(2L);

        Ticket ticketGuardado = Ticket.builder()
                .id(1L).codigo("TICK-2026-0001").titulo(dto.getTitulo())
                .descripcion(dto.getDescripcion()).cliente(cliente).empresa(empresa)
                .categoria(categoria).prioridad(prioridad).estado(estadoInicial)
                .fechaCreacion(LocalDateTime.now())
                .fechaLimiteRespuesta(LocalDateTime.now().plusHours(12))
                .fechaLimiteResolucion(LocalDateTime.now().plusHours(48))
                .tiempoEstimadoMinutos(2880).tiempoRegistradoMinutos(0).build();

        when(usuarioRepository.findByUsername("cliente1")).thenReturn(Optional.of(cliente));
        when(categoriaRepository.findById(1L)).thenReturn(Optional.of(categoria));
        when(subcategoriaRepository.findById(1L)).thenReturn(Optional.of(
                Subcategoria.builder().id(1L).nombre("Laptop").categoria(categoria).build()));
        when(prioridadRepository.findById(2L)).thenReturn(Optional.of(prioridad));
        when(slaRepository.findByPrioridadId(2L)).thenReturn(Optional.empty());
        when(estadoRepository.findByEsInicialTrue()).thenReturn(Optional.of(estadoInicial));
        when(ticketRepository.save(any())).thenReturn(ticketGuardado);
        when(attachmentRepository.findByTicketIdAndActivoTrue(1L)).thenReturn(java.util.List.of());


        // Act
        TicketResponseDTO result = ticketService.crearTicket(dto, "cliente1", null);

        // Assert
        assertThat(result).isNotNull();
        assertThat(result.getTitulo()).isEqualTo("Falla en laptop");
        assertThat(result.getCodigo()).isEqualTo("TICK-2026-0001");
        assertThat(result.getEstadoCodigo()).isEqualTo("NUEVO");
        assertThat(result.getPrioridadNombre()).isEqualTo("Media");
        verify(ticketRepository, times(1)).save(any(Ticket.class));
    }

    @Test
    @DisplayName("Obtener ticket inexistente lanza RuntimeException")
    void obtener_ticket_inexistente_lanza_excepcion() {
        when(ticketRepository.findById(999L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> ticketService.obtenerPorId(999L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Ticket no encontrado");
    }

    @Test
    @DisplayName("Cambiar estado actualiza SLA resolución cuando estado es final")
    void cambiar_estado_final_actualiza_sla() {
        Estado estadoCerrado = Estado.builder().id(6L).nombre("Cerrado").codigo("CERRADO")
                .esFinal(true).build();
        Ticket ticket = Ticket.builder()
                .id(1L).codigo("TICK-2026-0001").titulo("Test").descripcion("desc")
                .cliente(cliente).empresa(empresa).categoria(categoria)
                .prioridad(prioridad).estado(estadoInicial)
                .fechaLimiteResolucion(LocalDateTime.now().plusHours(2))
                .fechaCreacion(LocalDateTime.now())
                .tiempoEstimadoMinutos(0).tiempoRegistradoMinutos(0).build();

        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));
        when(usuarioRepository.findByUsername("admin")).thenReturn(Optional.of(cliente));
        when(estadoRepository.findByCodigo("CERRADO")).thenReturn(Optional.of(estadoCerrado));
        when(ticketRepository.save(any())).thenReturn(ticket);
        when(attachmentRepository.findByTicketIdAndActivoTrue(1L)).thenReturn(java.util.List.of());


        TicketResponseDTO result = ticketService.cambiarEstado(1L, "CERRADO", "admin");

        assertThat(result).isNotNull();
        assertThat(ticket.getFechaResolucion()).isNotNull();
        assertThat(ticket.getCumplioSlaResolucion()).isTrue();
        verify(historialRepository, times(1)).save(any());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, 45, 999})
    @DisplayName("El SLA determina el tiempo estimado, incluso si el cliente envía otro valor")
    void tiempo_estimado_se_calcula_desde_sla(Integer enviado) {
        Sla sla = Sla.builder().id(1L).prioridad(prioridad)
                .tiempoRespuestaMinutos(30).tiempoResolucionMinutos(90).build();
        TicketCreateDTO dto = prepararCreacion(enviado, sla);
        TicketResponseDTO result = ticketService.crearTicket(dto, "cliente1", "estimate-test");
        verify(ticketRepository).save(argThat(ticket -> ticket.getTiempoEstimadoMinutos() == 90));
        assertThat(result.getTiempoEstimadoMinutos()).isEqualTo(90);
        assertThat(result.getFechaLimiteResolucion()).isEqualTo(result.getFechaCreacion().plusMinutes(90));
    }

    @Test
    @DisplayName("Sin SLA previo, se crea desde la prioridad y se convierte de horas a minutos")
    void tiempo_estimado_sin_sla_usa_horas_de_prioridad() {
        TicketCreateDTO dto = prepararCreacion(null, null);
        when(slaRepository.save(any(Sla.class))).thenAnswer(invocation -> invocation.getArgument(0));
        TicketResponseDTO result = ticketService.crearTicket(dto, "cliente1", "estimate-fallback");
        verify(slaRepository).save(argThat(sla -> sla.getTiempoResolucionMinutos() == 2880));
        verify(ticketRepository).save(argThat(ticket -> ticket.getTiempoEstimadoMinutos() == 2880));
        assertThat(result.getTiempoEstimadoMinutos()).isEqualTo(2880);
        assertThat(result.getFechaLimiteResolucion()).isEqualTo(result.getFechaCreacion().plusHours(48));
    }

    private TicketCreateDTO prepararCreacion(Integer enviado, Sla sla) {
        TicketCreateDTO dto = new TicketCreateDTO();
        dto.setTitulo("Falla en laptop"); dto.setDescripcion("La pantalla parpadea constantemente");
        dto.setEmpresaId(1L); dto.setCategoriaId(1L); dto.setSubcategoriaId(1L); dto.setPrioridadId(2L);
        dto.setTiempoEstimadoMinutos(enviado);
        when(usuarioRepository.findByUsername("cliente1")).thenReturn(Optional.of(cliente));
        when(categoriaRepository.findById(1L)).thenReturn(Optional.of(categoria));
        when(subcategoriaRepository.findById(1L)).thenReturn(Optional.of(
                Subcategoria.builder().id(1L).nombre("Laptop").categoria(categoria).build()));
        when(prioridadRepository.findById(2L)).thenReturn(Optional.of(prioridad));
        when(estadoRepository.findByEsInicialTrue()).thenReturn(Optional.of(estadoInicial));
        when(slaRepository.findByPrioridadId(2L)).thenReturn(Optional.ofNullable(sla));
        when(ticketRepository.save(any(Ticket.class))).thenAnswer(invocation -> {
            Ticket ticket = invocation.getArgument(0); ticket.setId(1L); return ticket;
        });
        return dto;
    }
}
