package com.empresa.ticketmanagement.attachment;
import com.empresa.ticketmanagement.controller.AttachmentController;
import com.empresa.ticketmanagement.dto.TicketAttachmentDTO;
import com.empresa.ticketmanagement.service.AttachmentService;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class AttachmentPreviewSecurityTest {
    AttachmentService service;MockMvc mvc;
    @BeforeEach void init(){service=mock(AttachmentService.class);mvc=MockMvcBuilders.standaloneSetup(new AttachmentController(service)).build();}
    private void meta(String name,String mime){when(service.obtenerMetadatos(1L)).thenReturn(TicketAttachmentDTO.builder().id(1L).nombreOriginal(name).mimeType(mime).build());}
    @Test void legacyHtmlSvgAndOtherDocumentsCannotBePreviewed() throws Exception {
        for(String[] f:new String[][]{{"x.html","text/html"},{"x.svg","image/svg+xml"},{"x.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"},{"x.pdf","text/html"}}){meta(f[0],f[1]);mvc.perform(get("/attachments/1/preview")).andExpect(status().isUnsupportedMediaType());}
        verify(service,never()).descargarAdjunto(1L);
    }
    @Test void rejectsLegacyForgedRasterEvenWithImageMetadata() throws Exception {
        meta("x.png","image/png");when(service.descargarAdjunto(1L)).thenReturn(new ByteArrayResource("<html><script>alert(1)</script>".getBytes()));
        mvc.perform(get("/attachments/1/preview")).andExpect(status().isUnsupportedMediaType());
    }
    @Test void htmlDownloadAlwaysUsesAttachmentOctetStreamAndNoSniff() throws Exception {
        meta("x.html","text/html");when(service.descargarAdjunto(1L)).thenReturn(new ByteArrayResource("<script>alert(1)</script>".getBytes()));
        mvc.perform(get("/attachments/1/download")).andExpect(status().isOk()).andExpect(content().contentType("application/octet-stream"))
            .andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.startsWith("attachment;")))
            .andExpect(result->org.assertj.core.api.Assertions.assertThat(org.springframework.http.ContentDisposition.parse(result.getResponse().getHeader("Content-Disposition")).getFilename()).isEqualTo("x.html"))
            .andExpect(header().string("Content-Security-Policy",org.hamcrest.Matchers.containsString("sandbox")));
    }
    @Test void validatedPdfIsInlineWithSandboxPolicy() throws Exception {
        meta("x.pdf","application/pdf");when(service.descargarAdjunto(1L)).thenReturn(new ByteArrayResource("%PDF-1.7\n%%EOF".getBytes()));
        mvc.perform(get("/attachments/1/preview")).andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
            .andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.startsWith("inline;")))
            .andExpect(header().string("Content-Security-Policy",org.hamcrest.Matchers.startsWith("sandbox;")));
    }
}
