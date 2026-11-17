package com.empresa.ticketmanagement.repository;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;

import com.empresa.ticketmanagement.entity.RefreshToken;
import com.empresa.ticketmanagement.entity.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByToken(String token);
    @Query("select r.usuario.id from RefreshToken r where r.token=:token")
    Optional<Long> findUserIdByToken(@Param("token") String token);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RefreshToken r where r.token=:token")
    Optional<RefreshToken> lockByToken(@Param("token") String token);
    @Modifying(flushAutomatically = true)
    @Query("update RefreshToken r set r.revocado=true where r.usuario.id=:id and r.revocado=false")
    int revokeForUser(@Param("id") Long id);
    @Modifying
    @Query("delete from RefreshToken r where r.fechaExpiracion<:cutoff")
    int deleteExpiredBefore(@Param("cutoff") LocalDateTime cutoff);
    void deleteByUsuario(Usuario usuario);
}
