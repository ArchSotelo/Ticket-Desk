package com.empresa.ticketmanagement.realtime;

import com.empresa.ticketmanagement.controller.TicketController;
import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.exception.GlobalExceptionHandler;
import com.empresa.ticketmanagement.notification.NotificacionService;
import com.empresa.ticketmanagement.repository.TicketRepository;
import com.empresa.ticketmanagement.security.*;
import com.empresa.ticketmanagement.service.impl.TicketServiceImpl;
import tools.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.socket.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

// REST, JWT, WebSocket y transacciones reales con H2. Nunca utiliza el MySQL del usuario.
@SpringBootTest(classes=TicketConversationRealtimeTest.App.class,webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
 properties={"server.servlet.context-path=/api/v1","spring.datasource.url=jdbc:h2:mem:conversation-realtime;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa","spring.datasource.password=","spring.datasource.driver-class-name=org.h2.Driver",
 "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect","spring.jpa.hibernate.ddl-auto=create-drop",
 "spring.sql.init.mode=never","spring.jackson.time-zone=America/Lima",
 "app.jwt.secret=test-only-conversation-jwt-signing-key-never-use-in-production","logging.level.root=WARN"})
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class TicketConversationRealtimeTest {
 @Configuration(proxyBeanMethods=false)
 @EnableAutoConfiguration(exclude=MailSenderAutoConfiguration.class)
 @EntityScan(basePackageClasses=Ticket.class)
 @EnableJpaRepositories(basePackageClasses=TicketRepository.class)
 @Import({SecurityConfig.class,JwtAuthFilter.class,JwtUtils.class,UserDetailsServiceCustom.class,TicketAccessPolicy.class,
   TicketServiceImpl.class,TicketController.class,GlobalExceptionHandler.class,RealtimeWebSocketHandler.class,
   RealtimeAuthorizationService.class,RealtimeWebSocketConfig.class})
 static class App {}
 @LocalServerPort int port;
 @Autowired JwtUtils jwt;
 @Autowired ObjectMapper mapper;
 @Autowired EntityManager em;
 @Autowired PlatformTransactionManager transactions;
 @Autowired RealtimeWebSocketHandler events;
 @MockitoBean NotificacionService notifications;
 final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

 private Usuario actor(String name,String role,Empresa company){
   Rol r=em.merge(Rol.builder().nombre(role).build());
   var permissions=new java.util.ArrayList<String>();permissions.add("TICKET_READ");
   if(!"ROLE_CLIENTE".equals(role))permissions.add("TICKET_UPDATE");
   for(String code:permissions){
     var matches=em.createQuery("select p from Permiso p where p.codigo=:code",Permiso.class).setParameter("code",code).getResultList();
     Permiso permission=matches.isEmpty()?new Permiso():matches.getFirst();
     if(matches.isEmpty()){permission.setCodigo(code);permission.setNombre(code);permission.setModulo("TICKETS");em.persist(permission);}
     r.getPermisos().add(permission);
   }
   Usuario u=Usuario.builder().username(name).passwordHash("test-only-hash").nombres(name).apellidos("Pruebas")
     .email(name+"@example.test").empresa(company).roles(Set.of(r)).build();em.persist(u);return u;
 }
 record Snapshot(List<String> messages) {}
 class Receiver extends TextWebSocketHandler {
   final String token;final long id;
   final AtomicBoolean ready=new AtomicBoolean();
   final Queue<Snapshot> snapshots=new ConcurrentLinkedQueue<>();
   final Queue<String> errors=new ConcurrentLinkedQueue<>();
   Receiver(String token,long id){this.token=token;this.id=id;}
   @Override protected void handleTextMessage(WebSocketSession socket,TextMessage message){
     try {
       var event=mapper.readTree(message.getPayload());
       if(event.path("payload").path("ready").asBoolean()){ready.set(true);return;}
       if(!Set.of("ticket-comment","ticket-updated").contains(event.path("type").asText()))return;
       var response=http.send(HttpRequest.newBuilder(URI.create(base()+"/tickets/"+id)).timeout(Duration.ofSeconds(5))
          .header("Authorization","Bearer "+token).GET().build(),HttpResponse.BodyHandlers.ofString());
       if(response.statusCode()!=200){errors.add("GET status "+response.statusCode());return;}
       List<String> values=new ArrayList<>();mapper.readTree(response.body()).path("data").path("comentarios")
          .forEach(comment->values.add(comment.path("contenido").asText()));
       snapshots.add(new Snapshot(values));
     }catch(Exception e){errors.add(e.getClass().getSimpleName());}
   }
 }
 String base(){return "http://localhost:"+port+"/api/v1";}
 @Test void threeConsecutiveMessagesFromEachRoleAreImmediatelyVisibleToSenderAndAllReceivers() throws Exception {
   long id=new TransactionTemplate(transactions).execute(status->{
     Empresa company=Empresa.builder().razonSocial("Demo").ruc("12345678901").build();em.persist(company);
     Usuario client=actor("cliente","ROLE_CLIENTE",company);actor("tecnico","ROLE_TECNICO",company);actor("admin","ROLE_ADMIN",company);
     Estado state=Estado.builder().nombre("Nuevo").codigo("NUEVO").build();em.persist(state);
     em.persist(Estado.builder().nombre("Asignado").codigo("ASIGNADO").build());
     Prioridad priority=Prioridad.builder().nombre("Media").nivel(2).build();em.persist(priority);
     Categoria category=Categoria.builder().nombre("Soporte").build();em.persist(category);
     Ticket ticket=Ticket.builder().codigo("TEST-REALTIME").titulo("Conversación").descripcion("Prueba aislada")
       .cliente(client).empresa(company).categoria(category).estado(state).prioridad(priority)
       .fechaCreacion(LocalDateTime.now()).fechaLimiteRespuesta(LocalDateTime.now().plusHours(1))
       .fechaLimiteResolucion(LocalDateTime.now().plusHours(4)).build();em.persist(ticket);return ticket.getId();
   });
   List<WebSocketSession> sockets=new ArrayList<>();Map<String,Receiver> receivers=new LinkedHashMap<>();
   try {
     for(String name:List.of("cliente","tecnico","admin")){
       String token=jwt.generateTokenFromUsername(name);Receiver receiver=new Receiver(token,id);receivers.put(name,receiver);
       WebSocketSession socket=new StandardWebSocketClient().execute(receiver,
         "ws://localhost:"+port+"/api/v1/ws/updates?access_token="+token).get(5,TimeUnit.SECONDS);
       sockets.add(socket);socket.sendMessage(new TextMessage("{\"type\":\"subscribe\",\"ticketId\":"+id+"}"));
     }
     await().atMost(Duration.ofSeconds(5)).until(()->{
       events.publish("ticket-comment",null,id,Map.of("ready",true));return receivers.values().stream().allMatch(r->r.ready.get());
     });
     int expected=0;
     for(var entry:receivers.entrySet())for(int index=1;index<=3;index++){
       String content=entry.getKey()+" mensaje "+index;expected++;
       var request=HttpRequest.newBuilder(URI.create(base()+"/tickets/"+id+"/comentarios?contenido="+
         URLEncoder.encode(content,StandardCharsets.UTF_8)+"&esInterno=false"))
         .header("Authorization","Bearer "+entry.getValue().token).timeout(Duration.ofSeconds(10))
         .POST(HttpRequest.BodyPublishers.noBody()).build();
       var response=http.send(request,HttpResponse.BodyHandlers.ofString());
       assertThat(response.statusCode()).isEqualTo(200);
       var comments=mapper.readTree(response.body()).path("data").path("comentarios");
       assertThat(comments.size()).isEqualTo(expected);
       assertThat(comments.get(comments.size()-1).path("contenido").asText()).isEqualTo(content);
       int count=expected;
       for(Receiver receiver:receivers.values())await().atMost(Duration.ofSeconds(5)).untilAsserted(()->{
         assertThat(receiver.errors).isEmpty();
         assertThat(receiver.snapshots).anySatisfy(snapshot->{
           assertThat(snapshot.messages()).hasSize(count);assertThat(snapshot.messages().get(count-1)).isEqualTo(content);
         });
       });
     }
   }finally{for(WebSocketSession socket:sockets)if(socket.isOpen())socket.close();}
 }
}
