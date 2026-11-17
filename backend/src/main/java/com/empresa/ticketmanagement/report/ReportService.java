package com.empresa.ticketmanagement.report;

import com.empresa.ticketmanagement.entity.Ticket;
import com.empresa.ticketmanagement.repository.TicketRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.time.LocalDate;
import java.util.stream.Stream;
import java.util.List;

/**
 * Servicio de generación de reportes en formato Excel (XLSX) y CSV.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ReportService {

    private final TicketRepository ticketRepository;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    /**
     * Genera reporte Excel completo de tickets.
     */
    public byte[] generarReporteTicketsExcel(String estado, String prioridad, Long categoriaId,
                                              String busqueda, LocalDate fechaDesde, LocalDate fechaHasta) {
        List<Ticket> allTickets = ticketRepository.findAll(org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "fechaCreacion"));
        Stream<Ticket> stream = allTickets.stream();
        if (estado != null && !estado.isBlank()) stream = stream.filter(t -> t.getEstado() != null && estado.equalsIgnoreCase(t.getEstado().getCodigo()));
        if (prioridad != null && !prioridad.isBlank()) stream = stream.filter(t -> t.getPrioridad() != null && prioridad.equalsIgnoreCase(t.getPrioridad().getNombre()));
        if (categoriaId != null) stream = stream.filter(t -> t.getCategoria() != null && categoriaId.equals(t.getCategoria().getId()));
        if (busqueda != null && !busqueda.isBlank()) {
            String query = busqueda.trim().toLowerCase();
            stream = stream.filter(t -> contains(t.getCodigo(), query) || contains(t.getTitulo(), query)
                    || contains(t.getDescripcion(), query)
                    || (t.getCliente() != null && contains(t.getCliente().getNombreCompleto(), query))
                    || (t.getCategoria() != null && contains(t.getCategoria().getNombre(), query))
                    || (t.getPrioridad() != null && contains(t.getPrioridad().getNombre(), query)));
        }
        if (fechaDesde != null) stream = stream.filter(t -> t.getFechaCreacion() != null && !t.getFechaCreacion().toLocalDate().isBefore(fechaDesde));
        if (fechaHasta != null) stream = stream.filter(t -> t.getFechaCreacion() != null && !t.getFechaCreacion().toLocalDate().isAfter(fechaHasta));
        List<Ticket> tickets = stream.toList();

        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Reporte de Tickets");

            // Estilos
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);

            CellStyle dataStyle = workbook.createCellStyle();
            dataStyle.setBorderBottom(BorderStyle.THIN);
            dataStyle.setBorderLeft(BorderStyle.THIN);
            dataStyle.setBorderRight(BorderStyle.THIN);

            CellStyle slaOkStyle = workbook.createCellStyle();
            slaOkStyle.setFillForegroundColor(IndexedColors.LIGHT_GREEN.getIndex());
            slaOkStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            CellStyle slaFailStyle = workbook.createCellStyle();
            slaFailStyle.setFillForegroundColor(IndexedColors.ROSE.getIndex());
            slaFailStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // Título del reporte
            Row titleRow = sheet.createRow(0);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue("REPORTE DE TICKETS — ServiceDesk Pro");
            CellStyle titleStyle = workbook.createCellStyle();
            Font titleFont = workbook.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 14);
            titleStyle.setFont(titleFont);
            titleCell.setCellStyle(titleStyle);
            sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 13));

            // Cabeceras
            String[] headers = {
                "Código", "Título", "Cliente", "Técnico", "Empresa",
                "Categoría", "Prioridad", "Estado", "Fecha Creación",
                "Fecha Resolución", "Fecha Cierre", "Fecha Límite Resolución",
                "SLA Respuesta", "SLA Resolución"
            };
            Row headerRow = sheet.createRow(2);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 5000);
            }

            // Datos
            int rowNum = 3;
            for (Ticket t : tickets) {
                Row row = sheet.createRow(rowNum++);

                row.createCell(0).setCellValue(t.getCodigo());
                row.createCell(1).setCellValue(t.getTitulo());
                row.createCell(2).setCellValue(t.getCliente().getNombreCompleto());
                row.createCell(3).setCellValue(t.getTecnico() != null ? t.getTecnico().getNombreCompleto() : "Sin asignar");
                row.createCell(4).setCellValue(t.getEmpresa().getRazonSocial());
                row.createCell(5).setCellValue(t.getCategoria().getNombre());
                row.createCell(6).setCellValue(t.getPrioridad().getNombre());
                row.createCell(7).setCellValue(t.getEstado().getNombre());
                row.createCell(8).setCellValue(t.getFechaCreacion() != null ? t.getFechaCreacion().format(FMT) : "");
                row.createCell(9).setCellValue(t.getFechaResolucion() != null ? t.getFechaResolucion().format(FMT) : "");
                row.createCell(10).setCellValue(t.getFechaCierre() != null ? t.getFechaCierre().format(FMT) : "");
                row.createCell(11).setCellValue(t.getFechaLimiteResolucion() != null ? t.getFechaLimiteResolucion().format(FMT) : "");

                Cell slaRespCell = row.createCell(12);
                if (t.getCumplioSlaRespuesta() == null)        { slaRespCell.setCellValue("Pendiente"); }
                else if (Boolean.TRUE.equals(t.getCumplioSlaRespuesta())) { slaRespCell.setCellValue("✅ Cumplió"); slaRespCell.setCellStyle(slaOkStyle); }
                else                                           { slaRespCell.setCellValue("❌ Incumplió"); slaRespCell.setCellStyle(slaFailStyle); }

                Cell slaResolCell = row.createCell(13);
                if (t.getCumplioSlaResolucion() == null)         { slaResolCell.setCellValue("Pendiente"); }
                else if (Boolean.TRUE.equals(t.getCumplioSlaResolucion())) { slaResolCell.setCellValue("✅ Cumplió"); slaResolCell.setCellStyle(slaOkStyle); }
                else                                             { slaResolCell.setCellValue("❌ Incumplió"); slaResolCell.setCellStyle(slaFailStyle); }
            }

            // Fila de totales
            Row totalRow = sheet.createRow(rowNum + 1);
            totalRow.createCell(0).setCellValue("TOTAL REGISTROS: " + tickets.size());

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            log.info("Reporte Excel generado con {} tickets", tickets.size());
            return out.toByteArray();

        } catch (Exception e) {
            throw new RuntimeException("Error al generar reporte Excel: " + e.getMessage(), e);
        }
    }

    private boolean contains(String value, String query) {
        return value != null && value.toLowerCase().contains(query);
    }

    /**
     * Genera reporte en formato CSV.
     */
    public byte[] generarReporteTicketsCsv() {
        List<Ticket> tickets = ticketRepository.findAll(PageRequest.of(0, 5000)).getContent();
        StringBuilder csv = new StringBuilder();
        CsvExport.appendRow(csv, "Código", "Título", "Cliente", "Técnico", "Prioridad", "Estado", "Fecha Creación", "SLA Resolución");

        for (Ticket t : tickets) {
            CsvExport.appendRow(csv,
                t.getCodigo(),
                t.getTitulo(),
                t.getCliente().getNombreCompleto(),
                t.getTecnico() != null ? t.getTecnico().getNombreCompleto() : "Sin asignar",
                t.getPrioridad().getNombre(),
                t.getEstado().getNombre(),
                t.getFechaCreacion() != null ? t.getFechaCreacion().format(FMT) : "",
                t.getCumplioSlaResolucion() == null ? "Pendiente"
                    : Boolean.TRUE.equals(t.getCumplioSlaResolucion()) ? "Cumplió" : "Incumplió"
            );
        }
        return csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }
}
