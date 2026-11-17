package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.audit.AuditQueryService;
import com.empresa.ticketmanagement.controller.*;
import com.empresa.ticketmanagement.dto.UsuarioResponseDTO;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers={EmpresaController.class,AreaController.class,CategoriaController.class,SubcategoriaController.class,
        CategoriaServicioController.class,ConfiguracionServicioController.class,UsuarioController.class,
        AuditoriaController.class,ContactoController.class},properties="spring.jackson.time-zone=America/Lima")
@Import(SecurityConfig.class)
class AdministrativePermissionsTest {
    @Autowired MockMvc mvc;
    @MockitoBean EmpresaRepository companies;
    @MockitoBean AreaRepository areas;
    @MockitoBean CategoriaRepository categories;
    @MockitoBean SubcategoriaRepository subcategories;
    @MockitoBean CategoriaServicioRepository serviceCategories;
    @MockitoBean ConfiguracionServicioRepository settings;
    @MockitoBean UsuarioService users;
    @MockitoBean AuditQueryService audits;
    @MockitoBean ContactDirectoryService contacts;
    @MockitoBean JwtUtils jwt;
    @MockitoBean UserDetailsServiceCustom details;

    @ParameterizedTest @ValueSource(strings={"CLIENTE","TECNICO","SUPERVISOR","ADMIN","HELPDESK","INVITADO"})
    void aRoleNameAloneDoesNotGrantAdministrativePermissions(String role) throws Exception {
        var actor=user("actor").roles(role);
        for(String path:new String[]{"/users","/users/5","/audit","/empresas","/areas","/categorias","/subcategorias","/service-settings","/contacts","/contacts/5"})
            mvc.perform(get(path).with(actor)).andExpect(status().isForbidden());
        mvc.perform(post("/categorias").with(actor).contentType("application/json").content("{\"nombre\":\"Nueva\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/service-categories").with(actor).contentType("application/json").content("{\"nombre\":\"Nueva\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/service-settings").with(actor).contentType("application/json")
                .content("{\"diasPorVencer\":5,\"asuntoRecordatorio\":\"Aviso\",\"plantillaRecordatorio\":\"Contenido\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(companies,areas,categories,subcategories,serviceCategories,settings,users,audits,contacts);
    }

    @Test void supervisorCanReadAuditAndContactsButCannotAdministerAccountsOrSettings() throws Exception {
        var actor=user("supervisor").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_SUPERVISOR"),
                new org.springframework.security.core.authority.SimpleGrantedAuthority("AUDIT_VIEW"),
                new org.springframework.security.core.authority.SimpleGrantedAuthority("CONTACT_READ"));
        when(audits.listar(anyInt(),anyInt(),anyString(),anyString(),anyString(),isNull(),isNull(),anyString())).thenReturn(Page.empty());
        when(contacts.listar(anyString(),any())).thenReturn(Page.empty());
        mvc.perform(get("/audit").with(actor)).andExpect(status().isOk());
        mvc.perform(get("/contacts").with(actor)).andExpect(status().isOk());
        for(String path:new String[]{"/users","/users/5","/empresas","/areas","/categorias","/subcategorias","/service-settings"})
            mvc.perform(get(path).with(actor)).andExpect(status().isForbidden());
        verifyNoInteractions(users,companies,areas,categories,subcategories,settings);
    }

    @Test void permissionsAuthorizeTheCorrespondingAdministrativeOperations() throws Exception {
        when(users.listar(any(),any(),any(),any(),any())).thenReturn(Page.empty());
        when(categories.save(any(Categoria.class))).thenAnswer(i->i.getArgument(0));
        when(settings.findFirstByOrderByIdAsc()).thenReturn(Optional.of(ConfiguracionServicio.builder().build()));
        when(settings.save(any())).thenAnswer(i->i.getArgument(0));
        mvc.perform(get("/users").with(user("admin").authorities(()->"USER_MANAGE"))).andExpect(status().isOk());
        mvc.perform(post("/categorias").with(user("admin").authorities(()->"CATEGORY_MANAGE"))
                .contentType("application/json").content("{\"nombre\":\"Nueva\"}")).andExpect(status().isCreated());
        mvc.perform(put("/service-settings").with(user("admin").authorities(()->"SERVICE_CONFIG_MANAGE"))
                .contentType("application/json").content("{\"diasPorVencer\":5,\"asuntoRecordatorio\":\"Aviso\",\"plantillaRecordatorio\":\"Contenido\"}"))
                .andExpect(status().isOk());
    }

    @Test void clientKeepsOwnProfileAndAnonymousRequestsRemainUnauthorized() throws Exception {
        when(users.obtenerPorUsername("client")).thenReturn(UsuarioResponseDTO.builder().username("client").build());
        mvc.perform(get("/users/me").with(user("client").roles("CLIENTE"))).andExpect(status().isOk()).andExpect(jsonPath("$.data.username").value("client"));
        for(String path:new String[]{"/users","/users/me","/audit","/contacts","/empresas","/service-settings"})
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
    }
}
