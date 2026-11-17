package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.PageResponseDTO;
import com.empresa.ticketmanagement.dto.PasswordChangeDTO;
import com.empresa.ticketmanagement.dto.UsuarioCreateDTO;
import com.empresa.ticketmanagement.dto.UsuarioProfileUpdateDTO;
import com.empresa.ticketmanagement.dto.UsuarioResponseDTO;
import com.empresa.ticketmanagement.dto.UsuarioUpdateDTO;
import com.empresa.ticketmanagement.service.UsuarioService;
import com.empresa.ticketmanagement.util.PaginationPolicy;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
@Tag(name = "Gestión de Usuarios", description = "CRUD de usuarios, roles, permisos y perfil")
public class UsuarioController {

    private final UsuarioService usuarioService;

    @PostMapping
    @PreAuthorize("hasAuthority('USER_MANAGE')")
    @Operation(summary = "Crear un nuevo usuario en el sistema")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> crear(
            @Valid @RequestBody UsuarioCreateDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(usuarioService.crearUsuario(dto), "Usuario creado correctamente."));
    }

    @PreAuthorize("hasAuthority('USER_MANAGE')")
    @GetMapping("/{id}")
    @Operation(summary = "Obtener usuario por ID")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> obtenerPorId(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.obtenerPorId(id)));
    }

    @PreAuthorize("hasAuthority('USER_MANAGE')")
    @GetMapping
    @Operation(summary = "Listar usuarios con paginación y búsqueda")
    public ResponseEntity<ApiResponse<PageResponseDTO<UsuarioResponseDTO>>> listar(
            @RequestParam(required = false) String busqueda,
            @RequestParam(required = false) String rol,
            @RequestParam(required = false) Long empresaId,
            @RequestParam(required = false) String estado,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Page<UsuarioResponseDTO> result = usuarioService.listar(busqueda, rol, empresaId, estado,
                PageRequest.of(PaginationPolicy.page(page), PaginationPolicy.size(size),
                        Sort.by("nombres", "id").ascending()));
        return ResponseEntity.ok(ApiResponse.ok(PageResponseDTO.from(result)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('USER_MANAGE')")
    @Operation(summary = "Actualizar datos de un usuario")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> actualizar(
            @PathVariable Long id, @Valid @RequestBody UsuarioUpdateDTO dto) {
        return ResponseEntity.ok(ApiResponse.ok(
                usuarioService.actualizar(id, dto), "Usuario actualizado correctamente."));
    }

    @PatchMapping("/{id}/estado")
    @PreAuthorize("hasAuthority('USER_MANAGE')")
    @Operation(summary = "Activar / Bloquear / Desactivar usuario")
    public ResponseEntity<ApiResponse<Void>> cambiarEstado(
            @PathVariable Long id, @RequestParam String estado) {
        usuarioService.cambiarEstado(id, estado);
        return ResponseEntity.ok(ApiResponse.ok(null, "Estado del usuario actualizado a: " + estado));
    }



    @GetMapping("/me")
    @Operation(summary = "Obtener perfil del usuario autenticado")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> perfil(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.obtenerPorUsername(auth.getName())));
    }

    @PutMapping("/me")
    @Operation(summary = "Actualizar perfil del usuario autenticado")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> actualizarPerfil(
            Authentication auth,
            @Valid @RequestBody UsuarioProfileUpdateDTO dto) {
        return ResponseEntity.ok(ApiResponse.ok(
                usuarioService.actualizarPerfil(auth.getName(), dto),
                "Perfil actualizado correctamente."));
    }
    @PutMapping("/me/password")
    @Operation(summary = "Cambiar la contraseña del usuario autenticado")
    public ResponseEntity<ApiResponse<Void>> cambiarPassword(
            Authentication auth, @Valid @RequestBody PasswordChangeDTO dto) {
        usuarioService.cambiarPassword(auth.getName(), dto.getCurrentPassword(), dto.getNewPassword());
        return ResponseEntity.ok(ApiResponse.ok(null, "Contraseña actualizada correctamente."));
    }

}
