package com.empresa.ticketmanagement.scheduler;

import com.empresa.ticketmanagement.entity.Ticket;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.repository.TicketRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Scheduler de verificación de SLA.
 * Ejecuta tareas programadas para alertar sobre vencimientos próximos
 * y registrar incumplimientos automáticamente.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SlaScheduler {

    private final TicketRepository ticketRepository;
    private final NotificacionService notificacionService;

    /**
     * Verifica tickets con SLA de resolución próximo a vencer (cada 30 min).
     */
    @Scheduled(fixedRate = 1_800_000)
    @Transactional(readOnly = true)
    public void verificarSlaResolucionProximo() {
        log.debug("⏰ Verificando SLA de resolución próximo a vencer...");
        LocalDateTime ahora = LocalDateTime.now();
        LocalDateTime limite = ahora.plusMinutes(60);

        List<Ticket> ticketsEnRiesgo = ticketRepository.findAll().stream()
                .filter(t -> t.getFechaLimiteResolucion() != null)
                .filter(t -> t.getFechaResolucion() == null)
                .filter(t -> !Boolean.TRUE.equals(t.getEstado().getEsFinal()))
                .filter(t -> t.getFechaLimiteResolucion().isAfter(ahora)
                          && t.getFechaLimiteResolucion().isBefore(limite))
                .toList();

        for (Ticket t : ticketsEnRiesgo) {
            long minutosRestantes = ChronoUnit.MINUTES.between(ahora, t.getFechaLimiteResolucion());
            if (t.getTecnico() != null) {
                notificacionService.alertarSlaProximo(
                    t.getTecnico().getId(), t.getCodigo(), (int) minutosRestantes);
            }
            log.warn("⚠️ SLA próximo a vencer: {} - {} min restantes", t.getCodigo(), minutosRestantes);
        }
    }

    /**
     * Marca automáticamente los tickets con SLA de resolución vencido (cada hora).
     */
    @Scheduled(fixedRate = 3_600_000)
    @Transactional
    public void marcarSlaVencido() {
        log.debug("⏰ Marcando tickets con SLA de resolución vencido...");
        LocalDateTime ahora = LocalDateTime.now();

        List<Ticket> ticketsVencidos = ticketRepository.findAll().stream()
                .filter(t -> t.getFechaLimiteResolucion() != null)
                .filter(t -> t.getFechaResolucion() == null)
                .filter(t -> !Boolean.TRUE.equals(t.getEstado().getEsFinal()))
                .filter(t -> t.getFechaLimiteResolucion().isBefore(ahora))
                .filter(t -> t.getCumplioSlaResolucion() == null)
                .toList();

        for (Ticket t : ticketsVencidos) {
            t.setCumplioSlaResolucion(false);
            ticketRepository.save(t);
            log.warn("🔴 SLA VENCIDO: {}", t.getCodigo());
        }

        if (!ticketsVencidos.isEmpty()) {
            log.info("Tickets marcados como SLA vencido: {}", ticketsVencidos.size());
        }
    }

    /**
     * Verifica SLA de primera respuesta (cada 15 min).
     */
    @Scheduled(fixedRate = 900_000)
    @Transactional
    public void verificarSlaRespuesta() {
        log.debug("⏰ Verificando SLA de primera respuesta...");
        LocalDateTime ahora = LocalDateTime.now();

        List<Ticket> sinRespuesta = ticketRepository.findAll().stream()
                .filter(t -> t.getFechaLimiteRespuesta() != null)
                .filter(t -> t.getFechaPrimerRespuesta() == null)
                .filter(t -> t.getFechaLimiteRespuesta().isBefore(ahora))
                .filter(t -> t.getCumplioSlaRespuesta() == null)
                .toList();

        for (Ticket t : sinRespuesta) {
            t.setCumplioSlaRespuesta(false);
            ticketRepository.save(t);
        }
    }
}
