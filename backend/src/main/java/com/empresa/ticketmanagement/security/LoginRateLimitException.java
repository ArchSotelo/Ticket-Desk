package com.empresa.ticketmanagement.security;

import org.springframework.security.core.AuthenticationException;

public final class LoginRateLimitException extends AuthenticationException {
    private final long retryAfter;
    public LoginRateLimitException(long retryAfter) {
        super("Demasiados intentos de acceso. Espera antes de volver a intentarlo.");
        this.retryAfter = retryAfter;
    }
    public long retryAfter() { return retryAfter; }
}
