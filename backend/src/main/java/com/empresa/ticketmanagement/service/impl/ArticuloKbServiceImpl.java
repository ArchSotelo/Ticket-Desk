package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.ArticuloKbDTO;
import com.empresa.ticketmanagement.entity.ArticuloKb;
import com.empresa.ticketmanagement.repository.ArticuloKbRepository;
import com.empresa.ticketmanagement.repository.CategoriaRepository;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ArticuloKbServiceImpl {

    private final ArticuloKbRepository articuloKbRepository;
    private final CategoriaRepository categoriaRepository;
    private final UsuarioRepository usuarioRepository;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    @Transactional
    public ArticuloKbDTO crear(ArticuloKbDTO dto, String username) {
        var categoria = categoriaRepository.findById(dto.getCategoriaId())
                .orElseThrow(() -> new BusinessException("Categoría no encontrada"));
        var autor = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado"));

        ArticuloKb articulo = ArticuloKb.builder()
                .titulo(dto.getTitulo())
                .contenidoMarkdown(dto.getContenidoMarkdown())
                .categoria(categoria)
                .autor(autor)
                .esPublico(dto.getEsPublico() != null ? dto.getEsPublico() : true)
                .fechaCreacion(LocalDateTime.now())
                .build();

        return mapToDTO(articuloKbRepository.save(articulo));
    }

    @Transactional
    public ArticuloKbDTO obtenerPorId(Long id) {
        return obtenerPorId(id, false);
    }

    @Transactional
    public ArticuloKbDTO obtenerPorId(Long id, boolean incluirPrivados) {
        ArticuloKb articulo = articuloKbRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Artículo no encontrado: " + id));
        if (!Boolean.TRUE.equals(articulo.getEsPublico()) && !incluirPrivados) {
            throw new org.springframework.security.access.AccessDeniedException("Este artículo es interno del equipo de soporte.");
        }

        // El incremento se ejecuta en SQL para que dos aperturas simultáneas no
        // lean el mismo valor y sobrescriban el conteo de la otra.
        int actualizado = articuloKbRepository.incrementarVistas(id, incluirPrivados);
        if (actualizado == 0) {
            ArticuloKb actual = articuloKbRepository.findById(id)
                    .orElseThrow(() -> new BusinessException("Artículo no encontrado: " + id));
            if (!Boolean.TRUE.equals(actual.getEsPublico()) && !incluirPrivados) {
                throw new org.springframework.security.access.AccessDeniedException("Este artículo es interno del equipo de soporte.");
            }
            throw new BusinessException("No se pudo registrar la apertura del artículo.");
        }

        // La actualización masiva limpia el contexto de persistencia; se vuelve a
        // consultar para devolver el contador actualizado, no una entidad obsoleta.
        ArticuloKb actualizadoArticulo = articuloKbRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Artículo no encontrado: " + id));
        if (!Boolean.TRUE.equals(actualizadoArticulo.getEsPublico()) && !incluirPrivados) {
            throw new org.springframework.security.access.AccessDeniedException("Este artículo es interno del equipo de soporte.");
        }
        return mapToDTO(actualizadoArticulo);
    }

    @Transactional(readOnly = true)
    public Page<ArticuloKbDTO> buscar(String busqueda, Long categoriaId, Pageable pageable) {
        return buscar(busqueda, categoriaId, pageable, false);
    }

    @Transactional(readOnly = true)
    public Page<ArticuloKbDTO> buscar(String busqueda, Long categoriaId, Pageable pageable, boolean incluirPrivados) {
        Page<ArticuloKb> page = articuloKbRepository.buscar(busqueda, categoriaId, incluirPrivados, pageable);
        List<ArticuloKbDTO> dtos = page.getContent().stream().map(this::mapToDTO).toList();
        return new PageImpl<>(dtos, pageable, page.getTotalElements());
    }

    @Transactional
    public ArticuloKbDTO actualizar(Long id, ArticuloKbDTO dto) {
        ArticuloKb articulo = articuloKbRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Artículo no encontrado: " + id));
        if (dto.getCategoriaId() != null) {
            articulo.setCategoria(categoriaRepository.findById(dto.getCategoriaId())
                    .orElseThrow(() -> new BusinessException("Categoría no encontrada")));
        }
        if (dto.getTitulo() != null) articulo.setTitulo(dto.getTitulo());
        if (dto.getContenidoMarkdown() != null) articulo.setContenidoMarkdown(dto.getContenidoMarkdown());
        if (dto.getEsPublico() != null) articulo.setEsPublico(dto.getEsPublico());
        articulo.setFechaModificacion(LocalDateTime.now());
        return mapToDTO(articuloKbRepository.save(articulo));
    }

    @Transactional
    public void eliminar(Long id) {
        articuloKbRepository.deleteById(id);
    }

    private ArticuloKbDTO mapToDTO(ArticuloKb a) {
        ArticuloKbDTO dto = new ArticuloKbDTO();
        dto.setId(a.getId());
        dto.setTitulo(a.getTitulo());
        dto.setContenidoMarkdown(a.getContenidoMarkdown());
        dto.setCategoriaId(a.getCategoria().getId());
        dto.setCategoriaNombre(a.getCategoria().getNombre());
        dto.setAutorId(a.getAutor().getId());
        dto.setAutorNombre(a.getAutor().getNombreCompleto());
        dto.setVistas(a.getVistas());
        dto.setEsPublico(a.getEsPublico());
        dto.setFechaCreacion(a.getFechaCreacion() != null ? a.getFechaCreacion().format(FMT) : null);
        dto.setFechaModificacion(a.getFechaModificacion() != null ? a.getFechaModificacion().format(FMT) : null);
        return dto;
    }
}
