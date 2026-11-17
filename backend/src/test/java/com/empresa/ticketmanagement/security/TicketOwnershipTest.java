package com.empresa.ticketmanagement.security;

import com.empresa.ticketmanagement.attachment.StorageFactory;
import com.empresa.ticketmanagement.attachment.StorageProvider;
import com.empresa.ticketmanagement.controller.AttachmentController;
import com.empresa.ticketmanagement.controller.TicketController;
import com.empresa.ticketmanagement.dto.TicketCreateDTO;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.exception.GlobalExceptionHandler;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.realtime.RealtimeWebSocketHandler;
import com.empresa.ticketmanagement.service.impl.AttachmentServiceImpl;
import com.empresa.ticketmanagement.service.impl.TicketServiceImpl;
import com.empresa.ticketmanagement.service.KanbanService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDateTime;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Controladores, servicios, política y repositorios reales con H2 desechable.
@DataJpaTest(showSql=false, properties={"spring.jpa.hibernate.ddl-auto=create-drop","spring.sql.init.mode=never",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect","logging.level.root=WARN"})
@ActiveProfiles("test")
@Import({TicketServiceImpl.class,AttachmentServiceImpl.class,TicketAccessPolicy.class})
class TicketOwnershipTest {
    @Autowired TestEntityManager em;
    @Autowired TicketServiceImpl tickets;
    @Autowired AttachmentServiceImpl files;
    @MockitoBean StorageFactory storage;
    @MockitoBean NotificacionService notifications;
    @MockitoBean RealtimeWebSocketHandler realtime;
    MockMvc mvc;
    Usuario ana,bob,support;
    Ticket own,foreign;
    Categoria category;
    TicketAttachment ownFile,foreignFile,staffFile,inactive;
    @BeforeEach void seed() {
        Empresa company=em.persist(Empresa.builder().razonSocial("Pruebas").ruc("12345678901").build());
        ana=user("ana",company);bob=user("bob",company);support=user("support",company);
        category=em.persist(Categoria.builder().nombre("Soporte").build());
        Estado state=em.persist(Estado.builder().codigo("NUEVO").nombre("Nuevo").build());
        Prioridad priority=em.persist(Prioridad.builder().nombre("Alta").nivel(3).build());
        own=ticket("A",ana,company,state,priority);foreign=ticket("B",bob,company,state,priority);
        foreign.setIdempotencyKey("private-bob-key");
        ownFile=file(own,ana,true);foreignFile=file(foreign,bob,true);
        staffFile=file(own,support,true);inactive=file(own,ana,false);
        comment(false,"Respuesta pública");comment(true,"Nota interna privada");
        em.flush();em.clear();
        mvc=MockMvcBuilders.standaloneSetup(new TicketController(tickets, mock(KanbanService.class)),new AttachmentController(files))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        login("ana","CLIENTE");
    }
    private Usuario user(String name,Empresa c) {
        return em.persist(Usuario.builder().username(name).nombres(name).apellidos("Pruebas")
                .email(name+"@example.test").passwordHash("test-only-hash").empresa(c).build());
    }
    private Ticket ticket(String code,Usuario client,Empresa c,Estado state,Prioridad p) {
        return em.persist(Ticket.builder().codigo(code).titulo("Ticket "+code).descripcion("Privado "+code)
                .cliente(client).empresa(c).categoria(category).estado(state).prioridad(p).fechaCreacion(LocalDateTime.now())
                .fechaLimiteResolucion(LocalDateTime.now().plusDays(1)).build());
    }
    private TicketAttachment file(Ticket t,Usuario u,boolean active) {
        return em.persist(TicketAttachment.builder().ticket(t).usuarioCreacion(u).nombreOriginal("test.txt")
                .nombreFisico("test-"+t.getCodigo()+".txt").extension(".txt").mimeType("text/plain")
                .tamanoBytes(4L).ruta("test-only-path").activo(active).build());
    }
    private void comment(boolean internal,String text) {
        em.persist(Comentario.builder().ticket(own).usuario(support).contenido(text).esInterno(internal).build());
    }
    private void login(String name,String role) {
        var grants = new java.util.ArrayList<org.springframework.security.core.GrantedAuthority>();
        grants.add(new SimpleGrantedAuthority("ROLE_" + role));
        if (List.of("CLIENTE", "TECNICO", "SUPERVISOR", "ADMIN").contains(role)) {
            for (String permission : List.of("TICKET_CREATE", "TICKET_READ", "ATTACHMENT_UPLOAD"))
                grants.add(new SimpleGrantedAuthority(permission));
        }
        if (List.of("TECNICO", "SUPERVISOR", "ADMIN").contains(role))
            grants.add(new SimpleGrantedAuthority("TICKET_UPDATE"));
        if (List.of("SUPERVISOR", "ADMIN").contains(role))
            grants.add(new SimpleGrantedAuthority("TICKET_ASSIGN"));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(name,null,
                grants));
    }
    @AfterEach void clear() {SecurityContextHolder.clearContext();}
    @Test void deniesForeignTicketsByIdCodeAndOwnerListing() throws Exception {
        for(String p:List.of("/tickets/"+foreign.getId(),"/tickets/codigo/B","/tickets/cliente/"+bob.getId()))
            mvc.perform(get(p)).andExpect(status().isForbidden());
        verifyNoInteractions(storage);
    }
    @Test void generalAndPersonalListsApplyClientScopeBeforeCounting() throws Exception {
        mvc.perform(get("/tickets")).andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].codigo").value("A"));
        mvc.perform(get("/tickets/mine").principal(SecurityContextHolder.getContext().getAuthentication()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1));
        mvc.perform(get("/tickets/cliente/"+ana.getId())).andExpect(status().isOk());
    }
    @Test void internalCommentsAndTheirCountAreHiddenFromClient() throws Exception {
        mvc.perform(get("/tickets/"+own.getId())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.comentarios.length()").value(1))
                .andExpect(jsonPath("$.data.comentarios[0].contenido").value("Respuesta pública"))
                .andExpect(jsonPath("$.data.cantidadComentarios").value(1));
    }
    @Test void deniesForeignAttachmentListMetadataDownloadAndPreview() throws Exception {
        for(String p:List.of("/tickets/"+foreign.getId()+"/attachments","/attachments/"+foreignFile.getId(),
                "/attachments/"+foreignFile.getId()+"/download","/attachments/"+foreignFile.getId()+"/preview"))
            mvc.perform(get(p)).andExpect(status().isForbidden());
        verifyNoInteractions(storage);
    }
    @Test void deniedForeignWritesDoNotTouchDatabaseOrStorage() throws Exception {
        var actor=SecurityContextHolder.getContext().getAuthentication();
        mvc.perform(post("/tickets/"+foreign.getId()+"/comentarios").param("contenido","Intrusión").principal(actor))
                .andExpect(status().isForbidden());
        mvc.perform(multipart("/tickets/"+foreign.getId()+"/attachments")
                .file(new MockMultipartFile("file","test.txt","text/plain","test".getBytes())).principal(actor))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/attachments/"+foreignFile.getId()).principal(actor)).andExpect(status().isForbidden());
        assertThat(em.find(TicketAttachment.class,foreignFile.getId()).getActivo()).isTrue();
        verifyNoInteractions(storage,notifications,realtime);
    }
    @Test void clientCannotChangeStateAssignOrCreateInternalNotes() throws Exception {
        var actor=SecurityContextHolder.getContext().getAuthentication();
        mvc.perform(patch("/tickets/"+own.getId()+"/estado").param("nuevoEstadoCodigo","CERRADO").principal(actor))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/tickets/"+own.getId()+"/asignar").param("tecnicoId",support.getId().toString()).principal(actor))
                .andExpect(status().isForbidden());
        mvc.perform(post("/tickets/"+own.getId()+"/comentarios").param("contenido","Interno")
                .param("esInterno","true").principal(actor)).andExpect(status().isForbidden());
        verifyNoInteractions(storage,notifications,realtime);
    }
    @Test void idempotencyAndSpoofedUserCannotBypassOwnership() {
        assertThatThrownBy(()->tickets.crearTicket(new TicketCreateDTO(),"ana","private-bob-key"))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(()->tickets.listarMisTickets("bob",null,null,null,null,null,null,PageRequest.of(0,10)))
                .isInstanceOf(AccessDeniedException.class);
    }
    @Test void inactiveFilesCannotBeAccessed() throws Exception {
        for(String suffix:List.of("","/download","/preview"))
            mvc.perform(get("/attachments/"+inactive.getId()+suffix)).andExpect(status().isForbidden());
        verifyNoInteractions(storage);
    }
    @Test void clientDeletesOwnUploadButNotStaffUpload() throws Exception {
        var actor=SecurityContextHolder.getContext().getAuthentication();
        mvc.perform(delete("/attachments/"+staffFile.getId()).principal(actor)).andExpect(status().isForbidden());
        mvc.perform(delete("/attachments/"+ownFile.getId()).principal(actor)).andExpect(status().isOk());
        assertThat(em.find(TicketAttachment.class,ownFile.getId()).getActivo()).isFalse();
        mvc.perform(get("/attachments/"+ownFile.getId()+"/download")).andExpect(status().isForbidden());
    }
    @Test void ownUploadsAndCommentsStillWorkWithoutExposingInternalContent() throws Exception {
        StorageProvider provider=mock(StorageProvider.class);
        when(storage.getStorageProvider()).thenReturn(provider);when(provider.getProviderName()).thenReturn("LOCAL");
        when(provider.storeFile(any(),anyString())).thenReturn("test-only-new-path");
        var actor=SecurityContextHolder.getContext().getAuthentication();
        mvc.perform(multipart("/tickets/"+own.getId()+"/attachments")
                .file(new MockMultipartFile("file","test.txt","text/plain","test".getBytes())).principal(actor))
                .andExpect(status().isOk());
        mvc.perform(post("/tickets/"+own.getId()+"/comentarios").param("contenido","Mi respuesta").principal(actor))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.cantidadComentarios").value(2));
        verify(realtime).publish(eq("ticket-comment"),isNull(),eq(own.getId()),eq(java.util.Map.of("ticketId",own.getId())));
    }
    @ParameterizedTest @ValueSource(strings={"ADMIN","SUPERVISOR","TECNICO"})
    void staffRetainsGlobalAccessAndInternalComments(String role) throws Exception {
        login("support",role);
        mvc.perform(get("/tickets")).andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(2));
        mvc.perform(get("/tickets/"+foreign.getId())).andExpect(status().isOk());
        mvc.perform(get("/tickets/"+own.getId())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cantidadComentarios").value(2));
        mvc.perform(get("/attachments/"+foreignFile.getId())).andExpect(status().isOk());
        mvc.perform(delete("/attachments/"+foreignFile.getId()).principal(SecurityContextHolder.getContext().getAuthentication()))
                .andExpect(status().isOk());
    }
    @Test void guestAndUnauthenticatedServiceCallsAreDenied() {
        login("ana","INVITADO");
        assertThatThrownBy(()->tickets.obtenerPorId(own.getId())).isInstanceOf(AccessDeniedException.class);
        SecurityContextHolder.clearContext();
        assertThatThrownBy(()->files.obtenerMetadatos(ownFile.getId())).isInstanceOf(AccessDeniedException.class);
    }

    @ParameterizedTest @ValueSource(strings={"CLIENTE","TECNICO","ADMIN"})
    void uploadedFileBelongsToExactPublicComment(String role) {
        login("ana",role);
        Long messageId=tickets.agregarComentario(own.getId(),"Texto repetido",false,"ana").getComentarioCreadoId();
        assertThat(messageId).isNotNull();
        StorageProvider provider=mock(StorageProvider.class);
        when(storage.getStorageProvider()).thenReturn(provider);
        when(provider.storeFile(any(),anyString())).thenReturn("test-only-path");
        when(provider.getProviderName()).thenReturn("LOCAL");
        var result=files.subirAdjunto(own.getId(),new MockMultipartFile("file","test.pdf","application/pdf","%PDF-1.7\n%%EOF".getBytes()),"Respuesta","ana",messageId);
        em.flush();
        assertThat(result.getComentarioId()).isEqualTo(messageId);
        assertThat(em.find(TicketAttachment.class,result.getId()).getMensaje().getId()).isEqualTo(messageId);
        assertThat(tickets.obtenerPorId(own.getId()).getAttachments()).anySatisfy(a->assertThat(a.getComentarioId()).isEqualTo(messageId));
    }
    @Test void rejectsInvalidCommentLinksBeforeWritingAnyFile() {
        login("ana","ADMIN");
        var upload=new MockMultipartFile("file","x.pdf","application/pdf",new byte[]{1});
        var otherTicket=em.persist(Comentario.builder().ticket(foreign).usuario(ana).contenido("Otro ticket").build());
        var otherAuthor=em.persist(Comentario.builder().ticket(own).usuario(support).contenido("Otro autor").build());
        var internal=em.persist(Comentario.builder().ticket(own).usuario(ana).contenido("Privado").esInterno(true).build());
        for(Long id:List.of(otherTicket.getId(),otherAuthor.getId(),internal.getId(),Long.MAX_VALUE)) {
            assertThatThrownBy(()->files.subirAdjunto(own.getId(),upload,"","ana",id)).isInstanceOf(AccessDeniedException.class);
        }
        verifyNoInteractions(storage);
    }

    @Test void rejectsHtmlAndSvgBeforeStorageEvenForStaff() {
        login("ana","ADMIN");
        for(String name:List.of("x.html","x.svg","x.png","x.pdf"))
            assertThatThrownBy(()->files.subirAdjunto(own.getId(),new MockMultipartFile("file",name,"image/png","<svg onload='alert(1)'/>".getBytes()),"","ana"))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(storage);
    }
}
