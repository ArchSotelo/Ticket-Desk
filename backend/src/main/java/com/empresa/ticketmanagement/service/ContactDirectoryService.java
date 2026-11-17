package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ContactoDTO;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.security.ApplicationRoles;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ContactDirectoryService {
    private final UsuarioRepository users;

    @Transactional(readOnly = true)
    public Page<ContactoDTO> listar(String role, Pageable page) {
        if (!Set.of("ROLE_CLIENTE", "ROLE_TECNICO").contains(role))
            throw new BusinessException("El directorio admite clientes o técnicos.");
        Specification<Usuario> filter = (root, query, cb) -> {
            query.distinct(true);
            var roles = root.join("roles");
            return cb.and(cb.equal(roles.get("nombre"), role), cb.isTrue(roles.get("activo")));
        };
        return users.findAll(filter, page).map(this::toDTO);
    }

    @Transactional(readOnly = true)
    public ContactoDTO obtenerCliente(Long id) {
        Usuario user = users.findById(id).orElseThrow(() -> new AccessDeniedException("Contacto no disponible."));
        if (!ApplicationRoles.names(user).contains("ROLE_CLIENTE")) throw new AccessDeniedException("Contacto no disponible.");
        return toDTO(user);
    }

    private ContactoDTO toDTO(Usuario user) {
        return ContactoDTO.builder().id(user.getId()).username(user.getUsername()).nombres(user.getNombres())
                .apellidos(user.getApellidos()).email(user.getEmail()).telefono(user.getTelefono()).estado(user.getEstado())
                .empresaId(user.getEmpresa() == null ? null : user.getEmpresa().getId())
                .empresaNombre(user.getEmpresa() == null ? null : user.getEmpresa().getRazonSocial())
                .areaId(user.getArea() == null ? null : user.getArea().getId())
                .areaNombre(user.getArea() == null ? null : user.getArea().getNombre())
                .roles(ApplicationRoles.names(user).stream().filter(r -> Set.of("ROLE_CLIENTE", "ROLE_TECNICO").contains(r)).toList())
                .build();
    }
}
