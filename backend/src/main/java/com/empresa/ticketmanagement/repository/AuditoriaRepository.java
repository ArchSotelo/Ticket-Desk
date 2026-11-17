package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.Auditoria;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface AuditoriaRepository extends JpaRepository<Auditoria, Long>, JpaSpecificationExecutor<Auditoria> {
    Page<Auditoria> findAllByOrderByFechaRegistroDesc(Pageable pageable);
    Page<Auditoria> findByUsuarioIdOrderByFechaRegistroDesc(Long usuarioId, Pageable pageable);
    Page<Auditoria> findByModuloOrderByFechaRegistroDesc(String modulo, Pageable pageable);
}
