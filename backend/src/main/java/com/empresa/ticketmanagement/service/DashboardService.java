package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.dto.DashboardStatsDTO;
import java.time.LocalDate;

public interface DashboardService {
    DashboardStatsDTO obtenerMetricasGlobales();
    DashboardStatsDTO obtenerMetricasGlobales(LocalDate fechaDesde, LocalDate fechaHasta);
}
