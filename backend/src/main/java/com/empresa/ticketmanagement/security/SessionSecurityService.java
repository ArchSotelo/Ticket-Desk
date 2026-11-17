package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.entity.Usuario;
import com.empresa.ticketmanagement.repository.RefreshTokenRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class SessionSecurityService {
    private final UsuarioRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final EntityManager entityManager;
    private final ApplicationEventPublisher events;

    public Optional<Usuario> lockByUsername(String username) {
        return fresh(users.lockByUsername(username));
    }

    public Optional<Usuario> lockById(Long id) { return fresh(users.lockById(id)); }

    private Optional<Usuario> fresh(Optional<Usuario> account) {
        // Evitar una copia antigua en el EntityManager de una lectura previa del request.
        account.ifPresent(user -> entityManager.refresh(user, LockModeType.PESSIMISTIC_WRITE));
        return account;
    }

    public void invalidate(Usuario account) {
        account.setVersionSesion(Math.incrementExact(account.getVersionSesion()));
        refreshTokens.revokeForUser(account.getId());
        events.publishEvent(new SessionRevokedEvent(account.getId(), account.getVersionSesion()));
    }
}
