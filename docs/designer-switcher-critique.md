# Design Critique: Designer switcher

**Reviewed:** the previous/next control in the top right of the designer view, with 2 designers (Bob and Alexis) and with 3, at 1440×900 and 375×812.
**Who:** a manager going through their team one person at a time, for example before 1:1s or while rebalancing work.
**Stage:** fixing a shipped control.

### Overall Impression

The control is two bare avatars with no arrows, labels or position, so it reads as decoration rather than navigation. With two designers it breaks: "previous" and "next" both wrap around to the same person, so it shows **two identical avatars that do the same thing**.

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| With 2 designers, both buttons are the other person (wrap-around makes previous = next). They look like a duplicated avatar. | 🔴 Critical | Make it **linear**: ‹ disables on the first designer and › on the last. Two designers then show one live arrow and one disabled one, and nothing is duplicated. |
| Nothing shows the direction. The only hint is a native tooltip ("Previous: …"), which touch screens never show. | 🔴 Critical | Use chevron icons for direction. Name the destination in the accessible label ("Next designer: Alexis") and in the hover tooltip. |
| There's no sense of where you are, and no way to jump. Reaching the 8th of 10 designers takes 7 clicks. | 🟡 Moderate | Add a **position button** between the arrows ("2 of 10"). It opens a list of every designer with their avatar and average load. The current one is checked, and one click jumps anywhere. |
| Avatars are a second set of colored initials next to the hero avatar, so the eye compares three circles. | 🟡 Moderate | Keep identity in the hero avatar only. The switcher uses neutral chrome and shows colors only inside the list. |
| There's no keyboard path except tabbing to the buttons. | 🟢 Minor | Add `←`/`→` on the designer view to step between designers (skipped while typing, like the other shortcuts). |

### Visual Hierarchy

- **What draws the eye first:** the hero avatar and name, which is correct. The switcher should be secondary and read as one grouped control, not as two more people.
- **Reading flow:** name → stats → KPIs. The switcher sits top right, where page-level navigation lives elsewhere in the app (the quarter stepper uses the same ‹ label › shape).

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Stepper pattern | The top bar's quarter stepper is already "‹ FY27 Q4 ›". The designer switcher uses a different idiom for the same idea. | Reuse that shape: one bordered group with chevron buttons around a label. |
| Lists | The workspace and plan menus are popovers with check marks on the current item. | Make the jump list the same `Popover` and `MenuItem`, with the load as the hint. |

### Accessibility

- **Labels:** the arrows get `aria-label`s that name the destination. The position button has `aria-haspopup` and announces "Designer 2 of 10".
- **Touch targets:** 32px on desktop to match other small controls, and 36px on phones (the existing phone `.btn.sm` rule).
- **Disabled state:** the disabled arrow stays visible at reduced opacity, so the control doesn't change width or jump around.

### What Works Well

- Putting the switcher in the hero keeps navigation close to the person being viewed.
- The designer view already handles a missing designer (an empty state with a way back to Home).

### Priority Recommendations

1. **Linear ‹ › arrows with real labels.** This fixes the 2-designer bug and makes the direction obvious.
2. **A "2 of 10" jump list.** It shows the position and allows direct access, with each designer's load for context.
3. **←/→ shortcuts.** These make stepping through the team quick before 1:1s.
