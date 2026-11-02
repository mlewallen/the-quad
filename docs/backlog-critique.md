# Design critique: Backlog (November 2026)

**Reviewed:** the Backlog view after it became a single column with the auto-balance wizard and per-project plan pages. Demo workspace (10 designers), 1440×900, light theme.
**Stage:** refinement. The data model and flows exist; this is about layout and form factor.

## Overall impression

The page now holds the right things (this quarter's unowned work, ranked ideas, and work slotted into later quarters), but it still reads as three unrelated lists stacked top to bottom. The biggest opportunity is to show it as what it is: **demand over time, set against capacity**, so a manager can see at a glance where work piles up and move it.

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **No sense of capacity.** Each section totals effort weeks, but nothing says whether that's a lot. "40 effort wks" next quarter means nothing without the team's free capacity next to it. | 🔴 Critical | Put a demand-vs-capacity summary per horizon at the top: effort against free designer-weeks, with the gap called out. This is also the start of the cut line (roadmap 1.1). |
| **The page is one long scroll.** At 1440×900, Future quarters starts below the fold and its 14 rows push the page to almost 1,700px. Unscheduled ideas, the most forward-looking part, sit in the middle. | 🔴 Critical | Lay the horizons out side by side as lanes (now, next, later, unscheduled) so everything is visible at once on desktop, and stack them with a lane switcher on phones. |
| **Moving work between horizons is inconsistent.** Unassigned rows have an undo icon, unscheduled rows have a "Plan for…" menu, future rows have a wide "Pull into FY27 Q4" button plus an icon. Three patterns for one action. | 🟡 Moderate | One "Move to…" menu on every card (this quarter, next, later quarters, unscheduled), plus drag between lanes for pointer users. |
| **How far a plan has got is buried in a sentence.** "planned: 14w @ 50% · 6 phases · 3 milestones · Ava Thompson" is long and only shows on some rows. | 🟡 Moderate | Show plan readiness as a compact, consistent row of indicators on every card: owner, phases, milestones, GA. |
| **No way to narrow the list.** With 25+ items across horizons there's no search, priority or area filter. | 🟡 Moderate | One filter bar for the whole page: search, priority, product area. |
| **Deleting is one tap away** from reordering on unscheduled rows, with a red icon at the row's end. | 🟢 Minor | Move delete into the card's menu. |

## Visual hierarchy

- **What draws the eye first:** the orange Auto-balance button and the "5 unassigned" chip. That's right for this quarter but says nothing about the rest of the page.
- **Reading flow:** strictly top to bottom through three cards of different shapes. Later quarters come last, although they're often what a planning conversation is about.
- **Emphasis:** every row has the same weight. A P0 idea with no plan looks the same as a P3 that's fully planned.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Row anatomy | Three different row layouts: priority on the left (two sections) or after the name (unscheduled); meta under the name in two sections, beside it in one. | One card component for every item. |
| Section actions | Totals sit at the right of each header, but the quick-add only exists in one section and the wizard lives in the page toolbar. | Lane headers share a layout: title, count, effort, and the lane's one action. |
| Buttons | "Pull into FY27 Q4" is a full secondary button repeated 14 times; other moves are icons or menus. | One menu per card. |

## Accessibility

- **Color contrast:** chips and text use the AA tokens from section 0, so this passes.
- **Touch targets:** the rank arrows and icon buttons are 28px, under the 44px recommended for phones. Give them bigger hit areas at phone width.
- **Text readability:** the meta lines are 11–12px and long. Shorter indicators read better.
- **Keyboard:** everything works with the keyboard today; a redesign must keep a non-drag path for every move.

## What works well

- Every name opens the plan page, so the backlog is a launch point into planning.
- Ranking keeps focus on the moved item.
- The auto-balancer is out of the way until it's needed.
- Effort totals per section are the right unit; they just need capacity beside them.

## Priority recommendations

1. **Horizon board with capacity.** Four lanes (needs an owner this quarter, next quarter, later, unscheduled), each with a header showing unplaced effort against the team’s free capacity for that horizon.
2. **One card, one move menu.** The same card everywhere: priority, key, name, plan-readiness indicators, and a "Move to…" menu, with drag between lanes as a shortcut.
3. **A filter bar** for search, priority and area across all lanes, and a lane switcher on phones.
