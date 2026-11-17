import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { passwordChangeGuard } from './core/guards/password-change.guard';
import { adminGuard } from './core/guards/admin.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { clientGuard } from './core/guards/client.guard';
import { technicianGuard } from './core/guards/technician.guard';

// Cargar pantallas al entrar en ellas para mantener pequeño el paquete inicial.
const loadLogin = () => import('./auth/login/login.component').then(module => module.LoginComponent);
const loadMainLayout = () => import('./layouts/main-layout/main-layout.component').then(module => module.MainLayoutComponent);
const loadTicketList = () => import('./tickets/ticket-list/ticket-list.component').then(module => module.TicketListComponent);
const loadReports = () => import('./reports/reports.component').then(module => module.ReportsComponent);
const loadUserManagement = () => import('./users/user-management.component').then(module => module.UserManagementComponent);
const loadAreaManagement = () => import('./areas/area-management.component').then(module => module.AreaManagementComponent);
const loadCategoryManagement = () => import('./categorias/category-management.component').then(module => module.CategoryManagementComponent);
const loadSubcategoryManagement = () => import('./subcategorias/subcategory-management.component').then(module => module.SubcategoryManagementComponent);
const loadClientLayout = () => import('./cliente/client-layout.component').then(module => module.ClientLayoutComponent);
const loadClientHome = () => import('./cliente/client-home.component').then(module => module.ClientHomeComponent);
const loadClientTicketList = () => import('./cliente/client-ticket-list.component').then(module => module.ClientTicketListComponent);
const loadClientTicketCreate = () => import('./cliente/client-ticket-create.component').then(module => module.ClientTicketCreateComponent);
const loadTechnicianLayout = () => import('./tecnico/technician-layout.component').then(module => module.TechnicianLayoutComponent);
const loadAudit = () => import('./audit/audit.component').then(module => module.AuditComponent);
const loadContacts = () => import('./contactos/contact-directory.component').then(module => module.ContactDirectoryComponent);
const loadSettings = () => import('./ajustes/settings.component').then(module => module.SettingsComponent);
const loadServiceManagement = () => import('./servicios/service-management.component').then(module => module.ServiceManagementComponent);
const loadServiceCategories = () => import('./servicios/service-category-management.component').then(module => module.ServiceCategoryManagementComponent);
const loadServiceDetail = () => import('./servicios/service-detail.component').then(module => module.ServiceDetailComponent);
const loadServiceHistory = () => import('./servicios/service-history.component').then(module => module.ServiceHistoryComponent);
const loadServiceCreate = () => import('./servicios/service-create.component').then(module => module.ServiceCreateComponent);
const loadTicketDetail = () => import('./tickets/ticket-detail/ticket-detail.component').then(module => module.TicketDetailComponent);
const loadDashboard = () => import('./dashboard/dashboard.component').then(module => module.DashboardComponent);
const loadKanban = () => import('./tickets/kanban/kanban.component').then(module => module.KanbanComponent);
const loadKnowledgeBase = () => import('./knowledge-base/knowledge-base.component').then(module => module.KnowledgeBaseComponent);
const loadClientProfile = () => import('./cliente/client-profile.component').then(module => module.ClientProfileComponent);
const loadTechnicianProfile = () => import('./tecnico/technician-profile.component').then(module => module.TechnicianProfileComponent);
const loadAdminProfile = () => import('./admin/admin-profile.component').then(module => module.AdminProfileComponent);
const loadChangePassword = () => import('./auth/change-password/change-password.component').then(module => module.ChangePasswordComponent);
const loadApiDocumentation = () => import('./shared/api-documentation/api-documentation.component').then(module => module.ApiDocumentationComponent);
const loadCompanyManagement = () => import('./empresas/company-management.component').then(module => module.CompanyManagementComponent);

export const routes: Routes = [
  { path: 'auth/login', loadComponent: loadLogin },
  { path: 'auth/change-password', canActivate: [passwordChangeGuard], loadComponent: loadChangePassword },
  { path: 'documentacion-api', canActivate: [authGuard], loadComponent: loadApiDocumentation },
  {
    path: 'cliente',
    loadComponent: loadClientLayout,
    canActivate: [clientGuard],
    canActivateChild: [authGuard],
    children: [
      { path: '', loadComponent: loadClientHome },
      { path: 'tickets', loadComponent: loadClientTicketList },
      { path: 'tickets/:id', loadComponent: loadTicketDetail, data: { role: 'client' } },
      { path: 'nuevo-ticket', loadComponent: loadClientTicketCreate },
      { path: 'perfil', loadComponent: loadClientProfile },
      { path: 'knowledge-base', loadComponent: loadKnowledgeBase, data: { readOnly: true } },
      { path: '**', redirectTo: '' }
    ]
  },
  {
    path: 'tecnico',
    loadComponent: loadTechnicianLayout,
    canActivate: [technicianGuard],
    canActivateChild: [authGuard],
    children: [
      { path: 'tickets/:id', loadComponent: loadTicketDetail, data: { role: 'technician' } },
      { path: 'nuevo-ticket', loadComponent: loadClientTicketCreate, data: { role: 'technician' } },
      { path: '', loadComponent: loadTicketList, data: { role: 'technician' } },
      { path: 'dashboard', loadComponent: loadDashboard, data: { role: 'technician' } },
      { path: 'kanban', loadComponent: loadKanban, data: { role: 'technician' } },
      { path: 'knowledge-base', loadComponent: loadKnowledgeBase },
      { path: 'contactos', canActivate: [permissionGuard], loadComponent: loadContacts, data: { permission: 'CONTACT_READ', portal: 'technician' } },
      { path: 'contactos/:id', canActivate: [permissionGuard], loadComponent: loadContacts, data: { permission: 'CONTACT_READ', portal: 'technician' } },
      { path: 'servicios/historial', loadComponent: loadServiceHistory, data: { portal: 'technician' } },
      { path: 'servicios/:id/historial', loadComponent: loadServiceHistory, data: { portal: 'technician' } },
      { path: 'servicios/nuevo', loadComponent: loadServiceCreate, data: { portal: 'technician' } },
      { path: 'servicios/:id/renovar', loadComponent: loadServiceCreate, data: { portal: 'technician' } },
      { path: 'servicios/:id', loadComponent: loadServiceDetail, data: { portal: 'technician' } },
      { path: 'servicios', loadComponent: loadServiceManagement, data: { portal: 'technician' } },
      { path: 'reports', canActivate: [permissionGuard], loadComponent: loadReports, data: { permission: 'REPORT_VIEW' } },
      { path: 'perfil', loadComponent: loadTechnicianProfile },
      { path: '**', redirectTo: '' }
    ]
  },
  {
    path: '',
    loadComponent: loadMainLayout,
    canActivate: [adminGuard],
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: loadDashboard, data: { role: 'admin' } },
      { path: 'tickets/kanban', loadComponent: loadKanban, data: { role: 'admin' } },
      { path: 'tickets/list', loadComponent: loadTicketList, data: { role: 'admin' } },
      { path: 'tickets/detail/:id', loadComponent: loadTicketDetail, data: { role: 'admin' } },
      { path: 'tickets/new', loadComponent: loadClientTicketCreate, data: { role: 'admin' } },
      { path: 'knowledge-base', loadComponent: loadKnowledgeBase },
      { path: 'reports', canActivate: [permissionGuard], loadComponent: loadReports, data: { permission: 'REPORT_VIEW' } },
      { path: 'audit', canActivate: [permissionGuard], loadComponent: loadAudit, data: { permission: 'AUDIT_VIEW' } },
      { path: 'ajustes', canActivate: [permissionGuard], loadComponent: loadSettings, data: { permission: 'SERVICE_CONFIG_MANAGE' } },
      { path: 'servicios/historial', loadComponent: loadServiceHistory },
      { path: 'servicios/nuevo', loadComponent: loadServiceCreate },
      { path: 'servicios/:id/renovar', loadComponent: loadServiceCreate },
      { path: 'servicios/:id/historial', loadComponent: loadServiceHistory },
      { path: 'servicios/:id', loadComponent: loadServiceDetail },
      { path: 'servicios', loadComponent: loadServiceManagement },
      { path: 'categorias-servicio', canActivate: [permissionGuard], loadComponent: loadServiceCategories, data: { permission: 'CATEGORY_MANAGE' } },
      { path: 'perfil', loadComponent: loadAdminProfile },
      { path: 'users', canActivate: [permissionGuard], loadComponent: loadUserManagement, data: { permission: 'USER_MANAGE' } },
      { path: 'contactos', canActivate: [permissionGuard], loadComponent: loadContacts, data: { permission: 'CONTACT_READ' } },
      { path: 'contactos/:id', canActivate: [permissionGuard], loadComponent: loadContacts, data: { permission: 'CONTACT_READ' } },
      { path: 'empresas', canActivate: [permissionGuard], loadComponent: loadCompanyManagement, data: { permission: 'ORGANIZATION_MANAGE' } },
      { path: 'areas', canActivate: [permissionGuard], loadComponent: loadAreaManagement, data: { permission: 'ORGANIZATION_MANAGE' } },
      { path: 'categorias', canActivate: [permissionGuard], loadComponent: loadCategoryManagement, data: { permission: 'CATEGORY_MANAGE' } },
      { path: 'subcategorias', canActivate: [permissionGuard], loadComponent: loadSubcategoryManagement, data: { permission: 'CATEGORY_MANAGE' } },
      { path: '**', redirectTo: 'dashboard' }
    ]
  }
];
