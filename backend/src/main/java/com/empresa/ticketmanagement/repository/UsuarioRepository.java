package com.empresa.ticketmanagement.repository;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import com.empresa.ticketmanagement.entity.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UsuarioRepository extends JpaRepository<Usuario, Long>, JpaSpecificationExecutor<Usuario> {
    Optional<Usuario> findByUsername(String username);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from Usuario u where u.username=:username")
    Optional<Usuario> lockByUsername(@Param("username") String username);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from Usuario u where u.id=:id")
    Optional<Usuario> lockById(@Param("id") Long id);
    Optional<Usuario> findByEmail(String email);
    List<Usuario> findDistinctByRolesNombre(String nombre);
    boolean existsByUsername(String username);
    boolean existsByEmail(String email);

    @Query("select u from Usuario u where u.estado='BLOQUEADO' or (u.estado='ACTIVO' and u.bloqueadoHasta > :now)")
    Page<Usuario> findBlockedAccounts(@Param("now") java.time.LocalDateTime now, Pageable pageable);
}
