package com.empresa.ticketmanagement.web;

import com.empresa.ticketmanagement.controller.TicketController;
import com.empresa.ticketmanagement.dto.TicketResponseDTO;
import com.empresa.ticketmanagement.exception.GlobalExceptionHandler;
import com.empresa.ticketmanagement.exception.BusinessException;
import com.empresa.ticketmanagement.service.TicketService;
import com.empresa.ticketmanagement.service.KanbanService;
import org.apache.catalina.connector.ClientAbortException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(OutputCaptureExtension.class)
class HttpResponseHandlingTest {
    @Test void ticketPageKeepsTheExistingFrontendContractWithoutSerializingPageImpl(CapturedOutput output) throws Exception {
        var service = mock(TicketService.class);
        var page = new PageImpl<>(List.of(TicketResponseDTO.builder().id(4L).codigo("TICK-4").build()),
                PageRequest.of(1, 2, Sort.by("fechaCreacion").descending()), 3);
        when(service.listarTickets(any(), any(), any(), any(), any(), any(), any())).thenReturn(page);
        var mvc = MockMvcBuilders.standaloneSetup(new TicketController(service, mock(KanbanService.class))).build();
        mvc.perform(get("/tickets").param("page", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].codigo").value("TICK-4"))
                .andExpect(jsonPath("$.data.number").value(1))
                .andExpect(jsonPath("$.data.size").value(2))
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.totalPages").value(2))
                .andExpect(jsonPath("$.data.numberOfElements").value(1))
                .andExpect(jsonPath("$.data.first").value(false))
                .andExpect(jsonPath("$.data.last").value(true))
                .andExpect(jsonPath("$.data.empty").value(false))
                .andExpect(jsonPath("$.data.sort.sorted").value(true))
                .andExpect(jsonPath("$.data.pageable.offset").value(2));
        assertThat(output.getAll()).doesNotContain("Serializing PageImpl");
    }

    @RestController static class CancelledRequestController {
        @GetMapping("/cancelled") String cancelled() throws AsyncRequestNotUsableException {
            throw new AsyncRequestNotUsableException("ServletOutputStream failed to flush", new IOException("Broken pipe"));
        }
        @GetMapping("/disconnected") String disconnected() throws ClientAbortException {
            throw new ClientAbortException(new IOException("Broken pipe"));
        }
    }

    @Test void cancellationAndClientDisconnectDoNotWriteAnErrorBodyOrLogAnInternalFailure(CapturedOutput output) throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new CancelledRequestController())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        for (String path : List.of("/cancelled", "/disconnected")) {
            // No hay respuesta que enviar al cliente desconectado. En esta simulación
            // el estado permanece sin asignar (200), pero no se escribe otro cuerpo.
            mvc.perform(get(path)).andExpect(content().string(""));
        }
        assertThat(output.getAll()).doesNotContain("Error no controlado", "Error de tiempo de ejecución");
    }

    @Test void wrappedDisconnectIsIgnoredButRealIoAndBusinessErrorsKeepTheirHandling() {
        var advice = new GlobalExceptionHandler();
        assertThat(advice.handleUnexpectedException(new IllegalStateException(new ClientAbortException("Broken pipe")))).isNull();
        assertThat(advice.handleUnexpectedException(new IOException("Storage unavailable")).getStatusCode())
                .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(advice.handleBusinessException(new BusinessException("Invalid filter")).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
