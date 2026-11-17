package com.empresa.ticketmanagement.realtime;

import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.security.*;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration;
import org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration;
import org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.web.socket.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.awaitility.Awaitility.await;

// Servidor efímero local + JWT firmado + handshake real; los repositorios son mocks.
@SpringBootTest(classes=RealtimeHandshakeTest.TestApplication.class, webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties={"server.servlet.context-path=/api/v1","spring.jackson.time-zone=America/Lima",
                "app.jwt.secret=test-only-websocket-key-32-bytes-minimum-never-use-in-production",
                "logging.level.root=WARN"})
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class RealtimeHandshakeTest {
    @Configuration(proxyBeanMethods=false)
    @EnableAutoConfiguration(exclude={DataSourceAutoConfiguration.class,HibernateJpaAutoConfiguration.class,
            DataJpaRepositoriesAutoConfiguration.class,MailSenderAutoConfiguration.class})
    @Import({SecurityConfig.class,JwtAuthFilter.class,JwtUtils.class,RealtimeWebSocketHandler.class,
            RealtimeAuthorizationService.class,RealtimeWebSocketConfig.class})
    static class TestApplication {}
    @LocalServerPort int port;
    @Autowired JwtUtils jwt;
    @Autowired RealtimeWebSocketHandler handler;
    @Autowired ObjectMapper mapper;
    @MockitoBean UsuarioRepository users;
    @MockitoBean TicketRepository tickets;
    @MockitoBean UserDetailsServiceCustom userDetails;

    @BeforeEach void actors() {
        for(String name:List.of("ana","bob")) {
            long id=name.equals("ana")?1L:2L;
            var user=Usuario.builder().id(id).username(name).estado("ACTIVO")
                    .roles(Set.of(Rol.builder().nombre("ROLE_CLIENTE").build())).build();
            when(users.findByUsername(name)).thenReturn(Optional.of(user));
            when(userDetails.loadUserByUsername(name)).thenReturn(User.withUsername(name).password("test-only-hash")
                    .roles("CLIENTE").build());
        }
    }
    static class Receiver extends TextWebSocketHandler {
        BlockingQueue<String> messages=new LinkedBlockingQueue<>();
        CompletableFuture<CloseStatus> closed=new CompletableFuture<>();
        @Override protected void handleTextMessage(WebSocketSession session,TextMessage message){messages.add(message.getPayload());}
        @Override public void afterConnectionClosed(WebSocketSession session,CloseStatus status){closed.complete(status);}
    }
    WebSocketSession connect(Receiver receiver) throws Exception {
        String token=jwt.generateTokenFromUsername("ana");
        return new StandardWebSocketClient().execute(receiver,
                "ws://localhost:"+port+"/api/v1/ws/updates?access_token="+token).get(5,TimeUnit.SECONDS);
    }
    @Test void realHandshakePreservesAuthenticatedPrincipalAndDeliversOwnNotifications() throws Exception {
        Receiver receiver=new Receiver();WebSocketSession socket=connect(receiver);
        try {
            socket.sendMessage(new TextMessage("{\"type\":\"subscribe\"}"));
            await().atMost(Duration.ofSeconds(5)).untilAsserted(()->{
                handler.publish("notification",1L,null,"own-event");
                assertThat(receiver.messages.poll()).isNotNull();
            });
            receiver.messages.clear();
            handler.publish("notification",2L,null,"private-bob-event");
            assertThat(receiver.messages.poll(200,TimeUnit.MILLISECONDS)).isNull();
            assertThat(socket.isOpen()).isTrue();
        } finally {socket.close();}
    }
    @Test void realConnectionClosesWhenClientAttemptsAnotherUsersSubscription() throws Exception {
        Receiver receiver=new Receiver();WebSocketSession socket=connect(receiver);
        try {
            socket.sendMessage(new TextMessage("{\"type\":\"subscribe\",\"userId\":2}"));
            assertThat(receiver.closed.get(5,TimeUnit.SECONDS).getCode()).isEqualTo(1008);
            handler.publish("notification",2L,null,"private-bob-event");
            assertThat(receiver.messages).isEmpty();
        } finally {if(socket.isOpen())socket.close();}
    }
}
