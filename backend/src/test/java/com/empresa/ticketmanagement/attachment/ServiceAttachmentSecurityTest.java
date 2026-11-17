package com.empresa.ticketmanagement.attachment;

import com.empresa.ticketmanagement.controller.ServicioController;
import com.empresa.ticketmanagement.dto.*;
import com.empresa.ticketmanagement.entity.Servicio;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.service.ServicioService;
import com.empresa.ticketmanagement.service.impl.ServicioServiceImpl;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ServiceAttachmentSecurityTest {
    ServicioService api; MockMvc mvc;
    private static final byte[] PDF="%PDF-1.7\n%%EOF".getBytes();
    @BeforeEach void setup(){api=mock(ServicioService.class);mvc=MockMvcBuilders.standaloneSetup(new ServicioController(api)).build();}
    private void files(String name,String mime,byte[] data) {
        when(api.obtener(1L)).thenReturn(ServicioDTO.builder().id(1L).facturaNombre(name).facturaMime(mime)
            .adjuntos(List.of(ServicioAdjuntoDTO.builder().id(2L).nombreOriginal(name).mimeType(mime).build())).build());
        when(api.descargarFactura(1L)).thenReturn(new ByteArrayResource(data));
        when(api.descargarAdjunto(1L,2L)).thenReturn(new ByteArrayResource(data));
    }
    @Test void legacyHtmlSvgAndForgedPdfCannotBeInline() throws Exception {
        for(String[] f:new String[][]{{"x.svg","image/svg+xml"},{"x.html","text/html"},{"x.pdf","application/pdf"}}){
            files(f[0],f[1],"<svg onload='alert(1)'/>".getBytes());
            for(String path:List.of("/services/1/invoice","/services/1/attachments/2/preview"))mvc.perform(get(path)).andExpect(status().isUnsupportedMediaType());
        }
    }
    @Test void legacyFilesCanStillBeDownloadedWithoutExecuting() throws Exception {
        files("x.svg","image/svg+xml","<svg/>".getBytes());
        for(String path:List.of("/services/1/invoice/download","/services/1/attachments/2/download"))
            mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().contentType("application/octet-stream"))
                .andExpect(header().string("X-Content-Type-Options","nosniff"))
                .andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.startsWith("attachment;")))
                .andExpect(header().string("Content-Security-Policy",org.hamcrest.Matchers.containsString("sandbox")));
    }
    @Test void validatedPdfPreservesPreviewForInvoiceAndAttachment() throws Exception {
        files("x.pdf","application/pdf",PDF);
        for(String path:List.of("/services/1/invoice","/services/1/attachments/2/preview"))
            mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.startsWith("inline;")));
    }
    @Test void rejectsInvoiceAndWholeBatchBeforeWritingAnything() {
        ServicioRepository repo=mock(ServicioRepository.class);
        ServicioAdjuntoRepository attachments=mock(ServicioAdjuntoRepository.class);
        StorageFactory storage=mock(StorageFactory.class);
        var impl=new ServicioServiceImpl(repo,attachments,storage,mock(ConfiguracionServicioRepository.class));
        when(repo.findById(1L)).thenReturn(Optional.of(Servicio.builder().id(1L).estado("ACTIVO").build()));
        var valid=new MockMultipartFile("files","ok.pdf","application/pdf",PDF);
        for(String name:List.of("x.html","x.svg","x.pdf","x.png")) {
            var bad=new MockMultipartFile("files",name,"image/png","<svg/>".getBytes());
            assertThatThrownBy(()->impl.subirFactura(1L,bad)).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(()->impl.subirAdjuntos(1L,List.of(valid,bad))).isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(storage,attachments);
    }
    @Test void savesCanonicalMimeRatherThanClaimedBrowserType() {
        ServicioRepository repo=mock(ServicioRepository.class);var attachments=mock(ServicioAdjuntoRepository.class);
        var storage=mock(StorageFactory.class);var provider=mock(StorageProvider.class);
        var entity=Servicio.builder().id(1L).nombre("Test").estado("ACTIVO").build();
        when(repo.findById(1L)).thenReturn(Optional.of(entity));when(repo.save(any())).thenAnswer(i->i.getArgument(0));
        when(storage.getStorageProvider()).thenReturn(provider);when(provider.storeFile(any(),anyString())).thenReturn("stored");
        var impl=new ServicioServiceImpl(repo,attachments,storage,mock(ConfiguracionServicioRepository.class));
        var result=impl.subirFactura(1L,new MockMultipartFile("file","x.pdf","text/html",PDF));
        assertThat(result.getFacturaMime()).isEqualTo("application/pdf");
    }

    @Test void downloadRejectsAnInactiveFileOrOneFromAnotherServiceBeforeStorage() {
        var repo=mock(ServicioRepository.class);var attachments=mock(ServicioAdjuntoRepository.class);
        var storage=mock(StorageFactory.class);
        var impl=new ServicioServiceImpl(repo,attachments,storage,mock(ConfiguracionServicioRepository.class));
        var other=com.empresa.ticketmanagement.entity.ServicioAdjunto.builder().id(2L)
            .servicio(Servicio.builder().id(9L).build()).activo(true).build();
        when(attachments.findById(2L)).thenReturn(Optional.of(other));
        assertThatThrownBy(()->impl.descargarAdjunto(1L,2L)).isInstanceOf(RuntimeException.class);
        other.setServicio(Servicio.builder().id(1L).build());other.setActivo(false);
        assertThatThrownBy(()->impl.descargarAdjunto(1L,2L)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(storage);
    }
}
