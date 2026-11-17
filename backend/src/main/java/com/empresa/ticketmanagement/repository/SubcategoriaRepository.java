package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Subcategoria;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SubcategoriaRepository extends JpaRepository<Subcategoria, Long> {
    List<Subcategoria> findByCategoriaIdAndActivaTrue(Long categoriaId);
}
