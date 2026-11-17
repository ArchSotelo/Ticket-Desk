package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.controller.DashboardController;
import com.empresa.ticketmanagement.dto.DashboardStatsDTO;
import com.empresa.ticketmanagement.service.DashboardService;
import tools.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDate;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DashboardControllerPeriodTest {
    @Test void bindsBothDatesAndReturnsIsoDateMetadata() throws Exception {
        var service = mock(DashboardService.class);
        var from = LocalDate.parse("2026-10-01"); var to = LocalDate.parse("2026-10-14");
        when(service.obtenerMetricasGlobales(from, to)).thenReturn(DashboardStatsDTO.builder().totalTickets(2L).fechaDesde(from).fechaHasta(to).build());
        var json = JsonMapper.builder().build();
        var mvc = MockMvcBuilders.standaloneSetup(new DashboardController(service))
                .setMessageConverters(new JacksonJsonHttpMessageConverter(json)).build();
        mvc.perform(get("/dashboard/stats").param("fechaDesde", "2026-10-01").param("fechaHasta", "2026-10-14"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.totalTickets").value(2))
                .andExpect(jsonPath("$.data.fechaDesde").value("2026-10-01"))
                .andExpect(jsonPath("$.data.fechaHasta").value("2026-10-14"));
        verify(service).obtenerMetricasGlobales(from, to);
    }
    @Test void noParametersKeepsAllHistoryContract() throws Exception {
        var service = mock(DashboardService.class);
        when(service.obtenerMetricasGlobales(null, null)).thenReturn(DashboardStatsDTO.builder().totalTickets(104L).build());
        var mvc = MockMvcBuilders.standaloneSetup(new DashboardController(service)).build();
        mvc.perform(get("/dashboard/stats")).andExpect(status().isOk()).andExpect(jsonPath("$.data.totalTickets").value(104));
        verify(service).obtenerMetricasGlobales(null, null);
    }
}
