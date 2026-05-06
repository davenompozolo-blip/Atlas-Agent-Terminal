# ATLAS Command Centre

A standalone AI terminal for managing the ATLAS investment analytics platform. Four specialist agents — Archivist, Architect, Engineer, and Strategist — powered by Claude.

## Deploy on Vercel

1. Import this repo into Vercel.
2. Set the following environment variable in your Vercel project settings:
   - `ANTHROPIC_API_KEY` — your Anthropic API key
   - `ANTHROPIC_MODEL` — optional, defaults to `claude-opus-4-6`
   - `ATLAS_ALLOWED_ORIGIN` — optional, CORS origin if needed

No build step required. Vercel serves `public/index.html` statically and runs `api/command-centre.js` as a serverless function.

## Local Development

```bash
npm install -g vercel
vercel dev
```

Open `http://localhost:3000`.

## Agents

| Agent | Speciality |
|---|---|
| **Archivist** | State recall, open issues, version history, project status |
| **Architect** | Schema design, SQL views, data architecture, migration strategy |
| **Engineer** | Implementation specs, bug fixes, code architecture, deployment |
| **Strategist** | Product roadmap, feature priority, release planning, commercial strategy |
