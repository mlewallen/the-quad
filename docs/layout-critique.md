# Design Critique: App shell at non-default UI scale, and Home width

**Reviewed:** the shell at Interface scale 80%, 100% and 130% (1440×900), plus Home compared with Gantt, Allocation, Manage and Backlog.
**Stage:** bug fix and consistency pass on a shipped layout.

### Overall Impression

At 100% the shell is solid. At any other scale, the frame stops matching the window. Zoomed in, the sidebar and content end partway down and leave a blank band at the bottom (in the reported screenshot, about 20% of the height). Zoomed out, the shell grows taller than the window, so the whole page scrolls and the sidebar footer can scroll out of view. Separately, Home is the only view held to a centered 1600px column, so on wide screens it feels like a different app from the full-width views around it.

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Above 100%, the shell is shorter than the window. The sidebar's account and settings items float mid-screen, and the space below is dead. | 🔴 Critical | Size the root to exactly the window at every scale. The cause is `#root { height: calc(100% / scale) }`. The browser applies the zoom to pixel sizes but not to percentage heights, so dividing by the scale over- or under-shoots. Plain `height: 100%` is correct. |
| Below 100%, the root is taller than the window (1125px tall in a 900px window at 80%). The whole page scrolls, so the sidebar and top bar move instead of staying fixed. | 🔴 Critical | Same fix. Only `.main` should scroll. |
| Popovers (workspace, plan, user menus) are placed outside the zoomed root and apply the scale themselves. They have to keep lining up with their buttons after the root fix. | 🟡 Moderate | Check their alignment at 80% and 130%. Correct their placement only where it's off. |
| Home is capped at 1600px and centered, while every other view fills the content area. Switching views makes the content jump in width and move its left edge. | 🟡 Moderate | Make Home full width with the same 20px padding as the other views, so the left edge and gutters stay put. |
| On wide screens, centering wastes space where the capacity heatmap and project table would benefit most. | 🟢 Minor | Let the heatmap cells and the table use the extra width. The 12-column grid already scales. |

### Visual Hierarchy

- **What draws the eye first:** at 130%, the empty band under the shell. It reads as broken before anything else does.
- **Reading flow:** on Home, the extra margin and centered column create two different left edges (the sidebar and the content) depending on the view, which breaks the scan line set by the top bar's page title.

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| View container | Home uses `max-width: 1600px; margin: 0 auto`, while the other views use `.view` with only padding. | Use one container rule for every view. Only the full-page project detail stays centered, because it's a reading layout. |
| Shell sizing | The root's height is compensated for the scale but its width isn't. That mismatch is the bug. | Don't compensate either. The browser already handles full width and full height. |

### Accessibility

- UI scale is an accessibility feature (larger text for low vision), and it currently breaks the frame at exactly the settings people who need it would choose. After the fix, 130% must keep the sidebar footer (account, settings, collapse) reachable without scrolling the whole page.

### What Works Well

- Scaling everything with `zoom` keeps proportions and the timing of animations consistent. Only the root sizing needs to change.
- Home's 12-column grid already adapts to its width, so removing the cap needs no layout changes inside it.

### Priority Recommendations

1. **Root sizing at every scale:** `#root { height: 100% }`. Then verify that the shell fills the window and only `.main` scrolls at 80%, 100% and 130%.
2. **Home full width:** remove the 1600px cap so Home lines up with the other views.
3. **Popover alignment:** check the anchored menus at non-default scales after the root fix.
