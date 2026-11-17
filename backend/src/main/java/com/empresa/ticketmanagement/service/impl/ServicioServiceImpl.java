package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ServicioDTO;
import com.empresa.ticketmanagement.report.CsvExport;
import com.empresa.ticketmanagement.dto.ServicioPageDTO;
import com.empresa.ticketmanagement.entity.Servicio;
import com.empresa.ticketmanagement.entity.ServicioAdjunto;
import com.empresa.ticketmanagement.dto.ServicioAdjuntoDTO;
import com.empresa.ticketmanagement.entity.ConfiguracionServicio;
import com.empresa.ticketmanagement.repository.ConfiguracionServicioRepository;
import com.empresa.ticketmanagement.attachment.StorageFactory;
import com.empresa.ticketmanagement.attachment.AttachmentTypePolicy;
import com.empresa.ticketmanagement.exception.AttachmentNotFoundException;
import com.empresa.ticketmanagement.attachment.StorageProvider;
import com.empresa.ticketmanagement.repository.ServicioRepository;
import com.empresa.ticketmanagement.repository.ServicioAdjuntoRepository;
import com.empresa.ticketmanagement.service.ServicioService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

@Service @RequiredArgsConstructor
public class ServicioServiceImpl implements ServicioService {
    private final ServicioRepository repository;
    private final ServicioAdjuntoRepository adjuntoRepository;
    private final StorageFactory storageFactory;
    private final ConfiguracionServicioRepository configuracionServicioRepository;

    @Override @Transactional
    public ServicioPageDTO listar(String busqueda, String estado, int page, int size) {
        marcarVencidosInterno();
        String term = busqueda == null ? "" : busqueda.trim().toLowerCase(Locale.ROOT);
        String filtro = estado == null ? "" : estado.trim().toUpperCase(Locale.ROOT);
        List<Servicio> filtrados = repository.findAllByOrderByNombreAsc().stream()
                .filter(s -> term.isBlank() || contiene(s.getNombre(), term) || contiene(s.getProveedor(), term) || contiene(s.getTipo(), term) || contiene(s.getResponsable(), term))
                .filter(s -> List.of("ACTIVO", "POR_VENCER", "VENCIDO").contains(s.getEstado()) && (filtro.isBlank() || filtro.equals(s.getEstado())))
                .toList();
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(0, page);
        int from = Math.min(safePage * safeSize, filtrados.size());
        int to = Math.min(from + safeSize, filtrados.size());
        BigDecimal total = filtrados.stream().map(Servicio::getCostoMensual).filter(java.util.Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        int totalPages = (int) Math.ceil((double) filtrados.size() / safeSize);
        Map<String, BigDecimal> totalesPorDivisa = filtrados.stream().collect(java.util.stream.Collectors.groupingBy(s -> s.getDivisa() == null ? "PEN" : s.getDivisa(), LinkedHashMap::new, java.util.stream.Collectors.reducing(BigDecimal.ZERO, s -> s.getCostoMensual() == null ? BigDecimal.ZERO : s.getCostoMensual(), BigDecimal::add)));
        return ServicioPageDTO.builder().content(filtrados.subList(from, to).stream().map(this::toDto).toList())
                .totalElements(filtrados.size()).totalPages(totalPages).number(safePage).size(safeSize).totalCostoMensual(total).totalesPorDivisa(totalesPorDivisa).build();
    }

    @Override @Transactional(readOnly = true) public ServicioDTO obtener(Long id) { return toDto(find(id)); }

    @Override @Transactional public ServicioDTO crear(ServicioDTO dto) { return toDto(repository.save(fromDto(new Servicio(), dto))); }

    @Override @Transactional public ServicioDTO actualizar(Long id, ServicioDTO dto) { return toDto(repository.save(fromDto(find(id), dto))); }

    @Override @Transactional public ServicioDTO actualizarObservaciones(Long id, String observaciones) { Servicio servicio = find(id); if (List.of("CANCELADO", "FINALIZADO").contains(servicio.getEstado())) throw new BusinessException("No se pueden modificar las observaciones de un servicio cancelado o finalizado."); servicio.setNotas(observaciones == null ? null : observaciones.trim()); return toDto(repository.save(servicio)); }

    @Override @Transactional public ServicioDTO cambiarEstado(Long id, String estado) {
        String normalized = estado == null ? "" : estado.trim().toUpperCase(Locale.ROOT);
        if (!List.of("ACTIVO", "INACTIVO", "FINALIZADO").contains(normalized)) throw new BusinessException("El estado manual debe ser ACTIVO, INACTIVO o FINALIZADO.");
        Servicio servicio = find(id);
        if ("FINALIZADO".equals(normalized) && List.of("CANCELADO", "FINALIZADO").contains(servicio.getEstado())) throw new BusinessException("El servicio ya se encuentra cerrado.");
        if (servicio.getFechaFin() != null && servicio.getFechaFin().isBefore(LocalDate.now()) && !"FINALIZADO".equals(normalized)) normalized = "VENCIDO";
        servicio.setEstado(normalized);
        return toDto(repository.save(servicio));
    }

    @Override @Transactional public ServicioDTO cancelar(Long id, String observacionCancelacion) { if (observacionCancelacion == null || observacionCancelacion.isBlank()) throw new BusinessException("La observación de cancelación es obligatoria."); Servicio s = find(id); s.setEstado("CANCELADO"); s.setObservacionCancelacion(observacionCancelacion.trim()); return toDto(repository.save(s)); }

    @Override @Transactional
    public ServicioDTO renovar(Long id, LocalDate fechaInicio, LocalDate fechaFin) {
        Servicio anterior = find(id);
        ServicioDTO datos = ServicioDTO.builder()
                .nombre(anterior.getNombre()).proveedor(anterior.getProveedor()).tipo(anterior.getTipo())
                .fechaInicio(fechaInicio).fechaFin(fechaFin).costoMensual(anterior.getCostoMensual())
                .divisa(anterior.getDivisa()).responsable(anterior.getResponsable()).notas(anterior.getNotas())
                .correosRecordatorio(anterior.getCorreosRecordatorio()).build();
        return renovarRegistro(anterior, datos);
    }

    @Override @Transactional
    public ServicioDTO renovar(Long id, ServicioDTO datos) {
        return renovarRegistro(find(id), datos);
    }

    private ServicioDTO renovarRegistro(Servicio anterior, ServicioDTO datos) {
        if (List.of("CANCELADO", "FINALIZADO").contains(anterior.getEstado())) {
            throw new BusinessException("No se puede renovar un servicio cancelado o finalizado.");
        }
        if (datos.getFechaInicio() == null || datos.getFechaFin() == null
                || datos.getFechaFin().isBefore(datos.getFechaInicio())) {
            throw new BusinessException("La fecha de fin no puede ser anterior a la fecha de inicio.");
        }
        // Only the new record receives the edited fields. Invoices remain in the original period.
        Servicio nuevo = fromDto(new Servicio(), datos);
        nuevo.setServicioAnteriorId(anterior.getId());
        anterior.setEstado("FINALIZADO");
        repository.save(anterior);
        return toDto(repository.save(nuevo));
    }

    @Override @Transactional(readOnly = true) public List<ServicioDTO> historial(Long id) { List<ServicioDTO> result = new ArrayList<>(); Servicio actual = find(id); result.add(toDto(actual)); Long anteriorId = actual.getServicioAnteriorId(); while (anteriorId != null) { Servicio anterior = find(anteriorId); result.add(toDto(anterior)); anteriorId = anterior.getServicioAnteriorId(); } return result; }

    @Override @Transactional(readOnly = true) public List<ServicioDTO> historialGeneral() { return repository.findAllByOrderByNombreAsc().stream().filter(s -> "FINALIZADO".equals(s.getEstado()) || "CANCELADO".equals(s.getEstado())).map(this::toDto).toList(); }

    @Override @Transactional public ServicioDTO subirFactura(Long id, MultipartFile file) {
        if (file == null || file.isEmpty()) throw new BusinessException("Seleccione una factura.");
        Servicio s = find(id); validarServicioAbierto(s);
        String mime = AttachmentTypePolicy.validate(file);
        StorageProvider provider = storageFactory.getStorageProvider();
        String nombre = UUID.randomUUID() + "." + AttachmentTypePolicy.extension(file.getOriginalFilename());
        s.setFacturaRuta(provider.storeFile(file, nombre)); s.setFacturaNombre(file.getOriginalFilename());
        s.setFacturaMime(mime); s.setFacturaTamano(file.getSize());
        return toDto(repository.save(s));
    }

    @Override @Transactional public void eliminarFactura(Long id) { Servicio servicio = find(id); validarServicioAbierto(servicio); if (servicio.getFacturaRuta() != null) storageFactory.getStorageProvider().deleteFile(servicio.getFacturaRuta()); servicio.setFacturaRuta(null); servicio.setFacturaNombre(null); servicio.setFacturaMime(null); servicio.setFacturaTamano(null); repository.save(servicio); }

    @Override @Transactional public ServicioDTO subirAdjuntos(Long id, List<MultipartFile> files) {
        if (files == null || files.isEmpty() || files.stream().allMatch(file -> file == null || file.isEmpty())) throw new BusinessException("Seleccione al menos un archivo.");
        Servicio servicio = find(id);
        validarServicioAbierto(servicio);
        // Validar todo el lote antes de guardar el primer archivo.
        List<String> mimes = files.stream().map(file -> {
            if (file == null) throw new BusinessException("Archivo vacío no permitido.");
            return AttachmentTypePolicy.validate(file);
        }).toList();
        StorageProvider provider = storageFactory.getStorageProvider();
        for (int i=0; i<files.size(); i++) {
            MultipartFile file = files.get(i);
            if (file == null || file.isEmpty()) continue;
            String original = file.getOriginalFilename() == null ? "adjunto" : file.getOriginalFilename();
            String physical = UUID.randomUUID() + "." + AttachmentTypePolicy.extension(original);
            ServicioAdjunto adjunto = ServicioAdjunto.builder()
                    .servicio(servicio).nombreOriginal(original).nombreFisico(physical)
                    .mimeType(mimes.get(i))
                    .tamanoBytes(file.getSize()).ruta(provider.storeFile(file, physical))
                    .proveedorAlmacenamiento(provider.getProviderName()).fechaCreacion(java.time.LocalDateTime.now()).activo(true).build();
            adjuntoRepository.save(adjunto);
        }
        return toDto(servicio);
    }

    @Override @Transactional(readOnly = true) public Resource descargarAdjunto(Long servicioId, Long adjuntoId) {
        ServicioAdjunto adjunto = adjuntoRepository.findById(adjuntoId).orElseThrow(() -> new AttachmentNotFoundException());
        if (!adjunto.getActivo() || !adjunto.getServicio().getId().equals(servicioId)) throw new AttachmentNotFoundException();
        return storageFactory.getStorageProvider().loadFileAsResource(adjunto.getRuta());
    }

    @Override @Transactional public void eliminarAdjunto(Long servicioId, Long adjuntoId) {
        ServicioAdjunto adjunto = adjuntoRepository.findById(adjuntoId).orElseThrow(() -> new BusinessException("Archivo adjunto no encontrado."));
        if (!adjunto.getActivo() || !adjunto.getServicio().getId().equals(servicioId)) throw new BusinessException("Archivo adjunto no encontrado para este servicio.");
        validarServicioAbierto(adjunto.getServicio());
        adjunto.setActivo(false);
        adjuntoRepository.save(adjunto);
    }

    @Override @Transactional(readOnly = true) public Resource descargarFactura(Long id) { Servicio s = find(id); if (s.getFacturaRuta() == null) throw new AttachmentNotFoundException(); return storageFactory.getStorageProvider().loadFileAsResource(s.getFacturaRuta()); }

    @Override @Transactional public int marcarVencidos() { return marcarVencidosInterno(); }

    private int marcarVencidosInterno() {
        int count = 0;
        for (Servicio s : repository.findAll()) { String estado = estadoPorFecha(s.getFechaFin()); if (List.of("ACTIVO", "POR_VENCER", "VENCIDO").contains(s.getEstado()) && !estado.equals(s.getEstado())) { s.setEstado(estado); count++; } }
        if (count > 0) repository.flush();
        return count;
    }

    @Override @Transactional(readOnly = true) public byte[] exportarCsv() {
        StringBuilder csv = new StringBuilder();
        CsvExport.appendRow(csv, "Nombre", "Proveedor", "Tipo", "Estado", "Fecha inicio", "Fecha fin", "Costo mensual", "Divisa", "Responsable", "Correos recordatorio");
        repository.findAllByOrderByNombreAsc().forEach(s -> CsvExport.appendRow(csv,
                s.getNombre(), s.getProveedor(), s.getTipo(), s.getEstado(), s.getFechaInicio(), s.getFechaFin(),
                s.getCostoMensual(), s.getDivisa(), s.getResponsable(), String.join("; ", s.getCorreosRecordatorio())));
        return ('\ufeff' + csv.toString()).getBytes(StandardCharsets.UTF_8);
    }

    @Override @Transactional
    public byte[] exportarExcel() {
        marcarVencidosInterno();
        List<Servicio> servicios = repository.findAllByOrderByNombreAsc().stream()
                .filter(s -> List.of("ACTIVO", "POR_VENCER", "VENCIDO").contains(s.getEstado()))
                .toList();
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Servicios");
            sheet.createFreezePane(0, 4);
            sheet.setDisplayGridlines(false);

            CellStyle titleStyle = style(workbook, IndexedColors.DARK_BLUE, IndexedColors.WHITE, true, (short) 16);
            CellStyle subtitleStyle = style(workbook, IndexedColors.WHITE, IndexedColors.GREY_50_PERCENT, false, (short) 10);
            CellStyle headerStyle = style(workbook, IndexedColors.BLUE, IndexedColors.WHITE, true, (short) 10);
            CellStyle textStyle = bordered(workbook, HorizontalAlignment.LEFT);
            CellStyle dateStyle = bordered(workbook, HorizontalAlignment.CENTER);
            CellStyle moneyStyle = bordered(workbook, HorizontalAlignment.RIGHT);
            moneyStyle.setDataFormat(workbook.createDataFormat().getFormat("#,##0.00"));

            var title = sheet.createRow(0);
            title.setHeightInPoints(27);
            title.createCell(0).setCellValue("REPORTE DE SERVICIOS");
            title.getCell(0).setCellStyle(titleStyle);
            sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 9));
            var subtitle = sheet.createRow(1);
            subtitle.createCell(0).setCellValue("Servicios activos, por vencer y vencidos · Generado el " + LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")));
            subtitle.getCell(0).setCellStyle(subtitleStyle);
            sheet.addMergedRegion(new CellRangeAddress(1, 1, 0, 9));

            String[] headers = {"Servicio", "Proveedor", "Tipo", "Fecha inicio", "Fecha fin", "Estado", "Costo mensual", "Divisa", "Responsable", "Correos de recordatorio"};
            var header = sheet.createRow(3);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = header.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            Map<String, BigDecimal> totales = new LinkedHashMap<>();
            int rowIndex = 4;
            for (Servicio servicio : servicios) {
                var row = sheet.createRow(rowIndex++);
                write(row, 0, servicio.getNombre(), textStyle);
                write(row, 1, servicio.getProveedor(), textStyle);
                write(row, 2, servicio.getTipo(), textStyle);
                write(row, 3, formatearFecha(servicio.getFechaInicio()), dateStyle);
                write(row, 4, formatearFecha(servicio.getFechaFin()), dateStyle);
                Cell status = row.createCell(5);
                status.setCellValue(labelEstado(servicio.getEstado()));
                status.setCellStyle(statusStyle(workbook, servicio.getEstado()));
                Cell money = row.createCell(6);
                money.setCellValue(servicio.getCostoMensual() == null ? 0d : servicio.getCostoMensual().doubleValue());
                money.setCellStyle(moneyStyle);
                write(row, 7, servicio.getDivisa(), dateStyle);
                write(row, 8, servicio.getResponsable() == null ? "Sin asignar" : servicio.getResponsable(), textStyle);
                write(row, 9, String.join("; ", servicio.getCorreosRecordatorio()), textStyle);
                String divisa = servicio.getDivisa() == null ? "PEN" : servicio.getDivisa();
                totales.merge(divisa, servicio.getCostoMensual() == null ? BigDecimal.ZERO : servicio.getCostoMensual(), BigDecimal::add);
            }

            int lastDataRow = Math.max(3, rowIndex - 1);
            sheet.setAutoFilter(new CellRangeAddress(3, lastDataRow, 0, 9));
            int summaryRow = rowIndex + 1;
            var summaryTitle = sheet.createRow(summaryRow++);
            summaryTitle.createCell(0).setCellValue("RESUMEN DE GASTO MENSUAL");
            summaryTitle.getCell(0).setCellStyle(headerStyle);
            sheet.addMergedRegion(new CellRangeAddress(summaryTitle.getRowNum(), summaryTitle.getRowNum(), 0, 2));
            for (Map.Entry<String, BigDecimal> total : totales.entrySet()) {
                var row = sheet.createRow(summaryRow++);
                write(row, 0, total.getKey(), textStyle);
                write(row, 1, "Total mensual", textStyle);
                Cell money = row.createCell(2);
                money.setCellValue(total.getValue().doubleValue());
                money.setCellStyle(moneyStyle);
            }

            int[] widths = {28, 24, 18, 15, 15, 16, 16, 10, 22, 42};
            for (int i = 0; i < widths.length; i++) sheet.setColumnWidth(i, widths[i] * 256);
            workbook.write(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("No se pudo generar el Excel de servicios.", exception);
        }
    }

    private CellStyle style(Workbook workbook, IndexedColors background, IndexedColors foreground, boolean bold, short size) {
        CellStyle cellStyle = workbook.createCellStyle();
        cellStyle.setFillForegroundColor(background.getIndex());
        cellStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        cellStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        Font font = workbook.createFont();
        font.setColor(foreground.getIndex());
        font.setBold(bold);
        font.setFontHeightInPoints(size);
        cellStyle.setFont(font);
        return cellStyle;
    }

    private CellStyle bordered(Workbook workbook, HorizontalAlignment alignment) {
        CellStyle cellStyle = workbook.createCellStyle();
        cellStyle.setAlignment(alignment);
        cellStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        cellStyle.setBorderBottom(BorderStyle.THIN);
        cellStyle.setBottomBorderColor(IndexedColors.GREY_25_PERCENT.getIndex());
        cellStyle.setWrapText(true);
        return cellStyle;
    }

    private CellStyle statusStyle(Workbook workbook, String estado) {
        IndexedColors background = "VENCIDO".equals(estado) ? IndexedColors.RED : "POR_VENCER".equals(estado) ? IndexedColors.ORANGE : IndexedColors.GREEN;
        return style(workbook, background, IndexedColors.WHITE, true, (short) 10);
    }

    private void write(org.apache.poi.ss.usermodel.Row row, int column, String value, CellStyle cellStyle) {
        Cell cell = row.createCell(column);
        cell.setCellValue(value == null ? "" : value);
        cell.setCellStyle(cellStyle);
    }

    private String formatearFecha(LocalDate date) { return date == null ? "" : date.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")); }
    private String labelEstado(String estado) { return "VENCIDO".equals(estado) ? "Vencido" : "POR_VENCER".equals(estado) ? "Por vencer" : "Activo"; }

    private Servicio fromDto(Servicio s, ServicioDTO d) { s.setNombre(d.getNombre().trim()); s.setProveedor(d.getProveedor().trim()); s.setTipo(d.getTipo().trim()); s.setFechaInicio(d.getFechaInicio()); s.setFechaFin(d.getFechaFin()); s.setCostoMensual(d.getCostoMensual()); s.setDivisa(d.getDivisa() == null || d.getDivisa().isBlank() ? "PEN" : d.getDivisa().trim().toUpperCase(Locale.ROOT)); s.setResponsable(d.getResponsable()); s.setNotas(d.getNotas()); if (s.getEstado() == null || List.of("ACTIVO", "POR_VENCER", "VENCIDO").contains(s.getEstado())) s.setEstado(estadoPorFecha(s.getFechaFin())); s.setCorreosRecordatorio(new ArrayList<>(d.getCorreosRecordatorio() == null ? List.of() : d.getCorreosRecordatorio().stream().filter(e -> e != null && !e.isBlank()).map(String::trim).distinct().toList())); return s; }
    private Servicio find(Long id) { return repository.findById(id).orElseThrow(() -> new BusinessException("Servicio no encontrado: " + id)); }
    private void validarServicioAbierto(Servicio servicio) { if (List.of("CANCELADO", "FINALIZADO").contains(servicio.getEstado())) throw new BusinessException("No se pueden modificar archivos de un servicio cancelado o finalizado."); }

    private ServicioDTO toDto(Servicio s) { return ServicioDTO.builder().id(s.getId()).nombre(s.getNombre()).proveedor(s.getProveedor()).tipo(s.getTipo()).estado(s.getEstado()).fechaInicio(s.getFechaInicio()).fechaFin(s.getFechaFin()).costoMensual(s.getCostoMensual()).divisa(s.getDivisa() == null ? "PEN" : s.getDivisa()).servicioAnteriorId(s.getServicioAnteriorId()).facturaNombre(s.getFacturaNombre()).facturaMime(s.getFacturaMime()).facturaUrl(s.getFacturaRuta() == null ? null : "/api/v1/services/" + s.getId() + "/invoice").facturaTamano(s.getFacturaTamano()).responsable(s.getResponsable()).notas(s.getNotas()).observacionCancelacion(s.getObservacionCancelacion()).correosRecordatorio(s.getCorreosRecordatorio()).adjuntos(adjuntoRepository.findByServicioIdAndActivoTrueOrderByFechaCreacionDesc(s.getId()).stream().map(a -> ServicioAdjuntoDTO.builder().id(a.getId()).nombreOriginal(a.getNombreOriginal()).mimeType(a.getMimeType()).tamanoBytes(a.getTamanoBytes()).fechaCreacion(a.getFechaCreacion()).downloadUrl("/api/v1/services/" + s.getId() + "/attachments/" + a.getId() + "/download").previewUrl("/api/v1/services/" + s.getId() + "/attachments/" + a.getId() + "/preview").build()).toList()).build(); }
    private String estadoPorFecha(LocalDate fechaFin) { if (fechaFin == null) return "ACTIVO"; LocalDate hoy = LocalDate.now(); if (fechaFin.isBefore(hoy)) return "VENCIDO"; ConfiguracionServicio config = configuracionServicioRepository.findFirstByOrderByIdAsc().orElseGet(() -> configuracionServicioRepository.save(ConfiguracionServicio.builder().build())); return !fechaFin.isAfter(hoy.plusDays(config.getDiasPorVencer())) ? "POR_VENCER" : "ACTIVO"; }
    private boolean contiene(String value, String term) { return value != null && value.toLowerCase(Locale.ROOT).contains(term); }
}
