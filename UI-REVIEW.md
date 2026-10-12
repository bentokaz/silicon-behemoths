# Silicon Behemoths: usability review

Reviewed 12 Oct 2026 on a local dev build (`vite`, port 5211), Ember theme, in a browser at 1280x720, 1440x900, 1920x1080 and 1180x620. One guided game played by hand from the main menu to a device on sale and the first incident; one "Everything open" game pushed to a late state through `window.sb` / `window.sbGame` (70 staff, 7 executives, 11 products, 6 stores, 6 regions, factory, venue, one investor) and then used through the real UI. Screenshots are in `ui-review-shots/` and are named in the text. Measurements come from a script that walked every visible text node (font size, computed colour against its real background).

## Verdict

1. The game shows everything it knows at the same visual weight: a typical late screen carries 250 to 380 text nodes and 650 to 940 numerals, 35 to 55 percent of them at 9 or 10 px, and the one thing the screen is for is rarely bigger or brighter than the rest.
2. There are too many places: 18 destinations plus System in a rail that already scrolls at 1280x720 (Finance, Shares and Rivals fall off the bottom), and the same subject is split across several of them (rivals appear in Market, Rivals and Shares; owners in Marketing and After-sales; keynotes in the designer, Marketing and Venue; regions in City and Regions).
3. Too many things talk at once: the guide card, unlock banners, toasts, the feed, lock cards, nav badges and incident modals are six independent systems that overlap each other physically and give conflicting "Take me there" instructions.
4. The secondary text colour fails contrast everywhere (2.9:1) and is used for labels the player needs, while solid orange, the only strong signal, is spent on up to 26 buttons in one view.
5. The 3D places are the best part of the product and are treated as backdrops: half the campus view is under panels at the minimum size, and the questions a tycoon player asks ("what does this store earn", "why did sales drop", "what is out of stock") are answered by tables, or not at all, instead of on the building.

## The ten changes that would help most

1. **Collapse the navigation to seven destinations.** City, Company, Devices, Research, Campus, Sites, Marketing, plus System. Fold Market and Rivals into Devices as tabs, Labs into Research, Staff into Campus, Factory/Stores/Venue into Sites, After-sales into Marketing, Finance/Shares/Goals into Company, Regions into City. Map is in "Proposed structure" below.
2. **One messenger, one queue.** Merge guide, unlock banner, toast and "needs attention" into a single notification strip in one fixed place (bottom centre of the main area, never over a panel, never pushing layout). One item at a time, one action button. Unlocks become a line in that strip and a NEW badge on the nav item, nothing more. Delete the banner row under the top bar.
3. **Fix the type and colour floor.** No text under 11 px. Change `--color-faint` from `#655c54` (2.9:1) to about `#8c8279` (5.0:1 on panel, 4.7:1 on raise) and keep the old value for hairlines only. Give disabled controls a readable text colour and a different border, not opacity.
4. **One primary button per view.** Solid orange only for the single action the screen exists for. Shares shows 26 solid "BUY OUT" buttons, Stores three "OPEN ONE", Events three "BOOK", Campus a permanent "MOVE FOR $22.0M". Make all of those outline buttons; reserve fill for the one confirm.
5. **Give the 3D views the screen.** Build palette closed by default (it opens itself on every visit to Campus, Factory, a store and the Venue). Right-hand status column collapsed to a one-line strip (desks 70/104, comfort 2%, upkeep) that expands on click. Hint bar reduced to one line with a "?" for the rest. Target: panels under 20 percent of the view at 1180x620 (measured now: 50 percent).
6. **Put state on the buildings.** In City, each owned place gets a small plate: stores show profit this month, the factory shows the running order and percent, the campus shows free desks and raise requests, the port shows what is out of stock. Clicking the plate opens the relevant control. This replaces most of Overview's "needs attention", the Stores table, and the Production orders tab.
7. **Answer the three money questions.** Add revenue and profit to each store (table and store panel); add a "why" line to the product inspector (sold out since date, price against segment, awareness, newer rival) above the units chart; add a sales trend spark and a "reorder" button to each row of Devices.
8. **One table component.** One header row per table, fixed column grid shared by grouped tables, click-to-sort headers, sticky first column, no horizontal scroll at 1180 (drop or stack columns instead), one number format. Devices currently repeats eight headers per family and the columns do not line up between families (`42-devices-1920x1080-misaligned.jpg`).
9. **Make the feed earn its 236 px.** Off by default on screens that need width (Research, Finance, Marketing, Staff, Rivals), collapse repeats ("Vista is sold out" appears about ten times in one screenful), hide rival launches behind a filter, and never let it be the reason a table overflows.
10. **Undo and keyboard in the builders and drawers.** Ctrl+Z in every site builder (today only the designer has undo), Esc closes the person card and the year-end summary, Enter applies a typed value, and a visible 2 px accent focus ring (there is no focus style in the CSS; the browser's 0.8 px grey outline is what shows).

## Cross-cutting problems

### Navigation
- 18 destinations in three groups ("Run / Build / Company") plus System and a separate "New device" button. The rail's scroll area is 550 px high at 1280x720 and its content is 657 px: Finance, Shares and Rivals are below the fold. At 1180x620 the whole Company group is hidden (`40-staff-1180x620.jpg`).
- The groups do not predict content. Marketing and After-sales are under "Build"; Market, Regions and Goals under "Run"; Rivals under "Company".
- Duplicated subjects: rival companies are listed in Market (their devices), Rivals (companies and their devices) and Shares ("Other companies"); owner satisfaction and support in Marketing > Fans and feedback and in After-sales; keynotes in the launch plan, Marketing > Events and Venue; regions as a strip in City, a map in Regions and a table under the map.
- Two homes. The game opens on City, loading a save opens Overview, F1 is Overview, City has no F-key (it shows "G"). Pick one.
- Second-level navigation takes five different forms: underlined text tabs (Staff, Marketing, System, Factory), store-name tabs (Stores), icon-only tabs with a count (Market device types, Devices type filter), icon-only tabs with no count and no tooltip (build palette), and small caps sub-tabs inside a card (designer Score/Market).
- Names for the same thing differ: CFO / Chief Financial Officer / "finance chief"; HR / Head of People; CCO / Head of Support; Labs (chips and OS) / Research (tech tree) / "Research lab" (a room) / "Research park" (a city block); Campus / "head office" / "office"; "Fix this price" / "fixed-price contract"; "Launch" in the guide text / "Proceed to launch" on the button; "Sandbox" is both the game mode and the label on "Everything open".

### Density
Counts are visible text nodes / numerals in the page text / interactive controls, feed included, at 1440x900 unless noted.

| Screen | Text nodes | Numerals | Controls | 9 px | 10 px |
|---|---|---|---|---|---|
| Overview (late) | 248 | 704 | 59 | 60 | 45 |
| Devices (late) | 301 | 678 | 61 | 54 | 115 |
| Research | 304 | 762 | 113 | 106 | 52 |
| Staff > People | 307 | 810 | 55 | 106 | 37 |
| Staff > Teams | 209 | 701 | 149 | 54 | 19 |
| Finance | 310 | 929 | 42 | 53 | 43 |
| Rivals | 381 | 940 | 43 | 68 | 20 |
| Shares | 273 | 845 | 72 | 49 | 39 |
| Campus first visit (1280x720, 2 desks, 0 staff) | 106 | 46 | 57 | 19 | 23 |

A new player's second screen (Campus, `05-campus-first-run-1280.jpg`) has 57 controls. Overview with one product has 4 large tiles, 5 small tiles, 6 panels, a feed and the guide card (`13-overview-early-1280.jpg`).

### Consistency
- Money: `$1,200` and `$14.0K` in one price list (Campus furnish); `$9,150` and `$15.4K` in one salary column; `$17.14M` in Finance, `$2.8M` on Overview; `$6,712` inside a column of K and M; "6.95B" with no dollar sign on Overview's Company value. The trailing ".0" (`$250.0K`, `$100.0K`, `$22.0M`) is on almost every round figure.
- Status badges repeat the default: "ON SALE" on all 23 rows of a list titled "Phones on sale"; "WORKING" on 59 of 70 staff rows; "TRADING" on every store.
- Primary fill is used for navigation ("Take me there"), creation ("New device", twice on Devices: rail and screen), spending, and destructive toggles: "Start research" turns into a same-size, same-place "Stop researching" button (`11-research-first-run-1280.jpg` and after).
- Three kinds of floating card share the accent border (guide, lock card, selected option), so the border does not mean "selected".
- Closing: Esc closes the product drawer, lock card and feedback form; it does not close the person card or the year-end summary. Enter does not submit the price field.

### Typography
- Sizes in use: 9, 10, 11, 12, 13, 14, 18, 20, 48 px. Nothing below 9 px was found. 9 px is used for all KPI tile labels on Staff, Overview, Finance and Regions, nav group labels, shortcut hints, "OWNED" on every research node, table sub-labels, feed dates and kinds, trait chips. 10 px is the `.label` class and every table header.
- Uppercase with 0.12 to 0.2 em tracking is applied to labels, tabs, buttons, nav items, table headers and card titles alike, so case and tracking carry no hierarchy.
- At 1920x1080 nothing scales: the same 9 to 13 px text sits in rows 1,500 px wide (`42-devices-1920x1080-misaligned.jpg`).

### Colour and contrast (Ember theme, measured)
| Text | On | Ratio | Where |
|---|---|---|---|
| `#655c54` (faint) | `#12100f` panel | 2.90 | nav groups, key hints, tile labels, feed dates, "RIVAL", step counters, hint text, Finance cost columns (131 nodes on that screen) |
| `#655c54` | `#0a0908` carbon | 3.04 | small KPI tile labels, footers |
| `#655c54` | `#1b1816` raise | 2.70 | option sub-labels on New game, family totals on Devices |
| `#655c54` | `#2a1910` active nav tint | 2.57 | key hint on the selected nav item |
| `#44403c` | `#12100f` | 1.86 | disabled Undo / Redo in the designer |
| `#534e49` | `#12100f` | 2.31 | locked "Advanced" |
| `#716d69` | `#1b1816` | 3.43 | locked device types in the designer |
| `#66625f` | `#1b1816` | 2.93 | disabled "Timeline 1970+", "Own factory", "Create account", "Apply" |
| `#a94914` | `#ff6b1a` | 2.02 | disabled primary: "Send", "Sign in" |
| `#2f5fb5` Norvik, `#d43a5a` Aztra, `#e0403c` Quince | `#12100f` | 3.09, 4.11, 4.49 | rival names drawn in brand colour in Market |

Colour meaning is also unstable: orange is brand, selection, primary action, "your company", some bar fills and the LAUNCH news tag; green is good news, "OPEN", "TRADING" and some bars; score bars switch between green and orange with no legend.

### Feedback
- Good: toasts on hire, price change and save; lock cards explain requirements with progress; empty states on Applicants and Events have text and an action.
- Missing: placing a $1,200 desk changes "$6.00M" to nothing visible; opening a $120K to $2.5M store or a $22M campus move is one click with no confirmation; Quit to main menu has none either; the 3D site views are a black rectangle for 4 to 10 seconds on entry with no loading mark (worse on the big campus; may be slower in my hidden pane); a first device nearly sold out (521 of 10,000 left) shows "Nothing needs a decision right now".
- Tooltips are native `title` attributes (slow, unstyled, absent for keyboard users). Four of the five build-palette tabs have no title and no label at all.

### Attention
Evidence of collisions, all at 1280x720:
- Toast drawn on top of the guide card's buttons (`06-staff-toast-over-coach-1280.jpg`).
- Unlock banner, guide card, toast, feed item and NEW badge all announcing one unlock, with the banner's "Take me there" going to Research while the guide says "Design a device" (`07-unlock-banner-coach-toast-feed-1280.jpg`); two "Take me there" buttons with different targets were on screen together after the first launch (`10-devices-after-launch-banner-toast-1280.jpg`).
- Incident modal over a two-row unlock banner over the guide card over a feed of rival launches (`12-incident-over-banner-coach-feed-1280.jpg`).
- Guide card over the product inspector, hiding the score labels and the price field (`14-inspector-coach-overlap-1280.jpg`); lock card overlapping the guide card (`04-city-lockcard-plus-coach-1280.jpg`).
- The unlock banner is inserted above the layout and removed later, moving every control down then up by about 30 px (58 px with two entries). I mis-clicked the designer's tabs because of it.
- The feed in the late game is mostly rival launches and the same stock alert repeated.

### 3D against panels
- Campus at 1180x620: panels cover 50 percent of the main area (grid-sampled), leaving a strip about 460 px wide between a 265 px palette and a 275 px status column, with a two-line hint bar across the bottom that also covers the last palette row and the right column's text (`41-campus-1180x620.jpg`).
- The palette is full height whatever it holds: three items in a 720 px panel on the factory floor (`24-factory-floor-1440.jpg`).
- City at first run: region strip wraps to two lines over the islands, the guide card sits on the main street, and the toolbar ("Names" plus four unlabelled light icons) sits under the strip (`03-city-first-run-1280.jpg`).

## Screen by screen

Severity: blocker / major / minor / polish.

### Main menu
- **minor** With a save present the primary button is still "New company" and the save is a table row with a small "Load". Make "Continue: Behemoth Labs, 02 Apr 2026" the primary button; move the table behind "Load game".
- **polish** The right 60 percent of the screen is empty; the "Saved" column prints `10/12/2026, 10:33:47 PM`. Use a short relative or game-style date.

### New game (`02-newgame-1280.jpg`)
- **major** "Found company" is below the fold at 1280x720; five panels must be scrolled past. Pin a footer bar with the button and a one-line summary (name, mode, difficulty, cash).
- **major** A beginner sees 11 device tiles, 2 growth modes, 2 game modes (one disabled, "not built yet"), 3 difficulties, 4 difficulty read-outs, 4 sliders, a checkbox and 7 starting-tech read-outs. Keep Company, What you make and Difficulty; move Mode, Sandbox settings and "You start with" behind an "Advanced" fold; remove the disabled Timeline button until it exists.
- **minor** "Sandbox" names three things here. Rename the growth tag on "Everything open" and call the sliders "Custom rules".
- **polish** Tile sub-labels ("3 markets / slow start") are 10 px at 2.7:1.

### Guide / coach
- **major** Step 2 says "This is the campus, seen from inside" while the city is still on screen; the primary button is "Next", so the description never matches the view unless the player presses the secondary "Take me there". Navigate automatically when a step has a place, and drop the button.
- **major** After a step completes the card changes text in 0.9 s with no acknowledgement; "Read the reviews" was skipped entirely because the device had passed 2,000 sales before I looked. Hold a completed step until the player dismisses it.
- **major** The card is 440 px wide, floats over content and does not know about drawers, lock cards or toasts. Dock it in the notification strip (change 2).
- **minor** "Take me there" stays primary when you are already there (Applicants). The same paragraph is duplicated in Overview's "What to do next" panel.
- **minor** After hiring the engineer the step asks for a researcher but the list stays filtered to engineers and shows the empty state.

### Unlock banner, lock card, toasts
- **major** Banner: remove (see change 2). It shifts layout, stacks to two rows, persists into the designer and competes with the guide.
- **minor** Lock card: good content (what it is, what it takes, progress). Open it anchored to the nav item without covering the guide; one button, "Show me how", not two.
- **major** Toast position collides with the guide card and with the bottom-right "Headhunt" button on Staff. Move to the strip.

### City (`03-`, `20-city-late-1440.jpg`)
The right idea and the calmest screen.
- **major** It is the home screen but tells you nothing: no cash flow, no stock-outs, no raise requests on the buildings. Add plates (change 6). The only alert shown was a bottom-right card, "Research park: no research is running".
- **minor** Clicking a locked building flies the camera in and leaves it there after Esc; there is no "back to overview" control.
- **minor** Region strip: six text chips with "NOT ENTERED" wrap to two lines at 1280. Use short codes with full names on hover, or move regions onto the islands themselves.
- **minor** The four time-of-day icons have no labels; tuck them into one "Light" control (also on every site view).
- **polish** Home-region stores have no name plates while the overseas one does.

### Overview (`13-`, `21-overview-late-1440.jpg`)
- **major** No single purpose. 5 large tiles, 8 small tiles, 5 panels. Keep: Cash with month delta, Profit last month, Needs attention, Your devices. Move Market share chart to Devices > Market, Research levels to Research, Goals strip to Company > Goals, Brand / Awareness / Industry level / R&D tiles to their own screens.
- **major** Needs attention lists eight identical "X is sold out with nothing on order" rows. Group: "8 devices sold out" with "Reorder all" and a disclosure.
- **major** "Income, costs and cash" plots a stock (cash) and flows on one axis; income and cost lines are flat against cash. Two charts, or cash as a separate sparkline in the Cash tile.
- **minor** Market share chart: 27 stacked bands, no legend, the player's 1.5 percent is invisible. Show the player against the top five and "others".
- **minor** Small tile labels wrap at 1180 ("DEVICES ON SALE" on two lines, "STAFF 70 / morale 54" on two).

### Devices (`22-`, `42-`)
- **major** One table per family, each with its own header row and its own column widths: 56 header cells for 10 rows, and Status, Price, Stock do not line up between families. One table, family as a group row.
- **major** No action on the row. Sold-out devices need "Reorder" in the row; price should be editable in place.
- **major** No trend. Add a 12-month spark and profit per device; drop the Design column (static after launch) and the Status badge when it is "On sale".
- **minor** Type filter tabs show an icon and a count only; the active one grows a label, so the strip reflows on every click. Always show labels, or use one "Type" select.
- **minor** "New device" exists twice within 300 px (rail and screen header).

### Product inspector (`14-`)
- **major** The stock figure, the reorder control and the price are all behind "Manage"; Overview repeats the row's own numbers (price, review, sold, design) as four tiles. Put stock, reorder and price at the top of the first tab; move scores and specs behind.
- **major** At 720 px high the fixed header (title, 3D preview, four tiles, tabs) leaves about 290 px for content; shrink the preview to a 96 px thumbnail that expands on click.
- **major** Enter does not apply the price; "Apply" is a disabled-looking button until a change. No preview of what a price change does to demand or margin.
- **minor** Reorder defaults to 10,000 units for a device that sold 510,000. Suggest a quantity from recent sales.
- **minor** The drawer covers the table but leaves the feed visible. It should cover the feed instead.
- **polish** The four press reviews print the same three bullet lines.

### Designer (`08-designer-internals-1280.jpg`)
The best conventional screen: clear tabs, live cost, a real object.
- **minor** The rail stays live and bright while designing; dim it and keep only "Designing".
- **minor** Top row at 1280 holds 4 tabs, Simple/Advanced, Undo/Redo, Shut/Lid off/Exploded slider/Tour and 4 view buttons, and the summary card overlaps the teardown lid. Move the four view buttons and the teardown controls to a strip under the canvas.
- **minor** "Score" and "Market" on the summary card look like captions, not tabs. Give them the standard tab style, and a legend for green and orange bars.
- **minor** Disabled Undo/Redo are 1.86:1; locked types 3.43:1 with a lock icon only (no reason on hover that I could see without tooltips).
- **polish** Twelve device-type tiles occupy the top of Body every time, eleven of them locked in a guided game. Collapse to the current type with "Change".

### Launch plan (`09-launch-plan-1280.jpg`)
Clear and well ordered.
- **major** Nothing indicates how many units will sell. A default order of 10,000 costs $2.74M of a $6M company. Show an estimate range next to the quantity.
- **minor** Unit cost is $249 in the designer and $274 here with no line explaining the contractor's 10 percent. "Typical $900" sits beside a default price of 450 without comment.
- **minor** The keynote select lists four locked options on a first launch; hide the row until Events is open.

### Research (`11-`, `23-research-late-1440.jpg`)
- **major** The tree opens scrolled to levels 0 to 2 or 3, all "OWNED"; the first node you can research is off the right edge at 1280 and at 1440 with the feed open. Scroll to the frontier on open and collapse owned levels to a single "L0-L3 owned" stub.
- **major** Owned nodes have the heaviest styling (orange border, brown fill); available ones are plainer. Invert: owned = hairline and dim, available = accent border, running = fill.
- **minor** Budget slider gives no guidance ("918 days at $270K"); show time to finish live against the slider and mark a sensible range.
- **minor** "How it works" is a permanent panel; make it a "?" in the tree header. Node names truncate ("LTPO OLED (adaptiv…"); wrap to two lines.
- Device lines tab: seen only as a tab label ("Device lines 8") in the guided game; not opened.

### Market
- **major** The player's own device is row 23 of 23 and off screen. Pin it and show its rank.
- **minor** Twelve device-type tabs are icon plus count ("9", "11", "16"); only the active one has a word. Segment tiles are good.
- **minor** Remove the Status column; fix rival name colours under 4.5:1 (use a colour chip beside white text).

### Regions
Clean. One line: fold into City (click an island), keep the table as a drawer; the map, the City strip and the table are three views of six rows.

### Goals and Company growth (`15-company-growth-early-1280.jpg`)
- **major** Four progress systems run in parallel: the 16-step guide, 50 goals in four columns, 19 unlocks in Company growth with seven stages, plus "Opens next" on Overview and "More to unlock" in the rail. Make Company growth the one progression screen; show goals as the next three only, with "all 50" behind a link.
- **minor** Company growth cards are well built; the executive seat strip uses abbreviations (CFO, CCO, CSO) the cards below spell differently.

### Factory (`24-factory-floor-1440.jpg`)
- **major** "Production orders" lists contract-maker orders too, and "Component supply" affects every device; neither is about the factory. Move orders to Devices (per row and as a filter) and supply to Company > Finance, or show both physically at the port.
- **major** Build palette opens by default and is full height for three items; the Line status card is the useful thing and is top right at 9 to 11 px.
- **minor** Rail badge says 1, tab says "Production orders 2", status card says "Work queued: none". Three counts for one idea.
- **minor** Supply cards: five identical "Fix this price ($150.0K)" buttons; the explanatory paragraph sits outside any panel.

### Stores and a single store (`25-store-single-1440.jpg`)
- **major** Nowhere shows what a store earns. Table columns are visitors, units this month, units total and cost; the store panel repeats them. Add revenue and profit per month; lead with profit.
- **major** Every store is a top-level tab with no region; six stores fill the strip at 1280. Replace with a store picker (or pick the store in City).
- **minor** Three solid "Open one for…" buttons; no confirmation before spending up to $2.5M; you are dropped into the new store with the palette open.
- **minor** "Passers-by 1,500 / day" on the offer and "Visitors / day 55" on the store are not related anywhere.
- Restyling a room by clicking its floor works in two clicks and is the model for "physical" interaction, but the room card appears bottom centre, far from the click, and is only announced in the hint bar.

### Venue and keynote (`26-venue-1440.jpg`, `32-keynote-show-1440.jpg`)
- The keynote show is the product's best moment: full screen, one caption, one skip button, a compact result card. Keep it exactly.
- **minor** Venue hint reads "An empty plot. Open Rooms and mark out your first room" and the header "0 m² built" while a stage and 144 seats stand and the status is "Ready".
- **minor** Venue is a top-level destination used a few times a year; make it one of the Sites.

### Marketing (`27-marketing-table-overflow-1440.jpg`)
- **major** Running campaigns overflows its panel at 1440 with the feed open: the "Spent" header is cut, Interest and the stop control are off to the right behind a scrollbar. Drop "Spent", put budget slider and stop in view.
- **minor** Four tiles above three tabs; Awareness is the one that matters. Events: three solid "Book" buttons, and a row labelled "Reach" that shows a date.
- **minor** "Fans and feedback" contains owner satisfaction and customer support, which After-sales also covers.

### After-sales, Labs
After-sales: readable settings page; merge with Fans and feedback as "Owners". Labs: fine; belongs under Research.

### Staff (`40-staff-1180x620.jpg`)
- **major** Ten tiles stay above all five tabs; at 1180x620 the table starts at y=228 and shows 9 of 70 people. Keep headcount, payroll, morale, raise requests in one line; move the six effect tiles to Teams.
- **major** No sorting or filtering by status. With 11 raise requests you scroll 70 rows to find gold badges. Make headers sortable and add "Needs you" as the default filter when the count is above zero.
- **minor** The role filter (ALL plus six unlabelled icons) and the footer ("Hiring costs one month…", "Headhunt") show on Policies and Executives where they do nothing; at 1180 the last icons slide under the feed and the Status column is cut.
- **minor** Teams: 149 controls, 29 of them under 24 px, two unlabelled icon buttons per member.
- **minor** "office comfort 2%" under Morale explains nothing; link it to the campus.
- Person card: clear, one decision at the top. Esc does not close it.

### Campus builder (`05-`, `28-campus-rooms-late-1440.jpg`, `41-`)
- **major** First visit shows 57 controls around a two-desk garage. Start with the palette closed and one button, "Build".
- **major** Palette mode tabs (Rooms, Furnish, Walls, Grounds, Look): only the active one has a word, the others are bare icons with no tooltip. Use five short text tabs; there is room.
- **major** No undo. Ctrl+Z does nothing; a wrong wall is fixed by repainting with "Plain wall", a wrong room by Demolish.
- **major** "Move for $22.0M" is the largest, brightest control on the screen permanently. Put it behind "More land", outline style, with a confirm.
- **minor** The hint bar is a 60-word paragraph at 11 px that changes with every tool and covers the palette's last row. One line, with keys as chips.
- **minor** "Server rack" is dimmed with no reason given.
- Placing a desk: works, two clicks, clear red highlight.

### Finance (`29-finance-1440.jpg`)
- **major** 13 tiles and a 14-column statement that overflows at 1440 ("Cash at close" cut); cost columns are in the 2.9:1 grey. Show Income, Costs, Profit, Cash and a five-group cost bar; put the full statement behind "Monthly detail".
- **minor** A ninth small tile ("Interest, 12 mo $0") wraps onto its own row.

### Shares (`31-shares-buyout-wall-1440.jpg`)
- **major** 26 solid orange "BUY OUT $…" buttons, text clipped, each one click from a multi-billion purchase (I did not press one, so whether it confirms is unverified). Outline buttons, shown only for companies you can afford, with a confirm.
- **minor** Five tiles; "Your net worth" and "Valuation" could be one.

### Rivals (`30-rivals-1440.jpg`)
- **major** Stock column reads "1000.00B" on every rival device.
- **minor** "Makes" is a row of up to 12 unlabelled 10 px icons; the companies table's Units and Share columns are hidden under the device panel.
- Merge into Devices > Market as a "By company" view.

### System, Feedback
- **minor** "Saves and company" holds nine panels including Quit at the very bottom; split into Saves, Company, Settings, Keys. Rename the rail item "Menu" or "Save / Settings".
- Feedback form: good. One click, four kinds, one field. Disabled "Send" is 2.02:1.

### Incident, year end, game over
- Incident: clear, costs on the right, consequences in words. Fine. It arrives on top of everything else, which is the queue problem, not this card's.
- Year end: fine. Add Esc / Enter.
- **minor** Game over (state forced through the store handle): one neutral "Main menu" button and a footnote about a copy. Offer "Load last autosave" as the primary and one line on what went wrong.

## Tasks

| # | Task | Path | Clicks | Notes |
|---|---|---|---|---|
| - | Design and launch first device | New device > Proceed to launch > Start development | 3 with defaults | Smooth. No demand estimate. |
| - | Hire someone | Guide "Take me there" > Hire | 2 (3 without the guide: Staff > Applicants > Hire) | Fine. |
| - | Place a desk | Campus > Desk > floor | 3 | Palette was already open. No cash feedback. |
| - | Start research | Research > budget slider > Start research | 3 | Selected node is preselected but off screen. |
| 1 | Raise a price | Devices > row > Manage > field > type > Apply | 4 + typing | Enter does nothing. First tab shows the price as a static tile. |
| 2 | Why did sales drop | none | - | Tried Overview chart (flat), inspector units chart (shows the drop, not the cause), Market, Marketing > Fans. "Sold out" is a small badge. Not answerable in one place. |
| 3 | Give a raise | Staff > scroll for a gold badge > row > Agree | 3 + scanning | No sort or filter. Overview's "11 people are asking" row has an arrow. |
| 4 | What a store earns | none | - | No revenue or profit on Stores, the store panel or Finance. |
| 5 | Change a room's style | click floor > swatch | 2 | Good; undiscoverable except from the hint bar. |
| 6 | Open a store abroad | Stores > region chip > Open one | 3 | No confirmation. |
| 7 | Find my save | System > Saved games | 1 to 2 | Fine. "System" does not say "saves". |
| 8 | What a locked thing needs | click the locked nav item | 1 | Good. |
| 9 | Undo a wall | none | - | No undo in builders. |
| 10 | Report a bug | Feedback > type > Send | 1 + typing | Good. |

## Where it is still a spreadsheet

- Stock and orders: a table under Factory and a number in a drawer. The port and warehouse are already in the city; show pallets per device and a truck for each order.
- Store performance: a table. Show queue length, takings and a profit plate on each store in City and inside the store.
- Staff: a 70-row table with morale bars. The campus already draws people with markers; clicking a marker opens the person card. Add "show raise requests" and "show unhappy" highlight toggles on the campus and make that the People view.
- Research: a node grid. The Research park exists in the city and research labs on the campus; show running projects as lit benches with progress.
- Regions: a dot map and a table beside a 3D city that already has islands.
- Component shortages: five cards with multipliers. Show late or missing containers at the port.
- Rivals: three tables. Their towers are in the city with names on them; click a tower for the company.
- Needs attention: a list. Every item in it belongs to a building.

## Proposed structure

**Rail (7 + System), each with at most four tabs**

| Destination | Tabs | Replaces |
|---|---|---|
| City (home, F1) | world layer for regions | City, Regions |
| Company | Overview, Finance, Shares, Growth | Overview, Finance, Shares, Goals |
| Devices | Mine, Market, Rivals | Devices, Market, Rivals |
| Research | Technology, Device lines, Labs | Research, Labs |
| Campus | Build, People, Teams, Hiring (Policies and Executives inside People) | Campus, Staff |
| Sites | Factory, Stores, Venue | Factory, Stores, Venue (orders move to Devices, supply to Finance) |
| Marketing | Campaigns, Events, Owners | Marketing, After-sales |
| System | Saves, Company, Settings, Keys | System |

"New device" stays as the one filled button at the top of the rail and is removed from screen headers.

**Above the fold, per screen**
- City: the world, plates on owned buildings, one notification strip. Nothing else.
- Company > Overview: Cash, Profit, grouped attention list, your devices with reorder.
- Devices > Mine: one table (name, price, stock with reorder, 12-month spark, profit, review). Drawer: stock/reorder/price first.
- Research: frontier of the tree and the selected node with budget. Behind a click: owned levels, how it works.
- Campus and Sites: the 3D view, a one-line status strip, a "Build" button. Behind a click: palette, status detail, land, light.
- Marketing: awareness and running campaigns. Behind a click: new campaign form, history.

**Shared patterns**
- Panel header: 32 px high, 12 px semibold title in sentence case, optional count, actions right-aligned as outline buttons; no accent bar except on the one selected panel.
- Table: 32 px rows, 11 px uppercase header at the new faint colour, sortable, numbers right-aligned in mono with one format (three significant figures, no trailing ".0": `$1.2K`, `$14K`, `$2.74M`, `$3.41B`), status shown only when not the default, row action at the right edge on hover and focus.
- Buttons: Primary (accent fill, one per view), Secondary (1 px `line2` border, fg text), Quiet (text only), Danger (1 px `neg` border, used with a confirm). Heights 28 and 36. Disabled: `#8c8279` text, dashed border, no opacity.
- Spacing scale: 4, 8, 12, 16, 24. Panel padding 12, gap between panels 8, page gutter 16.
- Type scale: 11 (labels, table headers), 12 (body, table cells, buttons), 13 (panel titles, nav), 16 (tile values), 20 (the one headline figure per screen), 48 (menu only). Uppercase only for nav and table headers. Mono for numbers only.
- Text colours: fg `#f1ece6`, dim `#a39a91` (6.9:1), faint `#8c8279` (5.0:1). Hierarchy from size and weight, not a third grey.
- Floating layers: at most one drawer (right, over the feed), one modal, one notification strip; none may overlap another.
- Focus: 2 px accent outline, 2 px offset, on every control. Esc closes the top layer; Enter confirms it.

## Bugs found

1. Toast renders over the guide card's buttons. Hire anyone with the guide open.
2. Unlock banner shifts the whole layout on entry and exit; two entries double it. Hire a researcher, open the designer, wait.
3. Two "Take me there" buttons with different destinations at once. Launch the first device with the guide on.
4. Guide card covers product-inspector content; lock card overlaps the guide card.
5. Guide step 2 describes the campus while the city is shown.
6. Guide step "Read the reviews" is skipped if 2,000 units sell before the step is reached.
7. Rivals > any company: Stock shows "1000.00B" for every device.
8. Venue with the starter open-air layout: hint says the plot is empty, header says 0 m² built, status says Ready, 144 seats.
9. Marketing > Campaigns and Finance > Monthly statement overflow horizontally at 1440x900 with the feed open; Staff > People at 1180x620; Rivals company columns hidden under the device panel.
10. Build palette: inactive mode tabs have no `title` or `aria-label`.
11. Enter in the retail price field does not apply; Esc does not close the person card or the year-end summary.
12. Designer proposed the name "Behemoth 2" when Behemoth 2 and Behemoth 3 already existed.
13. Overview "Company value" has no currency sign ("6.95B").
14. Feed repeats "X is sold out. Order more units to keep selling" for the same device every few days.
15. Rail scrolls at 1280x720 with everything unlocked (657 px of items in 550 px).
16. Clicking a locked city building leaves the camera zoomed in after the card is closed.
17. Unverified: with "Lounge and café" selected in Campus > Rooms, two clicks on open lawn made no room, no preview and no message. Desk placement by click worked, so this may be the game or my automated pointer.

## Not reviewed, and why

- **Hover tooltips, transitions, animation**: the browser pane was hidden for the whole session. Selected-state highlights lagged in screenshots (CSS transitions did not advance), so I checked selection through the DOM and did not judge motion. Native tooltips never rendered.
- **Drag placing, wall painting, shapes (round, ring, slant, fill), grounds and look painting**: palettes seen, tools not exercised beyond one desk and one failed room.
- **Listed company**: the IPO was refused ("a full year of accounts"), so Shares was reviewed as a private company with one investor.
- **Recall flow, board removal, real bankruptcy with the "Before the debt" checkpoint**: game over was forced through the store handle.
- **Device lines tab, designer Colours tab, collapsed rail, Volt / Ice / Rose themes** (contrast figures are Ember only), **save export/import, sync folder, online account, sound, Timeline mode**.
- **Real pacing**: most late-game time was advanced by script, so I cannot say how often banners and incidents interrupt in normal play beyond the first three months I played by hand.
- **Fans and feedback, Policies**: seen at reduced screenshot scale and as text only.
