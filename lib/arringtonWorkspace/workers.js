const WORKERS = [
  {
    id: 'website_hosting',
    name: 'Arrington Website & Hosting',
    role: 'Repository, Railway, CMS and public-site technical delivery',
    status: 'active',
    sourceKey: 'website-hosting-handoff'
  },
  {
    id: 'ai_workspace_builder',
    name: 'Arrington AI Workspace Builder',
    role: 'Workspace architecture, source boundaries and acceptance shape',
    status: 'active',
    sourceKey: 'workspace-builder-handoff'
  },
  {
    id: 'governance_assurance',
    name: 'Governance & Assurance',
    role: 'Independent gates, stop conditions and permission checks',
    status: 'active',
    sourceKey: 'tech-implementation-brief'
  },
  {
    id: 'brain_keeper',
    name: 'Company Brain Keeper',
    role: 'Source discipline, freshness and canonical records',
    status: 'active',
    sourceKey: 'brain-index'
  }
];

function allWorkers() {
  return WORKERS.map((w) => ({ ...w }));
}

function routeQuestion(text) {
  const q = String(text || '').toLowerCase();
  if (/\b(railway|github|deploy|branch|commit|site|website|server|database)\b/.test(q)) {
    return WORKERS.find((w) => w.id === 'website_hosting');
  }
  if (/\b(governance|permission|approval|gate|risk|clearance)\b/.test(q)) {
    return WORKERS.find((w) => w.id === 'governance_assurance');
  }
  if (/\b(source|brain|drive|record|fresh|stale|gap)\b/.test(q)) {
    return WORKERS.find((w) => w.id === 'brain_keeper');
  }
  return WORKERS.find((w) => w.id === 'ai_workspace_builder');
}

module.exports = { allWorkers, routeQuestion };
