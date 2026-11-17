package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.audit.AuditService;
import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.CuentaBloqueadaDTO;
import com.empresa.ticketmanagement.dto.PageResponseDTO;
import com.empresa.ticketmanagement.dto.PoliticaAccesoDTO;
import com.empresa.ticketmanagement.entity.PoliticaAcceso;
import com.empresa.ticketmanagement.repository.PoliticaAccesoRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.security.SessionSecurityService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/admin/security")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Seguridad", description = "Política de inicio de sesión y administración de cuentas bloqueadas. Todos los endpoints requieren JWT y rol ADMIN.")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Parámetro, paginación o datos de entrada inválidos.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Falta el token JWT o la sesión no es válida.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "El usuario autenticado no tiene el rol ADMIN.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class))),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "Error interno no controlado.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class)))
})
public class SeguridadController {
    private final UsuarioRepository users;
    private final PoliticaAccesoRepository policies;
    private final SessionSecurityService sessions;
    private final AuditService audit;

    @Operation(summary = "Listar cuentas bloqueadas", description = "Devuelve las cuentas actualmente bloqueadas, ordenadas por fecha de desbloqueo descendente. La lista está paginada; page comienza en 0 y size se limita al rango de 1 a 100. Solo ADMIN puede consultar esta información.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Página de cuentas bloqueadas e información de paginación.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping("/blocked-accounts")
    public ResponseEntity<ApiResponse<PageResponseDTO<CuentaBloqueadaDTO>>> blockedAccounts(
            @Parameter(description = "Índice de página desde 0. Los valores negativos se ajustan a 0.", example = "0")
            @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Cantidad solicitada por página. Se limita de 1 a 100.", example = "25")
            @RequestParam(defaultValue = "10") int size) {
        var result = users.findBlockedAccounts(LocalDateTime.now(),
                PageRequest.of(Math.max(0, page), Math.min(100, Math.max(1, size)),
                        Sort.by("bloqueadoHasta").descending()));
        return ResponseEntity.ok(ApiResponse.ok(PageResponseDTO.from(result.map(user ->
                new CuentaBloqueadaDTO(user.getId(), user.getUsername(), user.getNombreCompleto(),
                        user.getEmail(), user.getIntentosFallidos(), user.getBloqueadoHasta())))));
    }

    @Operation(summary = "Desbloquear una cuenta", description = "Restablece los intentos fallidos, quita la fecha de bloqueo, activa la cuenta e invalida sus sesiones existentes. Registra la acción en auditoría. Solo puede utilizarlo un administrador. Devuelve error de negocio si el usuario no existe, está inactivo o ya no está bloqueado.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Cuenta desbloqueada; data es null.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Usuario inexistente, inactivo o sin bloqueo vigente.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class)))
    @PostMapping("/blocked-accounts/{id}/unlock")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> unlock(
            @Parameter(description = "ID numérico de la cuenta que se desbloqueará.", example = "42")
            @PathVariable Long id, Authentication authentication,
            HttpServletRequest request) {
        var user = sessions.lockById(id).orElseThrow(() -> new BusinessException("Usuario no encontrado."));
        if (!"ACTIVO".equalsIgnoreCase(user.getEstado()) && !"BLOQUEADO".equalsIgnoreCase(user.getEstado()))
            throw new BusinessException("Solo se pueden desbloquear cuentas activas o bloqueadas.");
        boolean blocked = "BLOQUEADO".equalsIgnoreCase(user.getEstado())
                || (user.getBloqueadoHasta() != null && user.getBloqueadoHasta().isAfter(LocalDateTime.now()));
        if (!blocked) throw new BusinessException("La cuenta ya no está bloqueada.");
        user.setEstado("ACTIVO");
        user.setBloqueadoHasta(null);
        user.setIntentosFallidos(0);
        sessions.invalidate(user);
        users.save(user);
        Long actorId = users.findByUsername(authentication.getName()).map(actor -> actor.getId()).orElse(null);
        audit.registrar(actorId, "CUENTA_DESBLOQUEADA", "SEGURIDAD",
                "Se desbloqueó la cuenta " + user.getUsername(), request);
        return ResponseEntity.ok(ApiResponse.ok(null, "Cuenta desbloqueada correctamente."));
    }

    @Operation(summary = "Consultar la política de inicio de sesión", description = "Devuelve los límites vigentes para fallos consecutivos, duración del bloqueo y solicitudes de inicio de sesión por dirección IP por minuto. Si todavía no se guardó una política, devuelve valores predeterminados: 5 intentos, 15 minutos de bloqueo y 30 solicitudes por minuto.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Política vigente y, si está guardada, usuario y fecha de la última modificación.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @GetMapping("/login-policy")
    public ResponseEntity<ApiResponse<PoliticaAccesoDTO>> getPolicy() {
        return ResponseEntity.ok(ApiResponse.ok(policies.findById(1).map(this::toDto)
                .orElseGet(this::defaultPolicy)));
    }

    @Operation(summary = "Actualizar la política de inicio de sesión", description = "Reemplaza los tres límites de seguridad. maxIntentos debe estar entre 3 y 20; duracionBloqueoMinutos entre 1 y 1440; limiteLoginPorMinuto entre 5 y 300 solicitudes por dirección IP. La modificación queda registrada en auditoría junto con el administrador que la realizó.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Política actualizada y guardada.", useReturnTypeSchema = true, content = @Content(mediaType = "application/json"))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Falta un valor o está fuera del rango permitido.", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiResponse.class)))
    @PutMapping("/login-policy")
    @Transactional
    public ResponseEntity<ApiResponse<PoliticaAccesoDTO>> updatePolicy(@Valid @RequestBody PoliticaAccesoDTO dto,
            Authentication authentication, HttpServletRequest request) {
        PoliticaAcceso policy = policies.findById(1).orElseGet(() -> {
            PoliticaAcceso created = new PoliticaAcceso();
            created.setId(1);
            return created;
        });
        policy.setMaxIntentos(dto.getMaxIntentos());
        policy.setDuracionBloqueoMinutos(dto.getDuracionBloqueoMinutos());
        policy.setLimiteLoginPorMinuto(dto.getLimiteLoginPorMinuto());
        policy.setActualizadoPor(authentication.getName());
        policy.setFechaActualizacion(LocalDateTime.now());
        PoliticaAcceso saved = policies.save(policy);
        Long actorId = users.findByUsername(authentication.getName()).map(actor -> actor.getId()).orElse(null);
        audit.registrar(actorId, "POLITICA_LOGIN_ACTUALIZADA", "SEGURIDAD",
                "Se actualizaron los límites de acceso: intentos=" + saved.getMaxIntentos()
                        + ", bloqueo_minutos=" + saved.getDuracionBloqueoMinutos()
                        + ", limite_por_minuto=" + saved.getLimiteLoginPorMinuto(), request);
        return ResponseEntity.ok(ApiResponse.ok(toDto(saved), "Política de inicio de sesión actualizada."));
    }

    private PoliticaAccesoDTO defaultPolicy() {
        PoliticaAccesoDTO dto = new PoliticaAccesoDTO();
        dto.setMaxIntentos(5);
        dto.setDuracionBloqueoMinutos(15);
        dto.setLimiteLoginPorMinuto(30);
        return dto;
    }

    private PoliticaAccesoDTO toDto(PoliticaAcceso policy) {
        PoliticaAccesoDTO dto = new PoliticaAccesoDTO();
        dto.setMaxIntentos(policy.getMaxIntentos());
        dto.setDuracionBloqueoMinutos(policy.getDuracionBloqueoMinutos());
        dto.setLimiteLoginPorMinuto(policy.getLimiteLoginPorMinuto());
        dto.setActualizadoPor(policy.getActualizadoPor());
        dto.setFechaActualizacion(policy.getFechaActualizacion());
        return dto;
    }
}
