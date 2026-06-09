const db = require('../db/pool');

// Hardcoded defaults — used as fallback if role_permissions table is empty or missing
const DEFAULTS = {
  admin:   { edit_content: true, manage_sections: true, manage_pages: true, manage_backups: true, manage_theme: true, view_activity: true, manage_users: true, manage_page_access: true, manage_seo: true, reset_content: true, view_csp: true, manage_permissions: true },
  content: { edit_content: true, manage_sections: true, manage_pages: true, manage_backups: true, manage_theme: true, view_activity: true, manage_users: true, manage_page_access: true, manage_seo: true, reset_content: false, view_csp: false, manage_permissions: false },
  client:  { edit_content: false, manage_sections: false, manage_pages: false, manage_backups: false, manage_theme: false, view_activity: false, manage_users: false, manage_page_access: false, manage_seo: false, reset_content: false, view_csp: false, manage_permissions: false }
};

const ALL_CAPABILITIES = Object.keys(DEFAULTS.admin);
const ALL_ROLES = ['admin', 'content', 'client'];

// In-memory cache: { role: { capability: boolean } }
let cache = null;

async function loadPermissions() {
  try {
    const { rows } = await db.query('SELECT role, capability, enabled FROM role_permissions');
    const map = {};
    for (const role of ALL_ROLES) {
      map[role] = { ...DEFAULTS[role] };
    }
    for (const row of rows) {
      if (map[row.role]) {
        map[row.role][row.capability] = row.enabled;
      }
    }
    cache = map;
  } catch (err) {
    console.error('Failed to load permissions, using defaults:', err.message);
    cache = JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function hasCapability(role, capability) {
  if (!cache) {
    // Fallback before cache is loaded
    return DEFAULTS[role]?.[capability] ?? false;
  }
  return cache[role]?.[capability] ?? DEFAULTS[role]?.[capability] ?? false;
}

function requireCapability(capability) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!hasCapability(req.session.user.role, capability)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function getCapabilitiesForRole(role) {
  const caps = {};
  for (const cap of ALL_CAPABILITIES) {
    caps[cap] = hasCapability(role, cap);
  }
  return caps;
}

function getPermissionsMatrix() {
  const matrix = {};
  for (const role of ALL_ROLES) {
    matrix[role] = getCapabilitiesForRole(role);
  }
  return matrix;
}

async function refreshPermissions() {
  await loadPermissions();
}

module.exports = {
  loadPermissions,
  hasCapability,
  requireCapability,
  getCapabilitiesForRole,
  getPermissionsMatrix,
  refreshPermissions,
  ALL_CAPABILITIES,
  ALL_ROLES
};
