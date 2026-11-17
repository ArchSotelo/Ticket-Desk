package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.CategoriaServicio;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CategoriaServicioRepository extends JpaRepository<CategoriaServicio, Long> {
    List<CategoriaServicio> findAllByOrderByNombreAsc();
    boolean existsByNombreIgnoreCase(String nombre);
}
