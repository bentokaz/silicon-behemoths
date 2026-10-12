# UI shots

Screenshots and density measurements of every screen, taken by a real headless
browser driven over the DevTools protocol. One Node script, no dependencies
(Node 22 or later, for the built-in `WebSocket`; Chrome or Edge installed).

It needs a **dev server**: it uses what dev builds put on `window` (`sb`,
`sbGame`) and loads the crawler at `scripts/ui-sweep/sweep.js` to put the game
into known states.

```
npx vite --port 5214 --strictPort
node scripts/ui-shots/shots.mjs --url http://localhost:5214 --out ui-after-shots
```

A full run (4 sizes, `fresh` and `late`, about 320 shots) takes about eleven minutes.

## Options

| Option | Default | |
| --- | --- | --- |
| `--url <base>` | `http://localhost:5214` | The dev server to shoot. |
| `--out <dir>` | `ui-after-shots` | Where the JPEGs, `metrics.json`, `summary.md` and `run.json` go. |
| `--sizes 1440x900,1180x620` | `1180x620,1280x720,1440x900,1920x1080` | Window sizes. |
| `--states fresh,late` | `fresh,late` | Game states. `launched` is there too (guided, first device on sale). |
| `--themes ember,volt,ice,rose` | `ember` | Applied with the app's own `applyTheme`. Other themes add `-<theme>` to the file name. |
| `--only <regex>` | | Only screens whose name matches, e.g. `--only "^(staff|campus)"`. |
| `--keep-shots 1440x900` | every size | Save JPEGs only for these sizes. Metrics are still taken for all. |
| `--no-shots` | | Metrics only. |
| `--clean` | | Start `metrics.json` over. Without it a run merges into the rows already there, so a `--only` rerun replaces just its own rows. |
| `--gl auto\|gpu\|swiftshader` | `auto` | How WebGL is drawn. `auto` tries the GPU through ANGLE/D3D11 and falls back to SwiftShader. |
| `--chrome <path>` | Chrome, then Edge | The browser to launch. |
| `--headed` | | Show the window. |
| `--quality 80` | `80` | JPEG quality. |
| `--verbose` | | Also print the screens skipped because they are locked in that state. |
| `--list` | | Print the screen table and exit. |
| `--compare <before.json>` | | No browser. Prints before -> after for text nodes, numerals, controls, primaries and coverage: `<before.json>` against `<out>/metrics.json`. |
| `--script <file.mjs>` | | No screen table. Runs your own script against the page with real input (below). |

Before and after:

```
node scripts/ui-shots/shots.mjs --url http://localhost:5215 --out ui-before-metrics --clean --keep-shots 1440x900,1180x620
node scripts/ui-shots/shots.mjs --url http://localhost:5214 --out ui-after-shots --clean
node scripts/ui-shots/shots.mjs --out ui-after-shots --compare ui-before-metrics/metrics.json
```

## The screen table

`SCREENS`, at the top of `shots.mjs`, is the list of what is shot. One row per screen:

```js
{ n: 37, name: 'staff-teams', states: FL, setup: `H.go('staff', 'teams')` },
{ n: 26, name: 'factory-floor', states: FL, gl: true, setup: `H.tab('factory', { 'factory:view': 'floor' })` },
```

- `n` is the two-digit order index in the file name. Keep it when moving rows, so files keep their names.
- `name` is the screen word. Files are `<NN>-<name>-<state>-<W>x<H>.jpg`.
- `states` lists the states the row is shot in. A row that cannot be reached in a state (the screen is still locked, there is no device yet) is skipped and listed under "Not reached" in `summary.md` and in `run.json`.
- `seed` is the `sweep.seed()` state restored first. It defaults to the state; `latePending` and `bankrupt` are used for the decision, the year-end summary and the game-over card; `null` means no game (the menus).
- `setup` is JavaScript run in the page after the seed is up, as the body of an async function. Throw to skip the row with a reason.
- `gl: true` marks a screen with a 3D view: the shot waits for the canvas to exist, for the loading mark to go, and for two samples of the canvas a quarter of a second apart to be the same (9 s at most; a view that never stops moving is flagged "3D moving", a flat one "3D VIEW BLANK").

Every screen starts from a freshly restored copy of the state (`sweep.seed`), so nothing done on one screen shows on the next.

What a setup can use, besides `sb`, `sbGame` and `sweep`:

| | |
| --- | --- |
| `H.st()` | `sb.getState()` |
| `H.tab(tab, views)` | `setTab(tab)`. `views` are kept sub-views, set before the screen opens: the keys of `useKept(...)` in the components (`'factory:view'`, `'marketing:view'`, `'research:view'`, `'labs:view'`, `'system:view'`, `'stores:open'`, ...). Throws `locked: needs <capability>` when the screen is not open in this state. |
| `H.go(tab, view)` | `sb.getState().go({ tab, view })`, for the screens that read the store's hint (Staff: `team teams policy hire execs`; Goals: `goals growth`). Same check. |
| `H.press(label)` | A click on the visible button whose name (text, `aria-label` or `title`) is `label`, or starts with it. Looks in the top dialog first and in the frame last. Throws if there is none or it is disabled. It refuses "Send", "Sign in" and "Create account". |
| `H.mine()`, `H.rival()` | A device of the player's (on sale if there is one), a rival's device. |
| `H.menu(withSave)` | The main menu with storage emptied, or with the current game saved to two slots. |
| `H.sleep(ms)`, `H.frames(n)` | |

If the dev server hot-reloads the page in the middle of a run (a source file was saved), the script notices, loads the crawler and helpers again and carries on; the states are rebuilt, which costs about half a minute.

## What is measured

`metrics.json` is an array with one object per shot:

| Field | |
| --- | --- |
| `file`, `n`, `screen`, `state`, `size`, `theme` | `file` is null when the JPEG was not kept. |
| `textNodes` | Text nodes with something in them that are actually visible: not `display:none` or `visibility:hidden`, opacity above zero, a box inside the window and inside every scrolling or clipping ancestor, and not under an opaque layer (a drawer, the keynote). Frame and news feed included. Text behind a modal's dimmed backdrop still counts; the modal's own share is `regions.dialog`. |
| `numerals` | Digit characters in those text nodes. |
| `numeralsAll` | Digits in `document.body.innerText`: everything, scrolled-away lists included. |
| `controls` | Visible `button, a[href], input, select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])`, each element once. |
| `widgets` | The same without elements that are only focusable (table rows and cards that can be pressed). |
| `chars` | Non-space characters in the visible text. |
| `regions` | `textNodes`, `numerals`, `controls` split by where they sit: `top`, `nav`, `feed` (the `data-chrome` parts), `dialog` (any `role=dialog` or `alertdialog`), `screen` (the rest). |
| `sizes` | Computed font size in px, rounded to 0.5: `{ "9": { nodes, chars }, ... }`. |
| `under11` | For each size under 11 px: `{ px, nodes, chars, samples: [{ text, path }] }`, 15 samples at most. |
| `pctUnder11` | `{ nodes, chars }`, in percent. |
| `lowContrast` | Text under 4.5:1 against what is painted behind it (backgrounds composited from the page down, the text's alpha and every ancestor's opacity applied), grouped by colour pair: `{ fg, bg, ratio, count, chars, sizes, disabled, samples }`. Text over a 3D view is measured against the page background, not the picture. |
| `overflow` | Elements with `overflow-x: auto/scroll` that have something to scroll sideways: `{ path, scrollWidth, clientWidth }`. |
| `docOverflow` | The document is wider than the window. |
| `railScrolls` | Something in `[data-chrome="nav"]` scrolls vertically (null when there is no rail). |
| `coverage` | With a 3D view on screen: the share, in percent, of a 40 x 24 grid of points over `main` where `document.elementFromPoint` is not the canvas. For a 3D view outside `main` (designer, keynote) the grid is over the layer that holds it. `canvasShare` is how much of that area the canvas itself spans. Elements with `pointer-events: none` do not count as covering. |
| `primaries`, `primaryNames` | Buttons whose background is exactly `--color-accent`, and the first twelve names. |
| `overlaps`, `overlapCount` | Pairs of visible `position: fixed/absolute` elements with `z-index >= 30` that intersect by more than 16 px2 and are not inside one another: `{ a, az, b, bz, area }`, largest first, 30 at most. |
| `canvas` | For a 3D view: `{ colours, spread, mean, blank, stable, settledMs }` of a 96 px wide copy of it. |
| `gl3d`, `crash`, `stillLoading` | The 3D view reported itself unavailable, broken or lost; the crash screen is up; something was still loading when the wait ran out. |
| `where` | `screen`, `tab`, `designing`, `inspect`, `person`, `lockCard`, `yearEnd`, `showing` from the store, with the staff and device counts and the day, to check a shot is what its name says. |

`summary.md` has one table per size: screen, state, text nodes, numerals, controls, % of text under 11 px (by text node, by character in brackets), primaries, coverage and flags, then the screens that were not reached. `run.json` has the browser, its flags, the WebGL renderer, the skipped list and any uncaught page errors.

Against the independent review's table (`UI-REVIEW.md`, Density): `textNodes` and the 9 px and 10 px counts are the same measure and land within a few percent on the same screens. Their "controls" matches `widgets` (they did not count pressable rows). Their "numerals" took in more than what is on screen; `numerals` here is visible digits only, and `numeralsAll` is the page's whole text.

## Real input: `--script`

```
node scripts/ui-shots/shots.mjs --url http://localhost:5214 --out ui-after-shots --sizes 1440x900 --script scripts/ui-shots/example-script.mjs
```

The module's default export gets a `page`, with the app, the crawler and the helpers already loaded and the window at the first of `--sizes`:

```js
export default async function (page) {
  await page.seed('late')
  await page.eval(`H.tab('office')`)
  await page.settle({ gl: true })          // wait for the 3D view to draw and stop moving
  await page.drag(700, 450, 900, 450)      // press, move in steps, release
  await page.wheel(700, 450, -240)
  await page.click(700, 450)
  await page.key('KeyR')
  await page.key('KeyZ', ['ctrl'])
  await page.shot('campus-after-drag')     // <out>/campus-after-drag.jpg
  console.log(await page.eval(`sb.getState().tab`))
}
```

| | |
| --- | --- |
| `page.eval(js)` | Runs in the page. An expression or several statements; top-level `await` works; the last value comes back (it must survive JSON). |
| `page.click(x, y, { button, modifiers, hold })` | A real mouse click (`Input.dispatchMouseEvent`). |
| `page.move(x, y, { steps })`, `page.down()`, `page.up()` | The parts of one. |
| `page.drag(x1, y1, x2, y2, { steps, button, pause })` | |
| `page.wheel(x, y, deltaY, deltaX)` | |
| `page.key(code, modifiers)` | A key by its `code` (`KeyA`, `Digit1`, `F5`, `Space`, `Escape`, `ArrowLeft`, `Delete`...). Modifiers: `['ctrl', 'shift', 'alt', 'meta']`. |
| `page.type(text)` | Inserts text into whatever has the focus. |
| `page.shot(name)` | A JPEG in `--out`; returns its path. |
| `page.wait(ms)` | |
| `page.seed(name)`, `page.settle({ gl })`, `page.metrics()`, `page.resize(w, h)`, `page.theme(id)` | What the runs themselves use. `metrics()` returns the object described above. |
| `page.send(method, params)` | Any other DevTools call. |

Unlike the crawler's synthetic events, these arrive as trusted pointer and key events and the page gets frames at full rate, so dragging, placing and zoning in the 3D views can be scripted.

## What it will not do

- The browser is started with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`: no host but this machine resolves, whatever the page asks for. The crawler's own block on requests, links, downloads and native dialogs is installed on top, first thing after the page loads.
- It uses a throwaway browser profile in the temp folder, deleted at the end: saves made for the "menu with a save" shot never touch your own browser's storage.
- The feedback form is opened and photographed, never sent. Nothing signs in or creates an account.

## Notes

- WebGL: on this machine headless Chrome draws the 3D views on the GPU with `--headless=new --enable-gpu --ignore-gpu-blocklist --use-gl=angle --use-angle=d3d11`. The fallback is `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` (slower, same pictures). The renderer that was used is printed at the start and written to `run.json`.
- The keynote runs on its own clock, so its shot is a frame from the first seconds of the show and is always flagged "3D moving".
- The new-company form draws a random seed number each time it opens, so its numeral count moves by a digit or two between runs.
- `late` is the crawler's seed: 40-odd staff on a two-desk campus, 13 devices. Change the seed in `scripts/ui-sweep/sweep.js` (or add one) to measure a different company; the names in `states` and `seed` are passed straight to `sweep.seed`.
