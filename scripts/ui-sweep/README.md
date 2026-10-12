# UI sweep

A crawler for the interface, run inside the page of a dev build. It puts the
game into a known state, opens every screen, presses every control, types
awkward things into every field, and after each step looks the page over for
anything broken.

It needs the dev server, because it uses what dev builds put on `window`
(`sb`, `sbGame`) and imports the store modules straight from Vite.

## Running it

```
npx vite --port 5212 --strictPort
```

Open the page, then in the console (or through any tool that can run script
in the page):

```js
await import('/scripts/ui-sweep/sweep.js?' + Date.now())

// everything in one state, as a background job (a full state takes minutes)
sweep.run(() => sweep.crawlState('mid'))
sweep.job              // { done, result | error, seconds }
sweep.summary()        // counts by kind, and what has been exercised
sweep.report()         // every finding as a line of text
sweep.report(/overflow|clipped|cut/)   // only some kinds
sweep.reset()          // forget the findings so far
```

Saving `sweep.js` makes Vite reload the page: import it again afterwards.

## What there is

| Call | What it does |
| --- | --- |
| `sweep.seed(name)` | Puts a game state on screen. Built once by playing the simulation, then restored from a copy, so every visit starts identical. |
| `sweep.crawlState(name, { only, depth, budget, fields })` | Every stop of a state: each screen, the frame around them, the designer in both modes, a device, a rival's device and a person. At each stop every control is pressed in turn, the stop is put back whenever a press changed anything, and controls that reveal more controls (a sub-tab, a fold, a drawer) are gone into, `depth` levels down. `only` is a regular expression on the stop name. |
| `sweep.crawlMenu()` | The same for the screens before a game: the main menu, its settings and keys, the Continue list and the new-company form. |
| `sweep.lookMenu()` | Those two screens audited without pressing, for each window size. |
| `sweep.lookState(name, { themes, only })` | No pressing beyond sub-tabs and folds: opens every view and audits its layout, then its colours in each theme. This is the pass to repeat at each window size. |
| `sweep.hotkeys(name)` | Every key from System, Keys, on every screen. |
| `sweep.soak({ state, rounds, designer, speed })` | A long session at top speed: hops screens, opens every device, opens and closes the designer, and samples heap, DOM size, listeners, timers and live WebGL contexts after each round. |
| `sweep.audit(label)` | Looks over the page as it stands. |
| `sweep.vitals()` | The numbers that should not grow. |

States: `fresh` (guided, day 0), `launched` (guided, first device on sale),
`mid` (open game, a year and a half in), `late` (everything built: every
device line, 40 staff, executives, factory, venue, stores abroad, listed),
`latePending` (the same with a decision waiting and the year-end summary up),
`bankrupt`, `sandbox` (unlimited money), and `type:<device>` for each of the
twelve starting lines.

## What an audit looks for

Uncaught errors, unhandled rejections, console errors and warnings (React's
included), the crash screen, failed requests, the page or an element
scrolling when it should not, text cut off with no tooltip, text running out
of its box, controls with no name, icon buttons without a title or label,
controls of no size, off screen with nothing to scroll, or under another
control, duplicate ids, images that did not load, empty icons, raw values
(`NaN`, `undefined`, `-0`, exponents), long unformatted numbers, emoji, low
contrast in each theme, rounded corners, gradients and soft shadows (none
belong in this interface), rows of buttons of uneven height, a press that
changes nothing at all, a disabled control that does not say why, and a game
hotkey firing while typing.

## What it will not do

It never leaves the machine and never opens a native dialog: requests to
other hosts, `window.open`, links, downloads, the file picker, the folder
picker and reloads are all swallowed and listed in `sweep.blocked`. It does
not press Send in the feedback form, or anything to do with accounts. To let
a request through on purpose, set `sweep.allowNetwork = true` first.

## Notes

- A press on a button that asks to be pressed again (anything that cannot be
  undone) is followed by the second press, so those actions are exercised too.
- When the page is in a background tab the browser gives it one frame a
  second and throttles timers. The crawler waits on messages instead, so it
  runs at full speed, but anything in the game that is driven by frames (the
  3D views) or timers (toasts, the game clock) moves slowly there. Run it in
  a visible tab when those matter.
- Findings are deduplicated by kind and text, and carry the path of presses
  that led to them. They are also kept in `sessionStorage`, so a reload of the
  page (which saving any source file can cause) does not lose them:
  `sweep.earlier()` reads them back. Do not edit source files while a crawl is
  running; a hot update in the middle of one makes noise.
- Long lists are sampled: two rows of each table, four of each kind of button
  that repeats down a list. Everything else is pressed.
- The crawler deletes and overwrites saves in the dev server's own storage
  (`localhost:5212`), which no other copy of the game shares.
