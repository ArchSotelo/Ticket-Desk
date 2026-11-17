package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.repository.PoliticaAccesoRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class LoginProtectionService {
    private final UsuarioRepository users;
    private final Clock clock;
    private final SessionSecurityService sessions;
    private final PoliticaAccesoRepository policyRepository;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private record Window(Instant until, int attempts) {}
    @Value("${app.security.login.max-failures:5}") private int defaultMaxFailures;
    @Value("${app.security.login.lock-minutes:15}") private int defaultLockMinutes;
    @Value("${app.security.login.requests-per-minute:30}") private int defaultRequestsPerMinute;

    private record Policy(int maxFailures, int lockMinutes, int requestsPerMinute) {}

    private Policy policy() {
        return policyRepository.findById(1).map(saved -> new Policy(saved.getMaxIntentos(),
                saved.getDuracionBloqueoMinutos(), saved.getLimiteLoginPorMinuto()))
                .orElseGet(() -> new Policy(defaultMaxFailures, defaultLockMinutes, defaultRequestsPerMinute));
    }

    public void checkRate(HttpServletRequest request) {
        int requestsPerMinute = policy().requestsPerMinute();
        // Solo la dirección de transporte. No confiar en X-Forwarded-For suministrado por el cliente.
        String address = request == null || request.getRemoteAddr() == null ? "local" : request.getRemoteAddr();
        Instant now = clock.instant();
        synchronized (windows) {
            if (windows.size() >= 10_000) {
                windows.entrySet().removeIf(entry -> !entry.getValue().until().isAfter(now));
                if (!windows.containsKey(address) && windows.size() >= 10_000) throw new LoginRateLimitException(60);
            }
            Window window = windows.get(address);
            if (window == null || !window.until().isAfter(now)) window = new Window(now.plusSeconds(60), 0);
            if (window.attempts() >= Math.max(1, requestsPerMinute))
                throw new LoginRateLimitException(Math.max(1, Duration.between(now, window.until()).toSeconds() + 1));
            windows.put(address, new Window(window.until(), window.attempts() + 1));
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(String username) {
        Policy policy = policy();
        var account = sessions.lockByUsername(username);
        if (account.isEmpty()) return;
        var user = account.get();
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), ZoneId.systemDefault());
        if (!"ACTIVO".equalsIgnoreCase(user.getEstado())
                || (user.getBloqueadoHasta() != null && user.getBloqueadoHasta().isAfter(now))) return;
        int previous = user.getBloqueadoHasta() != null ? 0 : user.getIntentosFallidos();
        int failures = Math.min(Math.max(1, policy.maxFailures()), previous + 1);
        user.setIntentosFallidos(failures);
        if (failures >= Math.max(1, policy.maxFailures())) user.setBloqueadoHasta(now.plusMinutes(Math.max(1, policy.lockMinutes())));
        users.save(user);
    }
}
