package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.controller.UsuarioController;
import com.empresa.ticketmanagement.dto.UsuarioResponseDTO;
import com.empresa.ticketmanagement.service.UsuarioService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = UsuarioController.class, properties = "spring.jackson.time-zone=America/Lima")
@Import(SecurityConfig.class)
class UserAdministrationSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean UsuarioService users;
    @MockitoBean JwtUtils jwt;
    @MockitoBean UserDetailsServiceCustom userDetails;

    @Test @WithMockUser(roles = "CLIENTE")
    void clientCannotGrantRolesOrChangeAnotherUsersPassword() throws Exception {
        mvc.perform(put("/users/1").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roles\":[\"ROLE_ADMIN\"],\"password\":\"test-only-password\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(users);
    }

    @Test @WithMockUser(authorities = "USER_MANAGE")
    void authorizedAdministratorCanUpdateUsers() throws Exception {
        when(users.actualizar(eq(1L), any())).thenReturn(new UsuarioResponseDTO());
        mvc.perform(put("/users/1").contentType(MediaType.APPLICATION_JSON).content("{\"nombres\":\"Ana\"}"))
                .andExpect(status().isOk());
        verify(users).actualizar(eq(1L), any());
    }
}
