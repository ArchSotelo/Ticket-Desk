package com.empresa.ticketmanagement.audit;

import com.empresa.ticketmanagement.repository.UsuarioRepository;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuditAspectFailureTest {
    final AuditService audit=mock(AuditService.class);
    final UsuarioRepository users=mock(UsuarioRepository.class);
    final AuditAspect aspect=new AuditAspect(audit,users);
    ProceedingJoinPoint invocation() {
        SecurityContextHolder.clearContext();
        var request=new MockHttpServletRequest("POST","/auth/login");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var invocation=mock(ProceedingJoinPoint.class);when(invocation.getTarget()).thenReturn(new Object());return invocation;
    }
    @AfterEach void cleanup() {RequestContextHolder.resetRequestAttributes();SecurityContextHolder.clearContext();}
    @Test void aGenericAuditFailureDoesNotReplaceTheAuthenticationException() throws Throwable {
        var invocation=invocation();var rejection=new BadCredentialsException("Bad credentials");
        when(invocation.proceed()).thenThrow(rejection);
        doThrow(new DataAccessResourceFailureException("test-only-storage-failure")).when(audit).registrar(isNull(),anyString(),anyString(),anyString(),any());
        assertThatThrownBy(()->aspect.auditarOperacion(invocation)).isSameAs(rejection);
    }
    @Test void anAuditFailureDoesNotTurnASuccessfulOperationIntoAnError() throws Throwable {
        var invocation=invocation();Object result=new Object();when(invocation.proceed()).thenReturn(result);
        doThrow(new DataAccessResourceFailureException("test-only-storage-failure")).when(audit).registrar(isNull(),anyString(),anyString(),anyString(),any());
        assertThat(aspect.auditarOperacion(invocation)).isSameAs(result);
        verify(audit).registrar(isNull(),eq("POST"),anyString(),anyString(),any());verifyNoMoreInteractions(audit);
    }
    @Test void anIdentityLookupFailureDoesNotPreventTheBusinessOperation() throws Throwable {
        var invocation=invocation();SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test-user",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        when(users.findByUsername("test-user")).thenThrow(new DataAccessResourceFailureException("test-only-storage-failure"));
        when(invocation.proceed()).thenReturn("result");
        assertThat(aspect.auditarOperacion(invocation)).isEqualTo("result");
        verify(audit).registrar(isNull(),eq("POST"),anyString(),anyString(),any());
    }
}
