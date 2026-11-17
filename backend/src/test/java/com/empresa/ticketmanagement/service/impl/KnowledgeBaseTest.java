package com.empresa.ticketmanagement.service.impl;

import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.dto.ArticuloKbDTO;
import com.empresa.ticketmanagement.repository.ArticuloKbRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false, properties = { "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never", "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect", "logging.level.root=WARN" })
@ActiveProfiles("test")
@Import(ArticuloKbServiceImpl.class)
class KnowledgeBaseTest {
    @Autowired TestEntityManager em;
    @Autowired ArticuloKbServiceImpl service;
    @Autowired ArticuloKbRepository repository;
    Categoria first, second;
    Usuario user;
    ArticuloKb article;
    @BeforeEach void setup() {
        first = em.persist(Categoria.builder().nombre("Redes").build());
        second = em.persist(Categoria.builder().nombre("Capacitaciones").build());
        user = em.persist(Usuario.builder().username("autor").nombres("Autor").apellidos("Demo").email("autor@example.test").passwordHash("test-only").build());
        article = em.persist(ArticuloKb.builder().titulo("Conexión de red").contenidoMarkdown("## Problema\n\nSin conexión\n\n## Solución\n\n1. Revisar el cable.")
                .categoria(first).autor(user).vistas(0).esPublico(true).build());
        em.flush();
    }
    @Test void updatesCategoryAndPreservesMarkdownAndAuthor() {
        String markdown = article.getContenidoMarkdown();
        var dto = new ArticuloKbDTO(); dto.setTitulo("Guía revisada"); dto.setCategoriaId(second.getId()); dto.setContenidoMarkdown(markdown); dto.setEsPublico(false);
        var result = service.actualizar(article.getId(), dto);
        em.flush(); em.clear();
        var stored = repository.findById(article.getId()).orElseThrow();
        assertThat(stored.getCategoria().getId()).isEqualTo(second.getId());
        assertThat(stored.getContenidoMarkdown()).isEqualTo(markdown);
        assertThat(stored.getAutor().getId()).isEqualTo(user.getId());
        assertThat(result.getEsPublico()).isFalse();
    }
    @Test void openingArticlePersistsViewCountAndKeepsContent() {
        var result = service.obtenerPorId(article.getId());
        assertThat(result.getVistas()).isEqualTo(1);
        em.flush(); em.clear();
        assertThat(repository.findById(article.getId()).orElseThrow().getVistas()).isEqualTo(1);
        assertThat(result.getContenidoMarkdown()).contains("## Problema");
    }
    @Test void privateArticlesRemainManageableForStaffAndPublicSearchExcludesThem() {
        var dto = new ArticuloKbDTO(); dto.setTitulo("Interno"); dto.setContenidoMarkdown("Texto interno"); dto.setCategoriaId(second.getId()); dto.setEsPublico(false);
        service.crear(dto, user.getUsername()); em.flush();
        assertThat(service.buscar(null, null, PageRequest.of(0, 10)).getTotalElements()).isEqualTo(1);
        assertThat(service.buscar(null, null, PageRequest.of(0, 10), true).getTotalElements()).isEqualTo(2);
        assertThat(service.buscar(null, second.getId(), PageRequest.of(0, 10), true).getContent()).extracting("titulo").containsExactly("Interno");
    }
    @Test void internalArticleCannotBeReadDirectlyByPublicReadersOrIncrementTheirViews() {
        article.setEsPublico(false); em.flush();
        assertThatThrownBy(() -> service.obtenerPorId(article.getId(), false))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        assertThat(article.getVistas()).isZero();
        assertThat(service.obtenerPorId(article.getId(), true).getVistas()).isEqualTo(1);
    }
    @Test void controllerOnlyIncludesInternalArticlesForStaff() {
        var mockService = org.mockito.Mockito.mock(ArticuloKbServiceImpl.class);
        org.mockito.Mockito.when(mockService.buscar(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyBoolean())).thenReturn(org.springframework.data.domain.Page.empty());
        var controller = new com.empresa.ticketmanagement.controller.ArticuloKbController(mockService);
        for (String role : new String[]{"ROLE_CLIENTE", "ROLE_TECNICO", "ROLE_ADMIN"}) {
            var authentication = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("user", null,
                    java.util.List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority(role)));
            controller.buscar(null, null, 0, 12, authentication);
            org.mockito.Mockito.verify(mockService).buscar(null, null,
                    PageRequest.of(0, 12, org.springframework.data.domain.Sort.by("vistas").descending().and(org.springframework.data.domain.Sort.by("id").descending())),
                    !role.equals("ROLE_CLIENTE"));
            org.mockito.Mockito.clearInvocations(mockService);
        }
    }
    @Test void invalidCategoryDoesNotPartiallyUpdateArticle() {
        var dto = new ArticuloKbDTO(); dto.setTitulo("No guardar"); dto.setCategoriaId(99999L);
        assertThatThrownBy(() -> service.actualizar(article.getId(), dto)).hasMessage("Categoría no encontrada");
        assertThat(article.getTitulo()).isEqualTo("Conexión de red");
    }
}
