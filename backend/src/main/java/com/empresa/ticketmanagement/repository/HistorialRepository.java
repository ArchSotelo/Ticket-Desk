package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Historial;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HistorialRepository extends JpaRepository<Historial, Long> {
    List<Historial> findByTicketIdOrderByFechaCambioDesc(Long ticketId);
}
