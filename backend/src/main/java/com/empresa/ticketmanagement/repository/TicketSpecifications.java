package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Ticket;
import jakarta.persistence.criteria.*;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Filtros aplicados por MySQL antes de paginar, sin cargar todo el historial de tickets. */
public final class TicketSpecifications {
    private TicketSpecifications() {}

    public static Specification<Ticket> filtered(String estado, String prioridad, Long categoriaId,
            String busqueda, LocalDate desde, LocalDate hasta, Long clienteId, boolean personal) {
        return (root, query, cb) -> {
            // Solo relaciones de un registro: no alteran el límite de la página.
            if (query != null && Ticket.class.equals(query.getResultType())) {
                for (String relation : List.of("cliente", "tecnico", "empresa", "area", "categoria",
                        "subcategoria", "prioridad", "estado", "sla")) root.fetch(relation, JoinType.LEFT);
            }
            List<Predicate> predicates = new ArrayList<>();
            if (clienteId != null) predicates.add(cb.equal(root.get("cliente").get("id"), clienteId));
            if (estado != null && !estado.isBlank()) predicates.add(cb.equal(
                    cb.lower(root.join("estado", JoinType.LEFT).get("codigo")), estado.toLowerCase(Locale.ROOT)));
            if (prioridad != null && !prioridad.isBlank()) predicates.add(cb.equal(
                    cb.lower(root.join("prioridad", JoinType.LEFT).get("nombre")), prioridad.toLowerCase(Locale.ROOT)));
            if (categoriaId != null) predicates.add(cb.equal(root.get("categoria").get("id"), categoriaId));
            if (busqueda != null && !busqueda.isBlank()) {
                String search = "%" + busqueda.trim().toLowerCase(Locale.ROOT)
                        .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                List<Predicate> matches = new ArrayList<>();
                matches.add(contains(cb, root.get("codigo"), search));
                matches.add(contains(cb, root.get("titulo"), search));
                // La descripción es LONGTEXT/CLOB: convertir a texto antes de aplicar lower.
                matches.add(contains(cb, root.get("descripcion").as(String.class), search));
                matches.add(contains(cb, root.join("categoria", JoinType.LEFT).get("nombre"), search));
                matches.add(contains(cb, root.join("prioridad", JoinType.LEFT).get("nombre"), search));
                Join<Object, Object> person = root.join(personal ? "tecnico" : "cliente", JoinType.LEFT);
                Expression<String> name = cb.concat(cb.concat(cb.coalesce(person.get("nombres"), ""), " "),
                        cb.coalesce(person.get("apellidos"), ""));
                matches.add(contains(cb, name, search));
                if (personal) matches.add(contains(cb, root.join("estado", JoinType.LEFT).get("nombre"), search));
                predicates.add(cb.or(matches.toArray(Predicate[]::new)));
            }
            if (desde != null) predicates.add(cb.greaterThanOrEqualTo(root.get("fechaCreacion"), desde.atStartOfDay()));
            if (hasta != null) {
                if (hasta.equals(LocalDate.of(9999, 12, 31))) predicates.add(cb.lessThanOrEqualTo(
                        root.get("fechaCreacion"), hasta.atTime(23, 59, 59, 999_999_000)));
                else predicates.add(cb.lessThan(root.get("fechaCreacion"), hasta.plusDays(1).atStartOfDay()));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static Predicate contains(CriteriaBuilder cb, Expression<String> field, String search) {
        return cb.like(cb.lower(field), search, '\\');
    }
}
