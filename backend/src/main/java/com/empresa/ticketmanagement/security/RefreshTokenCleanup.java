package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class RefreshTokenCleanup {
    private final RefreshTokenRepository tokens;

    // Retener toda la vida de la sesión y un día adicional para detectar reutilización.
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 3_600_000)
    @Transactional
    public void removeExpired() { tokens.deleteExpiredBefore(LocalDateTime.now().minusDays(1)); }
}
