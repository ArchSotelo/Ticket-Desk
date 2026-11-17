package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.report.ReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

@RestController
@PreAuthorize("hasAuthority('REPORT_VIEW')")
@RequestMapping("/reports")
@RequiredArgsConstructor
@Tag(name = "Reportes & Exportación", description = "Descarga de reportes en Excel y CSV")
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/tickets/excel")
    @Operation(summary = "Exportar todos los tickets a Excel (.xlsx)")
    public ResponseEntity<byte[]> exportarExcel(
            @RequestParam(required = false) String estado,
            @RequestParam(required = false) String prioridad,
            @RequestParam(required = false) Long categoriaId,
            @RequestParam(required = false) String busqueda,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaDesde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaHasta) {
        byte[] data = reportService.generarReporteTicketsExcel(estado, prioridad, categoriaId, busqueda, fechaDesde, fechaHasta);
        String filename = "tickets_reporte_" + LocalDate.now() + ".xlsx";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(data.length)
                .body(data);
    }

    @GetMapping("/tickets/csv")
    @Operation(summary = "Exportar todos los tickets a CSV")
    public ResponseEntity<byte[]> exportarCsv() {
        byte[] data = reportService.generarReporteTicketsCsv();
        String filename = "tickets_reporte_" + LocalDate.now() + ".csv";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .contentLength(data.length)
                .body(data);
    }
}
