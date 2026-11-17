package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.controller.ArticuloKbController;
import com.empresa.ticketmanagement.dto.ArticuloKbDTO;
import com.empresa.ticketmanagement.repository.UsuarioRepository;
import com.empresa.ticketmanagement.service.impl.ArticuloKbServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = ArticuloKbController.class, properties = "spring.jackson.time-zone=America/Lima")
@Import(SecurityConfig.class)
class KnowledgeBaseSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtUtils jwtUtils;
    @MockitoBean UserDetailsServiceCustom userDetailsService;
    @MockitoBean UsuarioRepository usuarioRepository;
    @MockitoBean ArticuloKbServiceImpl service;
    final String body = "{\"titulo\":\"Guía\",\"contenidoMarkdown\":\"Contenido\",\"categoriaId\":1,\"esPublico\":true}";
    void login(String role) {
        when(jwtUtils.validateJwtToken("valid")).thenReturn(true);
        when(jwtUtils.getUserNameFromJwtToken("valid")).thenReturn("reader");
        when(userDetailsService.loadUserByUsername("reader")).thenReturn(User.withUsername("reader").password("unused").authorities(role).build());
    }
    @Test void anonymousReaderNeedsAuthentication() throws Exception {
        mvc.perform(get("/knowledge-base")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void clientCanListAndReadPublicArticlesWithoutIncludingInternalOnes() throws Exception {
        login("ROLE_CLIENTE");
        when(service.buscar(any(), any(), any(), eq(false))).thenReturn(Page.empty());
        var article = new ArticuloKbDTO(); article.setId(1L); article.setTitulo("Guía pública"); article.setEsPublico(true);
        when(service.obtenerPorId(1L, false)).thenReturn(article);
        mvc.perform(get("/knowledge-base").param("incluirPrivados", "true").header(HttpHeaders.AUTHORIZATION, "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
        mvc.perform(get("/knowledge-base/1").header(HttpHeaders.AUTHORIZATION, "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.esPublico").value(true));
        verify(service).buscar(isNull(), isNull(), any(), eq(false)); verify(service).obtenerPorId(1L, false);
    }
    @Test void clientCannotCreateEditOrDeleteEvenByCallingTheApiDirectly() throws Exception {
        login("ROLE_CLIENTE");
        mvc.perform(post("/knowledge-base").header(HttpHeaders.AUTHORIZATION,"Bearer valid").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(put("/knowledge-base/1").header(HttpHeaders.AUTHORIZATION,"Bearer valid").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(delete("/knowledge-base/1").header(HttpHeaders.AUTHORIZATION,"Bearer valid")).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
    @Test void clientCannotReadInternalArticleByItsId() throws Exception {
        login("ROLE_CLIENTE"); when(service.obtenerPorId(2L, false)).thenThrow(new AccessDeniedException("Interno"));
        mvc.perform(get("/knowledge-base/2").header(HttpHeaders.AUTHORIZATION,"Bearer valid")).andExpect(status().isForbidden());
    }
    @Test void administratorAndTechnicianKeepTheirEditingCapabilities() throws Exception {
        for (String role : new String[]{"ROLE_ADMIN", "ROLE_TECNICO", "ROLE_SUPERVISOR"}) {
            login(role);
            mvc.perform(post("/knowledge-base").header(HttpHeaders.AUTHORIZATION,"Bearer valid").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
            mvc.perform(put("/knowledge-base/1").header(HttpHeaders.AUTHORIZATION,"Bearer valid").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
            mvc.perform(delete("/knowledge-base/1").header(HttpHeaders.AUTHORIZATION,"Bearer valid")).andExpect(status().isOk());
        }
        verify(service,times(3)).crear(any(),eq("reader")); verify(service,times(3)).actualizar(eq(1L),any()); verify(service,times(3)).eliminar(1L);
    }
}
