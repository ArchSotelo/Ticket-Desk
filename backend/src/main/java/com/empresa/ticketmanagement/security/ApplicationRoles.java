package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.entity.Rol;
import java.util.Set;
import java.util.List;
import com.empresa.ticketmanagement.entity.Usuario;

/** Catálogo de roles admitidos; sus permisos se obtienen de roles_permisos. */
public final class ApplicationRoles {
    public static final Set<String> SUPPORTED = Set.of("ROLE_CLIENTE", "ROLE_TECNICO", "ROLE_SUPERVISOR", "ROLE_ADMIN");
    private ApplicationRoles() {}
    public static boolean isActive(Rol role) {
        return role != null && Boolean.TRUE.equals(role.getActivo()) && SUPPORTED.contains(role.getNombre());
    }
    public static List<String> names(Usuario user) {
        return user.getRoles().stream().filter(ApplicationRoles::isActive).map(Rol::getNombre).distinct().sorted().toList();
    }
    public static List<String> permissions(Usuario user) {
        return user.getRoles().stream().filter(ApplicationRoles::isActive).flatMap(r -> r.getPermisos().stream())
                .map(p -> p.getCodigo()).distinct().sorted().toList();
    }
}

