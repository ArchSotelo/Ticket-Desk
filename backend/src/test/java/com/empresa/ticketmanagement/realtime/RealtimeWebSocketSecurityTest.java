package com.empresa.ticketmanagement.realtime;

import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import com.empresa.ticketmanagement.security.JwtUtils;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.socket.*;

import java.net.URI;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RealtimeWebSocketSecurityTest {
    UsuarioRepository users;
    TicketRepository tickets;
    JwtUtils jwt;
    RealtimeWebSocketHandler handler;
    Map<String,Usuario> accounts;
    Map<Long,Ticket> records;
    MutableClock clock;
    Usuario ana,bob,staff;
    Ticket own,foreign,otherOwn;
    static class MutableClock extends Clock {
        Instant now=Instant.parse("2026-11-01T12:00:00Z");
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return now;}
    }
    @BeforeEach void setup() {
        SecurityContextHolder.clearContext();
        users=mock(UsuarioRepository.class);tickets=mock(TicketRepository.class);jwt=mock(JwtUtils.class);
        clock=new MutableClock();accounts=new HashMap<>();records=new HashMap<>();
        ana=account(1L,"ana","ROLE_CLIENTE");bob=account(2L,"bob","ROLE_CLIENTE");staff=account(3L,"staff","ROLE_TECNICO");
        own=ticket(11L,ana);foreign=ticket(12L,bob);otherOwn=ticket(13L,ana);
        when(users.findByUsername(anyString())).thenAnswer(i->Optional.ofNullable(accounts.get(i.getArgument(0))));
        when(tickets.findById(anyLong())).thenAnswer(i->Optional.ofNullable(records.get(i.getArgument(0))));
        when(jwt.validateJwtToken(anyString())).thenReturn(true);
        when(jwt.getUserNameFromJwtToken(anyString())).thenAnswer(i->((String)i.getArgument(0)).substring(4));
        when(jwt.getExpirationFromJwtToken(anyString())).thenReturn(Date.from(clock.instant().plusSeconds(300)));
        handler=new RealtimeWebSocketHandler(new ObjectMapper(),new RealtimeAuthorizationService(users,tickets),jwt,clock);
    }
    Usuario account(long id,String name,String role) {
        Usuario u=Usuario.builder().id(id).username(name).estado("ACTIVO")
                .roles(Set.of(Rol.builder().nombre(role).build())).build();accounts.put(name,u);return u;
    }
    Ticket ticket(long id,Usuario owner) {Ticket t=Ticket.builder().id(id).cliente(owner).build();records.put(id,t);return t;}
    WebSocketSession session(String name) {
        WebSocketSession s=mock(WebSocketSession.class);
        when(s.getPrincipal()).thenReturn(new UsernamePasswordAuthenticationToken(name,null,List.of(new SimpleGrantedAuthority("ROLE_CLIENTE"))));
        when(s.getUri()).thenReturn(URI.create("ws://localhost/api/v1/ws/updates?access_token=jwt-"+name));
        when(s.getHandshakeHeaders()).thenReturn(new HttpHeaders());when(s.isOpen()).thenReturn(true);
        when(s.getAttributes()).thenReturn(new HashMap<>());return s;
    }
    WebSocketSession connect(String name){WebSocketSession s=session(name);handler.afterConnectionEstablished(s);return s;}
    void subscribe(WebSocketSession s,String fields){handler.handleTextMessage(s,new TextMessage("{\"type\":\"subscribe\""+fields+"}"));}
    void rejected(WebSocketSession s) throws Exception {verify(s).close(argThat(status->status.getCode()==1008));verify(s,never()).sendMessage(any());}

    @Test void delayedRevocationCannotCloseASocketFromANewerSession() throws Exception {
        WebSocketSession old = connect("ana");
        ana.setVersionSesion(1);
        ana.setPasswordHash("test-only-hash");
        WebSocketSession current = session("ana");
        var details = new com.empresa.ticketmanagement.security.SessionUserDetails(ana,
                List.of(new SimpleGrantedAuthority("ROLE_CLIENTE")));
        when(current.getPrincipal()).thenReturn(new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));
        handler.afterConnectionEstablished(current);
        handler.sessionRevoked(new com.empresa.ticketmanagement.security.SessionRevokedEvent(ana.getId(), 1));
        verify(old).close(argThat(status -> "SESSION_REVOKED".equals(status.getReason())));
        verify(current, never()).close(any());
        handler.publish("notification", ana.getId(), null, "new-session");
        verify(current).sendMessage(any());
    }

    @Test void currentVersionAndPasswordRequirementAreRecheckedBeforeSending() throws Exception {
        WebSocketSession old = connect("ana");
        ana.setVersionSesion(1);
        handler.publish("notification", ana.getId(), null, "private");
        rejected(old);
        WebSocketSession limited = session("bob");
        bob.setRequiereCambioPassword(true);
        handler.afterConnectionEstablished(limited);
        rejected(limited);
    }

    @Test void notificationsUseServerIdentityEvenWithoutUserIdAndIgnoreSessionAttributeInjection() throws Exception {
        WebSocketSession a=connect("ana"),b=connect("bob");
        a.getAttributes().put("userId",2L);subscribe(a,"");
        handler.publish("notification",2L,null,"bob-private");
        verify(a,never()).sendMessage(any());verify(b).sendMessage(any(TextMessage.class));
        handler.publish("notification",1L,null,"ana-private");verify(a).sendMessage(any(TextMessage.class));
    }
    @Test void legacyMatchingUserIdStillWorksButSpoofingClosesConnection() throws Exception {
        WebSocketSession good=connect("ana");subscribe(good,",\"userId\":1");
        handler.publish("notification",1L,null,"own");verify(good).sendMessage(any());
        WebSocketSession bad=connect("ana");subscribe(bad,",\"userId\":2");
        handler.publish("notification",2L,null,"private");rejected(bad);
    }
    @Test void anotherClientsTicketCannotBeSubscribedTo() throws Exception {
        WebSocketSession s=connect("ana");subscribe(s,",\"ticketId\":12");
        handler.publish("ticket-comment",null,12L,"private");rejected(s);
    }
    @Test void ownerCanSubscribeAndPrivateUserEventsCannotUseTicketAsAnAlternateRecipient() throws Exception {
        WebSocketSession a=connect("ana"),b=connect("bob");subscribe(a,",\"ticketId\":11");
        handler.publish("notification",2L,11L,"only-bob");
        verify(a,never()).sendMessage(any());verify(b).sendMessage(any());
        handler.publish("ticket-comment",null,11L,"owner-event");verify(a).sendMessage(any());
    }
    @Test void clientCannotSubscribeToKanban() throws Exception {
        WebSocketSession s=connect("ana");subscribe(s,",\"scope\":\"KANBAN\"");
        handler.publishBoard("kanban-ticket-updated",Map.of("ticketId",12));rejected(s);
    }
    @ParameterizedTest @ValueSource(strings={"ROLE_ADMIN","ROLE_SUPERVISOR","ROLE_TECNICO"})
    void staffCanReceiveKanbanAndAnyExistingTicket(String role) throws Exception {
        staff.setRoles(Set.of(Rol.builder().nombre(role).build()));WebSocketSession s=connect("staff");
        subscribe(s,",\"scope\":\"KANBAN\",\"ticketId\":12");
        handler.publishBoard("kanban-ticket-updated",Map.of("ticketId",12));
        handler.publish("ticket-comment",null,12L,"ticket");verify(s,times(2)).sendMessage(any());verify(s,never()).close(any());
    }
    @Test void changingOrOmittingChannelsReplacesTheOldSubscriptionAtomically() throws Exception {
        WebSocketSession s=connect("ana");subscribe(s,",\"ticketId\":11");subscribe(s,",\"ticketId\":13");
        handler.publish("ticket-comment",null,11L,"old");verify(s,never()).sendMessage(any());
        handler.publish("ticket-comment",null,13L,"current");verify(s).sendMessage(any());
        subscribe(s,"");handler.publish("ticket-comment",null,13L,"removed");verify(s).sendMessage(any());
        handler.publish("notification",1L,null,"personal");verify(s,times(2)).sendMessage(any());
    }
    @ParameterizedTest @ValueSource(strings={"0","-1","1.5","\"11\"","9223372036854775808","{}"})
    void rejectsMalformedTicketIds(String value) throws Exception {
        WebSocketSession s=connect("ana");subscribe(s,",\"ticketId\":"+value);rejected(s);
    }
    @Test void malformedResubscriptionDoesNotLeaveOldChannelActive() throws Exception {
        WebSocketSession s=connect("ana");subscribe(s,",\"ticketId\":11");
        handler.handleTextMessage(s,new TextMessage("not-json"));handler.publish("ticket-comment",null,11L,"private");rejected(s);
    }
    @Test void unknownScopeAndMissingTicketsAreRejected() throws Exception {
        WebSocketSession s=connect("ana");subscribe(s,",\"scope\":\"ADMIN\"");rejected(s);
        WebSocketSession other=connect("ana");subscribe(other,",\"ticketId\":999");rejected(other);
    }
    @Test void ownershipChangesRevokeDeliveryToExistingSubscribers() throws Exception {
        WebSocketSession s=connect("ana");subscribe(s,",\"ticketId\":11");own.setCliente(bob);
        handler.publish("ticket-comment",null,11L,"private");rejected(s);
    }
    @Test void removingStaffRoleRevokesKanbanDelivery() throws Exception {
        WebSocketSession s=connect("staff");subscribe(s,",\"scope\":\"KANBAN\"");
        staff.setRoles(Set.of(Rol.builder().nombre("ROLE_CLIENTE").build()));
        handler.publishBoard("kanban-ticket-updated",Map.of("ticketId",11));rejected(s);
    }
    @ParameterizedTest @ValueSource(strings={"disabled","locked","deleted","recreated"})
    void accountChangesRevokeExistingConnections(String change) throws Exception {
        WebSocketSession s=connect("ana");
        switch(change){case "disabled"->ana.setEstado("INACTIVO");case "locked"->ana.setBloqueadoHasta(java.time.LocalDateTime.now().plusHours(1));
            case "deleted"->accounts.remove("ana");case "recreated"->ana.setId(99L);default->throw new AssertionError();}
        handler.publish("notification",1L,null,"private");rejected(s);
    }
    @Test void expiredConnectionCannotReceiveEventsOrResubscribe() throws Exception {
        WebSocketSession s=connect("ana");clock.now=clock.now.plusSeconds(301);
        handler.publish("notification",1L,null,"private");rejected(s);
    }
    @ParameterizedTest @ValueSource(strings={"missing","invalid","mismatch","expired","anonymous","unauthenticated","no-principal"})
    void handshakeIdentityAndSignedTokenAreRequired(String mode) throws Exception {
        WebSocketSession s=session("ana");
        switch(mode){
            case "missing"->when(s.getUri()).thenReturn(URI.create("ws://localhost/api/v1/ws/updates"));
            case "invalid"->when(jwt.validateJwtToken("jwt-ana")).thenReturn(false);
            case "mismatch"->when(jwt.getUserNameFromJwtToken("jwt-ana")).thenReturn("bob");
            case "expired"->when(jwt.getExpirationFromJwtToken("jwt-ana")).thenReturn(Date.from(clock.now.minusSeconds(1)));
            case "anonymous"->when(s.getPrincipal()).thenReturn(new AnonymousAuthenticationToken("key","anonymous",List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));
            case "unauthenticated"->when(s.getPrincipal()).thenReturn(new UsernamePasswordAuthenticationToken("ana","unused"));
            case "no-principal"->when(s.getPrincipal()).thenReturn(null);
            default->throw new AssertionError();
        }
        handler.afterConnectionEstablished(s);rejected(s);
    }
    @Test void closedConnectionsAndTransportErrorsAreRemoved() throws Exception {
        WebSocketSession closed=connect("ana"),broken=connect("ana");
        handler.afterConnectionClosed(closed,CloseStatus.NORMAL);handler.handleTransportError(broken,new java.io.IOException("closed"));
        handler.publish("notification",1L,null,"private");verify(closed,never()).sendMessage(any());rejected(broken);
    }
    @Test void concurrentPublicationsNeverWriteTheSameSocketSimultaneously() throws Exception {
        WebSocketSession s=connect("ana");AtomicBoolean writing=new AtomicBoolean();AtomicInteger overlapping=new AtomicInteger();
        doAnswer(i->{if(!writing.compareAndSet(false,true))overlapping.incrementAndGet();Thread.yield();writing.set(false);return null;})
                .when(s).sendMessage(any());
        ExecutorService pool=Executors.newFixedThreadPool(4);
        try {List<Future<?>> results=new ArrayList<>();for(int i=0;i<40;i++)results.add(pool.submit(()->handler.publish("notification",1L,null,"own")));
            for(Future<?> future:results)future.get(5,TimeUnit.SECONDS);
        } finally {pool.shutdownNow();}
        assertThat(overlapping.get()).isZero();verify(s,times(40)).sendMessage(any());
    }
    @Test void transactionalEventsAreDeliveredOnlyAfterCommit() throws Exception {
        var client=connect("ana");subscribe(client,",\"ticketId\":11");
        var tech=connect("staff");subscribe(tech,",\"ticketId\":11,\"scope\":\"KANBAN\"");
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            handler.publish("ticket-comment",null,11L,Map.of("ticketId",11));
            handler.publish("notification",1L,null,"own");
            handler.publishBoard("kanban-ticket-updated",Map.of("ticketId",11));
            handler.publishStaffTicket("ticket-comment",11L,Map.of("ticketId",11));
            verify(client,never()).sendMessage(any());verify(tech,never()).sendMessage(any());
            var callbacks=org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations();
            assertThat(callbacks).hasSize(4);
            callbacks.forEach(org.springframework.transaction.support.TransactionSynchronization::afterCommit);
            verify(client,times(2)).sendMessage(any());verify(tech,times(3)).sendMessage(any());
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
            org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(false);
        }
    }
    @Test void rolledBackMessagesNeverProduceRealtimeEvents() throws Exception {
        var s=connect("ana");subscribe(s,",\"ticketId\":11");
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            handler.publish("ticket-comment",null,11L,"uncommitted");
            org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations().forEach(callback->
                    callback.afterCompletion(org.springframework.transaction.support.TransactionSynchronization.STATUS_ROLLED_BACK));
            verify(s,never()).sendMessage(any());
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
            org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(false);
        }
    }
    @Test void internalNotesRefreshStaffWithoutNotifyingOrDisconnectingClient() throws Exception {
        var client=connect("ana");subscribe(client,",\"ticketId\":11");
        var tech=connect("staff");subscribe(tech,",\"ticketId\":11");
        handler.publishStaffTicket("ticket-comment",11L,Map.of("ticketId",11));
        verify(tech).sendMessage(any());verify(client,never()).sendMessage(any());verify(client,never()).close(any());
        handler.publish("ticket-comment",null,11L,Map.of("ticketId",11));verify(client).sendMessage(any());
    }

}
