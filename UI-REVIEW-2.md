# UI review 2: a first-time player's view

Played from the main menu through the guided start (city, campus, hiring, designer, first launch) and in the `late` crawler state, in headless Chrome with GPU WebGL at 1920x1080 and 1366x768. Before shots: `ui-overhaul-shots/before/`. The first redesign cut the number of places and the clutter; what is left is mostly how the screens *feel*, not how many things they hold.

## Problems, worst first

1. **Everything is small and the same weight.** Body text is 12 px, labels 11 px, figures 16 px, in a condensed face (Bahnschrift). At 1920x1080 a whole screen reads like fine print; the one number that matters (cash, profit, awareness) is barely larger than its caption. *Fix:* a type scale with a 14 px body (15 px above 1600 px wide), 12-13 px floor, 20/28 px figures, a plain humanist UI face for text and the condensed face only for titles.

2. **No screen says what it is for.** Screens start with a strip of boxes; there is no title, no sentence saying what question the page answers or what to do first. A new player on Overview sees "Nothing needs you" while the guide below talks about the city. *Fix:* every page opens with a header: title, one line of purpose, at most one primary action.

3. **A grid of hairline boxes.** Every panel, tile, tag, button and row has a 1 px outline and a ruled header, so the eye has no rest and no grouping; borders do the work that space should do. *Fix:* more space (16-24 px gutters), fewer rules: sections separated by space and surface tone, outlines kept only for panels and controls (still square, still thin).

4. **Information hides behind "?" and slow native tooltips.** Explanations live in click-to-open popovers that need scrolling; details of a research node or figure need a click or a one-second browser tooltip in tiny system type. *Fix:* hover/focus info cards everywhere (instant, styled, readable, no click), the page's purpose in its header, and "How this works" opening on hover.

5. **The guide is a footnote.** The onboarding is one grey line in the bottom strip ("1/16 Welcome ..."), easy to miss at 1080p, and its text often describes another screen than the one shown. *Fix:* a docked "First steps" card with the step title, one sentence, a checklist of the first few goals with progress, and one "Show me" action; it can be collapsed back to the strip.

6. **The rail shouts.** Uppercase letter-spaced labels, function-key hints on every row, a full-width orange "New device" block and lock icons compete with the screen. *Fix:* sentence-case labels at body size, keys only in tooltips, a quieter "New device" (accent outline), locked places dimmed with the reason on hover.

7. **Wide screens are wasted, narrow ones are cramped.** At 1920 the content is a thin band at the top-left (new game form, Marketing, Overview) with half the screen empty; tables stretch names and figures 1500 px apart. *Fix:* the page spacing and type grow with the window; in a wide table the names column stops growing and the spare width is shared between all columns; empty states explain and offer the next action.

8. **The top bar figures are tiny.** Date and cash, the two things a tycoon player watches, are 13 px; speed buttons are 28 px squares with no state beyond colour. *Fix:* larger date and cash, a segmented speed control, the running/paused state as a coloured dot.

9. **Main menu and new game look unfinished at 1080p.** The menu is a column of three buttons and an empty right half; the new-company form floats at the top of a black area. *Fix:* centred, wider layout, a hero area, steps of the form in a readable column with a sticky summary.

10. **Tables and lists lack hierarchy.** Names, roles and figures share size and colour; status tags repeat on every row ("No desk" x40). *Fix:* the name in body weight, the rest quieter, figures in mono, headers in sentence case, row height 36-40 px, status tags only for exceptions.

## What to keep

Dark theme, orange accent, line icons, monospace figures, square corners, the 7-destination navigation, the messenger strip, the contrast floor.
