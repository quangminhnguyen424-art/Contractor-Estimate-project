# The web app on a computer screen

**Why.** On a computer the web app was the phone app in a 760-px column: phone lists, phone buttons edge to edge, a day strip
for a calendar, and no way around the app once a screen was open. It should look and work like a web app there. Phones, and
browser windows narrower than 960 px, stay exactly as they were.

**What changes at 960 px and wider (browser only, `useWide()` in `src/ui/wide.tsx`).**

- A dark rail on the left of every signed-in screen (`ui/web/SideNav`): New estimate, Home, Jobs, Schedule, Receipts, Money
  sheet, My prices, Crew and subs, Settings, Help. It replaces the tab bar. Opening a place from it closes whatever is stacked.
- Every screen built on `Screen` sits on a pale canvas as a white sheet (820 px for forms, 1240 px for big tables), with its
  main buttons in a bar at the bottom right at a button's width.
- Bottom sheets (menus, drop-downs, small forms) open as dialogs in the middle of the window.
- Home: four numbers across the top, "Needs you today" and recent jobs as a table on the left, the week ahead on the right.
  From 1240 px, Ask Studwise is its own column, always in view.
- Jobs: a table (job, client, address, status, total, paid, updated) with search and filters in one line.
- Schedule: a month calendar, with the picked day and what is coming up beside it.
- Money sheet: all nine columns in view, no sideways scrolling.

**Not in this step.** The estimate flow, the job page and Settings keep their one-column content inside the white sheet; two-pane
layouts for them come next. No change to what any screen does, to data, or to the phone apps.

**Approaches considered.** (1) A separate web front end: best result, but two apps to keep in step for every feature. (2) Only
widen the phone screens: cheap, still looks like a phone. (3) One code base, with a desktop shell and desktop layouts for the
pages where a wide window matters most: chosen, because every feature still ships once.
