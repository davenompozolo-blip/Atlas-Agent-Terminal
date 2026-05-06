// Vercel Serverless Function: fetch GitHub repo context using server-side GITHUB_PAT.
// The browser only sends the repo name — the token never leaves the server.
//
// Environment variables:
//   GITHUB_PAT - Personal Access Token with repo read scope
//
// GET /api/github-context?repo=owner/repo-name

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.GITHUB_PAT;
  if (!token) return res.status(501).json({ error: 'GITHUB_PAT not configured on server' });

  const { repo } = req.query;
  if (!repo || !repo.includes('/')) {
    return res.status(400).json({ error: 'repo query param required (owner/repo)' });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept:        'application/vnd.github+json',
    'User-Agent':  'ATLAS-Command-Centre',
  };
  const base = `https://api.github.com/repos/${repo}`;

  try {
    const [repoRes, commitsRes, issuesRes, treeRes] = await Promise.all([
      fetch(base,                                            { headers }),
      fetch(`${base}/commits?per_page=8`,                   { headers }),
      fetch(`${base}/issues?state=open&per_page=10`,        { headers }),
      fetch(`${base}/git/trees/HEAD?recursive=false`,       { headers }),
    ]);

    if (!repoRes.ok) {
      return res.status(repoRes.status).json({ error: `GitHub returned ${repoRes.status} — check the repo name and PAT scope` });
    }

    const [repoData, commits, issues, tree] = await Promise.all([
      repoRes.json(), commitsRes.json(), issuesRes.json(), treeRes.json(),
    ]);

    let ctx = `Repository: ${repoData.full_name}\n`;
    if (repoData.description) ctx += `Description: ${repoData.description}\n`;
    ctx += `Default branch: ${repoData.default_branch} · Stars: ${repoData.stargazers_count}\n`;

    if (Array.isArray(tree.tree)) {
      const files = tree.tree
        .filter(f => f.type === 'blob' || f.type === 'tree')
        .map(f => f.type === 'tree' ? `📁 ${f.path}/` : `  ${f.path}`)
        .slice(0, 60);
      if (files.length) ctx += `\nRoot file tree:\n${files.join('\n')}`;
    }

    if (Array.isArray(commits) && commits.length) {
      ctx += `\n\nRecent commits:\n`;
      commits.slice(0, 8).forEach(c => {
        const sha = (c.sha || '').slice(0, 7);
        const msg = (c.commit?.message || '').split('\n')[0];
        ctx += `  ${sha} ${msg}\n`;
      });
    }

    if (Array.isArray(issues) && issues.length) {
      ctx += `\nOpen issues (${issues.length}):\n`;
      issues.slice(0, 10).forEach(i => { ctx += `  #${i.number} ${i.title}\n`; });
    }

    return res.status(200).json({ repo: repoData.full_name, context: ctx });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Failed to reach GitHub API' });
  }
};
