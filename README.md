# The Quad

Capacity planning for design teams. Design managers assign designers to quarterly projects, balance workloads and compare planning scenarios. Everything is stored locally in the browser (`localStorage`); there is no backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # capacity / curve / balancer / migration unit tests
npm run build      # typecheck + production build into dist/
```

## Accounts

The app opens on a sign-in screen. This isn't real authentication yet: an account is just an email and a name, stored in this browser. Each account's plans are kept under their own storage key (`the-quad:user:<email>`). Data created before accounts existed moves into the first account that signs in. People can also opt into product-update emails, or join the update list without signing in. Opt-ins are stored locally and can be exported as CSV from Settings → Account. To send them to a mailing-list service, set `VITE_SIGNUP_ENDPOINT` (each signup is POSTed there as JSON). See `src/account.ts` and `src/lib/session.ts`.

## Adding data fast

- **Paste anywhere.** Copy cells from a spreadsheet, a CSV or JSON export, tracker links, or plain lines, then press ⌘V/Ctrl-V anywhere outside a text field. The importer opens with the data already detected.
- **Drop a file** (CSV, TSV or JSON) anywhere on the window.
- **Quick-add syntax**, one project per line: `Checkout redesign @maya !P1 ~L #Checkout 6w 50%` sets the designer, priority, size or story points, product area, duration and allocation.
- **Trackers:** Jira, Asana, ServiceNow and Linear exports (CSV or JSON) and issue links are recognized automatically. Imported projects remember their tracker key, so importing again updates them instead of creating duplicates.

`src/lib/ingest.ts` is where future live integrations plug in. Each source is turned into a common `ExternalItem` format. `planImport` then decides what to create and what to update (matching by tracker id, then ticket, then name), maps statuses to phases, priorities, points to sizes, and dates to weeks, and matches designers by email, name or first name. The store's `applyImport` writes the result. A live Jira or Asana sync only needs to produce `ExternalItem[]`.

## Demo data

To try the app with a realistic team, use **Settings → Data → Load demo team**, the ⌘K palette ("Load demo team"), or the link on the first onboarding screen. Any of these adds a separate workspace (`src/lib/demo.ts`) with 10 designers, ~27 projects this quarter plus a draft for next quarter, a ranked backlog of unscheduled ideas, two plan scenarios, GA targets, PTO, on-call and onboarding. Your own data isn't touched. The data is the same every time it loads, and includes a few overloaded designers and some unassigned work so every view has something to show.

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
| `src/views/*` | Home (readiness, next steps, capacity heatmap), Gantt, Team (per-designer load, projects and allocation), Projects (the bulk-editable table), Disruptions, Backlog, Designer |
| `src/components/*` | Context bar, project detail, curve editor, onboarding, settings, import |

## Planning rules worth knowing

- **Calendar weeks = effort weeks ÷ allocation.** For example, a Large Design project at 50% is about 14 weeks. Shaped curves are adjusted so the recommendation still delivers the full effort.
- A **pair designer** is counted at half the primary designer's weekly allocation.
- Load colors: green ≤ 85%, yellow ≤ 100%, red above 100%.
- A project's **phase follows its schedule**: today's position in the schedule picks a phase from `phaseBreakdown`. Choosing a phase in the project panel pins it until you switch it back to Auto.
- The **backlog** holds three kinds of work: unassigned projects this quarter (which the auto-balancer places), unscheduled projects with no quarter yet (ranked, `quarter: null`), and projects already slotted into later quarters.
- Each quarter's capacity also includes work from neighbouring quarters, using each of those quarters' active plans, so spill-over shows up in the Gantt's before/after weeks.
- **Google Sheets import** reads sheets shared as "Anyone with the link can view" through their CSV export URL. For private sheets, copy the cells and paste them. Full OAuth would need a Google Cloud client ID, which this repo doesn't have yet.
