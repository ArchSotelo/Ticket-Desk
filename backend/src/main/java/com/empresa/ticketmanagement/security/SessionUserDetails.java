package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.entity.Usuario;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;
import java.util.Collection;
import java.time.LocalDateTime;

/** Estado de seguridad leído desde la base en cada petición; no procede de claims de permisos. */
public final class SessionUserDetails extends User {
    private final long sessionVersion;
    private final boolean passwordChangeRequired;

    public SessionUserDetails(Usuario user, Collection<? extends GrantedAuthority> authorities) {
        super(user.getUsername(), user.getPasswordHash(),
                "ACTIVO".equalsIgnoreCase(user.getEstado()) && !ApplicationRoles.names(user).isEmpty(),
                true, true, user.getBloqueadoHasta() == null
                        || !user.getBloqueadoHasta().isAfter(LocalDateTime.now()), authorities);
        this.sessionVersion = user.getVersionSesion();
        this.passwordChangeRequired = Boolean.TRUE.equals(user.getRequiereCambioPassword());
    }

    public long sessionVersion() { return sessionVersion; }
    public boolean passwordChangeRequired() { return passwordChangeRequired; }
}
