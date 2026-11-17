package com.empresa.ticketmanagement.security;

/** Cerrar únicamente conexiones anteriores a esta versión, nunca un login posterior. */
public record SessionRevokedEvent(Long userId, long validVersion) {}
