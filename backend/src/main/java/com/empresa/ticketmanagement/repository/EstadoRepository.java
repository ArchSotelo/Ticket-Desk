package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Estado;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface EstadoRepository extends JpaRepository<Estado, Long> {
    Optional<Estado> findByCodigo(String codigo);
    Optional<Estado> findByEsInicialTrue();
}
