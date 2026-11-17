package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Sla;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SlaRepository extends JpaRepository<Sla, Long> {
    Optional<Sla> findByPrioridadId(Long prioridadId);
}
