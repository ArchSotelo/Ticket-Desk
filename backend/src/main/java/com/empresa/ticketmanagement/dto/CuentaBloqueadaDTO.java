package com.empresa.ticketmanagement.dto;

import java.time.LocalDateTime;

public record CuentaBloqueadaDTO(Long id, String username, String nombreCompleto,
        String email, Integer intentosFallidos, LocalDateTime bloqueadoHasta) {}
