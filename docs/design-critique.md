# Design Critique: The Quad

**Reviewed:** the running app (onboarding, Home, Gantt, Allocation, Disruptions, Focus, Manage, Backlog, project detail, Settings) at 1440×900 in light and dark themes.
**Stage:** a working v1 moving into polish.
**Focus:** the app shell and navigation, how modern the components feel, clean UI, and motion.

---

### Overall Impression

The foundations are solid. The data model is clear, the Gantt is genuinely useful, and the restrained neutral palette with designer colors reads well. The biggest opportunity is the **shell**. Right now the app reads as a web page with a header, not a tool you live in. The wrapping top bar packs five unrelated controls of the same visual weight into one row. Navigation is a plain tab strip with no icons and no shortcuts. Nothing moves, so state changes (switching plans, opening details, dragging) feel abrupt. Fixing those three things changes how the whole app feels.

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Plan actions (new, duplicate) are hidden inside a native `<select>` behind a fake `──────` divider. Picking an option runs an action, which isn't what people expect a select to do. | 🔴 Critical | Replace it with a plan switcher popover: a list of plans with stats, and separate "New plan" and "Duplicate" items with icons. |
| Destructive actions use the browser's `confirm()`, which is unstyled, blocks the page, and can't follow the app's theme. | 🔴 Critical | Use an in-app confirm dialog with a clear destructive button, and show a toast after the change. |
| Seven top-level views sit in a text-only tab strip. There are no icons or shortcuts, and no way to jump to a project or command from the keyboard. | 🟡 Moderate | Use a collapsible left sidebar with icons, counts, and number-key shortcuts, plus a ⌘K command palette for views, projects and actions. |
| The quarter control lives in the middle of a wrapping header, so at narrower widths it drops to a second line and the hierarchy falls apart. | 🟡 Moderate | Put a dedicated top bar inside the content area with breadcrumb-style context: workspace › quarter › plan. |
| Actions give no feedback. Duplicating a plan, applying balancer suggestions, or importing changes data silently. | 🟡 Moderate | Add a toast system for confirmations and errors. |
| Settings is a modal that's 980px wide with its own nav, so it competes with the app's navigation. | 🟢 Minor | Keep the modal, but give it a sidebar-style nav with icons that matches the shell. |
| Gantt bar labels are cut off with no tooltip on keyboard focus. | 🟢 Minor | Show the tooltip on focus as well as hover. |

### Visual Hierarchy

- **What draws the eye first:** the purple "+ Initiative" button in the top right. That's acceptable, but the Gantt itself should come first. The header has no clear anchor, because the brand, the workspace select, the quarter, and the plan select all carry equal weight.
- **Reading flow:** the eye zig-zags across a single crowded header row, then drops to the tabs, then the view title. Each view also repeats its title as a 22px H1 right under the tab that already names it, so it's said twice.
- **Emphasis:** load chips (green, yellow, red) are the most important signal on Gantt and Home, but at 11px they're quieter than the column headers. Designer names and load should be stronger, and the column chrome should be lighter.
- **Whitespace:** cards use 14px padding while the view gutter is 16px, so content feels tight against the edges. A 4px spacing scale (8, 12, 16, 24, 32) would add some breathing room.

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Icons | Unicode glyphs (⚙ ✕ ‹ › ◧ ⬚ ▸) render differently across operating systems and fonts. | Use one icon set (Lucide) at 16px with a 1.75 stroke throughout. |
| Buttons | Four heights are in use (24, 28, 30px, plus the segmented control), and "ghost" and "icon" buttons have different hover colors. | Standardize on two sizes (28 and 32px) and give every button variant the same hover, active, and focus styles. |
| Radii | 6, 8, 10, and 14px are mixed without a pattern. | Use three tokens: 6px for controls, 10px for cards, 14px for overlays. |
| Elevation | Cards use a border with no shadow, and modals use a heavy shadow. There's nothing in between for popovers. | Add a three-level elevation scale: border, popover, overlay. |
| Selects | Native selects sit next to custom segmented controls, which makes the UI feel uneven. | Keep native selects for long lists inside forms, and use custom menus for shell-level switchers. |
| Typography | Inter is declared but never loaded, so it falls back to the system font. | Load Inter, turn on tabular numbers for all percentages and dates, and set a type scale of 12, 13, 15, 18, and 24px. |

### Accessibility

- **Color contrast:** body text passes in both themes. `--text-3` (#8d8d85 on white) is about 3.4:1, which fails AA for the 11px text it's used on (week dates, hints). Darken it to about #73736b, roughly 4.6:1. White labels on yellow (#f59e0b) and light designer colors fail at about 2.1:1. Pick the label color from the bar color's luminance.
- **Touch targets:** 24px small buttons and 8px resize handles are below the 24px minimum for pointer targets and well below 44px for touch. Make the handle hit area 12px on a 4px visual grip, and make 28px the minimum control height.
- **Text readability:** 10–11px is used for week labels and chips, which is too small to scan. Use 12px minimum with tabular numbers.
- **Motion:** there's no reduced-motion handling yet beyond the confetti, so the new motion layer has to respect `prefers-reduced-motion`.
- **Focus:** `:focus-visible` outlines exist only on inputs and buttons. Gantt bars, rows, and links have no visible focus ring.

### Motion (currently none)

The app has no motion at all, except for a single fade on overlays and a slide on the side panel. Proposed principles:

1. **Motion explains change.** When something changes (switching plans, dragging, reassigning), animate it from its old position to its new one so the eye can follow. Use layout animations on Gantt bars and table rows.
2. **Fast and physical.** Use springs with short durations: 150–220ms for UI chrome and 250–350ms for panels. Nothing should block input.
3. **Enter softly, exit faster.** Overlays and panels come in with opacity plus an 8–16px offset, and leave in about two-thirds of that time.
4. **Small, staggered reveals** for lists and cards when a view first appears, around 20ms per item, capped so big lists don't drag.
5. **Feedback on touch.** Buttons press down slightly (scale 0.97). Draggable bars lift with a shadow.
6. **Respect `prefers-reduced-motion`.** Fall back to opacity-only transitions or none.

### What Works Well

- Designer colors give each person a strong identity across every view. The hatched pattern for tentative work and the diagonal stripes for disruptions are clever, low-ink ways to encode status.
- The capacity health strip and trend line add a lot of information without clutter. Together they're the best part of the Gantt.
- Planning Intelligence is genuinely helpful. The recommendation, its reasoning, and one-click apply follow good "explain, then act" UX.
- The light and dark token sets are already in place, which makes a refresh cheap.
- Bulk editing with shift-click range selection is powerful and easy to discover.

### Priority Recommendations

1. **Rebuild the shell:** a collapsible sidebar (brand, workspace switcher, icon nav with counts and shortcuts, settings at the bottom) plus a slim top bar (quarter stepper, plan switcher popover, ⌘K search, primary action). This fixes the crowded header, makes navigation one keystroke away, and frees vertical space for the Gantt.
2. **Bring the components up to date:** Lucide icons, in-app confirm dialogs and toasts, a popover menu component, consistent button sizes and radii, Inter with tabular numbers, and contrast-safe text tokens. This removes the native-browser feel and the inconsistencies listed above.
3. **Add a motion layer** following the principles above: view and panel transitions, layout animation for bars and rows, spring-driven overlays, press feedback, and full reduced-motion support. This makes changes easy to follow and makes the tool feel crafted.
