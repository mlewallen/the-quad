# Design Critique: Home view

**Reviewed:** `#/home` at 1440×900 with a 3-designer, 10-project workspace, then checked against a 10-designer team.
**Stage:** polishing a working view.
**Focus:** usability, visual appeal, and helping a manager see where the plan stands and what to do next.

---

### Overall Impression

Home is three lists of equal weight: plans, a projects table, and team cards. Everything is accurate, but nothing is interpreted. A manager landing here can't tell in two seconds whether the plan is in good shape, how far into the quarter they are, or what to do next. The page reports status but doesn't help the manager make progress. The biggest opportunity is to put a **plan-readiness summary and a "next steps" list** at the top, and to compress the team view so it still works with 10 or more designers.

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Nothing answers "is this plan ready?" The stat tiles (8/10 assigned, 8 confirmed, 2 over weeks) are tiny and buried inside plan cards. | 🔴 Critical | Add a readiness summary at the top: a score ring plus a three-stage tracker (**Assigned → Confirmed → Balanced**) for the active plan. |
| No guidance on what to do next. Unassigned work, tentative assignments and overloads all have to be found by scanning. | 🔴 Critical | Add a **Next steps** list built from the data, with one-click actions (open the backlog, confirm all, open an overloaded designer's view). When nothing is left, show a "plan is ready" state. |
| The team column grows about 85px per designer. With 10 people it scrolls, and weekly load is reduced to a single bar, so you can't see *when* someone is overloaded. | 🟡 Moderate | Replace it with a **capacity heatmap**: one compact row per designer with a cell per week, colored by load. Ten designers fit at a glance, and peaks show where they fall in time. |
| No sense of where we are in time (week 1 of 13? week 11?). | 🟡 Moderate | Show the quarter's progress in the summary, e.g. "Week 3 of 13 · 10 weeks left", with a thin progress bar. |
| The projects table duplicates Manage and takes half the page. | 🟡 Moderate | Keep it, since bulk editing from Home is useful, but make it secondary: move it below the summary and put it next to scenario comparison and upcoming milestones. |
| Plan cards compare scenarios through small text-heavy tiles. | 🟢 Minor | Give each plan a readiness bar and its key differences so scenarios can be compared at a glance. |
| Milestones aren't shown anywhere on Home. | 🟢 Minor | Add an "Upcoming milestones" list for the next 4 weeks. |

### Visual Hierarchy

- **What draws the eye first:** the "+ Project" button and the green Confirmed chips repeated down the table. The table's repetition wins by volume. It *should* be the plan's overall state.
- **Reading flow:** three columns of equal weight, read left to right with no anchor. There's no single headline.
- **Emphasis:** the most decision-relevant numbers (over-capacity weeks, unassigned count) are the smallest text on the page.
- **Whitespace and density:** the side columns leave a lot of dead space below short lists, while the middle column is dense.

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Status signals | Load uses green/yellow/red chips in the team column and plain numbers in plan cards. | Use the same load color scale everywhere, including the heatmap and the readiness score. |
| Section headers | Count chips sit next to titles, but no header has an action or a description. | Each panel gets a title, a one-line purpose, and at most one action. |

### Accessibility

- **Color contrast:** chips pass AA. Heatmap cells must not rely on color alone, so each cell gets a tooltip and there's a legend.
- **Targets:** next-step actions are full buttons of at least 28px, not text links.
- **Readability:** readiness percentages use 24px+ tabular numbers, and body text stays at 13px.

### What Works Well

- The load color scale and designer colors are already a shared language across views.
- Bulk editing with shift-click on Home is powerful, so keep it.
- The plan cards' rename, duplicate and delete actions are well placed and easy to discover.

### Priority Recommendations

1. **Plan readiness summary:** a score ring, the Assigned → Confirmed → Balanced tracker, quarter progress, and key numbers (projects, free capacity, overloaded designers). It answers "where do we stand?" in two seconds.
2. **Next steps:** a list built from the data with direct actions, ending in a "plan is ready" state. This turns Home from a report into something that moves the plan forward.
3. **Team capacity heatmap:** designers × weeks, which scales to 10 or more people and shows when load is a problem, not just whether it is. Each row links to that designer's view.
