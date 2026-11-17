package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Comentario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ComentarioRepository extends JpaRepository<Comentario, Long> {
    List<Comentario> findByTicketIdOrderByFechaCreacionAsc(Long ticketId);
    Integer countByTicketId(Long ticketId);
}
