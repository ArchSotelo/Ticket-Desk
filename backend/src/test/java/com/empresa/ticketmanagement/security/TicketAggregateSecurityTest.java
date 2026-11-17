package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.controller.DashboardController;
import com.empresa.ticketmanagement.controller.ReportController;
import com.empresa.ticketmanagement.dto.DashboardStatsDTO;
import com.empresa.ticketmanagement.report.ReportService;
import com.empresa.ticketmanagement.service.DashboardService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {ReportController.class, DashboardController.class},
        properties = "spring.jackson.time-zone=America/Lima")
@Import(SecurityConfig.class)
class TicketAggregateSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean ReportService reports;
    @MockitoBean DashboardService dashboard;
    @MockitoBean JwtUtils jwt;
    @MockitoBean UserDetailsServiceCustom users;

    @Test @WithMockUser(roles="CLIENTE")
    void clientCannotBypassTicketIsolationThroughExportsOrGlobalStatistics() throws Exception {
        for(String path:new String[]{"/reports/tickets/excel","/reports/tickets/csv","/dashboard/stats"})
            mvc.perform(get(path)).andExpect(status().isForbidden());
        verifyNoInteractions(reports,dashboard);
    }
    @Test @WithMockUser(authorities={"ROLE_TECNICO","REPORT_VIEW"})
    void supportRetainsAccessToReportsAndGlobalStatistics() throws Exception {
        when(dashboard.obtenerMetricasGlobales(null,null)).thenReturn(DashboardStatsDTO.builder().totalTickets(3L).build());
        when(reports.generarReporteTicketsCsv()).thenReturn(new byte[]{1});
        mvc.perform(get("/dashboard/stats")).andExpect(status().isOk()).andExpect(jsonPath("$.data.totalTickets").value(3));
        mvc.perform(get("/reports/tickets/csv")).andExpect(status().isOk());
    }
    @Test void anonymousCallsRequireAuthentication() throws Exception {
        mvc.perform(get("/reports/tickets/csv")).andExpect(status().isUnauthorized());
        verifyNoInteractions(reports);
    }
}
