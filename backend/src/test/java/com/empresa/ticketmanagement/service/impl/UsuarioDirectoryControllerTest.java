package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.controller.UsuarioController;
import com.empresa.ticketmanagement.service.UsuarioService;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UsuarioDirectoryControllerTest {
    @Test void forwardsAllFiltersToThePaginatedQuery() {
        UsuarioService service = mock(UsuarioService.class);
        when(service.listar(any(), any(), any(), any(), any())).thenReturn(Page.empty());
        new UsuarioController(service).listar("Ana", "ROLE_TECNICO", 12L, "INACTIVO", 2, 5);
        verify(service).listar(eq("Ana"), eq("ROLE_TECNICO"), eq(12L), eq("INACTIVO"), argThat(page ->
                page.getPageNumber() == 2 && page.getPageSize() == 5 && page.getSort().getOrderFor("id") != null));
    }
    @Test void preservesLargeDirectoryRequestsUsedByTicketAssignment() {
        UsuarioService service = mock(UsuarioService.class);
        when(service.listar(any(), any(), any(), any(), any())).thenReturn(Page.empty());
        new UsuarioController(service).listar(null, null, null, null, 0, 500);
        verify(service).listar(isNull(), isNull(), isNull(), isNull(), argThat(page -> page.getPageSize() == 500));
    }
    @Test void normalizesNegativePageAndEmptySizeWithoutChangingFilters() {
        UsuarioService service = mock(UsuarioService.class);
        when(service.listar(any(), any(), any(), any(), any())).thenReturn(Page.empty());
        new UsuarioController(service).listar("", null, null, null, -5, 0);
        verify(service).listar(eq(""), isNull(), isNull(), isNull(), argThat(page -> page.getPageNumber() == 0 && page.getPageSize() == 1));
    }
}
