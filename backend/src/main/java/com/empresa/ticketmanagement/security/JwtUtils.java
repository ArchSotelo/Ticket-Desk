package com.empresa.ticketmanagement.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
@Slf4j
public class JwtUtils {

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @Value("${app.jwt.expiration-ms}")
    private long jwtExpirationMs;

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateJwtToken(Authentication authentication) {
        UserDetails userPrincipal = (UserDetails) authentication.getPrincipal();

        long version = userPrincipal instanceof SessionUserDetails details ? details.sessionVersion() : 0;
        return generateToken(userPrincipal.getUsername(), version, jwtExpirationMs);
    }

    public String generateTokenFromUsername(String username) {
        return generateToken(username, 0, jwtExpirationMs);
    }

    public String generateToken(String username, long sessionVersion, long lifetimeMs) {
        return Jwts.builder().subject(username).claim("sv", sessionVersion)
                .id(java.util.UUID.randomUUID().toString())
                .issuedAt(new Date()).expiration(new Date(System.currentTimeMillis() + lifetimeMs))
                .signWith(getSigningKey(), Jwts.SIG.HS256).compact();
    }

    public long getSessionVersion(String token) {
        Number version = Jwts.parser().verifyWith(getSigningKey()).build()
                .parseSignedClaims(token).getPayload().get("sv", Number.class);
        return version == null ? -1 : version.longValue();
    }

    public String getUserNameFromJwtToken(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
    }

    /** Caducidad firmada del token para limitar también la vida de conexiones WebSocket. */
    public Date getExpirationFromJwtToken(String token) {
        return Jwts.parser().verifyWith(getSigningKey()).build()
                .parseSignedClaims(token).getPayload().getExpiration();
    }

    public boolean validateJwtToken(String authToken) {
        try {
            Jwts.parser().verifyWith(getSigningKey()).build().parseSignedClaims(authToken);
            return true;
        } catch (JwtException e) {
            log.error("Token JWT inválido: {}", e.getMessage());
        } catch (IllegalArgumentException e) {
            log.error("La cadena JWT está vacía: {}", e.getMessage());
        }
        return false;
    }
}
