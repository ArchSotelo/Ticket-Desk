package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.controller.ServicioController;
import com.empresa.ticketmanagement.dto.ServicioDTO;
import com.empresa.ticketmanagement.service.ServicioService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers=ServicioController.class,properties="spring.jackson.time-zone=America/Lima")
@Import(SecurityConfig.class)
class ServiceAttachmentAuthorizationTest {
    @Autowired MockMvc mvc;
    @MockitoBean ServicioService services;
    @MockitoBean JwtUtils jwt;
    @MockitoBean UserDetailsServiceCustom userDetails;
    @Test void clientsAndUnknownRolesCannotAccessFilesOrTheirMetadata() throws Exception {
        for(String role:List.of("CLIENTE","GUEST")) {
            for(String path:List.of("/services","/services/1","/services/1/invoice","/services/1/invoice/download","/services/1/attachments/2/preview","/services/1/attachments/2/download"))
                mvc.perform(get(path).with(user("client").roles(role))).andExpect(status().isForbidden());
            mvc.perform(multipart("/services/1/invoice").file(new MockMultipartFile("file","x.pdf","application/pdf","%PDF-1.7\n%%EOF".getBytes())).with(user("client").roles(role))).andExpect(status().isForbidden());
            mvc.perform(multipart("/services/1/attachments").file(new MockMultipartFile("files","x.pdf","application/pdf","%PDF-1.7\n%%EOF".getBytes())).with(user("client").roles(role))).andExpect(status().isForbidden());
            for(String path:List.of("/services/1/invoice","/services/1/attachments/2"))
                mvc.perform(delete(path).with(user("client").roles(role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(services);
    }
    @Test void anonymousRequestsRequireAuthentication() throws Exception {
        for(String path:List.of("/services/1/invoice","/services/1/invoice/download","/services/1/attachments/2/preview","/services/1/attachments/2/download"))
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        verifyNoInteractions(services);
    }
    @Test void rolesUsedByTheAdminAndTechnicianPortalsCanStillPreviewAndDownload() throws Exception {
        when(services.obtener(1L)).thenReturn(ServicioDTO.builder().id(1L).facturaNombre("x.pdf").facturaMime("application/pdf").build());
        when(services.descargarFactura(1L)).thenReturn(new ByteArrayResource("%PDF-1.7\n%%EOF".getBytes()));
        for(String role:List.of("ADMIN","SUPERVISOR","TECNICO")) {
            mvc.perform(get("/services/1/invoice").with(user("staff").roles(role))).andExpect(status().isOk()).andExpect(content().contentType("application/pdf"));
            mvc.perform(get("/services/1/invoice/download").with(user("staff").roles(role))).andExpect(status().isOk()).andExpect(content().contentType("application/octet-stream"));
        }
    }
}
