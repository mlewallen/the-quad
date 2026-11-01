# Design Critique: The Quad on a phone

**Reviewed:** every view at 375×812 (iPhone-sized), signed in, using the current desktop layout.
**Who:** design managers checking or adjusting a plan away from their laptop, such as between meetings, on a commute, or in a 1:1.
**Stage:** responsive pass on a shipped desktop app. Hard constraint: nothing changes above the phone breakpoint.

### Overall Impression

The app can't be used on a phone today. The 236px sidebar takes about 75% of a 375px screen, and the active view gets squeezed into a 90px column where words wrap one per line ("Designer / not / found"). The top bar's quarter stepper, plan switcher, search and "+ Project" run off the right edge. The foundations are good, though: the views are cards on a grid, the Gantt already scrolls inside its card, and popovers already render in a portal. So this is mainly a shell problem plus targeted view fixes, not a rebuild.

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| The sidebar is always expanded, takes most of the width, and has no way to dismiss it on touch (the `[` shortcut needs a keyboard). | 🔴 Critical | Below 720px, replace it with a **bottom tab bar** for the four views a manager checks most (Home, Gantt, Allocation, Backlog) plus **More**. More opens a bottom sheet with the other views, the team list, theme, settings and account. Thumbs reach the bottom of the screen; they don't reach a top-left hamburger. |
| The top bar holds six controls in one row: title, quarter, plan, search, "+ Project" and import. Most of them are off-screen. | 🔴 Critical | Use two compact rows. Row 1: workspace mark, page title, search, and **+**. Row 2: a full-width context strip with the quarter stepper on the left and the plan switcher filling the rest. Both stay 44px tall to match desktop. |
| Project detail opens as a 360px or wider side panel that's wider than the screen. | 🔴 Critical | On phones, always open project detail as a **bottom sheet** (about 92% of the height, rounded top, slides up). Hide the panel/modal/page switcher there, because the user can't choose a layout that doesn't fit. |
| Gantt bars use `touch-action: none`, so a finger that lands on a bar can't scroll the timeline. On a phone, most of the timeline is bars. | 🔴 Critical | Swiping should scroll, and a **long-press (about 300ms)** should pick up a bar to move or resize it, with a short vibration when supported. A tap still opens the project. Mouse behavior stays exactly as it is. |
| Settings shows a 200px nav column beside its content, inside a 904px modal. | 🟡 Moderate | Use a full-height sheet whose section nav is a horizontally scrolling tab strip at the top. |
| Modals, the importer and the command palette assume desktop margins (6vh top padding, 48px side insets). | 🟡 Moderate | Make them edge-to-edge sheets anchored to the bottom. Keep the palette near the top, so the keyboard doesn't cover the results. |
| Toasts sit at the bottom right with a 260px minimum width, which overlaps the new tab bar. | 🟡 Moderate | Make toasts full width just above the tab bar. Move the celebration pill up by the same amount. |
| On iOS, tapping an input with text under 16px zooms the page. | 🟡 Moderate | Use 16px text in form fields on phones only. |
| Fixed-width parts (the 220px search filter, the 320px minimum card width, 3-column grids, the 6-column KPI row, the 170px timeline label) overflow at 343px. | 🟡 Moderate | Make them fluid: full-width search, `min(320px, 100%)` card minimum, two-column KPIs, and narrower sticky labels. |

### Visual Hierarchy

- **What draws the eye first:** right now, the sidebar, which is navigation, not content. After the fix it should be the page title and then the view's first card. On Home, that's the readiness score, which is the right first answer to "how's the plan doing?"
- **Reading flow:** a single column throughout. Home's hero stacks the score, stage bars and KPIs vertically, and each 12-column span becomes full width.
- **Emphasis:** the tab bar stays quiet (neutral icons, with the accent only on the active tab). Badges carry the urgency: the backlog count, and a red dot on Allocation when anyone is overloaded.

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Navigation | The phone needs a different control (tabs), but the same information. | Reuse the sidebar's icons, labels, order and badge logic, so the two never drift apart. |
| Context controls | The quarter stepper and plan switcher need to work identically in both layouts. | Share one component between both top bars. Only spacing changes on the phone. |
| Sheets | Detail, settings and import would otherwise each slide in their own way. | Give them one sheet treatment: a grabber bar, a 16px top radius, and a spring slide-up that shares the desktop dialog's timing. |

### Accessibility

- **Touch targets:** tabs are 56px tall. Buttons move from 32px to 36px, and Gantt resize handles grow to 20px on coarse pointers. Every primary action is at least 44px.
- **Safe areas:** the tab bar pads by `env(safe-area-inset-bottom)` and the top bar by `env(safe-area-inset-top)`, so iPhone home indicators and notches never cover controls.
- **Labels:** icon-only controls keep their `aria-label`s, and the tab bar is a labelled `nav` that marks the active tab with `aria-current="page"`.
- **Reduced motion:** sheets and the long-press feedback still go through `MotionConfig reducedMotion="user"`.

### What Works Well

- Card and grid views reflow cleanly once they have the full width. Home's 12-column grid and the container queries do most of the work.
- Wide content (the Gantt, the heatmap, tables) already scrolls inside its own card, so the page itself never scrolls sideways.
- Popovers are placed in a portal from the trigger's rectangle, so they only need to be capped to the viewport width.

### Priority Recommendations

1. **Phone shell:** a bottom tab bar, a More sheet, and a two-row top bar. Without these, nothing else matters.
2. **Bottom-sheet project detail and settings:** so the core edit loop (tap a bar, change it, close) works one-handed.
3. **Touch-safe Gantt:** swipe scrolls, long-press drags, tap opens.
4. **Fluid views and form fields:** full-width filters, two-column KPIs, 16px inputs, and toasts that stay clear of the tab bar.

The breakpoint is `max-width: 720px` on the viewport. Every rule and component branch sits behind that query, so desktop is unchanged.
