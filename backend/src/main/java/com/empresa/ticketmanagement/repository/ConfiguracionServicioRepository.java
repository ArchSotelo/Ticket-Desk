package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.ConfiguracionServicio;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ConfiguracionServicioRepository extends JpaRepository<ConfiguracionServicio, Long> {
    Optional<ConfiguracionServicio> findFirstByOrderByIdAsc();
}
