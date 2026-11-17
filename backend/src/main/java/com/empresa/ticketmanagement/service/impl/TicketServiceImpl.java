package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.exception.BusinessException;

import com.empresa.ticketmanagement.dto.TicketAttachmentDTO;
import com.empresa.ticketmanagement.dto.TicketCreateDTO;
import com.empresa.ticketmanagement.dto.ComentarioDTO;
import com.empresa.ticketmanagement.dto.TicketResponseDTO;
import com.empresa.ticketmanagement.dto.HistorialCambioDTO;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler;
import com.empresa.ticketmanagement.service.TicketService;
import com.empresa.ticketmanagement.security.TicketAccessPolicy;
import com.empresa.ticketmanagement.security.ApplicationRoles;
import org.springframework.security.access.AccessDeniedException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class TicketServiceImpl implements TicketService {

    private final TicketRepository ticketRepository;
    private final TicketAccessPolicy accessPolicy;
    private final UsuarioRepository usuarioRepository;
    private final CategoriaRepository categoriaRepository;
    private final SubcategoriaRepository subcategoriaRepository;
    private final PrioridadRepository prioridadRepository;
    private final SlaRepository slaRepository;
    private final EstadoRepository estadoRepository;
    private final TicketAttachmentRepository attachmentRepository;
    private final ComentarioRepository comentarioRepository;
    private final HistorialRepository historialRepository;
    private final NotificacionService notificacionService;
    private final RealtimeWebSocketHandler realtimeHandler;

    @Override
    @Transactional
    public TicketResponseDTO crearTicket(TicketCreateDTO createDTO, String username, String idempotencyKey) {
        accessPolicy.requireSelf(username);
        accessPolicy.requireCreate();
        String requestKey = normalizarIdempotencyKey(idempotencyKey);
        if (requestKey != null) {
            Optional<Ticket> ticketExistente = ticketRepository.findByIdempotencyKey(requestKey);
            if (ticketExistente.isPresent()) {
                accessPolicy.requireRead(ticketExistente.get());
                return mapToDTO(ticketExistente.get());
            }
        }

        if (createDTO.getSubcategoriaId() == null) {
            throw new BusinessException("La subcategoría es obligatoria");
        }
        Usuario creador = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario creador no encontrado"));
        // La identidad autenticada contiene solo los roles activos admitidos.
        boolean puedeSeleccionarCliente = accessPolicy.isStaff();
        Usuario cliente;
        if (createDTO.getClienteId() != null) {
            if (!puedeSeleccionarCliente) {
                throw new AccessDeniedException("Solo el personal de soporte puede seleccionar al cliente.");
            }
            cliente = usuarioRepository.findById(createDTO.getClienteId())
                    .orElseThrow(() -> new BusinessException("Cliente no encontrado"));
            boolean esClienteActivo = "ACTIVO".equalsIgnoreCase(cliente.getEstado())
                    && ApplicationRoles.names(cliente).contains("ROLE_CLIENTE");
            if (!esClienteActivo) {
                throw new BusinessException("El cliente seleccionado no está activo");
            }
        } else {
            cliente = creador;
            if (puedeSeleccionarCliente) {
                throw new BusinessException("Debes seleccionar un cliente activo");
            }
        }

        // La organización siempre procede del solicitante autorizado; nunca del DTO.
        Empresa empresa = cliente.getEmpresa();
        if (empresa == null) {
            throw new BusinessException("El solicitante no tiene una empresa asignada. Actualiza su perfil.");
        }
        Area area = cliente.getArea();
        if (area != null && (area.getEmpresa() == null
                || !empresa.getId().equals(area.getEmpresa().getId()))) {
            throw new BusinessException("El área del solicitante no pertenece a su empresa. Actualiza su perfil.");
        }
        if ((createDTO.getEmpresaId() != null && !createDTO.getEmpresaId().equals(empresa.getId()))
                || (createDTO.getAreaId() != null
                && (area == null || !createDTO.getAreaId().equals(area.getId())))) {
            throw new AccessDeniedException("La empresa o el área no coincide con la del solicitante.");
        }

        Categoria categoria = categoriaRepository.findById(createDTO.getCategoriaId())
                .orElseThrow(() -> new BusinessException("Categoría no encontrada"));
        Subcategoria subcategoria = subcategoriaRepository.findById(createDTO.getSubcategoriaId())
                .orElseThrow(() -> new BusinessException("Subcategoría no encontrada"));
        if (subcategoria.getCategoria() == null
                || !categoria.getId().equals(subcategoria.getCategoria().getId())) {
            throw new BusinessException("La subcategoría no pertenece a la categoría seleccionada");
        }
        if (!Boolean.TRUE.equals(subcategoria.getActiva())) {
            throw new BusinessException("La subcategoría seleccionada no está activa");
        }

        Prioridad prioridad = prioridadRepository.findById(createDTO.getPrioridadId())
                .orElseThrow(() -> new BusinessException("Prioridad no encontrada"));

        Estado estadoInicial = estadoRepository.findByEsInicialTrue()
                .orElseGet(() -> estadoRepository.findByCodigo("NUEVO")
                        .orElseThrow(() -> new BusinessException("Estado inicial no configurado")));

        Sla sla = slaRepository.findByPrioridadId(prioridad.getId())
                .orElseGet(() -> slaRepository.save(Sla.builder()
                        .nombre("SLA " + prioridad.getNombre())
                        .prioridad(prioridad)
                        .tiempoRespuestaMinutos(prioridad.getTiempoRespuestaHrs() * 60)
                        .tiempoResolucionMinutos(prioridad.getTiempoResolucionHrs() * 60)
                        .horarioAtencion("24x7")
                        .activo(true)
                        .build()));
        LocalDateTime ahora = LocalDateTime.now();
        // La estimación se fija al crear el ticket usando el SLA de resolución,
        // independientemente de los valores enviados desde el cliente.
        int tiempoEstimado = sla != null
                ? sla.getTiempoResolucionMinutos()
                : Math.multiplyExact(prioridad.getTiempoResolucionHrs(), 60);

        Ticket ticket = Ticket.builder()
                // La fila necesita código al insertarse. Se reemplaza por el código final
                // basado en el ID autoincremental, dentro de esta misma transacción.
                .codigo("PENDING-" + UUID.randomUUID())
                .idempotencyKey(requestKey)
                .titulo(createDTO.getTitulo())
                .descripcion(createDTO.getDescripcion())
                .cliente(cliente)
                .empresa(empresa)
                .area(area)
                .categoria(categoria)
                .subcategoria(subcategoria)
                .prioridad(prioridad)
                .estado(estadoInicial)
                .sla(sla)
                .fechaCreacion(ahora)
                .fechaLimiteRespuesta(sla != null
                        ? ahora.plusMinutes(sla.getTiempoRespuestaMinutos())
                        : ahora.plusHours(prioridad.getTiempoRespuestaHrs()))
                .fechaLimiteResolucion(ahora.plusMinutes(tiempoEstimado))
                .tiempoEstimadoMinutos(tiempoEstimado)
                .tiempoRegistradoMinutos(0)
                .build();

        Ticket saved = ticketRepository.save(ticket);
        if (saved.getId() == null) {
            throw new IllegalStateException("La base de datos no generó el identificador del ticket.");
        }
        saved.setCodigo(generarCodigo(saved.getFechaCreacion(), saved.getId()));
        notificarTecnicosNuevoTicket(saved);
        TicketResponseDTO response = mapToDTO(saved);
        realtimeHandler.publishBoard("kanban-ticket-created", Map.of("ticketId", response.getId()));
        return response;
    }

    private String generarCodigo(LocalDateTime fechaCreacion, Long ticketId) {
        return "TICK-" + fechaCreacion.getYear() + "-" + String.format(java.util.Locale.ROOT, "%04d", ticketId);
    }

    private String normalizarIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return UUID.randomUUID().toString();
        }
        if (idempotencyKey.length() > 64) {
            throw new BusinessException("La clave de idempotencia no puede superar 64 caracteres");
        }
        return idempotencyKey.trim();
    }

    @Override
    @Transactional(readOnly = true)
    public TicketResponseDTO obtenerPorId(Long id) {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Ticket no encontrado con ID: " + id));
        accessPolicy.requireRead(ticket);
        return mapToDTO(ticket);
    }

    @Override
    @Transactional(readOnly = true)
    public TicketResponseDTO obtenerPorCodigo(String codigo) {
        Ticket ticket = ticketRepository.findByCodigo(codigo)
                .orElseThrow(() -> new BusinessException("Ticket no encontrado con código: " + codigo));
        accessPolicy.requireRead(ticket);
        return mapToDTO(ticket);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<TicketResponseDTO> listarTickets(String estado, String prioridad, Long categoriaId, String busqueda, LocalDate fechaDesde, LocalDate fechaHasta, Pageable pageable) {
        return ticketRepository.findAll(TicketSpecifications.filtered(estado, prioridad, categoriaId,
                busqueda, fechaDesde, fechaHasta, accessPolicy.clientScope(), false), ordenarPagina(pageable)).map(this::mapToDTO);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<TicketResponseDTO> listarMisTickets(String username, String estado, String prioridad,
            Long categoriaId, String busqueda, LocalDate fechaDesde, LocalDate fechaHasta, Pageable pageable) {
        accessPolicy.requireSelf(username);
        accessPolicy.clientScope();
        Usuario cliente = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado"));
        return ticketRepository.findAll(TicketSpecifications.filtered(estado, prioridad, categoriaId,
                busqueda, fechaDesde, fechaHasta, cliente.getId(), true), ordenarPagina(pageable)).map(this::mapToDTO);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<TicketResponseDTO> listarTicketsPorCliente(Long clienteId, Pageable pageable) {
        accessPolicy.requireClient(clienteId);
        if (!usuarioRepository.existsById(clienteId)) throw new BusinessException("Cliente no encontrado");
        return ticketRepository.findAll(TicketSpecifications.filtered(null, null, null, null, null, null,
                clienteId, false), ordenarPagina(pageable)).map(this::mapToDTO);
    }

    private Pageable ordenarPagina(Pageable pageable) {
        Sort sort = pageable.getSort().isSorted() ? pageable.getSort() : Sort.by(Sort.Direction.DESC, "fechaCreacion");
        // Un orden estable evita repetir o perder tickets entre páginas con la misma fecha.
        if (sort.getOrderFor("id") == null) sort = sort.and(Sort.by(Sort.Direction.DESC, "id"));
        return pageable.isPaged() ? org.springframework.data.domain.PageRequest.of(
                pageable.getPageNumber(), pageable.getPageSize(), sort) : Pageable.unpaged(sort);
    }

    @Override
    @Transactional
    public TicketResponseDTO cambiarEstado(Long id, String nuevoEstadoCodigo, String username) {
        accessPolicy.requireSelf(username);
        accessPolicy.requireUpdate();
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Ticket no encontrado"));
        accessPolicy.requireRead(ticket);
        Usuario usuario = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado"));
        boolean esTecnico = accessPolicy.hasRole("ROLE_TECNICO");
        Estado nuevoEstado = estadoRepository.findByCodigo(nuevoEstadoCodigo)
                .orElseThrow(() -> new BusinessException("Estado no válido: " + nuevoEstadoCodigo));

        boolean esAdministrador = accessPolicy.hasRole("ROLE_ADMIN");

        if (ticket.getEstado() != null
                && "CERRADO".equalsIgnoreCase(ticket.getEstado().getCodigo())
                && !esAdministrador
                && !"CERRADO".equalsIgnoreCase(nuevoEstado.getCodigo())) {
            throw new BusinessException("Solo un administrador puede cambiar el estado de un ticket cerrado");
        }

        if (esTecnico) {
            asignarTecnicoAutomatico(ticket, usuario);
        }

        String estadoAnterior = ticket.getEstado().getNombre();
        ticket.setEstado(nuevoEstado);
        ticket.setFechaModificacion(LocalDateTime.now());

        if (Boolean.TRUE.equals(nuevoEstado.getEsFinal())) {
            ticket.setFechaResolucion(LocalDateTime.now());
            ticket.setCumplioSlaResolucion(LocalDateTime.now().isBefore(ticket.getFechaLimiteResolucion()));
            ticket.setTiempoRegistradoMinutos(calcularTiempoTranscurrido(ticket.getFechaCreacion(), LocalDateTime.now()));
        }

        if ("CERRADO".equalsIgnoreCase(nuevoEstado.getCodigo())) {
            ticket.setFechaCierre(LocalDateTime.now());
        }

        ticketRepository.save(ticket);

        // Guardar historial
        historialRepository.save(Historial.builder()
                .ticket(ticket)
                .usuario(usuario)
                .campoModificado("Estado")
                .valorAnterior(estadoAnterior)
                .valorNuevo(nuevoEstado.getNombre())
                .fechaCambio(LocalDateTime.now())
                .build());

        if (ticket.getCliente() != null && !estadoAnterior.equalsIgnoreCase(nuevoEstado.getNombre())) {
            notificacionService.notificar(
                    ticket.getCliente().getId(),
                    "Cambio de estado en " + ticket.getCodigo(),
                    "El ticket ahora está en estado: " + nuevoEstado.getNombre(),
                    "INFO",
                    "/cliente/tickets/" + ticket.getId(),
                    "STATUS_CHANGED",
                    ticket.getCodigo(), ticket.getTitulo(), ticket.getCliente().getNombreCompleto()
            );
        }

        TicketResponseDTO response = mapToDTO(ticket);
        realtimeHandler.publishBoard("kanban-ticket-updated", Map.of("ticketId", response.getId()));
        realtimeHandler.publish("ticket-updated", null, response.getId(), Map.of("ticketId", response.getId()));
        return response;
    }

    @Override
    @Transactional
    public TicketResponseDTO asignarTecnico(Long id, Long tecnicoId, String username) {
        accessPolicy.requireSelf(username);
        accessPolicy.requireAssignment();
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Ticket no encontrado"));
        accessPolicy.requireRead(ticket);
        Usuario asignador = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario asignador no encontrado"));
        Usuario tecnico = usuarioRepository.findById(tecnicoId)
                .orElseThrow(() -> new BusinessException("Técnico no encontrado"));

        String tecnicoAnterior = ticket.getTecnico() != null ? ticket.getTecnico().getNombreCompleto() : "Sin Asignar";
        ticket.setTecnico(tecnico);
        ticket.setFechaModificacion(LocalDateTime.now());

        // Si está en NUEVO, pasar a ASIGNADO
        if ("NUEVO".equals(ticket.getEstado().getCodigo())) {
            estadoRepository.findByCodigo("ASIGNADO").ifPresent(ticket::setEstado);
        }

        ticketRepository.save(ticket);

        historialRepository.save(Historial.builder()
                .ticket(ticket)
                .usuario(asignador)
                .campoModificado("Técnico Asignado")
                .valorAnterior(tecnicoAnterior)
                .valorNuevo(tecnico.getNombreCompleto())
                .fechaCambio(LocalDateTime.now())
                .build());

        notificacionService.notificarAsignacion(tecnico.getId(), ticket.getCodigo(), ticket.getTitulo());

        TicketResponseDTO response = mapToDTO(ticket);
        realtimeHandler.publishBoard("kanban-ticket-updated", Map.of("ticketId", response.getId()));
        realtimeHandler.publish("ticket-updated", null, response.getId(), Map.of("ticketId", response.getId()));
        return response;
    }

    @Override
    @Transactional
    public TicketResponseDTO agregarComentario(Long id, String contenido, boolean esInterno, String username) {
        accessPolicy.requireSelf(username);
        if (esInterno) accessPolicy.requireStaff();
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Ticket no encontrado"));
        accessPolicy.requireRead(ticket);
        // Una respuesta del personal puede cambiar automáticamente el técnico y el estado.
        // Los clientes responden dentro de su propio ticket sin permisos de gestión.
        if (accessPolicy.isStaff()) accessPolicy.requireUpdate();
        Usuario usuario = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado"));
        boolean esTecnico = accessPolicy.hasRole("ROLE_TECNICO");

        if (esTecnico) {
            asignarTecnicoAutomatico(ticket, usuario);
        }

        ticket.setFechaModificacion(LocalDateTime.now());
        ticketRepository.save(ticket);
        Comentario creado = comentarioRepository.save(Comentario.builder()
                .ticket(ticket)
                .usuario(usuario)
                .contenido(contenido)
                .esInterno(esInterno)
                .fechaCreacion(LocalDateTime.now())
                .build());
        if (esInterno) realtimeHandler.publishStaffTicket("ticket-comment", ticket.getId(), Map.of("ticketId", ticket.getId()));
        else realtimeHandler.publish("ticket-comment", null, ticket.getId(), Map.of("ticketId", ticket.getId()));

        if (!esInterno && esTecnico && ticket.getFechaPrimerRespuesta() == null) {
            LocalDateTime fechaRespuesta = LocalDateTime.now();
            ticket.setFechaPrimerRespuesta(fechaRespuesta);
            ticket.setCumplioSlaRespuesta(ticket.getFechaLimiteRespuesta() == null
                    || !fechaRespuesta.isAfter(ticket.getFechaLimiteRespuesta()));
            ticket.setFechaModificacion(fechaRespuesta);
            ticketRepository.save(ticket);
        }

        boolean esCliente = accessPolicy.hasRole("ROLE_CLIENTE");
        boolean esAdministrador = accessPolicy.hasRole("ROLE_ADMIN");

        if (!esInterno && esTecnico && ticket.getCliente() != null) {
            notificacionService.notificar(
                    ticket.getCliente().getId(),
                    "Respuesta en tu ticket " + ticket.getCodigo(),
                    "El técnico respondió al ticket: " + ticket.getTitulo(),
                    "INFO",
                    "/cliente/tickets/" + ticket.getId(),
                    "REPLY",
                    ticket.getCodigo(), ticket.getTitulo(), ticket.getCliente().getNombreCompleto()
            );
        }

        if (!esInterno && esCliente && ticket.getTecnico() != null) {
            notificacionService.notificar(
                    ticket.getTecnico().getId(),
                    "Nuevo comentario en " + ticket.getCodigo(),
                    "El cliente respondió al ticket: " + ticket.getTitulo(),
                    "INFO",
                    "/tecnico/tickets/" + ticket.getId(),
                    "REPLY",
                    ticket.getCodigo(), ticket.getTitulo(), ticket.getCliente().getNombreCompleto()
            );
        }

        if (!esInterno && esAdministrador && ticket.getCliente() != null) {
            notificacionService.notificar(
                    ticket.getCliente().getId(),
                    "Nueva respuesta en " + ticket.getCodigo(),
                    "El administrador respondió al ticket: " + ticket.getTitulo(),
                    "INFO",
                    "/cliente/tickets/" + ticket.getId(),
                    "REPLY",
                    ticket.getCodigo(), ticket.getTitulo(), ticket.getCliente().getNombreCompleto()
            );
        }

        TicketResponseDTO response = mapToDTO(ticket);
        response.setComentarioCreadoId(creado != null ? creado.getId() : null);
        realtimeHandler.publishBoard("kanban-ticket-updated", Map.of("ticketId", response.getId()));
        return response;
    }

    private void asignarTecnicoAutomatico(Ticket ticket, Usuario usuario) {
        if (ticket.getTecnico() != null && ticket.getTecnico().getId().equals(usuario.getId())) {
            return;
        }

        accessPolicy.requireUpdate();
        ticket.setTecnico(usuario);
        if (ticket.getEstado() != null && "NUEVO".equalsIgnoreCase(ticket.getEstado().getCodigo())) {
            estadoRepository.findByCodigo("ASIGNADO").ifPresent(ticket::setEstado);
        }
        ticket.setFechaModificacion(LocalDateTime.now());
        ticketRepository.save(ticket);
    }

    private void notificarTecnicosNuevoTicket(Ticket ticket) {
        List<Usuario> tecnicos = usuarioRepository.findDistinctByRolesNombre("ROLE_TECNICO");
        tecnicos.stream()
                .filter(tecnico -> "ACTIVO".equalsIgnoreCase(tecnico.getEstado()))
                .filter(tecnico -> ApplicationRoles.names(tecnico).contains("ROLE_TECNICO"))
                .forEach(tecnico -> notificacionService.notificar(
                        tecnico.getId(),
                        "Nuevo ticket registrado: " + ticket.getCodigo(),
                        "Se creó un nuevo caso: " + ticket.getTitulo(),
                        "ALERTA",
                        "/tecnico/tickets/" + ticket.getId(),
                        "TICKET_CREATED",
                        ticket.getCodigo(), ticket.getTitulo(), ticket.getCliente().getNombreCompleto()
                ));
    }

    private int calcularTiempoTranscurrido(LocalDateTime inicio, LocalDateTime fin) {
        if (inicio == null || fin == null) {
            return 0;
        }
        return (int) Math.max(0, java.time.Duration.between(inicio, fin).toMinutes());
    }

    private String obtenerRolComentario(Usuario usuario) {
        if (usuario.getRoles() == null) return "OTRO";
        var activeRoles = ApplicationRoles.names(usuario);
        if (activeRoles.contains("ROLE_ADMIN")) return "ADMIN";
        if (activeRoles.contains("ROLE_TECNICO")) return "TECNICO";
        if (activeRoles.contains("ROLE_CLIENTE")) return "CLIENTE";
        return "INTERNO";
    }

    private TicketResponseDTO mapToDTO(Ticket ticket) {
        List<HistorialCambioDTO> historialCambios = historialRepository.findByTicketIdOrderByFechaCambioDesc(ticket.getId())
                .stream().map(h -> HistorialCambioDTO.builder()
                        .id(h.getId())
                        .usuarioNombre(h.getUsuario().getNombreCompleto())
                        .campoModificado(h.getCampoModificado())
                        .valorAnterior(h.getValorAnterior())
                        .valorNuevo(h.getValorNuevo())
                        .fechaCambio(h.getFechaCambio())
                        .build()).toList();
        List<TicketAttachmentDTO> attachments = attachmentRepository.findByTicketIdAndActivoTrue(ticket.getId())
                .stream().map(a -> TicketAttachmentDTO.builder()
                        .id(a.getId())
                        .ticketId(ticket.getId())
                        .comentarioId(a.getMensaje() != null ? a.getMensaje().getId() : null)
                        .nombreOriginal(a.getNombreOriginal())
                        .comentario(a.getComentario())
                        .extension(a.getExtension())
                        .mimeType(a.getMimeType())
                        .tamanoBytes(a.getTamanoBytes())
                        .proveedorAlmacenamiento(a.getProveedorAlmacenamiento())
                        .usuarioCreacionNombre(a.getUsuarioCreacion().getNombreCompleto())
                        .fechaCreacion(a.getFechaCreacion())
                        .downloadUrl("/api/v1/attachments/" + a.getId() + "/download")
                        .previewUrl("/api/v1/attachments/" + a.getId() + "/preview")
                        .build()).toList();

        boolean includeInternal = accessPolicy.isStaff();
        List<ComentarioDTO> comentarios = comentarioRepository.findByTicketIdOrderByFechaCreacionAsc(ticket.getId())
                .stream().filter(c -> includeInternal || !Boolean.TRUE.equals(c.getEsInterno())).map(c -> ComentarioDTO.builder()
                        .id(c.getId())
                        .usuarioId(c.getUsuario().getId())
                        .usuarioNombre(c.getUsuario().getNombreCompleto())
                        .usuarioRol(obtenerRolComentario(c.getUsuario()))
                        .contenido(c.getContenido())
                        .esInterno(c.getEsInterno())
                        .fechaCreacion(c.getFechaCreacion())
                        .build()).toList();

        return TicketResponseDTO.builder()
                .id(ticket.getId())
                .codigo(ticket.getCodigo())
                .titulo(ticket.getTitulo())
                .descripcion(ticket.getDescripcion())
                .clienteId(ticket.getCliente().getId())
                .clienteNombre(ticket.getCliente().getNombreCompleto())
                .clienteEmail(ticket.getCliente().getEmail())
                .tecnicoId(ticket.getTecnico() != null ? ticket.getTecnico().getId() : null)
                .tecnicoNombre(ticket.getTecnico() != null ? ticket.getTecnico().getNombreCompleto() : "Sin Asignar")
                .empresaId(ticket.getEmpresa().getId())
                .empresaNombre(ticket.getEmpresa().getRazonSocial())
                .areaId(ticket.getArea() != null ? ticket.getArea().getId() : null)
                .areaNombre(ticket.getArea() != null ? ticket.getArea().getNombre() : null)
                .categoriaId(ticket.getCategoria().getId())
                .categoriaNombre(ticket.getCategoria().getNombre())
                .subcategoriaId(ticket.getSubcategoria() != null ? ticket.getSubcategoria().getId() : null)
                .subcategoriaNombre(ticket.getSubcategoria() != null ? ticket.getSubcategoria().getNombre() : null)
                .prioridadId(ticket.getPrioridad().getId())
                .prioridadNombre(ticket.getPrioridad().getNombre())
                .prioridadColorHex(ticket.getPrioridad().getColorHex())
                .estadoId(ticket.getEstado().getId())
                .estadoNombre(ticket.getEstado().getNombre())
                .estadoCodigo(ticket.getEstado().getCodigo())
                .estadoColorHex(ticket.getEstado().getColorHex())
                .slaId(ticket.getSla() != null ? ticket.getSla().getId() : null)
                .fechaCreacion(ticket.getFechaCreacion())
                .fechaModificacion(ticket.getFechaModificacion())
                .fechaLimiteRespuesta(ticket.getFechaLimiteRespuesta())
                .fechaLimiteResolucion(ticket.getFechaLimiteResolucion())
                .fechaPrimerRespuesta(ticket.getFechaPrimerRespuesta())
                .fechaResolucion(ticket.getFechaResolucion())
                .fechaCierre(ticket.getFechaCierre())
                .cumplioSlaRespuesta(ticket.getCumplioSlaRespuesta())
                .cumplioSlaResolucion(ticket.getCumplioSlaResolucion())
                .tiempoEstimadoMinutos(ticket.getTiempoEstimadoMinutos())
                .tiempoRegistradoMinutos(ticket.getTiempoRegistradoMinutos())
                .attachments(attachments)
                .comentarios(comentarios)
                .cantidadComentarios(comentarios.size())
                .historialCambios(historialCambios)
                .build();
    }
}
