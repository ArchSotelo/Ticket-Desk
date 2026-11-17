package com.empresa.ticketmanagement.report;

import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.ServicioRepository;
import com.empresa.ticketmanagement.repository.TicketRepository;
import com.empresa.ticketmanagement.service.impl.ServicioServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CsvReportsSecurityTest {
    @Test void bothExportersProtectAllColumnsAndPreserveQuotingAndOptionalValues() throws Exception {
        var ticketRepository = mock(TicketRepository.class);
        var first = Ticket.builder().codigo("=1+1").titulo(" +1+1")
                .cliente(Usuario.builder().nombres("@SUM(1,1)").apellidos("").build())
                .tecnico(Usuario.builder().nombres("-1+1").apellidos("").build())
                .prioridad(Prioridad.builder().nombre("＝1+1").build())
                .estado(Estado.builder().nombre("\u200b=1+1").build())
                .fechaCreacion(LocalDateTime.of(2026,11,2,12,30)).cumplioSlaResolucion(true).build();
        var second = Ticket.builder().codigo("TICK-2").titulo("Texto\",=1+1\r\nOtra línea")
                .cliente(Usuario.builder().nombres("Ana \"QA\", Lima").apellidos("Torres").build())
                .prioridad(Prioridad.builder().nombre("Alta, \"urgente\"").build())
                .estado(Estado.builder().nombre("En\nproceso").build()).fechaCreacion(null).build();
        when(ticketRepository.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(first,second)));
        byte[] tickets = new ReportService(ticketRepository).generarReporteTicketsCsv();
        assertThat(new String(tickets,StandardCharsets.UTF_8)).isEqualTo(
                "\"Código\",\"Título\",\"Cliente\",\"Técnico\",\"Prioridad\",\"Estado\",\"Fecha Creación\",\"SLA Resolución\"\n"
                + "\"\t=1+1\",\"\t +1+1\",\"\t@SUM(1,1) \",\"\t-1+1 \",\"\t＝1+1\",\"\t\u200b=1+1\",\"02/11/2026 12:30\",\"Cumplió\"\n"
                + "\"TICK-2\",\"Texto\"\",=1+1\r\nOtra línea\",\"Ana \"\"QA\"\", Lima Torres\",\"Sin asignar\",\"Alta, \"\"urgente\"\"\",\"En\nproceso\",\"\",\"Pendiente\"\n");
        assertThat(new String(tickets,StandardCharsets.UTF_8)).contains("\"\t=1+1\"", "\"\t +1+1\"", "\"\t@SUM(1,1) \"", "\"\t-1+1 \"", "\"\t＝1+1\"", "\"\t\u200b=1+1\"");
        assertThat(first.getCodigo()).isEqualTo("=1+1");
        assertThat(second.getCliente().getNombres()).isEqualTo("Ana \"QA\", Lima");

        var repository = mock(ServicioRepository.class);
        var service = new ServicioServiceImpl(repository,null,null,null);
        var firstService = Servicio.builder().nombre("=1+1").proveedor("+1+1").tipo("@SUM(1,1)").estado("-1+1")
                .fechaInicio(LocalDate.of(2026,11,1)).fechaFin(LocalDate.of(2026,12,1))
                .costoMensual(new BigDecimal("80.50")).divisa("＝1+1").responsable("\r\n=1+1")
                .correosRecordatorio(List.of("+alert@example.test")).build();
        var secondService = Servicio.builder().nombre("Correo, \"Demo\"").proveedor("Línea 1\nLínea 2").tipo("Hosting")
                .estado("ACTIVO").divisa(null).correosRecordatorio(List.of()).build();
        when(repository.findAllByOrderByNombreAsc()).thenReturn(List.of(firstService,secondService));
        byte[] services = service.exportarCsv();
        assertThat(new String(services,StandardCharsets.UTF_8)).isEqualTo(
                "\ufeff\"Nombre\",\"Proveedor\",\"Tipo\",\"Estado\",\"Fecha inicio\",\"Fecha fin\",\"Costo mensual\",\"Divisa\",\"Responsable\",\"Correos recordatorio\"\n"
                + "\"\t=1+1\",\"\t+1+1\",\"\t@SUM(1,1)\",\"\t-1+1\",\"2026-11-01\",\"2026-12-01\",\"80.50\",\"\t＝1+1\",\"\t\r\n=1+1\",\"\t+alert@example.test\"\n"
                + "\"Correo, \"\"Demo\"\"\",\"Línea 1\nLínea 2\",\"Hosting\",\"ACTIVO\",\"\",\"\",\"0\",\"\",\"\",\"\"\n");
        assertThat(new String(services,StandardCharsets.UTF_8)).startsWith("\ufeff").contains("\"\t+1+1\"", "\"\t\r\n=1+1\"", "\"\t+alert@example.test\"");
        assertThat(firstService.getNombre()).isEqualTo("=1+1");
        verify(repository,never()).save(any());
        verify(ticketRepository,never()).save(any());

        // Artefactos de prueba para contrastar con csv.reader y Calc, sin dependencias nuevas.
        Path directory = Path.of("target","csv-security");Files.createDirectories(directory);
        Files.write(directory.resolve("tickets.csv"),tickets);Files.write(directory.resolve("servicios.csv"),services);
        var expected = Map.of(
                "tickets.csv",List.of(
                    List.of("Código","Título","Cliente","Técnico","Prioridad","Estado","Fecha Creación","SLA Resolución"),
                    List.of("\t=1+1","\t +1+1","\t@SUM(1,1) ","\t-1+1 ","\t＝1+1","\t\u200b=1+1","02/11/2026 12:30","Cumplió"),
                    List.of("TICK-2","Texto\",=1+1\r\nOtra línea","Ana \"QA\", Lima Torres","Sin asignar","Alta, \"urgente\"","En\nproceso","","Pendiente")),
                "servicios.csv",List.of(
                    List.of("Nombre","Proveedor","Tipo","Estado","Fecha inicio","Fecha fin","Costo mensual","Divisa","Responsable","Correos recordatorio"),
                    List.of("\t=1+1","\t+1+1","\t@SUM(1,1)","\t-1+1","2026-11-01","2026-12-01","80.50","\t＝1+1","\t\r\n=1+1","\t+alert@example.test"),
                    List.of("Correo, \"Demo\"","Línea 1\nLínea 2","Hosting","ACTIVO","","","0","","","")));
        Files.writeString(directory.resolve("expected.json"),JsonMapper.builder().build().writeValueAsString(expected));
    }
}
