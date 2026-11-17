package com.empresa.ticketmanagement.util;

/** Reglas comunes para evitar consultas paginadas desproporcionadas. */
public final class PaginationPolicy {

    public static final int MAX_PAGE_SIZE = 100;

    private PaginationPolicy() {}

    public static int page(int requestedPage) {
        return Math.max(0, requestedPage);
    }

    public static int size(int requestedSize) {
        return Math.max(1, Math.min(MAX_PAGE_SIZE, requestedSize));
    }
}
