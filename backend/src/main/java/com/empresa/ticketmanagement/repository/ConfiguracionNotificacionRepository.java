package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.ConfiguracionNotificacion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ConfiguracionNotificacionRepository extends JpaRepository<ConfiguracionNotificacion, Long> {
    Optional<ConfiguracionNotificacion> findFirstByOrderByIdAsc();
}
