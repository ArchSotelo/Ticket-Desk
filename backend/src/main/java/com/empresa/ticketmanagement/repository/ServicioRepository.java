package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Servicio;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ServicioRepository extends JpaRepository<Servicio, Long> {
    List<Servicio> findAllByOrderByNombreAsc();
    List<Servicio> findByServicioAnteriorIdOrderByFechaCreacionDesc(Long servicioAnteriorId);
}
