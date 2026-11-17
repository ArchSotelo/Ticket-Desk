package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Ticket;
import com.empresa.ticketmanagement.dto.KanbanTechnicianOptionDTO;
import com.empresa.ticketmanagement.dto.KanbanTicketDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TicketRepository extends JpaRepository<Ticket, Long>, JpaSpecificationExecutor<Ticket> {
    Optional<Ticket> findByCodigo(String codigo);
    Optional<Ticket> findByIdempotencyKey(String idempotencyKey);
    Page<Ticket> findByClienteId(Long clienteId, Pageable pageable);
    List<Ticket> findByClienteId(Long clienteId, Sort sort);
    Page<Ticket> findByTecnicoId(Long tecnicoId, Pageable pageable);

    @Query("""
        SELECT new com.empresa.ticketmanagement.dto.KanbanTicketDTO(
            t.id, t.codigo, t.titulo,
            CONCAT(c.nombres, ' ', c.apellidos),
            tecnico.id,
            CASE WHEN tecnico.id IS NULL THEN 'Sin Asignar'
                 ELSE CONCAT(tecnico.nombres, ' ', tecnico.apellidos) END,
            prioridad.nombre, estado.codigo,
            (SELECT COUNT(a.id) FROM TicketAttachment a WHERE a.ticket.id = t.id AND a.activo = true))
        FROM Ticket t
        JOIN t.cliente c
        LEFT JOIN t.tecnico tecnico
        JOIN t.prioridad prioridad
        JOIN t.estado estado
        WHERE (:clienteId IS NULL OR c.id = :clienteId)
          AND estado.codigo IN :estados
          AND (:prioridadFiltro IS NULL OR LOWER(prioridad.nombre) = :prioridadFiltro)
          AND (:busqueda IS NULL OR LOWER(t.codigo) LIKE :busqueda ESCAPE '$'
               OR LOWER(t.titulo) LIKE :busqueda ESCAPE '$'
               OR LOWER(CONCAT(CONCAT(c.nombres, ' '), c.apellidos)) LIKE :busqueda ESCAPE '$')
          AND (:filtrarTecnico = false OR
               (:sinAsignar = true AND tecnico.id IS NULL) OR
               (:sinAsignar = false AND tecnico.id = :tecnicoId))
        ORDER BY COALESCE(t.fechaModificacion, t.fechaCreacion) DESC, t.id DESC
        """)
    List<KanbanTicketDTO> buscarTarjetasKanban(
            @Param("clienteId") Long clienteId,
            @Param("estados") List<String> estados,
            @Param("prioridadFiltro") String prioridadFiltro,
            @Param("busqueda") String busqueda,
            @Param("filtrarTecnico") boolean filtrarTecnico,
            @Param("sinAsignar") boolean sinAsignar,
            @Param("tecnicoId") Long tecnicoId,
            Pageable pageable);

    @Query("""
        SELECT estado.codigo, COUNT(t.id)
        FROM Ticket t
        JOIN t.cliente c
        LEFT JOIN t.tecnico tecnico
        JOIN t.prioridad prioridad
        JOIN t.estado estado
        WHERE (:clienteId IS NULL OR c.id = :clienteId)
          AND estado.codigo IN :estados
          AND (:prioridadFiltro IS NULL OR LOWER(prioridad.nombre) = :prioridadFiltro)
          AND (:busqueda IS NULL OR LOWER(t.codigo) LIKE :busqueda ESCAPE '$'
               OR LOWER(t.titulo) LIKE :busqueda ESCAPE '$'
               OR LOWER(CONCAT(CONCAT(c.nombres, ' '), c.apellidos)) LIKE :busqueda ESCAPE '$')
          AND (:filtrarTecnico = false OR
               (:sinAsignar = true AND tecnico.id IS NULL) OR
               (:sinAsignar = false AND tecnico.id = :tecnicoId))
        GROUP BY estado.codigo
        """)
    List<Object[]> contarEstadosKanban(
            @Param("clienteId") Long clienteId,
            @Param("estados") List<String> estados,
            @Param("prioridadFiltro") String prioridadFiltro,
            @Param("busqueda") String busqueda,
            @Param("filtrarTecnico") boolean filtrarTecnico,
            @Param("sinAsignar") boolean sinAsignar,
            @Param("tecnicoId") Long tecnicoId);

    @Query("SELECT DISTINCT p.nombre FROM Ticket t JOIN t.prioridad p " +
            "WHERE (:clienteId IS NULL OR t.cliente.id = :clienteId) ORDER BY p.nombre")
    List<String> opcionesPrioridadKanban(@Param("clienteId") Long clienteId);

    @Query("SELECT DISTINCT new com.empresa.ticketmanagement.dto.KanbanTechnicianOptionDTO(" +
            "tecnico.id, CONCAT(tecnico.nombres, ' ', tecnico.apellidos)) " +
            "FROM Ticket t JOIN t.tecnico tecnico " +
            "WHERE (:clienteId IS NULL OR t.cliente.id = :clienteId)")
    List<KanbanTechnicianOptionDTO> opcionesTecnicoKanban(@Param("clienteId") Long clienteId);
    
    @Query("SELECT COUNT(t) FROM Ticket t WHERE t.estado.codigo = :codigoEstado")
    Long countByEstadoCodigo(@Param("codigoEstado") String codigoEstado);

    @Query("SELECT COUNT(t) FROM Ticket t WHERE t.cumplioSlaResolucion = false")
    Long countTicketsVencidosSla();

    @Query("SELECT t.estado.nombre, COUNT(t) FROM Ticket t GROUP BY t.estado.nombre")
    List<Object[]> countTicketsGroupByEstado();

    @Query("SELECT t.prioridad.nombre, COUNT(t) FROM Ticket t GROUP BY t.prioridad.nombre")
    List<Object[]> countTicketsGroupByPrioridad();
}
