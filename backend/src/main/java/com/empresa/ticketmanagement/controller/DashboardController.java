package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.DashboardStatsDTO;
import com.empresa.ticketmanagement.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;

@RestController
@PreAuthorize("hasAuthority('REPORT_VIEW')")
@RequestMapping("/dashboard")
@RequiredArgsConstructor
@Tag(name = "Dashboard & Métricas", description = "Métricas globales, gráficos KPI y cumplimiento de SLA")
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/stats")
    @Operation(summary = "Obtener métricas y KPIs globales para el Dashboard")
    public ResponseEntity<ApiResponse<DashboardStatsDTO>> obtenerMetricas(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaDesde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaHasta) {
        DashboardStatsDTO stats = dashboardService.obtenerMetricasGlobales(fechaDesde, fechaHasta);
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }
}
