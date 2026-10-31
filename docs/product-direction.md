# Product direction: The Quad as a design planning tool

**Thesis.** In most companies, design is the org whose work is hardest to see. Engineering has tickets, velocity and deploys. Product has roadmaps and OKRs. Design work spans many projects at partial allocation, much of it never shows up in a tracker (crits, consults, research, drive-by asks), and its impact is usually credited to whoever shipped the feature. Design managers end up defending headcount and saying "no" with spreadsheets and gut feel.

The Quad already answers *"who is working on what, and are they overloaded?"* The opportunity is to also answer the three questions design leaders get asked and can't easily answer:

1. **Demand:** *What is the business asking of design, and what aren't we doing because of it?*
2. **Impact:** *What did design actually change, ship, or de-risk this quarter?*
3. **Fit:** *Is design involved at the right time, with the right people, on the work that matters most?*

Every feature below serves one of those questions, or the people (design managers and product leaders) who need the answers.

---

## What already exists (and should stay the core)

- Quarterly plans with scenarios, a Gantt, allocation curves and an auto-balancer
- Size profiles that turn S/M/L/XL into effort weeks and recommended durations
- Disruptions (PTO, on-call, onboarding, design system support) counted against capacity
- Backlog, Focus, per-designer view, and import from Jira, Asana, Linear, ServiceNow and Sheets
- Readiness-focused Home with next steps and a capacity heatmap

These are strong foundations. Most of what follows adds *meaning* on top of the capacity math rather than replacing it.

---

## 1. Make demand visible

The single most persuasive artifact a design manager can bring to a planning meeting is a clear picture of what was asked for versus what the team can do.

| Feature | What it does | Why it matters |
|---|---|---|
| **Cut line in Backlog** | Rank the backlog by priority, total the effort weeks against remaining capacity, and draw a line where capacity runs out. Everything below is "not this quarter" by default. | Turns "we're busy" into "here are the 6 things we won't do unless something moves." |
| **Demand vs. capacity forecast** | Per quarter and per product area: requested effort weeks vs. available effort weeks, with the gap as a number and a chart. | The headcount conversation, quantified. |
| **Unplanned work log** | A one-keystroke "log an ask" (⌘K or a floating button): who asked, which area, rough size, whether it was accepted. Accepted asks consume capacity like a disruption. | Unplanned work is the biggest invisible tax on design. At quarter end, show "18% of capacity went to unplanned requests." |
| **Design request intake** | A shareable form for PMs and EMs: problem, desired outcome, deadline, confidence, stakeholders. Submissions land in Backlog in a "Needs triage" state. | Stops requests arriving via DMs and hallway conversations; creates a paper trail of demand. *(Needs a backend.)* |
| **Triage workflow** | Backlog states: New → Needs info → Sized → Accepted / Deferred / Declined, with a required reason for Deferred and Declined. | Declined work with reasons is evidence. It also protects designers from silent scope creep. |
| **Late-engagement tracking** | Record when design was brought in relative to the eng start date. Flag projects where design was engaged after eng kickoff. | A recurring, measurable org problem that leaders can act on. |

## 2. Make impact visible

Capacity tells you design was busy. Impact tells you it mattered.

| Feature | What it does | Why it matters |
|---|---|---|
| **Outcome fields on projects** | Hypothesis, success metric, baseline, target, and (after launch) result. Optional, but prompted when a project reaches its final milestone. | Connects design work to business numbers instead of output. |
| **Contribution types beyond "shipped"** | Tag what design delivered: shipped UI, research insight, strategic direction, de-risked or killed an idea, design system contribution, unblocked another team. | Much of design's best work is preventing bad bets. That should count. |
| **Artifact links** | Attach Figma files, prototypes, research reports and decks to a project, with thumbnails where possible. | The plan becomes the index of the team's work, not just its schedule. |
| **Quarterly impact report** | Auto-generated, editable summary: projects delivered by area and goal, contribution types, outcomes reported, unplanned load absorbed, notable wins. Export to PDF/slides or share as a link. | The thing a design leader sends to their VP every quarter, done in 10 minutes instead of a weekend. |
| **Quality signals** | Per project: accessibility review status, usability test done, design QA pass/fail at launch. | Gives design a quality story, not only a speed story. |
| **Wins feed** | Lightweight log of moments ("exec praised onboarding redesign", "conversion +4%"). Feeds the impact report and performance reviews. | Captures evidence when it happens instead of reconstructing it later. |

## 3. Model how design actually works

Design work isn't shaped like eng tickets. The tool should reflect the real lifecycle.

| Feature | What it does | Why it matters |
|---|---|---|
| **Phase gates with readiness criteria** | Each phase (Discovery → Concepts → Design → Approve → Handoff → Build support) can have exit criteria: brief approved, research complete, crit held, specs done. Show gate status on the Gantt. | Makes "is design ready?" a checkable state rather than a vibe. |
| **Eng timeline overlay** | Show the eng start and GA dates (from Jira/Linear or manual) alongside the design bar. Flag when design is on the critical path or finishes after eng starts. | The most common source of design–eng friction, made visible before it happens. |
| **Build-support tail** | When a project reaches Handoff, automatically add a low-allocation support tail (e.g. 10% for N weeks) unless turned off. | Design QA and support during build is real work that's almost never planned. |
| **Crit and review tracking** | Log design reviews per project (date, type, participants, decision). Surface projects that have gone N weeks without review. | Supports a healthy critique culture and shows leaders the rigor behind decisions. |
| **Research as shared work** | Research studies as their own items that can feed multiple projects, with researcher capacity tracked separately. | Research is often the first thing cut because its value is spread across projects. |
| **Design system investment** | Track system work as its own work type with a target share of capacity (e.g. 15%), and show actual vs. target. | Makes platform investment a deliberate, defended choice. |

## 4. Support the design manager's people work

| Feature | What it does | Why it matters |
|---|---|---|
| **Richer designer profiles** | Role (product, content, research, design ops, manager), level, FTE %, skills, product-area familiarity, growth goals. | Today a designer is just a name and color. Planning quality depends on knowing more. |
| **Fit-aware balancer** | The auto-balancer weighs skills, area continuity and growth goals, not only load. Suggest stretch assignments explicitly. | Turns balancing from load-leveling into team development. |
| **Context-switching flag** | Warn when a designer is on more than N concurrent projects, or when their week is fragmented across many small allocations. | 4 projects at 25% is not the same as 1 at 100%. This is a known productivity and burnout driver. |
| **Sustained overload alerts** | Flag designers who've been above 100% for several weeks across quarters, not just this week. | Burnout is a trend, not a spike. |
| **Area coverage and bus factor** | Show which product areas depend on a single designer, and who has historically owned each area. | Supports succession planning and smarter PTO coverage. |
| **1:1 prep export** | Per designer: current projects, load trend, upcoming milestones, recent wins, growth-goal progress. | Saves prep time every week and keeps growth conversations grounded in real work. |
| **Partial-IC managers** | Let managers include themselves with a reduced IC allocation. | Common in practice, and usually invisible. |

## 5. Give product leaders the view they need

Product leaders are the audience that decides design headcount and priorities. They need answers, not Gantt charts.

| Feature | What it does | Why it matters |
|---|---|---|
| **Investment mix** | Where design effort is going, by product area, goal/OKR and work type, compared with stated priorities. | "70% of design is on area X but it's our #3 priority" is a decision-forcing insight. |
| **Staffing ratios** | Designer : PM : engineer ratios per product area (eng and PM counts entered manually or synced). | The standard benchmark leaders use, computed automatically. |
| **What-if impact preview** | Before accepting a new request: "adding this pushes these 3 projects by 2–4 weeks" or "requires 0.5 FTE you don't have." | Makes the cost of a yes visible at the moment of the yes. |
| **Scenario diff** | Compare two plans side by side: what moved, what was cut, load changes per designer. | Plans exist today; the missing piece is explaining the difference to stakeholders. |
| **Headcount modeling** | Add a hypothetical hire or contractor with a start week and onboarding ramp, then see the backlog coverage change. | Turns a hiring request into a modeled business case. |
| **Read-only stakeholder view** | A clean, shareable roadmap for PMs and execs: what design is doing, when, and what's below the cut line. No editing chrome. | Makes design's plan visible outside the design team. *(Needs a backend or export.)* |
| **Plan accuracy retro** | At quarter end, compare the committed plan with what actually happened: slips, adds, cuts, with reasons. Track accuracy over quarters. | Builds credibility; teams that show their forecasting improve get trusted with more. |

## 6. Integrations that feed the story

Integrations should reduce manual entry and add evidence, not replicate other tools.

- **Figma:** link files to projects and show last-edited activity as a soft progress signal.
- **Jira / Linear:** sync eng epic start and GA dates for the eng timeline overlay. Two-way linking of design tickets.
- **Calendar:** pull PTO and recurring rituals (crits, on-call) into disruptions automatically.
- **Slack:** weekly digest for the manager (overloads, upcoming handoffs, untriaged requests) and an intake shortcut ("/design-request").
- **Weekly check-in:** a 30-second "where did your time actually go?" prompt for designers, giving plan-vs-actual data without timesheets.

## 7. Platform prerequisites

Several features above need things the app doesn't have yet, since everything lives in `localStorage` today:

- **Backend, auth and multi-user workspaces** (in progress on this branch) for intake, sharing, check-ins and integrations
- **Roles:** manager (edit), designer (view and check in), stakeholder (read-only)
- **History:** an audit log of plan changes, which is also the data source for plan-accuracy retros
- **Comments** on projects and plans
- **Exports:** PDF/slides for the impact report and quarterly plan

---

## Suggested sequencing

**Now: local-only, high signal, builds on current data**
1. Richer designer profiles (role, FTE %, skills)
2. Cut line and demand-vs-capacity in Backlog
3. Unplanned work log
4. Outcome fields, contribution types and artifact links
5. Context-switching and sustained-overload flags
6. Investment mix view
7. Build-support tail and eng timeline overlay (manual dates first)

**Next: once auth and a backend land**
1. Design request intake and triage workflow
2. Read-only stakeholder view and impact report export
3. Weekly check-ins for plan vs. actual
4. Jira/Linear date sync and Figma links
5. Scenario diff and what-if impact preview

**Later: differentiators**
1. Plan accuracy retros across quarters
2. Headcount modeling with ramp curves
3. Fit-aware balancer
4. AI-drafted impact reports and 1:1 prep from the plan, wins and check-ins
5. Anonymous cross-company benchmarks (ratios, unplanned-work share, design lead time)

## How we'd know it's working

- Design managers use the impact report or cut line in a real planning or headcount conversation
- Unplanned work share and late-engagement rate are tracked and trending down
- Product leaders open the stakeholder view without being sent a screenshot
- Plan accuracy improves quarter over quarter
- Time to prepare quarterly planning drops from days to under an hour

## Deliberately out of scope

- **Time tracking.** Check-ins should stay coarse and optional. Timesheets would destroy designer trust.
- **Task management.** Leave tickets to Jira/Linear/Asana. The Quad is the planning and visibility layer above them.
- **Individual productivity scoring.** Every metric is at the team or project level. Nothing should rank designers against each other.
