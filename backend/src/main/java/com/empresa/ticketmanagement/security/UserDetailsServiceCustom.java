package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserDetailsServiceCustom implements UserDetailsService {

    private final UsuarioRepository usuarioRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Usuario usuario = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado con username: " + username));

        List<SimpleGrantedAuthority> authorities = new ArrayList<>();
        var activeRoles = usuario.getRoles().stream().filter(ApplicationRoles::isActive).toList();
        activeRoles.forEach(rol -> {
            authorities.add(new SimpleGrantedAuthority(rol.getNombre()));
            rol.getPermisos().forEach(permiso -> 
                authorities.add(new SimpleGrantedAuthority(permiso.getCodigo()))
            );
        });

        return new SessionUserDetails(usuario, authorities);
    }
}
