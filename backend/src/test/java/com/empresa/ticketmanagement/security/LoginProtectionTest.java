package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.repository.PoliticaAccesoRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LoginProtectionTest {
    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-11-03T12:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    @Test void transportAddressIsLimitedDespiteDifferentSpoofedForwardingHeadersAndResetsAfterTheWindow() {
        var clock = new MutableClock();
        var policies = mock(PoliticaAccesoRepository.class);
        when(policies.findById(1)).thenReturn(java.util.Optional.empty());
        var service = new LoginProtectionService(mock(UsuarioRepository.class), clock, mock(SessionSecurityService.class), policies);
        ReflectionTestUtils.setField(service, "defaultRequestsPerMinute", 30);
        var request = new MockHttpServletRequest(); request.setRemoteAddr("192.0.2.1");
        for (int i = 0; i < 30; i++) { request.addHeader("X-Forwarded-For", "203.0.113." + i); service.checkRate(request); }
        assertThatThrownBy(() -> service.checkRate(request)).isInstanceOf(LoginRateLimitException.class)
                .satisfies(error -> assertThat(((LoginRateLimitException) error).retryAfter()).isBetween(1L, 61L));
        var other = new MockHttpServletRequest(); other.setRemoteAddr("192.0.2.2"); service.checkRate(other);
        clock.now = clock.now.plusSeconds(61);
        service.checkRate(request);
    }
    @Test void rateLimitResponseHas429AndRetryAfter() {
        var response = new com.empresa.ticketmanagement.exception.GlobalExceptionHandler().handleLoginRate(new LoginRateLimitException(42));
        assertThat(response.getStatusCode().value()).isEqualTo(429);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("42");
        assertThat(response.getBody().isSuccess()).isFalse();
    }
}
