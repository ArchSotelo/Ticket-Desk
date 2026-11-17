package com.empresa.ticketmanagement.audit;

import com.empresa.ticketmanagement.controller.AuthController;
import com.empresa.ticketmanagement.dto.AuthRequest;
import com.empresa.ticketmanagement.dto.AuthResponse;
import com.empresa.ticketmanagement.service.AuthService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.dao.DataAccessResourceFailureException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(OutputCaptureExtension.class)
class FailedLoginControllerTest {
    final AuthService service=mock(AuthService.class);
    final AuditService audit=mock(AuditService.class);
    final AuthController controller=new AuthController(service,audit,mock(com.empresa.ticketmanagement.security.LoginProtectionService.class));
    final AuthRequest credentials=new AuthRequest();
    final MockHttpServletRequest request=new MockHttpServletRequest();
    FailedLoginControllerTest() {credentials.setUsername("test-user");credentials.setPassword("test-only-password");}
    @Test void auditRunsOnlyAfterTheServiceHasReportedTheAuthenticationFailure() {
        var rejection=new BadCredentialsException("Bad credentials");when(service.login(credentials,request)).thenThrow(rejection);
        assertThatThrownBy(()->controller.login(credentials,request)).isSameAs(rejection);
        var order=inOrder(service,audit);order.verify(service).login(credentials,request);order.verify(audit).registrarLoginFallido("test-user",request);
        verifyNoMoreInteractions(audit);
    }
    @Test void anUnavailableAuditStoreDoesNotMaskTheOriginalFailureOrLogItsSensitiveMessage(CapturedOutput output) {
        var rejection=new BadCredentialsException("Bad credentials");when(service.login(credentials,request)).thenThrow(rejection);
        doThrow(new DataAccessResourceFailureException("test-only-sensitive-audit-message")).when(audit).registrarLoginFallido("test-user",request);
        assertThatThrownBy(()->controller.login(credentials,request)).isSameAs(rejection);
        assertThat(output.getAll()).contains("No se pudo registrar LOGIN_FALLIDO").doesNotContain("test-only-password","test-only-sensitive-audit-message");
    }
    @Test void aSuccessfulLoginDoesNotCreateAFailedLoginRecord() {
        when(service.login(credentials,request)).thenReturn(AuthResponse.builder().accessToken("test-token").build());
        assertThat(controller.login(credentials,request).getStatusCode().value()).isEqualTo(200);
        verifyNoInteractions(audit);
    }
}
