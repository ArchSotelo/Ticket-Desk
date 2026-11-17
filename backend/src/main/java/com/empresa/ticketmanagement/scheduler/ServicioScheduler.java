package com.empresa.ticketmanagement.scheduler;

import com.empresa.ticketmanagement.service.ServicioService;
import com.empresa.ticketmanagement.entity.Servicio;
import com.empresa.ticketmanagement.repository.ServicioRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.entity.ConfiguracionServicio;
import com.empresa.ticketmanagement.repository.ConfiguracionServicioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;

@Component @RequiredArgsConstructor
public class ServicioScheduler {
    private final ServicioService servicioService;
    private final ServicioRepository repository;
    private final UsuarioRepository usuarioRepository;
    private final NotificacionService notificacionService;
    private final ConfiguracionServicioRepository configuracionRepository;
    @Scheduled(fixedRate = 3600000)
    @Transactional
    public void marcarServiciosVencidos() {
        servicioService.marcarVencidos();
        LocalDate hoy = LocalDate.now();
        ConfiguracionServicio config = configuracionRepository.findFirstByOrderByIdAsc().orElseGet(() -> configuracionRepository.save(ConfiguracionServicio.builder().build()));
        for (Servicio servicio : repository.findAll()) {
            if (!java.util.List.of("ACTIVO", "POR_VENCER", "VENCIDO").contains(servicio.getEstado())) continue;
            long dias = java.time.temporal.ChronoUnit.DAYS.between(hoy, servicio.getFechaFin());
            if (dias >= 0 && dias <= config.getDiasPorVencer() && !Boolean.TRUE.equals(servicio.getAlertaProximaEnviada())) {
                enviar(servicio, config.getAsuntoPorVencer(), config.getPlantillaPorVencer());
                servicio.setAlertaProximaEnviada(true);
            }
            if (dias < 0 && Boolean.TRUE.equals(config.getRecordatorioVencido()) && !Boolean.TRUE.equals(servicio.getAlertaVencidaEnviada())) {
                enviar(servicio, config.getAsuntoVencido(), config.getPlantillaVencido());
                usuarioRepository.findDistinctByRolesNombre("ROLE_ADMIN").forEach(u -> notificacionService.notificar(u.getId(), "Servicio vencido", servicio.getNombre() + " ha vencido.", "ALERTA", "/servicios/" + servicio.getId()));
                usuarioRepository.findDistinctByRolesNombre("ROLE_TECNICO").forEach(u -> notificacionService.notificar(u.getId(), "Servicio vencido", servicio.getNombre() + " ha vencido.", "ALERTA", "/servicios/" + servicio.getId()));
                servicio.setAlertaVencidaEnviada(true);
            }
        }
        repository.flush();
    }
    private void enviar(Servicio servicio, String asunto, String cuerpo) { String mensaje = cuerpo.replace("{{servicio.nombre}}", servicio.getNombre()).replace("{{servicio.fechaFin}}", String.valueOf(servicio.getFechaFin())).replace("{{servicio.estado}}", servicio.getEstado()); String titulo = asunto.replace("{{servicio.nombre}}", servicio.getNombre()); servicio.getCorreosRecordatorio().stream().filter(e -> e != null && !e.isBlank()).forEach(e -> notificacionService.enviarEmail(e, titulo, mensaje)); }
}
