package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.ServicioAdjunto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ServicioAdjuntoRepository extends JpaRepository<ServicioAdjunto, Long> {
    List<ServicioAdjunto> findByServicioIdAndActivoTrueOrderByFechaCreacionDesc(Long servicioId);
}
