package com.empresa.ticketmanagement.audit;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.AuditoriaDTO;
import com.empresa.ticketmanagement.entity.Auditoria;
import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.AuditoriaRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AuditQueryService {
    private final AuditoriaRepository audits;
    private final UsuarioRepository users;

    @Transactional(readOnly = true)
    public Page<AuditoriaDTO> listar(int page, int size, String busqueda, String grupo,
                                    String accion, LocalDate desde, LocalDate hasta, String orden) {
        if (desde != null && hasta != null && desde.isAfter(hasta))
            throw new BusinessException("La fecha desde no puede ser posterior a la fecha hasta.");
        if (!Set.of("", "accesos", "actividad").contains(grupo))
            throw new BusinessException("Grupo de auditoría inválido.");
        if (!Set.of("desc", "asc").contains(orden))
            throw new BusinessException("Orden de auditoría inválido.");
        String search = busqueda == null ? "" : busqueda.trim().toLowerCase(Locale.ROOT);
        Specification<Auditoria> filters = (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();
            var access = cb.or(cb.upper(root.get("modulo")).in("AUTH", "AUTENTICACION"),
                    cb.like(cb.upper(root.get("accion")), "LOGIN\\_%", '\\'),
                    cb.like(cb.upper(root.get("accion")), "LOGOUT%"));
            if ("accesos".equals(grupo)) predicates.add(access);
            if ("actividad".equals(grupo)) predicates.add(cb.not(access));
            if (!accion.isBlank()) predicates.add(cb.equal(root.get("accion"), accion));
            if (desde != null) predicates.add(cb.greaterThanOrEqualTo(root.get("fechaRegistro"), desde.atStartOfDay()));
            if (hasta != null) predicates.add(cb.lessThan(root.get("fechaRegistro"), hasta.plusDays(1).atStartOfDay()));
            if (!search.isEmpty()) {
                String pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                var userIds = query.subquery(Long.class);
                var user = userIds.from(Usuario.class);
                var fullName = cb.concat(cb.concat(user.get("nombres"), " "), user.get("apellidos"));
                userIds.select(user.get("id")).where(cb.or(cb.like(cb.lower(fullName), pattern, '\\'),
                        cb.like(cb.lower(user.get("username")), pattern, '\\')));
                var match = cb.or(cb.like(cb.lower(root.get("ipOrigen")), pattern, '\\'),
                        cb.like(cb.lower(root.get("accion")), pattern, '\\'),
                        cb.like(cb.lower(root.get("modulo")), pattern, '\\'),
                        cb.like(cb.lower(root.get("detalle").as(String.class)), pattern, '\\'), root.get("usuarioId").in(userIds));
                if ("no identificado".contains(search)) match = cb.or(match, cb.isNull(root.get("usuarioId")));
                predicates.add(match);
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        var direction = "asc".equals(orden) ? Sort.Direction.ASC : Sort.Direction.DESC;
        var result = audits.findAll(filters, PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)),
                Sort.by(direction, "fechaRegistro", "id")));
        var ids = result.getContent().stream().map(Auditoria::getUsuarioId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        var names = users.findAllById(ids).stream().collect(Collectors.toMap(Usuario::getId, Usuario::getNombreCompleto));
        return result.map(a -> AuditoriaDTO.builder().id(a.getId()).usuarioId(a.getUsuarioId())
                .usuarioNombre(a.getUsuarioId() == null ? "No identificado" : names.getOrDefault(a.getUsuarioId(), "Usuario no disponible"))
                .ipOrigen(a.getIpOrigen()).userAgent(a.getUserAgent()).accion(a.getAccion()).modulo(a.getModulo())
                .detalle(a.getDetalle()).fechaRegistro(a.getFechaRegistro()).build());
    }
}
