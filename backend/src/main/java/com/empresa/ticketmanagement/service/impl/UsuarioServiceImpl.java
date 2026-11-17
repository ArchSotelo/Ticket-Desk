package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.security.SessionSecurityService;

import com.empresa.ticketmanagement.dto.UsuarioCreateDTO;
import com.empresa.ticketmanagement.dto.UsuarioProfileUpdateDTO;
import com.empresa.ticketmanagement.dto.UsuarioResponseDTO;
import com.empresa.ticketmanagement.dto.UsuarioUpdateDTO;
import com.empresa.ticketmanagement.entity.Area;
import com.empresa.ticketmanagement.entity.Empresa;
import com.empresa.ticketmanagement.entity.Rol;
import com.empresa.ticketmanagement.security.ApplicationRoles;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.AreaRepository;
import com.empresa.ticketmanagement.repository.EmpresaRepository;
import com.empresa.ticketmanagement.repository.RolRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.service.UsuarioService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.Predicate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.ArrayList;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class UsuarioServiceImpl implements UsuarioService {

    private final UsuarioRepository usuarioRepository;
    private final RolRepository rolRepository;
    private final EmpresaRepository empresaRepository;
    private final AreaRepository areaRepository;
    private final PasswordEncoder passwordEncoder;
    private final SessionSecurityService sessionSecurity;

    @Override
    @Transactional
    public UsuarioResponseDTO crearUsuario(UsuarioCreateDTO dto) {
        if (usuarioRepository.existsByUsername(dto.getUsername()))
            throw new BusinessException("El username '" + dto.getUsername() + "' ya está en uso.");
        if (usuarioRepository.existsByEmail(dto.getEmail()))
            throw new BusinessException("El email '" + dto.getEmail() + "' ya está registrado.");

        Empresa empresa = dto.getEmpresaId() != null
                ? empresaRepository.findById(dto.getEmpresaId()).orElse(null) : null;
        Area area = dto.getAreaId() != null
                ? areaRepository.findById(dto.getAreaId()).orElse(null) : null;

        Set<Rol> roles = resolveRoles(dto.getRoles());

        Usuario usuario = Usuario.builder()
                .username(dto.getUsername())
                .passwordHash(passwordEncoder.encode(dto.getPassword()))
                .nombres(dto.getNombres())
                .apellidos(dto.getApellidos())
                .email(dto.getEmail())
                .telefono(dto.getTelefono())
                .empresa(empresa)
                .area(area)
                .cargo(dto.getCargo())
                .estado("ACTIVO")
                .requiereCambioPassword(dto.getRequiereCambioPassword() == null
                        || dto.getRequiereCambioPassword())
                .roles(roles)
                .fechaCreacion(LocalDateTime.now())
                .build();

        return mapToDTO(usuarioRepository.save(usuario));
    }

    @Override
    @Transactional(readOnly = true)
    public UsuarioResponseDTO obtenerPorId(Long id) {
        return mapToDTO(usuarioRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado: " + id)));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<UsuarioResponseDTO> listar(String busqueda, Pageable pageable) {
        return listar(busqueda, null, null, null, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<UsuarioResponseDTO> listar(String busqueda, String rol, Long empresaId, String estado, Pageable pageable) {
        String search = busqueda == null ? "" : busqueda.trim().toLowerCase(Locale.ROOT);
        String role = rol == null ? "" : rol.trim().toUpperCase(Locale.ROOT);
        String status = estado == null ? "" : estado.trim().toUpperCase(Locale.ROOT);
        if (!status.isEmpty() && !Set.of("ACTIVO", "INACTIVO", "BLOQUEADO").contains(status))
            throw new BusinessException("Estado de usuario inválido.");
        Specification<Usuario> filters = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (!search.isEmpty()) {
                // Los caracteres de LIKE se buscan literalmente, no como comodines.
                String pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                var fullName = cb.concat(cb.concat(root.get("nombres"), " "), root.get("apellidos"));
                predicates.add(cb.or(cb.like(cb.lower(fullName), pattern, '\\'),
                        cb.like(cb.lower(root.get("email")), pattern, '\\'),
                        cb.like(cb.lower(root.get("username")), pattern, '\\')));
            }
            if (!role.isEmpty()) {
                query.distinct(true);
                predicates.add(cb.equal(root.join("roles").get("nombre"), role));
            }
            if (empresaId != null) predicates.add(cb.equal(root.get("empresa").get("id"), empresaId));
            if (!status.isEmpty()) predicates.add(cb.equal(root.get("estado"), status));
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        // Filtrar antes de paginar mantiene resultados y contadores consistentes.
        return usuarioRepository.findAll(filters, pageable).map(this::mapToDTO);
    }

    @Override
    @Transactional
    public UsuarioResponseDTO actualizar(Long id, UsuarioUpdateDTO dto) {
        Usuario usuario = sessionSecurity.lockById(id)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado: " + id));

        if (dto.getNombres() != null) usuario.setNombres(dto.getNombres());
        if (dto.getApellidos() != null) usuario.setApellidos(dto.getApellidos());
        if (dto.getEmail() != null) usuario.setEmail(dto.getEmail());
        if (dto.getTelefono() != null) usuario.setTelefono(dto.getTelefono());
        if (dto.getCargo() != null) usuario.setCargo(dto.getCargo());
        if (dto.getEmpresaId() != null) {
            Empresa empresa = empresaRepository.findById(dto.getEmpresaId())
                    .orElseThrow(() -> new BusinessException("Empresa no encontrada: " + dto.getEmpresaId()));
            usuario.setEmpresa(empresa);
        } else {
            usuario.setEmpresa(null);
        }
        if (dto.getAreaId() != null) {
            Area area = areaRepository.findById(dto.getAreaId())
                    .orElseThrow(() -> new BusinessException("Área no encontrada: " + dto.getAreaId()));
            usuario.setArea(area);
        } else {
            usuario.setArea(null);
        }
        if (dto.getRoles() != null) {
            usuario.setRoles(resolveRoles(dto.getRoles()));
        }

        if (dto.getPassword() != null && !dto.getPassword().isBlank()) {
            usuario.setPasswordHash(passwordEncoder.encode(dto.getPassword()));
            usuario.setRequiereCambioPassword(true);
            sessionSecurity.invalidate(usuario);
        }
        usuario.setFechaModificacion(LocalDateTime.now());

        return mapToDTO(usuarioRepository.save(usuario));
    }

    @Override
    @Transactional
    public UsuarioResponseDTO actualizarPerfil(String username, UsuarioProfileUpdateDTO dto) {
        Usuario usuario = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado: " + username));

        boolean emailCambiado = dto.getEmail() != null && !dto.getEmail().equalsIgnoreCase(usuario.getEmail());
        if (emailCambiado && usuarioRepository.existsByEmail(dto.getEmail())) {
            throw new BusinessException("El email '" + dto.getEmail() + "' ya está registrado.");
        }

        if (dto.getNombres() != null) usuario.setNombres(dto.getNombres());
        if (dto.getApellidos() != null) usuario.setApellidos(dto.getApellidos());
        if (dto.getEmail() != null) usuario.setEmail(dto.getEmail());
        if (dto.getTelefono() != null) usuario.setTelefono(dto.getTelefono());
        if (dto.getCargo() != null) usuario.setCargo(dto.getCargo());
        usuario.setFechaModificacion(LocalDateTime.now());

        return mapToDTO(usuarioRepository.save(usuario));
    }

    @Override
    @Transactional
    public void cambiarPassword(String username, String currentPassword, String newPassword) {
        Usuario usuario = sessionSecurity.lockByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado."));
        if (currentPassword == null || !passwordEncoder.matches(currentPassword, usuario.getPasswordHash())) {
            throw new BusinessException("La contraseña actual es incorrecta.");
        }
        if (newPassword == null || newPassword.isBlank() || newPassword.length() < 8
                || newPassword.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new BusinessException("La nueva contraseña debe tener al menos 8 caracteres y un máximo de 72 bytes.");
        }
        if (passwordEncoder.matches(newPassword, usuario.getPasswordHash())) {
            throw new BusinessException("La nueva contraseña debe ser diferente de la actual.");
        }
        usuario.setPasswordHash(passwordEncoder.encode(newPassword));
        usuario.setRequiereCambioPassword(false);
        sessionSecurity.invalidate(usuario);
        usuario.setFechaModificacion(LocalDateTime.now());
        usuarioRepository.save(usuario);
    }

    @Override
    @Transactional
    public void cambiarEstado(Long id, String estado) {
        Usuario usuario = sessionSecurity.lockById(id)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado: " + id));
        if (!Set.of("ACTIVO", "INACTIVO", "BLOQUEADO").contains(estado))
            throw new BusinessException("Estado de usuario inválido.");
        usuario.setEstado(estado);
        if (!"ACTIVO".equals(estado)) sessionSecurity.invalidate(usuario);
        usuarioRepository.save(usuario);
    }


    @Override
    @Transactional(readOnly = true)
    public UsuarioResponseDTO obtenerPorUsername(String username) {
        return mapToDTO(usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado: " + username)));
    }

    private Set<Rol> resolveRoles(List<String> requested) {
        List<String> names = requested == null || requested.isEmpty() ? List.of("ROLE_CLIENTE") : requested;
        Set<Rol> result = new HashSet<>();
        for (String name : names) {
            if (!ApplicationRoles.SUPPORTED.contains(name == null ? "" : name))
                throw new BusinessException("Rol no permitido. Usa CLIENTE, TECNICO, SUPERVISOR o ADMIN.");
            result.add(rolRepository.findByNombre(name).filter(ApplicationRoles::isActive)
                    .orElseThrow(() -> new BusinessException("El rol solicitado no está disponible.")));
        }
        return result;
    }

    private UsuarioResponseDTO mapToDTO(Usuario u) {
        return UsuarioResponseDTO.builder()
                .id(u.getId())
                .username(u.getUsername())
                .nombres(u.getNombres())
                .apellidos(u.getApellidos())
                .email(u.getEmail())
                .telefono(u.getTelefono())
                .empresaId(u.getEmpresa() != null ? u.getEmpresa().getId() : null)
                .empresaNombre(u.getEmpresa() != null ? u.getEmpresa().getRazonSocial() : null)
                .areaId(u.getArea() != null ? u.getArea().getId() : null)
                .areaNombre(u.getArea() != null ? u.getArea().getNombre() : null)
                .cargo(u.getCargo())
                .estado(u.getEstado())
                .requiereCambioPassword(u.getRequiereCambioPassword())
                .fechaUltimoAcceso(u.getFechaUltimoAcceso())
                .fechaCreacion(u.getFechaCreacion())
                .roles(ApplicationRoles.names(u))
                .permissions(ApplicationRoles.permissions(u))
                .build();
    }
}
