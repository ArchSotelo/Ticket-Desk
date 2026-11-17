// Los fixtures antiguos solo declaraban roles. Simula los permisos que ahora
// devuelve la API; una lista permissions explícita (incluso []) se conserva.
function installPermissionSessionDefaults() {
  if (window !== window.top || window.__permissionFixtureInstalled) return;
  window.__permissionFixtureInstalled = true;
  const grants = {
    ROLE_ADMIN: [
      'TICKET_CREATE',
      'TICKET_READ',
      'TICKET_UPDATE',
      'TICKET_DELETE',
      'TICKET_ASSIGN',
      'USER_MANAGE',
      'REPORT_VIEW',
      'ATTACHMENT_UPLOAD',
      'ORGANIZATION_MANAGE',
      'CATEGORY_MANAGE',
      'SERVICE_CONFIG_MANAGE',
      'AUDIT_VIEW',
      'CONTACT_READ',
    ],
    ROLE_SUPERVISOR: [
      'TICKET_CREATE',
      'TICKET_READ',
      'TICKET_UPDATE',
      'TICKET_ASSIGN',
      'REPORT_VIEW',
      'ATTACHMENT_UPLOAD',
      'AUDIT_VIEW',
      'CONTACT_READ',
    ],
    ROLE_TECNICO: [
      'TICKET_CREATE',
      'TICKET_READ',
      'TICKET_UPDATE',
      'REPORT_VIEW',
      'ATTACHMENT_UPLOAD',
      'CONTACT_READ',
    ],
    ROLE_CLIENTE: ['TICKET_CREATE', 'TICKET_READ', 'ATTACHMENT_UPLOAD'],
  };
  const nativeSet = Storage.prototype.setItem;
  function session(value) {
    try {
      const data = JSON.parse(value);
      if (data && data.permissions === undefined)
        data.permissions = [...new Set((data.roles || []).flatMap((role) => grants[role] || []))];
      return JSON.stringify(data);
    } catch {
      return value;
    }
  }
  Storage.prototype.setItem = function (key, value) {
    nativeSet.call(this, key, key === 'user_session' ? session(value) : value);
  };
  const existing = localStorage.getItem('user_session');
  if (existing) nativeSet.call(localStorage, 'user_session', session(existing));
}
module.exports = { installPermissionSessionDefaults };
