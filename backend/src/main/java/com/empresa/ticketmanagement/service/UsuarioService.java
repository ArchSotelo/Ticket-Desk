package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.dto.UsuarioCreateDTO;
import com.empresa.ticketmanagement.dto.UsuarioResponseDTO;
import com.empresa.ticketmanagement.dto.UsuarioProfileUpdateDTO;
import com.empresa.ticketmanagement.dto.UsuarioUpdateDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface UsuarioService {
    UsuarioResponseDTO crearUsuario(UsuarioCreateDTO dto);
    UsuarioResponseDTO obtenerPorId(Long id);
    Page<UsuarioResponseDTO> listar(String busqueda, Pageable pageable);
    Page<UsuarioResponseDTO> listar(String busqueda, String rol, Long empresaId, String estado, Pageable pageable);
    UsuarioResponseDTO actualizar(Long id, UsuarioUpdateDTO dto);
    UsuarioResponseDTO actualizarPerfil(String username, UsuarioProfileUpdateDTO dto);
    void cambiarPassword(String username, String currentPassword, String newPassword);
    void cambiarEstado(Long id, String estado);
    UsuarioResponseDTO obtenerPorUsername(String username);
}
