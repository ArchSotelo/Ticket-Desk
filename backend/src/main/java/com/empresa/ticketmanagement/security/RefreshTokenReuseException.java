package com.empresa.ticketmanagement.security;

import org.springframework.security.core.AuthenticationException;

/** Debe confirmar la revocación antes de devolver 401. */
public final class RefreshTokenReuseException extends AuthenticationException {
    public RefreshTokenReuseException() { super("La sesión ya no es válida."); }
}
