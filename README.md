# The Quad

Capacity planning for design teams. Design managers assign designers to quarterly projects, balance workloads and compare planning scenarios. Everything is stored locally in the browser (`localStorage`); there is no backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # capacity / curve / balancer / migration unit tests
npm run build      # typecheck + production build into dist/
```

## Demo data

To try the app with a realistic team, use **Settings → Data → Load demo team**, the ⌘K palette ("Load demo team"), or the link on the first onboarding screen. Any of these adds a separate workspace (`src/lib/demo.ts`) with 10 designers, ~27 projects this quarter plus a draft for next quarter, two plan scenarios, PTO, on-call and onboarding. Your own data isn't touched. The data is the same every time it loads, and includes a few overloaded designers and some unassigned work so every view has something to show.

## How it's organized

| Path | What lives there |
| --- | --- |
| `src/types.ts` | Data model: workspaces, projects (shared metadata), plans (per-plan schedules), disruptions, settings |
| `src/store.ts` | Zustand store persisted to `localStorage`; every mutation, celebration triggers, and the v1 → v2 migration |
| `src/hooks.ts` | Selectors (active plan, entries, weekly load) and hash routing (`#/gantt?p=<id>`, `#/project/<id>`) |
| `src/lib/quarters.ts` | Fiscal calendar: 13-week quarters anchored to the Monday on/before the fiscal start month |
| `src/lib/capacity.ts` | Weekly load per designer (projects + disruptions), overload detection |
| `src/lib/curves.ts` | Flat / front / back / bell / custom allocation curves; custom curves resample when duration changes |
| `src/lib/sizing.ts` | Size profiles (effort weeks by work type × S/M/L/XL) and the duration recommendation |
| `src/lib/balancer.ts` | Greedy auto-balancer (even load, priority first, minimize conflicts) |
| `src/views/*` | Home (readiness, next steps, capacity heatmap), Gantt, Allocation, Disruptions, Focus, Manage, Backlog, Designer |
| `src/components/*` | Context bar, project detail, curve editor, onboarding, settings, import |

## Planning rules worth knowing

- **Calendar weeks = effort weeks ÷ allocation.** For example, a Large Design project at 50% is about 14 weeks. Shaped curves are adjusted so the recommendation still delivers the full effort.
- A **pair designer** is counted at half the primary designer's weekly allocation.
- Load colors: green ≤ 85%, yellow ≤ 100%, red above 100%.
- Each quarter's capacity also includes work from neighbouring quarters, using each of those quarters' active plans, so spill-over shows up in the Gantt's before/after weeks.
- **Google Sheets import** reads sheets shared as "Anyone with the link can view" through their CSV export URL. For private sheets, copy the cells and paste them. Full OAuth would need a Google Cloud client ID, which this repo doesn't have yet.
