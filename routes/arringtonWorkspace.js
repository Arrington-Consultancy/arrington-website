const express = require('express');
const {
  noindexHeader,
  requireWorkspaceApiAccess,
  requireWorkspacePageAccess,
  workspaceEnabled
} = require('../lib/arringtonWorkspace/access');
const repo = require('../lib/arringtonWorkspace/repository');
const { allWorkers, routeQuestion } = require('../lib/arringtonWorkspace/workers');

const router = express.Router();

function safeQuery(value) {
  return String(value || '').trim().slice(0, 160);
}

async function viewModel(req, active) {
  const dashboard = await repo.getDashboard();
  return {
    active,
    user: req.session.user,
    workers: allWorkers(),
    summary: dashboard.summary,
    navCounts: { openGaps: dashboard.summary.openGaps, staleSources: dashboard.summary.staleSources }
  };
}

function mountPageRoute(app, generateCsrfToken) {
  app.get('/arrington-workspace', noindexHeader, requireWorkspacePageAccess, async (req, res, next) => {
    try {
      const dashboard = await repo.getDashboard();
      res.render('arrington-workspace/dashboard', {
        ...(await viewModel(req, 'dashboard')),
        ...dashboard,
        csrfToken: generateCsrfToken(req, res),
        workspaceEnabled: workspaceEnabled()
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/arrington-workspace/brain', noindexHeader, requireWorkspacePageAccess, async (req, res, next) => {
    try {
      res.render('arrington-workspace/brain', {
        ...(await viewModel(req, 'brain')),
        sources: await repo.getSources(),
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/arrington-workspace/gaps', noindexHeader, requireWorkspacePageAccess, async (req, res, next) => {
    try {
      res.render('arrington-workspace/gaps', {
        ...(await viewModel(req, 'gaps')),
        gaps: await repo.getGaps(),
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/arrington-workspace/workers', noindexHeader, requireWorkspacePageAccess, async (req, res, next) => {
    try {
      res.render('arrington-workspace/workers', {
        ...(await viewModel(req, 'workers')),
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/arrington-workspace/activity', noindexHeader, requireWorkspacePageAccess, async (req, res, next) => {
    try {
      res.render('arrington-workspace/activity', {
        ...(await viewModel(req, 'activity')),
        activity: await repo.getActivity(),
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });
}

router.get('/api/arrington-workspace/search', noindexHeader, requireWorkspaceApiAccess, async (req, res, next) => {
  try {
    const q = safeQuery(req.query.q);
    const results = await repo.searchSources(q);
    res.json({ query: q, results });
  } catch (err) {
    next(err);
  }
});

router.post('/api/arrington-workspace/route', noindexHeader, requireWorkspaceApiAccess, async (req, res, next) => {
  try {
    const question = safeQuery(req.body.question);
    const worker = routeQuestion(question);
    await repo.recordActivity({
      actor: req.session.user.username,
      eventType: 'question_routed',
      summary: `Question routed to ${worker.name}: ${question || 'empty question'}`,
      sourceKey: worker.sourceKey
    });
    res.json({ worker });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, mountPageRoute };
