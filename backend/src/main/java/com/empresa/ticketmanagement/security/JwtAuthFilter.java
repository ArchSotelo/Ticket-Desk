package com.empresa.ticketmanagement.security;

import tools.jackson.databind.ObjectMapper;
import com.empresa.ticketmanagement.dto.ApiResponse;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper;
    private final JwtUtils jwtUtils;
    private final UserDetailsServiceCustom userDetailsService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        try {
            String jwt = parseJwt(request);
            if (jwt != null && jwtUtils.validateJwtToken(jwt)) {
                String username = jwtUtils.getUserNameFromJwtToken(jwt);
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);

                long version = userDetails instanceof SessionUserDetails details ? details.sessionVersion() : 0;
                if (jwtUtils.getSessionVersion(jwt) == version && userDetails.isEnabled() && userDetails.isAccountNonLocked()
                        && userDetails.isAccountNonExpired() && userDetails.isCredentialsNonExpired()) {
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                            userDetails, null, userDetails.getAuthorities());
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            }
        } catch (Exception e) {
            logger.error("No se pudo configurar la autenticación de usuario: {}", e);
        }

        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof SessionUserDetails details
                && details.passwordChangeRequired() && !passwordChangeAllowed(request)) {
            response.setStatus(403);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            objectMapper.writeValue(response.getWriter(), ApiResponse.error(
                    "Debes cambiar tu contraseña antes de continuar.", List.of("PASSWORD_CHANGE_REQUIRED")));
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean passwordChangeAllowed(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return switch (request.getMethod()) {
            case "GET" -> path.equals("/auth/me") || path.equals("/users/me");
            case "PUT" -> path.equals("/users/me/password");
            case "POST" -> path.equals("/auth/login") || path.equals("/auth/logout") || path.equals("/auth/refresh-token");
            case "OPTIONS" -> true;
            default -> false;
        };
    }

    private String parseJwt(HttpServletRequest request) {
        String headerAuth = request.getHeader("Authorization");
        if (StringUtils.hasText(headerAuth) && headerAuth.startsWith("Bearer ")) {
            return headerAuth.substring(7);
        }

        // Los navegadores no permiten enviar un encabezado Authorization
        // personalizado durante el handshake WebSocket. En ese caso el
        // frontend envía el JWT como access_token en la URL.
        if (request.getRequestURI().endsWith("/ws/updates")) {
            String queryToken = request.getParameter("access_token");
            if (StringUtils.hasText(queryToken)) {
                return queryToken;
            }
        }
        return null;
    }
}
