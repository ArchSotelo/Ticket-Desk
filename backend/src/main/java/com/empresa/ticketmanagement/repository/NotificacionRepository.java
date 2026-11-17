package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Notificacion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificacionRepository extends JpaRepository<Notificacion, Long> {
    List<Notificacion> findByUsuarioIdOrderByFechaCreacionDesc(Long usuarioId);
    long countByUsuarioIdAndLeidoFalse(Long usuarioId);
    List<Notificacion> findByUsuarioIdAndLeidoFalse(Long usuarioId);
}
