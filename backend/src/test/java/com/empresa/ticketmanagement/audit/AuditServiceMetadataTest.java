package com.empresa.ticketmanagement.audit;

import com.empresa.ticketmanagement.entity.Auditoria;
import com.empresa.ticketmanagement.repository.AuditoriaRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuditServiceMetadataTest {
    @Test void failedLoginCapturesOnlyTheAttemptedIdentityAndHttpMetadata() {
        var repository=mock(AuditoriaRepository.class);
        var request=new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For"," 203.0.113.20, 10.0.0.1");
        request.addHeader("User-Agent","test-browser");
        request.addHeader("Authorization","Bearer test-only-token");request.setParameter("password","test-only-password");
        new AuditService(repository).registrarLoginFallido("attempted-user",request);
        var event=ArgumentCaptor.forClass(Auditoria.class);verify(repository).save(event.capture());
        assertThat(event.getValue().getAccion()).isEqualTo("LOGIN_FALLIDO");
        assertThat(event.getValue().getModulo()).isEqualTo("AUTENTICACION");
        assertThat(event.getValue().getUsuarioId()).isNull();
        assertThat(event.getValue().getDetalle()).isEqualTo("Intento fallido para el usuario: attempted-user")
                .doesNotContain("test-only-password","test-only-token");
        assertThat(event.getValue().getIpOrigen()).isEqualTo("203.0.113.20");
        assertThat(event.getValue().getUserAgent()).isEqualTo("test-browser");
        assertThat(event.getValue().getFechaRegistro()).isNotNull();
    }
    @Test void oversizedMetadataFitsTheColumnsWithoutSplittingUnicodeCharacters() {
        var repository=mock(AuditoriaRepository.class);
        var request=new MockHttpServletRequest();request.addHeader("X-Forwarded-For","x".repeat(200));
        request.addHeader("User-Agent","A".repeat(254)+"\ud83d\ude00");
        new AuditService(repository).registrarLoginFallido("u".repeat(49)+"\ud83d\ude00",request);
        var event=ArgumentCaptor.forClass(Auditoria.class);verify(repository).save(event.capture());
        assertThat(event.getValue().getIpOrigen()).hasSize(50);
        assertThat(event.getValue().getUserAgent()).isEqualTo("A".repeat(254));
        assertThat(event.getValue().getDetalle()).isEqualTo("Intento fallido para el usuario: "+"u".repeat(49));
    }
    @Test void missingRequestUsesSystemMetadata() {
        var repository=mock(AuditoriaRepository.class);
        new AuditService(repository).registrarLoginFallido("test",null);
        var event=ArgumentCaptor.forClass(Auditoria.class);verify(repository).save(event.capture());
        assertThat(event.getValue().getIpOrigen()).isEqualTo("SISTEMA");
        assertThat(event.getValue().getUserAgent()).isEqualTo("N/A");
    }
}
