package com.empresa.ticketmanagement.config;

import com.empresa.ticketmanagement.entity.*;
import com.empresa.ticketmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Inicializa los datos maestros en la base de datos al arrancar la aplicación
 * si no existen previamente. Las contraseñas iniciales provienen del entorno.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final RolRepository rolRepository;
    private final PermisoRepository permisoRepository;
    private final EmpresaRepository empresaRepository;
    private final AreaRepository areaRepository;
    private final UsuarioRepository usuarioRepository;
    private final PrioridadRepository prioridadRepository;
    private final EstadoRepository estadoRepository;
    private final CategoriaRepository categoriaRepository;
    private final SubcategoriaRepository subcategoriaRepository;
    private final SlaRepository slaRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${APP_SEED_ADMIN_PASSWORD:}")
    private String adminPassword;
    @Value("${APP_SEED_TECHNICIAN_PASSWORD:}")
    private String technicianPassword;
    @Value("${APP_SEED_CLIENT_PASSWORD:}")
    private String clientPassword;

    @Override
    public void run(String... args) throws Exception {
        if (rolRepository.count() > 0) {
            log.info("Datos iniciales ya existen, omitiendo inicialización.");
            return;
        }
        // Validar antes de insertar datos para evitar una inicialización parcial.
        for (String password : new String[] { adminPassword, technicianPassword, clientPassword }) {
            if (password == null || password.length() < 8
                    || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
                throw new IllegalStateException("Configura APP_SEED_ADMIN_PASSWORD, APP_SEED_TECHNICIAN_PASSWORD "
                        + "y APP_SEED_CLIENT_PASSWORD (entre 8 y 72 bytes) para inicializar una base vacía.");
            }
        }
        log.info("Inicializando datos maestros del sistema...");

        // 1. PERMISOS. Las asignaciones se guardan en roles_permisos, no en el JWT.
        Permiso pTicketCreate = crearPermiso("TICKET_CREATE", "Crear Tickets", "TICKETS");
        Permiso pTicketRead = crearPermiso("TICKET_READ", "Ver Tickets", "TICKETS");
        Permiso pTicketUpdate = crearPermiso("TICKET_UPDATE", "Modificar Tickets", "TICKETS");
        Permiso pTicketDelete = crearPermiso("TICKET_DELETE", "Eliminar Tickets", "TICKETS");
        Permiso pTicketAssign = crearPermiso("TICKET_ASSIGN", "Asignar Técnico", "TICKETS");
        Permiso pUserManage = crearPermiso("USER_MANAGE", "Gestionar Usuarios", "USUARIOS");
        Permiso pReportView = crearPermiso("REPORT_VIEW", "Ver Reportes", "REPORTES");
        Permiso pAttachment = crearPermiso("ATTACHMENT_UPLOAD", "Subir Adjuntos", "ADJUNTOS");
        Permiso pOrganization = crearPermiso("ORGANIZATION_MANAGE", "Gestionar empresas y áreas", "ORGANIZACION");
        Permiso pCategory = crearPermiso("CATEGORY_MANAGE", "Gestionar categorías", "CATALOGOS");
        Permiso pServiceConfig = crearPermiso("SERVICE_CONFIG_MANAGE", "Gestionar ajustes globales", "CONFIGURACION");
        Permiso pAudit = crearPermiso("AUDIT_VIEW", "Consultar auditoría", "AUDITORIA");
        Permiso pContact = crearPermiso("CONTACT_READ", "Consultar contactos", "CONTACTOS");

        // 2. Solo cuatro roles. La base existente se actualiza con 06_roles_permissions.sql.
        Rol admin = Rol.builder().nombre("ROLE_ADMIN").descripcion("Administrador General")
                .permisos(Set.of(pTicketCreate, pTicketRead, pTicketUpdate, pTicketDelete, pTicketAssign,
                        pUserManage, pReportView, pAttachment, pOrganization, pCategory, pServiceConfig, pAudit, pContact)).build();
        Rol supervisor = Rol.builder().nombre("ROLE_SUPERVISOR").descripcion("Supervisor de Mesa de Ayuda")
                .permisos(Set.of(pTicketCreate, pTicketRead, pTicketUpdate, pTicketAssign, pReportView,
                        pAttachment, pAudit, pContact)).build();
        Rol tecnico = Rol.builder().nombre("ROLE_TECNICO").descripcion("Técnico Especialista")
                .permisos(Set.of(pTicketCreate, pTicketRead, pTicketUpdate, pReportView, pAttachment, pContact)).build();
        Rol cliente = Rol.builder().nombre("ROLE_CLIENTE").descripcion("Usuario Cliente")
                .permisos(Set.of(pTicketCreate, pTicketRead, pAttachment)).build();
        rolRepository.saveAll(java.util.List.of(admin, supervisor, tecnico, cliente));

        // 3. EMPRESA DEMO
        Empresa empresa = Empresa.builder()
                .razonSocial("Corporación Demo S.A.C.")
                .ruc("20123456789")
                .email("contacto@demo.com")
                .telefono("+51 1 555-0100")
                .direccion("Av. Principal 123, Lima")
                .build();
        empresaRepository.save(empresa);

        // 4. ÁREAS
        Area areaTi  = Area.builder().empresa(empresa).nombre("Tecnología de la Información").build();
        Area areaRrhh= Area.builder().empresa(empresa).nombre("Recursos Humanos").build();
        Area areaOps = Area.builder().empresa(empresa).nombre("Operaciones").build();
        areaRepository.saveAll(java.util.List.of(areaTi, areaRrhh, areaOps));

        // 5. USUARIOS INICIALES
        Usuario adminUser = Usuario.builder()
                .username("admin").passwordHash(passwordEncoder.encode(adminPassword))
                .nombres("Administrador").apellidos("General")
                .email("admin@demo.com").empresa(empresa).area(areaTi)
                .cargo("CIO").estado("ACTIVO")
                .roles(Set.of(admin))
                .build();
        Usuario tecnicoUser = Usuario.builder()
                .username("tecnico1").passwordHash(passwordEncoder.encode(technicianPassword))
                .nombres("Carlos").apellidos("Mendoza")
                .email("carlos.mendoza@demo.com").empresa(empresa).area(areaTi)
                .cargo("Soporte Senior TI").estado("ACTIVO")
                .roles(Set.of(tecnico))
                .build();
        Usuario clienteUser = Usuario.builder()
                .username("cliente1").passwordHash(passwordEncoder.encode(clientPassword))
                .nombres("Ana").apellidos("Torres")
                .email("ana.torres@demo.com").empresa(empresa).area(areaRrhh)
                .cargo("Analista RRHH").estado("ACTIVO")
                .roles(Set.of(cliente))
                .build();
        usuarioRepository.saveAll(java.util.List.of(adminUser, tecnicoUser, clienteUser));

        // 6. PRIORIDADES
        Prioridad baja     = crearPrioridad("Baja",    1, "#28A745", 24, 72);
        Prioridad media    = crearPrioridad("Media",   2, "#FFC107", 12, 48);
        Prioridad alta     = crearPrioridad("Alta",    3, "#FD7E14",  4, 24);
        Prioridad critica  = crearPrioridad("Crítica", 4, "#DC3545",  1,  4);

        // 7. ESTADOS DEL WORKFLOW
        Estado nuevo           = crearEstado("Nuevo",             "NUEVO",             "#17A2B8", true,  false, 1);
        Estado asignado        = crearEstado("Asignado",          "ASIGNADO",          "#6F42C1", false, false, 2);
        Estado enProceso       = crearEstado("En Proceso",        "EN_PROCESO",        "#007BFF", false, false, 3);
        Estado pendienteCliente= crearEstado("Pendiente Cliente", "PENDIENTE_CLIENTE", "#FFC107", false, false, 4);
        Estado resuelto        = crearEstado("Resuelto",          "RESUELTO",          "#28A745", false, false, 5);
        Estado cerrado         = crearEstado("Cerrado",           "CERRADO",           "#343A40", false, true,  6);
        Estado cancelado       = crearEstado("Cancelado",         "CANCELADO",         "#DC3545", false, true,  7);

        // 8. CATEGORÍAS Y SUBCATEGORÍAS
        Categoria catHw  = Categoria.builder().nombre("Hardware & Equipos").descripcion("Laptops, Monitores y Periféricos").build();
        Categoria catSw  = Categoria.builder().nombre("Software & Aplicaciones").descripcion("Licencias, ERP, Correo").build();
        Categoria catNet = Categoria.builder().nombre("Redes & Conectividad").descripcion("VPN, Wi-Fi, Servidores").build();
        Categoria catSec = Categoria.builder().nombre("Accesos & Seguridad").descripcion("Cuentas, Permisos, Contraseñas").build();
        categoriaRepository.saveAll(java.util.List.of(catHw, catSw, catNet, catSec));

        subcategoriaRepository.saveAll(java.util.List.of(
            Subcategoria.builder().categoria(catHw).nombre("Falla de Pantalla / Monitor").build(),
            Subcategoria.builder().categoria(catHw).nombre("Teclado o Mouse averiado").build(),
            Subcategoria.builder().categoria(catSw).nombre("Error en Sistema ERP").build(),
            Subcategoria.builder().categoria(catSw).nombre("Configuración de Correo").build(),
            Subcategoria.builder().categoria(catNet).nombre("Falla de VPN").build(),
            Subcategoria.builder().categoria(catSec).nombre("Restablecimiento de Contraseña").build()
        ));

        // 9. SLA
        slaRepository.saveAll(java.util.List.of(
            Sla.builder().nombre("SLA Estándar Baja").prioridad(baja).tiempoRespuestaMinutos(1440).tiempoResolucionMinutos(4320).build(),
            Sla.builder().nombre("SLA Estándar Media").prioridad(media).tiempoRespuestaMinutos(720).tiempoResolucionMinutos(2880).build(),
            Sla.builder().nombre("SLA Urgente Alta").prioridad(alta).tiempoRespuestaMinutos(240).tiempoResolucionMinutos(1440).build(),
            Sla.builder().nombre("SLA Crítico VIP").prioridad(critica).tiempoRespuestaMinutos(60).tiempoResolucionMinutos(240).build()
        ));

        log.info("Datos iniciales cargados correctamente.");
    }

    private Permiso crearPermiso(String codigo, String nombre, String modulo) {
        return permisoRepository.save(Permiso.builder().codigo(codigo).nombre(nombre).modulo(modulo).build());
    }

    private Prioridad crearPrioridad(String nombre, int nivel, String color, int respHrs, int resolHrs) {
        return prioridadRepository.save(Prioridad.builder().nombre(nombre).nivel(nivel)
                .colorHex(color).tiempoRespuestaHrs(respHrs).tiempoResolucionHrs(resolHrs).build());
    }

    private Estado crearEstado(String nombre, String codigo, String color, boolean esInicial, boolean esFinal, int orden) {
        return estadoRepository.save(Estado.builder().nombre(nombre).codigo(codigo)
                .colorHex(color).esInicial(esInicial).esFinal(esFinal).orden(orden).build());
    }
}
