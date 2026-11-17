package com.empresa.ticketmanagement.attachment;

import com.empresa.ticketmanagement.controller.*;
import com.empresa.ticketmanagement.dto.TicketAttachmentDTO;
import com.empresa.ticketmanagement.exception.*;
import com.empresa.ticketmanagement.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.system.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(OutputCaptureExtension.class)
class MissingAttachmentHandlingTest {
    @TempDir Path root;
    @Test void missingLocalContentReturns404WithoutErrorStackOrInternalPath(CapturedOutput output) throws Exception {
        var provider=new LocalStorageProvider(root.toString());
        var files=mock(AttachmentService.class);var services=mock(ServicioService.class);
        when(files.obtenerMetadatos(1L)).thenReturn(TicketAttachmentDTO.builder().id(1L).nombreOriginal("missing.pdf").mimeType("application/pdf").build());
        when(files.descargarAdjunto(1L)).thenAnswer(i->provider.loadFileAsResource("missing.pdf"));
        when(services.descargarAdjunto(1L,2L)).thenAnswer(i->provider.loadFileAsResource("missing.pdf"));
        when(services.descargarFactura(1L)).thenAnswer(i->provider.loadFileAsResource("missing.pdf"));
        var mvc=MockMvcBuilders.standaloneSetup(new AttachmentController(files),new ServicioController(services)).setControllerAdvice(new GlobalExceptionHandler()).build();
        for(int attempt=0;attempt<2;attempt++) for(String route:new String[]{"/attachments/1/download","/attachments/1/preview","/services/1/invoice","/services/1/invoice/download","/services/1/attachments/2/download","/services/1/attachments/2/preview"})
            mvc.perform(get(route)).andExpect(status().isNotFound()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("no está disponible")))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(root.toString()))));
        assertThat(output.getAll()).doesNotContain("Error de tiempo de ejecución","Error no controlado","AttachmentNotFoundException:");
    }
    @Test void bareNamesUseConfiguredDirectoryAndAbsolutePathsContinueToWork() throws Exception {
        var provider=new LocalStorageProvider(root.toString());Path file=root.resolve("test.pdf");Files.writeString(file,"content");
        assertThat(provider.loadFileAsResource("test.pdf").getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).isEqualTo("content");
        assertThat(provider.loadFileAsResource(file.toString()).exists()).isTrue();
        try(var stream=provider.loadFileAsStream("test.pdf")){assertThat(new String(stream.readAllBytes())).isEqualTo("content");}
    }
    @Test void nonexistentPathsAndDirectoriesAreNotAvailableFiles() {
        var provider=new LocalStorageProvider(root.toString());
        for(String value:new String[]{"missing.pdf",root.resolve("missing.pdf").toString(),root.toString(),""})
            assertThatThrownBy(()->provider.loadFileAsResource(value)).isInstanceOf(AttachmentNotFoundException.class);
        assertThatThrownBy(()->provider.loadFileAsStream("missing.pdf")).isInstanceOf(AttachmentNotFoundException.class);
    }
}
