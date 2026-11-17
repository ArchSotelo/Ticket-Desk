package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.attachment.StorageFactory;
import com.empresa.ticketmanagement.controller.ServicioController;
import com.empresa.ticketmanagement.dto.ServicioDTO;
import com.empresa.ticketmanagement.entity.ConfiguracionServicio;
import com.empresa.ticketmanagement.entity.Servicio;
import com.empresa.ticketmanagement.exception.GlobalExceptionHandler;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.service.ServicioService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class ServicioRenewalTest {
    @Mock ServicioRepository repository;
    @Mock ServicioAdjuntoRepository adjuntoRepository;
    @Mock StorageFactory storageFactory;
    @Mock ConfiguracionServicioRepository configuracionServicioRepository;
    @InjectMocks ServicioServiceImpl service;

    private Servicio original() {
        return Servicio.builder().id(1L).nombre("Correo").proveedor("Google").tipo("Correo")
                .estado("ACTIVO").fechaInicio(LocalDate.now()).fechaFin(LocalDate.now().plusDays(30))
                .costoMensual(new BigDecimal("340.00")).divisa("PEN").responsable("Sistemas")
                .notas("Periodo original").correosRecordatorio(List.of("original@empresa.com"))
                .facturaNombre("factura.pdf").facturaRuta("original.pdf").build();
    }

    private ServicioDTO edited() {
        return ServicioDTO.builder().nombre("Correo renovado").proveedor("Nuevo proveedor").tipo("Licencia")
                .fechaInicio(LocalDate.now().plusDays(31)).fechaFin(LocalDate.now().plusDays(61))
                .costoMensual(new BigDecimal("150.00")).divisa("USD").responsable("Compras")
                .notas("Nueva observación").correosRecordatorio(List.of("nuevo@empresa.com")).build();
    }

    private void allowSave(Servicio original) {
        when(repository.findById(1L)).thenReturn(Optional.of(original));
        when(configuracionServicioRepository.findFirstByOrderByIdAsc())
                .thenReturn(Optional.of(ConfiguracionServicio.builder().build()));
        when(repository.save(any(Servicio.class))).thenAnswer(invocation -> {
            Servicio saved = invocation.getArgument(0);
            if (saved.getId() == null) saved.setId(2L);
            return saved;
        });
    }

    @Test void renewalSavesAllEditedFieldsAndPreservesOriginalPeriod() {
        Servicio original = original();
        allowSave(original);
        ServicioDTO result = service.renovar(1L, edited());
        assertThat(result.getId()).isEqualTo(2L);
        assertThat(result.getServicioAnteriorId()).isEqualTo(1L);
        assertThat(result.getNombre()).isEqualTo("Correo renovado");
        assertThat(result.getProveedor()).isEqualTo("Nuevo proveedor");
        assertThat(result.getTipo()).isEqualTo("Licencia");
        assertThat(result.getCostoMensual()).isEqualByComparingTo("150.00");
        assertThat(result.getDivisa()).isEqualTo("USD");
        assertThat(result.getResponsable()).isEqualTo("Compras");
        assertThat(result.getNotas()).isEqualTo("Nueva observación");
        assertThat(result.getCorreosRecordatorio()).containsExactly("nuevo@empresa.com");
        assertThat(result.getFechaInicio()).isEqualTo(edited().getFechaInicio());
        assertThat(result.getFechaFin()).isEqualTo(edited().getFechaFin());
        assertThat(result.getEstado()).isEqualTo("ACTIVO");
        assertThat(result.getFacturaNombre()).isNull();
        assertThat(original.getEstado()).isEqualTo("FINALIZADO");
        assertThat(original.getNombre()).isEqualTo("Correo");
        assertThat(original.getCostoMensual()).isEqualByComparingTo("340.00");
        assertThat(original.getCorreosRecordatorio()).containsExactly("original@empresa.com");
        assertThat(original.getFacturaNombre()).isEqualTo("factura.pdf");
    }

    @Test void legacyRenewalStillCopiesOriginalFields() {
        Servicio original = original();
        allowSave(original);
        ServicioDTO result = service.renovar(1L, edited().getFechaInicio(), edited().getFechaFin());
        assertThat(result.getNombre()).isEqualTo(original.getNombre());
        assertThat(result.getCostoMensual()).isEqualByComparingTo(original.getCostoMensual());
        assertThat(result.getCorreosRecordatorio()).containsExactly("original@empresa.com");
        assertThat(result.getServicioAnteriorId()).isEqualTo(1L);
        assertThat(original.getEstado()).isEqualTo("FINALIZADO");
    }

    @Test void invalidDatesDoNotCloseOriginalService() {
        Servicio original = original();
        when(repository.findById(1L)).thenReturn(Optional.of(original));
        ServicioDTO dto = edited();
        dto.setFechaFin(dto.getFechaInicio().minusDays(1));
        assertThatThrownBy(() -> service.renovar(1L, dto)).isInstanceOf(IllegalArgumentException.class);
        assertThat(original.getEstado()).isEqualTo("ACTIVO");
        verify(repository, never()).save(any());
    }

    @Test void closedServicesCannotBeRenewedAgain() {
        Servicio original = original();
        when(repository.findById(1L)).thenReturn(Optional.of(original));
        for (String state : List.of("FINALIZADO", "CANCELADO")) {
            original.setEstado(state);
            assertThatThrownBy(() -> service.renovar(1L, edited())).isInstanceOf(IllegalStateException.class);
        }
        verify(repository, never()).save(any());
    }

    private MockMvc controller(ServicioService mock) {
        return MockMvcBuilders.standaloneSetup(new ServicioController(mock))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test void endpointAcceptsAndValidatesFullRenewalBody() throws Exception {
        ServicioService mock = mock(ServicioService.class);
        when(mock.renovar(eq(1L), any(ServicioDTO.class))).thenReturn(edited());
        controller(mock).perform(post("/services/1/renew").contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"nombre":"Correo renovado","proveedor":"Google","tipo":"Correo",
                     "fechaInicio":"2027-01-01","fechaFin":"2027-01-31","costoMensual":150,
                     "divisa":"USD","responsable":"Compras","notas":"Nuevo periodo",
                     "correosRecordatorio":["nuevo@empresa.com"]}
                    """)).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
        verify(mock).renovar(eq(1L), argThat((ServicioDTO dto) ->
                "USD".equals(dto.getDivisa()) && dto.getCorreosRecordatorio().contains("nuevo@empresa.com")));
    }

    @Test void endpointRejectsIncompleteBodyWithoutSaving() throws Exception {
        ServicioService mock = mock(ServicioService.class);
        controller(mock).perform(post("/services/1/renew").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(mock);
    }

    @Test void endpointStillSupportsLegacyDateParameters() throws Exception {
        ServicioService mock = mock(ServicioService.class);
        when(mock.renovar(eq(1L), any(LocalDate.class), any(LocalDate.class))).thenReturn(edited());
        controller(mock).perform(post("/services/1/renew")
                .param("fechaInicio", "2027-01-01").param("fechaFin", "2027-01-31")
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        verify(mock).renovar(1L, LocalDate.of(2027, 1, 1), LocalDate.of(2027, 1, 31));
    }
}
