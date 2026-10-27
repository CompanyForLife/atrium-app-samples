# COHO design guide for internal Atrium apps

Version 0.6, draft, 26 Oct 2026. Built from the COHO design system docs (`docs/design/` in the HouseShare repo), COHO's compiled stylesheet, and the Atrium asset guidance. Where this file and the stylesheet disagree, the stylesheet is right.

This file works together with **`coho.css`**, COHO's stylesheet trimmed to the classes documented here, and **`reorder.js`**, the kit's script for a list the user puts in order (section 11). Every class in this guide exists in the stylesheet. Nothing else is needed to build a screen, except COHO's own icons and sprite images, which section 16 and section 17 explain how to get.

## 0. How to use this file

1. Read sections 1 to 3. They say what an app screen is, the rules, and how to choose a part.
2. Build the screen as plain HTML from the parts in sections 8 to 15, starting from the closest worked example in section 18.
3. Paste `coho.css` into a `<style>` block in the `<head>`, unchanged. If your app can serve a file, you may link it instead. Keep the theme script at the end of `<body>`. A page with a reorderable list (section 11) also pastes `reorder.js` into its own `<script>` block, or links it, unchanged.
4. Before you hand over, produce the Store listing as section 20 describes, then work through section 21 and list any gaps as section 22 describes.

Do not read `coho.css` itself. It is large and tells you nothing this file does not.

## 1. What you are building

An app screen is a **panel inside COHO**. COHO loads it in an iframe beside its own navigation. So:

- No site header, navigation bar, footer or logo. COHO supplies the frame.
- One screen is one scrolling column of panels. Each panel has a title bar, a body, and where there are actions, a button group.
- Design for narrow widths first. The panel can be small. Everything here is mobile-first.
- Plain HTML and CSS. No framework, no build step, no other UI library.
- Light or dark is COHO's choice. COHO tells the page which theme the manager uses and the shell's theme script applies it. Nothing else in the app knows about themes.

Every page starts from this shell:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>App name</title>
  <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* Paste the whole of coho.css here, unchanged. */
  </style>
</head>
<body>
  <!-- If you use icons, the inlined sprite goes here (section 16.2). -->
  <main class="u-padding-left--20 u-padding-right--20">
    <!-- panels go here -->
  </main>
  <script>
    // The theme script. Paste it unchanged. parentOrigin is the COHO origin this page is embedded from:
    // fill it in on the server from ATRIUM_PARENT_ORIGIN, as the starter does. Never '*'.
    var parentOrigin = '{{ATRIUM_PARENT_ORIGIN}}';
    function applyTheme(theme) {
      var next = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      document.body.classList.toggle('coho__dark', next === 'dark');
    }
    var fromQuery = new URLSearchParams(location.search).get('theme');
    if (fromQuery === 'dark' || fromQuery === 'light') applyTheme(fromQuery);
    window.addEventListener('message', function (event) {
      if (event.origin !== parentOrigin) return;
      if (event.data && event.data.type === 'atrium.quickView.theme') applyTheme(event.data.theme);
    });
    if (window.parent !== window) parent.postMessage({ type: 'atrium.quickView.ready' }, parentOrigin);
  </script>
  <!-- Only on a page with a reorderable list (section 11): the reorder script, linked or pasted into its own block, unchanged.
       <script src="reorder.js"></script> -->
</body>
</html>
```

The theme script is how the page follows COHO. COHO opens the page with `theme=light` or `theme=dark` on the signed URL, which paints it right the first time, and posts `atrium.quickView.theme` whenever the manager toggles dark mode while the panel is open. Applying a theme means setting the `coho__dark` class on `<body>`: that is the hook every dark rule in `coho.css` keys on, exactly as in COHO itself. The `data-theme` attribute is set alongside it for the day COHO's stylesheet keys on the attribute instead; today the stylesheet ignores it. A page opened in a new tab (an external configure page) has no COHO parent, so it takes the theme from the URL and no message ever arrives; the same script serves. Nothing else in the app reads or sets a theme (section 2, rule 14).

A page served with a Content-Security-Policy that forbids inline scripts links `reorder.js` rather than pasting it. The theme script stays in the page, where the checker looks for it, so allow it by hash or nonce.

## 2. The rules

These are checked at review. Break none of them.

1. **Reuse before invent.** If a part in this file does the job, use it. Do not create a new button style, card, colour class or icon. Building from scratch what already exists is the most common reason work is rejected.
2. **Only classes in this file.** Every class in your markup must appear here. Do not invent class names.
3. **No CSS of your own.** No inline `style` attributes, no `<style>` block other than the pasted stylesheet. Spacing and text are set with the utility classes.
4. **Colour comes from the parts. You never write a colour.** Not a hex code, and not a token either: the tokens do not change in dark mode, so a token you write is a light-mode hard-code. Magenta is the main action, green is money or success, orange is a warning, red is destructive or an error, cyan is a link or information. Never pick a colour because it looks nice.
5. **One primary button per view**, always inside `button__group` and `button__group-item`, always in the order primary, secondary, ghost, cancel. One size per group. Labels of three words or fewer.
6. **Headings:** `heading--section` wraps every panel title. Heading levels follow the outline, never the size you want.
7. **Forms:** single column unless fields truly belong side by side. Label above control. Errors at the end of the body. Footer is `hr` then a button group. Never disable the submit button to show a form is invalid.
8. **Tables:** always `compact__table compact__table--narrow` together, column widths with `width-*` classes only.
9. **Layout:** `grid grid--12` with `grid-span-*` for panels. `form__grid` only inside forms. No floats, no tables for layout, no other grid.
10. **Type:** Mulish only, loaded in the page head. Never set a font size or weight yourself. Never below 12px.
11. **No other UI libraries.** No Bootstrap, Tailwind, Material, Font Awesome, Heroicons or any component kit, not even for one glyph.
12. **COHO icons and sprites only**, taken as section 16 and section 17 describe. Never draw, trace, generate or link an icon from anywhere else. Never redraw the COHO logo.
13. **Accessibility:** every control has a label. Every interactive element can be reached and seen with the keyboard. Do not remove focus outlines. No white text on a light background, and no dark text on a dark one: check every screen in both themes.
14. **Theme:** light or dark comes from COHO through the theme script in section 1, and from nowhere else. No `prefers-color-scheme`, no theme control of your own, no `coho__dark` or `data-theme` written into markup.

## 3. Pick by intent

Find the user's need on the left. Use the part in the middle, not the one on the right. If nothing fits, see section 22.

| The user needs to... | Use | Not this |
|---|---|---|
| See a page of things grouped by topic | Panels (section 8) | Headings floating with no panel |
| See a few key numbers at a glance | Stat tiles (section 13) | A table, or big text on its own |
| Filter a list by status, with counts | Stat tiles used as filters | A dropdown, when there are five states or fewer |
| Find a record by text, or narrow a list by property or a flag | Filter bar (section 12) | A full form with a rule and a Save button, or a search box of your own |
| Compare many records across columns | Table (section 10) | Cards, one per row |
| Put items in an order the user chooses | Reorderable list (section 11) | Up and down buttons, a position number to type, a table with a sort, or a library's sortable |
| Browse a few items that are mostly one title and a few lines | Content cards (section 13) | A table with one column |
| Enter or change up to about eight fields | Single-column form (section 12) | A grid of fields |
| Enter related fields side by side (a date range, amount and unit) | Form grid, inside the form only | The page grid |
| Pick one of two to five options | Radio buttons | A dropdown |
| Pick one of more than five options | Select | A long list of radios |
| Switch one thing on or off | Checkbox | Two radios labelled Yes and No |
| Tell the user something next to the thing it is about | Notice (section 14) | Coloured text on its own |
| Label the state of a record (paid, overdue, draft) | Status pill or badge (section 15) | Coloured text, or a new class |
| Take the one main action | Primary button | Any other button |
| Offer a second, less important action | Secondary or ghost button | A second primary button |
| Cancel or back out | Cancel button, always last | A secondary button |
| Confirm a destructive action | A notice saying what will happen, then the destructive action and cancel (section 9) | Doing it on the first click, or a red button of your own |
| Show nothing is here yet | Notice saying what to do next | A blank panel |
| Show the facts about one record | Label and value rows (section 7), paragraphs for long text | A one-column table, or a card per fact |
| Show a section is loading | A short grey line such as "Loading..." | A custom spinner |
| Go to another page | A plain link `<a href>` | A button |

Parts COHO has that are **not in this guide yet**: tabs, accordions, modals, drop-down menus, date pickers, skeleton loaders, pagination, the pound-sign input group. Do not build your own. Use separate panels, a native `<input type="date">`, or text labels instead, and record the gap (section 22).

## 4. Colour

All colour is a CSS custom property. You never write one, because every part brings its own colour. The hex values are for reference only. Never write them in markup.

| Role | Token | Reference |
|---|---|---|
| Main action (buttons) | `--color-magenta` | `#CC0A73` |
| Navigation, dark headers | `--color-blue` | `#293B5B` |
| Links, information | `--color-cyan` | `#1C9BD8` |
| Form focus, setup and progress | `--color-teal` | `#1BB3AF` |
| Body text | `--color-text` | `#262626` |
| Page background | `--color-white` | `#FFFFFF` |
| Quiet background | `--color-grey-xxlight` | `#F7F7F7` |
| Borders | `--color-grey-light` | `#CCCCCC` |
| Success, payment | `--color-green-xdark` | `#5FA94F` |
| Warning, overdue | `--color-orange-dark` | `#EB9800` |
| Error, destructive | `--color-warning` | `#FF5C5C` |
| Information badge | `--color-cyan-dark` | `#1885B9` |

Meaning rules:

- **Magenta** is the main action only. Never decoration, body text or backgrounds.
- **Cyan** is links and informational interactive elements.
- **Teal** is form elements and the setup or completeness domain.
- **Green** is payment, success and positive money states.
- **Orange** is warnings, overdue and attention states.
- **Red** is destructive actions and errors only.
- **Brown** and anything named `internal` belong to COHO's own admin screens. Never use them.
- Do not invent colours by mixing or hard-coding. Do not import conventions from other systems, such as blue as a primary action.

Dark mode:

- COHO's dark theme does not change the tokens. It restyles each part under the `coho__dark` body class, and `coho.css` carries those rules for every part in this file. That is why you never write a token: `--color-white` is white in both themes.
- A part flips only in the context this file documents it in. Used elsewhere, it may keep its light colours.
- Some parts keep their light colours in dark mode in COHO itself: the plain `info-badge`, the `status--*` pills and `u-text--caption`. They are logged in `design-gaps.md`; do not work around them.
- Check every screen in both themes before you finish (section 21).

## 5. Typography

One typeface, **Mulish**, loaded in the page head. Headings are weight 800. Body text is weight 600, heavier than usual, on purpose, for legibility. `strong` is 700.

| Use | Markup | Size |
|---|---|---|
| Page title, one per screen | `<h1 class="heading--1">` | 30px, 36px from tablet |
| Panel title | `<h2 class="heading--2">` inside `heading--section` | 24px, 28px from tablet |
| Sub-section | `<h3 class="heading--3">` | 20px, 24px from tablet |
| Minor heading | `<h4 class="heading--4">` | 18px, 20px from tablet |
| Body | `<p>` | 16px |
| Intro line under a title | `<p class="lede">` | 20px |
| Small text | `u-text--small` | 14px |
| Caption, quiet note | `u-text--caption` | 13px, grey |
| Smallest allowed | `u-text--tiny` | 12px. Never go below it |

Text utilities in the stylesheet:

| Class | Effect |
|---|---|
| `u-text--large` | Larger body text |
| `u-text--bold` | Weight 700 |
| `u-text-color--grey` | Supporting or secondary text |
| `u-text-color--light-grey` | De-emphasised text |
| `u-text-color--green` / `u-text-color--orange` / `u-text-color--cyan` / `u-text-color--teal` | Emphasis with a meaning: money or success, warning, information, progress. Only per the colour rules in section 4. Never magenta on text |
| `u-text-align--right` / `u-text-align--center` | Alignment |
| `u-text--1-line-max` | One line, cut with an ellipsis |

Rules:

- Never use a heading tag for its size. Pick the level by its place in the outline.
- Never write a font size or a font weight.
- Long words wrap on their own. Do not add word-break rules.

## 6. Spacing

A 5px and 10px scale, through classes only. Never an inline margin or padding.

| Need | Classes |
|---|---|
| Space above | `u-margin-top--5`, `--10`, `--20`, `--30`, `--40` |
| Space below | `u-margin-bottom--5`, `--10`, `--20`, `--30`, `--40` |
| Space at the sides | `u-margin-left--5`, `--10`, `--20`; `u-margin-right--5`, `--10`, `--20` |
| Padding above or below | `u-padding-top--5`, `--10`, `--20`, `--30`, `--40`; `u-padding-bottom--10`, `--20`, `--30` |
| Padding at the sides | `u-padding-left--20`, `u-padding-right--20` |
| Padding all round | `u-padding--10` |
| Remove space | `u-margin-top--none`, `u-margin-bottom--none`, `u-padding-top--none`, `u-padding-bottom--none` |

For space between items in a grid use the grid's own `grid-gap-*` classes (section 7).

## 7. Layout

A 12-column grid, applied directly on the container, no wrapper divs. Mobile first: a span with no prefix applies at every width, and a prefixed span applies from that width up.

```html
<div class="grid grid--12 grid-gap-md">
  <div class="grid-span-12 grid-span-sm-6 grid-span-md-4">...</div>
  <div class="grid-span-12 grid-span-sm-6 grid-span-md-4">...</div>
  <div class="grid-span-12 grid-span-sm-6 grid-span-md-4">...</div>
</div>
```

| Purpose | Classes |
|---|---|
| Container | `grid grid--12` |
| Gap all round | `grid-gap-none`, `grid-gap-sm`, `grid-gap-md`, `grid-gap-lg` |
| Column gap only | `grid-gap-x-none`, `grid-gap-x-sm`, `grid-gap-x-md`, `grid-gap-x-lg` |
| Row gap only | `grid-gap-y-none`, `grid-gap-y-sm`, `grid-gap-y-md`, `grid-gap-y-lg` |
| Span | `grid-span-1` to `grid-span-12`, `grid-span-full` |
| Span from a width up | `grid-span-xs-*`, `grid-span-sm-*`, `grid-span-md-*`, `grid-span-lg-*` |
| Start column | `grid-start-1` to `grid-start-13` |

Breakpoints, for reference. You never write a media query.

| Prefix | From |
|---|---|
| `xs` | 414px |
| `sm` | 560px |
| `md` | 768px |
| `lg` | 1152px |

Show and hide: `hide-for-mobile` (hidden below 768px), `show-for-mobile` (shown only below 768px), `show-for-large` (shown only from 1152px).

Small layout helpers, for lining up a few things inside a panel. Not a substitute for the grid.

| Class | Effect |
|---|---|
| `u-flex` | A flex row |
| `u-space-between` | A flex row with the first item left and the last item right |
| `u-flex--1` | Let one item in a flex row take the remaining space |
| `u-flex--end` | Push the items of a flex row to the right |
| `u-align--center` / `u-align--end` | Vertical alignment of items in a flex row |
| `u-gap--5` / `u-gap--10` / `u-gap--20` | Space between the items of a flex row |
| `u-width--100` | Full width |
| `u-border-top` / `u-border-bottom` / `u-border-all` | A 1px border in the standard grey |

```html
<div class="u-space-between u-align--center">
  <span>12 Mill Lane</span>
  <span class="status--completed">Occupied</span>
</div>
```

Use the page grid for panels, stat tiles and cards side by side. Never use it to place form fields. That is what `form__grid` is for (section 12).

### Label and value rows

**Use when** a screen shows the facts about one record: reference, property, where it is kept, status.
**Do not use when** records are compared across columns (table) or the value is a paragraph.

One row per fact, label on the left in grey, value on the right. A long value, such as a description, does not fit a row: give it a grey label line and a paragraph of its own.

```html
<div class="u-space-between u-gap--20 u-border-bottom u-padding-top--10 u-padding-bottom--10">
  <span class="u-text-color--grey">Kept at</span>
  <span class="u-text-align--right">Main office, key safe B</span>
</div>
<div class="u-space-between u-gap--20 u-border-bottom u-padding-top--10 u-padding-bottom--10">
  <span class="u-text-color--grey">Status</span>
  <span class="u-text-align--right"><span class="info-badge info-badge--green">Available</span></span>
</div>
<p class="u-text--small u-text-color--grey u-margin-top--10 u-margin-bottom--none">Description</p>
<p>Yale cylinder key. Two copies cut March 2025; this is copy 1 of 2.</p>
```

The last row in a group drops `u-border-bottom`. Labels are one or two words. Values are plain text, a pill or a badge, never a button.

**Mistakes:** a sentence as a row value (it wraps right-aligned and reads badly on a phone); a two-column table; a card per fact.

## 8. Panels and section headings

**Use when** you group related content. Every screen is a stack of panels.
**Do not use when** you need a pop-up or a tab. Those are not in this guide.

A fixed, repeating shape, title bar with a rule under it then content, is what makes any screen scannable. People learn it once. The title bar can hold one small action so the action sits next to what it affects.

```html
<section class="page__section page__section--narrow">
  <div class="heading--section heading--has-button">
    <h2 class="heading--2">Rota this week</h2>
    <div class="button__group">
      <div class="button__group-item">
        <button class="button button--small button--secondary">Add shift</button>
      </div>
    </div>
  </div>
  <!-- panel body: a table, a form, cards, a notice -->
</section>
```

Without an action in the title bar, drop `heading--has-button` and the button group:

```html
<section class="page__section page__section--narrow">
  <div class="heading--section">
    <h2 class="heading--2">Details</h2>
  </div>
  <p>Panel body.</p>
</section>
```

Always both `page__section` and `page__section--narrow` together. COHO's own full pages use `page__section` alone, which adds 60px above and below on wide screens. An app sits inside a COHO panel, so it uses the compact version.

**Mistakes:** a bare `<h2>` with no `heading--section`; more than one action in a title bar (put the rest in the body); `h1` as a panel title (the page has one `h1`, at the top).

## 9. Buttons

**Use when** the user takes an action: save, add, send, cancel.
**Do not use when** the thing goes to another page. Use a link.

The order and colour tell the user what the app wants them to do. One magenta button says "this is the main thing". Cancel is a quiet link so it is never mistaken for a real action. The order is always primary, secondary, ghost, cancel. Not every group needs all four. Primary plus cancel is the most common.

```html
<div class="button__group">
  <div class="button__group-item">
    <button class="button">Save</button>
  </div>
  <div class="button__group-item">
    <button class="button button--secondary">Preview</button>
  </div>
  <div class="button__group-item">
    <button class="button button--ghost">Duplicate</button>
  </div>
  <div class="button__group-item">
    <button class="button button--cancel">Cancel</button>
  </div>
</div>
```

| Class | Meaning | Look |
|---|---|---|
| `button` | The one main action | Magenta |
| `button button--secondary` | Another action they might want | Cyan |
| `button button--ghost` | A low-emphasis extra | Flat, no shadow |
| `button button--cancel` | Leave, back out | Blue underlined text |

Sizes, one per group: default (16px, stand-alone calls to action), `button--small` (14px, inside panels and table rows), `button--tiny` (12px, dense spaces).

Special-purpose colours, each for its one purpose only: `button--payment` (green, payment actions), `button--feedback` (feedback prompts), `button--knowledge` (help links), `button--advert` (upgrade prompts). Never use them as general colours.

A link can be a button, inside its group like any other: `<a href="#" class="button button--small button--ghost">View</a>`. Use this in table rows where the action opens a page.

**Icons on buttons.** Add `button--icon` and put the icon first (section 16 explains the icon markup). The button colours the icon itself: white on primary and secondary, text-colour on ghost and cancel. An icon-only button adds `button--icon-only` and an aria-label attribute, and is for dense places such as table rows and title bars.

```html
<div class="button__group">
  <div class="button__group-item">
    <button class="button button--small button--secondary button--icon">
      <span class="icon"><svg class="icon-add" aria-hidden="true"><use href="#icon-add"></use></svg></span>
      Add shift
    </button>
  </div>
  <div class="button__group-item">
    <button class="button button--small button--ghost button--icon button--icon-only" aria-label="Delete">
      <span class="icon"><svg class="icon-delete" aria-hidden="true"><use href="#icon-delete"></use></svg></span>
    </button>
  </div>
</div>
```

Actions that call a server: when the request starts, set the button's `disabled` attribute and change its label (for example "Saving..."). Restore both when the request finishes, whether it succeeds or fails. This is the only time a button is disabled.

**Destructive actions.** COHO has no red button, and this guide adds none. A destructive action (delete, remove, mark lost) is a `button--ghost`, never the primary, placed after the secondary actions. Confirming it takes two steps in place: a `form__message--notification` notice that says exactly what will happen and to what (section 14), then a button group with the confirming action first, still a ghost, labelled with the verb ("Yes, mark lost"), and cancel last. The notice carries the warning. Do not reach for red, magenta or a colour of your own to make the button look dangerous.

**Mistakes:** two primary buttons in a view; cancel first; mixed sizes in a group; labels longer than three words; a button used to navigate; a submit button disabled because the form is invalid (show a notice instead, section 12); a new button colour; a primary, or a colour of your own, for a destructive action.

## 10. Tables

**Use when** the user compares records across columns or scans a long list.
**Do not use when** there are fewer than three columns or the items carry images or long text (use cards).

```html
<table class="compact__table compact__table--narrow">
  <thead>
    <tr>
      <th class="width-180">Date</th>
      <th class="width-f-350 one-line">Property</th>
      <th class="width-200 one-line">Tenant</th>
      <th class="width-100 u-text-align--right">Amount</th>
      <th class="width-f-100 u-text-align--right">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="width-180">15 Jan 2026</td>
      <td class="width-f-350 one-line">123 High Street</td>
      <td class="width-200 one-line">John Smith</td>
      <td class="width-100 u-text-align--right">£850.00</td>
      <td class="width-f-100 u-text-align--right"><span class="status--completed">Paid</span></td>
    </tr>
  </tbody>
</table>
```

Rules:

- Always both `compact__table` and `compact__table--narrow`.
- Every `<th>` and every `<td>` in a column carries the **same** width class.
- `width-120` grows and shrinks from 120 pixels. `width-f-200` grows but never goes below 200. The number runs in steps of 10 from 30 to 600, plus 24, 28, 45, 125 and 168.
- `one-line` cuts long text with an ellipsis. Put it on every cell of a column that could overflow, header included, so the column stays one line.
- Amounts and actions are right aligned with `u-text-align--right`.
- On a narrow screen each row stacks into a block and the headings are hidden, so make the first column meaningful on its own and keep to five columns or fewer.

Column conventions:

| Column | Classes |
|---|---|
| Date | `width-180` (or `width-120` when space is tight) |
| Name, property, title | `width-f-350 one-line` (or `width-f-200`) |
| Email, payee | `width-200 one-line` |
| Amount | `width-100 u-text-align--right` |
| Status | `width-f-100 one-line` |
| Actions | `width-f-100 u-text-align--right` |
| Small icon or checkbox | `width-45` |

**Mistakes:** `<table>` without the two classes; different widths on `th` and `td`; custom column classes; a table used to lay out a page.

## 11. Reorderable list

**Use when** the user puts items in an order of their own choosing: the steps of a checklist, the collections on a bin rota, the priority of a list of jobs.
**Do not use when** the order is fixed or computed, by date or by a column. That is a table (section 10). One flat list per panel: a list inside a list is not in this guide.

The part is COHO's workflow checklist row, as the Workflow tab of an action renders it: a drag handle, a teal step number over a small checkbox, the item's name in bold with a grey line under it, and an actions column, with a dashed rule between rows. The behaviour is the kit's reorder script, `reorder.js`, which sits beside `coho.css` and goes into the page the same way: pasted into its own `<script>` block, or linked, unchanged. It gives every list on the page what COHO's checklist has. Picking a row up by its handle lifts a translucent copy that follows the pointer, the rows it passes slide out of the way, and releasing it drops it into the gap with a short snap. A press on the handle that moves only a few pixels is not a drag. It works by mouse, by touch (the page does not scroll while a row is held) and from the keyboard, in both themes. The page writes no drag code and links no sortable library.

```html
<div class="card__detail--step-wrapper">
  <div class="card__detail--step-list">
    <div class="card__detail--step-holder" data-id="inspect">
      <div class="card__detail--step-drag">
        <span class="icon icon--light-grey"><svg class="icon-drag-handle" aria-hidden="true"><use href="#icon-drag-handle"></use></svg></span>
      </div>
      <div class="card__detail--step-checkbox">
        <span class="card__detail--step-index">1</span>
        <label class="form__checkbox form__input--small">
          <input type="checkbox" aria-label="Inspect the property done">
          <div class="form__checkbox-label"></div>
        </label>
      </div>
      <div class="card__detail--step-description">
        <p>Inspect the property</p>
        <div class="card__detail--step-meta">
          <p class="u-text-color--grey u-text--small">Due Mon 27 Oct</p>
        </div>
      </div>
      <div class="card__detail--step-actions">
        <div class="button__group u-margin-bottom--none">
          <div class="button__group-item">
            <button type="button" class="button button--ghost button--tiny button--icon button--icon-only" aria-label="Edit Inspect the property">
              <span class="icon"><svg class="icon-edit" aria-hidden="true"><use href="#icon-edit"></use></svg></span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="card__detail--step-holder" data-id="report">
      <div class="card__detail--step-drag">
        <span class="icon icon--light-grey"><svg class="icon-drag-handle" aria-hidden="true"><use href="#icon-drag-handle"></use></svg></span>
      </div>
      <div class="card__detail--step-checkbox">
        <span class="card__detail--step-index">2</span>
      </div>
      <div class="card__detail--step-description">
        <p>Send the report</p>
      </div>
    </div>
  </div>
</div>
<div id="order-error" class="form__message form__message--error u-margin-top--10" role="alert" hidden>
  <div class="form__message-text u-padding--10">The order could not be saved. Try again.</div>
</div>
```

The shape:

- The wrapper and the list, always together, and every row a direct child of the list. Each row carries `data-id`, the id your backend knows the item by.
- The handle cell comes first and is always present. It holds the `icon-drag-handle` icon and nothing else, on a wrapper carrying `icon--light-grey` (section 16), as COHO's row has it: light grey in light mode, the dark default in dark mode. Rows are picked up by the handle only, so the checkbox, links and buttons in a row keep working as clicks. For a row the user may not move, leave the cell empty, `<div class="card__detail--step-drag"></div>` with nothing inside, as COHO renders it: the script leaves an empty cell alone, so the row can be neither picked up nor focused, though the rows that can move still pass over it. A list the user may not reorder at all has every cell empty.
- The checkbox cell holds the step number and the small checkbox. The number is the row's position, and the script renumbers after every move. The checkbox's own label is empty, so give the input an `aria-label` that names the item. Leave the checkbox out when there is nothing to tick, keeping the cell and the number, as the second row above does.
- The description holds the name as its first paragraph. The meta line under it is optional and holds one fact per small grey paragraph, a due date, who completed it and when, and the like; they sit in a line and wrap. No pill there: COHO's row has none.
- The actions column is optional and takes icon-only ghost `button--tiny` buttons (section 9). COHO's own row has an overflow menu here; drop-down menus are not in this guide yet, so use the buttons.
- A list with one row cannot be reordered. The script keeps its handle cell empty, as COHO renders it, and fills it again when a second row arrives. Rows added or removed after the page loads need no further wiring.

**Saving the order.** The script moves the row first and then tells the page, as COHO's checklist does. After a drop that changed the order, the list dispatches a `coho:reorder` event whose `detail` carries `ids`, every row's `data-id` in the new order, and `save`. Pass `save` the promise of your request. While it is pending the list cannot be reordered; if it rejects, the rows go back to their previous order. Show the failure in a `form__message--error` notice after the list (section 14), hidden until it is needed. This is the only drag-related code a page writes:

```html
<script src="reorder.js"></script>
<script>
  var list = document.querySelector('.card__detail--step-list');
  var notice = document.getElementById('order-error');
  list.addEventListener('coho:reorder', function (event) {
    notice.hidden = true;
    event.detail.save(fetch('/steps/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: event.detail.ids })
    }).then(function (response) {
      if (!response.ok) throw new Error('Save failed');
    }).catch(function (error) {
      notice.hidden = false;
      throw error; // rethrown so the script puts the rows back
    }));
  });
</script>
```

If you do not call `save`, the new order stays as dropped and nothing is disabled; do that when the order is saved later with the rest of a form. To stop reordering for a while, for example while a form of your own is open under the list, set `aria-busy="true"` on the list and remove it after; the script sets it while a save is pending. A row or a list the user may never move gets empty handle cells instead, as above.

**Keyboard.** The handle takes focus. Space or Enter picks the row up, the arrow keys move it, Space or Enter drops it (which saves as above), Escape puts it back, and every move is announced to screen readers. Nothing of this shows on screen beyond the focus ring. COHO's own checklist has no keyboard reorder yet; the gap is logged in `design-gaps.md`.

**Both themes.** In dark mode the rows take COHO's dark text and rule and the number stays teal; the lifted copy stays white at half opacity, as it does in COHO. From 768px wide the wrapper is a 350px box with its own scroll, COHO's rule for the checklist outside the action card. Both are logged in `design-gaps.md`; do not work around them.

**Mistakes:** a sortable library; `draggable="true"` on a row; picking rows up anywhere but the handle; up and down buttons, or a position number to type, for ordering; drag CSS or drag code of your own; a `cdk-` class written into markup (the script adds its own when it wires the list and while a row is dragged); a row that is not a direct child of the list; a handle cell missing, or holding anything but its icon; the script pasted with changes, or sharing a `<script>` block with other code.

## 12. Forms

**Use when** the user enters or changes information.

One column, label above control, errors together at the end, actions at the bottom. It is the most predictable way to fill in a form and it works at any width. The form is checked when it is sent and the problems are listed, rather than the button being disabled, so the user is told what is wrong instead of being left with a button that does nothing.

```html
<form class="form" novalidate>
  <h3 class="heading--3 u-margin-bottom--20">New shift</h3>

  <label class="form__label" for="name">Name</label>
  <input id="name" type="text" placeholder="e.g. Morning clean">
  <div class="form__input-help"><p>Staff will see this on their rota.</p></div>

  <label class="form__label" for="role">Role</label>
  <select id="role" class="form__select">
    <option value="">Choose a role</option>
    <option>Cleaner</option>
    <option>Supervisor</option>
  </select>

  <label class="form__label" for="notes">Notes <span class="form__label-subtext">Optional</span></label>
  <textarea id="notes" rows="3"></textarea>

  <label class="form__label">Repeat</label>
  <div class="form__radio-buttons">
    <label class="form__radio-button">
      <input type="radio" name="repeat" value="no" checked>
      <div class="form__radio-button-label">Does not repeat</div>
    </label>
    <label class="form__radio-button">
      <input type="radio" name="repeat" value="weekly">
      <div class="form__radio-button-label">Every week</div>
    </label>
  </div>

  <div class="u-margin-top--10">
    <label class="form__checkbox">
      <input type="checkbox">
      <div class="form__checkbox-label">Notify staff by email</div>
    </label>
  </div>

  <!-- Errors: always at the end of the body, before the footer. Render only when there are errors. -->
  <div class="form__message form__message--error u-margin-top--20" role="alert">
    <div class="form__message-text u-padding--10">
      <ul>
        <li>Name: enter a name for the shift.</li>
        <li>Role: choose a role.</li>
      </ul>
    </div>
  </div>

  <!-- Footer: always hr then a button group -->
  <hr class="u-margin-top--20">
  <div class="button__group">
    <div class="button__group-item">
      <button type="submit" class="button">Save</button>
    </div>
    <div class="button__group-item">
      <button type="button" class="button button--cancel">Cancel</button>
    </div>
  </div>
</form>
```

Field anatomy:

- The control is a sibling of its `form__label`, not wrapped in an extra div. Pair them with `for` and `id`.
- Text, number, email, date and other inputs need no class. The stylesheet styles them by element.
- Selects use `form__select`.
- Radios: a `form__radio-buttons` wrapper, then one `label.form__radio-button` per option holding the `<input type="radio">` and a `form__radio-button-label`. Give every radio in the group the same `name`.
- Checkboxes: a `label.form__checkbox` holding the `<input type="checkbox">` and a `form__checkbox-label`. The label is the checkbox's own label, so there is no separate `form__label`. Wrap each in `u-margin-top--10`.
- Contextual help sits directly after the field it describes, in `form__input-help`.
- `placeholder` is a hint, never a substitute for a label.
- A field that may be left empty says so in its label with `form__label-subtext`: `<label class="form__label" for="purpose">Purpose <span class="form__label-subtext">Optional</span></label>`. Do not write "(optional)" into the label text, and do not mark required fields.

Validation, when the form is submitted:

1. Add `novalidate` to the form so the browser's own bubbles do not appear.
2. On submit, check every field. Collect one line per problem as "Label: what to do".
3. If there are any, render them in a `form__message--error` notice at the end of the body, move focus to it, and stop.
4. If there are none, send the request, disabling the submit button only while it is in flight (section 9).
5. Show a failed request the same way, in a second error notice with the server's message.

**Fields that belong side by side** (a date range, an amount and its unit) go in a form grid, inside the form only. The label, control and help text all live inside the cell:

```html
<div class="form__grid form__grid-2--medium">
  <div class="form__grid-element">
    <label class="form__label" for="start">Starts</label>
    <input id="start" type="date">
  </div>
  <div class="form__grid-element">
    <label class="form__label" for="end">Ends</label>
    <input id="end" type="date">
  </div>
</div>
```

`form__grid-2--medium` is two columns from 768px and one below, which is the usual choice. `form__grid-3--medium` is three. The footer (`hr` and buttons) sits below the grid, never inside it.

**Grouping** several topics in one form: wrap each in `<div class="form__section">`, with an optional heading one level below the form's title: `<h4 class="heading--4 u-margin-bottom--20">` under a form that has an `h3` title, `<h3 class="heading--3 u-margin-bottom--20">` when the form sits straight under a panel's `h2` with no title of its own (rule 6). It adds the gap between groups so you stop hand-placing margins. Short forms on one topic do not need it.

**Mistakes:** a control with no label; `placeholder` instead of a label; a disabled submit button; errors scattered between fields; a form grid for a single field; the page grid used to place fields; Yes and No as two radios (use one checkbox).

### Filter bar

**Use when** the user finds one record by text, or narrows a list by a property, a status or a flag. It sits at the top of the panel body, above the tiles or table it filters, in its own grey box.
**Do not use when** the user is entering or changing a record. That is a form (above).

```html
<form class="form form--inline form--slimmer form--full-width" novalidate>
  <div class="form__grid form__grid-2--small form__grid-4--medium">
    <div class="form__grid-element">
      <input id="search" type="text" placeholder="Search keys" aria-label="Search keys">
    </div>
    <div class="form__grid-element">
      <select id="filter-property" class="form__select" aria-label="Property">
        <option value="" selected>All properties</option>
        <option>12 Mill Lane</option>
        <option>4 Park View</option>
      </select>
    </div>
    <div class="form__grid-element">
      <label class="form__checkbox">
        <input type="checkbox">
        <div class="form__checkbox-label">Overdue only</div>
      </label>
    </div>
    <div class="form__grid-element">
      <div class="button__group u-flex--end">
        <div class="button__group-item">
          <button type="submit" class="button button--small button--secondary button--icon">
            <span class="icon"><svg class="icon-filter" aria-hidden="true"><use href="#icon-filter"></use></svg></span>
            Filter
          </button>
        </div>
      </div>
    </div>
  </div>
</form>
```

- Always all three of `form--inline`, `form--slimmer` and `form--full-width` on the form. They give the grey box, the tight padding and the full width.
- Two to four controls, each in a `form__grid-element`, then one button: Filter, secondary, small, with `icon-filter`, pushed right with `u-flex--end`.
- No `form__label` above the controls. The placeholder names the field and an `aria-label` repeats it for screen readers. A checkbox is its own label.
- No `hr`, no cancel, no save. To reset, the user empties the fields and filters again, or follows a plain link "Clear filters" placed after the button group.
- A search box on its own is this bar with one text input and the button.
- Stat tiles above the bar filter by status with counts (section 13). The bar narrows by everything else. Do not repeat a tile's filter in the bar.

**Mistakes:** labels above the controls; a rule and a Save-style footer; a magenta Search button; a search icon drawn inside the input (not in this guide).

## 13. Cards and stat tiles

### Stat tile

**Use when** the user needs a headline number, or a list filtered by status where each status has a count.
**Do not use when** you have more than six tiles, or the number needs explaining (use a table).

A number on a coloured tile reads in a glance, and the colour carries the meaning. Pick the variant by meaning, never by taste.

```html
<div class="grid grid--12 grid-gap-md u-margin-bottom--20">
  <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
    <a class="card card__filters card__filters--action" href="#overdue">
      <div class="card__count">4</div>
      <div class="card__title">Overdue</div>
    </a>
  </div>
  <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
    <a class="card card__filters card__filters--progress" href="#pending">
      <div class="card__count">9</div>
      <div class="card__title">Pending</div>
    </a>
  </div>
  <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
    <a class="card card__filters card__filters--active" href="#paid">
      <div class="card__count">31</div>
      <div class="card__title">Paid</div>
    </a>
  </div>
  <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
    <a class="card card__filters card__filters--inactive" href="#draft">
      <div class="card__count">0</div>
      <div class="card__title">Draft</div>
    </a>
  </div>
</div>
```

| Class, always exactly one | Meaning | Colour |
|---|---|---|
| `card__filters--action` | Needs the user's attention | Magenta |
| `card__filters--progress` | In progress, waiting | Orange |
| `card__filters--active` | Healthy, done, positive | Green |
| `card__filters--inactive` | Zero, nothing to see, not clickable | Grey |

A clickable total ("All keys", "Everything") takes `--active`: it is a healthy, neutral number. `--inactive` is only for a count of zero, whatever the tile means, so a zero tile is grey and not clickable.

**Mistakes:** forgetting the variant (the tile is white on white); green for a bad number; long text in `card__title` (one or two words); a zero tile that is not `--inactive`; `--inactive` on a tile with a count that can be clicked.

### Content card

**Use when** you show a few distinct items that each have a title and a few lines.
**Do not use when** items are compared across columns (table) or you only need a number (stat tile).

```html
<div class="grid grid--12 grid-gap-md">
  <div class="grid-span-12 grid-span-sm-6 grid-span-md-4">
    <div class="card">
      <div class="card__content">
        <div class="card__title">12 Mill Lane</div>
        <p class="u-text--small u-text-color--grey u-margin-bottom--10">3 bedrooms, Leeds</p>
        <p class="u-text--small">Next inspection: 14 Nov</p>
        <span class="status--completed">Occupied</span>
      </div>
    </div>
  </div>
</div>
```

Make the whole card a link with `<a class="card" href="#">` in place of the div.

**Mistakes:** a card inside a card; a button group in every card (one or two actions at most); an image with no `alt`.

## 14. Notices

**Use when** you tell the user something next to the thing it is about: a hint, a success, an error, "nothing here yet".
**Do not use when** the message is a status label on a record (use a pill).

One box, three colours, so the user learns the meaning from the colour first and the words second.

```html
<div class="form__message form__message--notification">
  <div class="form__message-text u-padding--10">No shifts yet. Choose Add shift to create the first one.</div>
</div>
```

| Class | Meaning | Colour |
|---|---|---|
| `form__message--notification` | Information, a hint, an empty state | Blue |
| `form__message--success` | It worked | Green |
| `form__message--error` | It did not work, or something is wrong | Red |

Add `role="alert"` to an error so screen readers announce it. A list of problems goes in a `<ul>` inside `form__message-text`.

**Mistakes:** `--error` for a warning that blocks nothing (use `--notification`); long paragraphs (one or two sentences); a notice used as a button.

## 15. Status pills and badges

**Use when** you label the state or kind of one record: paid, overdue, draft.
**Do not use when** the label is a heading or a count.

Status pills go on a `<span>` only. The stylesheet qualifies them by element and will not style a `div`.

```html
<span class="status--completed">Paid</span>
<span class="status--stale">Draft</span>
```

| Class | Meaning |
|---|---|
| `status--completed` | Done, agreed, active (green) |
| `status--stale` | Inactive, cancelled, not started (grey) |
| `status--high`, `status--medium`, `status--low` | Priority |

Badges, for a quality or a flag rather than a lifecycle state:

```html
<span class="info-badge info-badge--green">Recommended</span>
<span class="info-badge info-badge--orange">Due soon</span>
```

| Class | Meaning |
|---|---|
| `info-badge` | Neutral (grey) |
| `info-badge--green` | Good, success, money in |
| `info-badge--orange` | Needs attention soon |
| `info-badge--red` | Problem, overdue |
| `info-badge--cyan` | Information |

Choose by meaning, never by colour. Use pills or badges in a given list, not both.

## 16. Icons

COHO has its own set of about 300 SVG icons. Use those and nothing else: no Font Awesome, Material Icons, Heroicons, Lucide, Bootstrap Icons, emoji, or hand-written or generated path data, not even for one glyph. Icon colour carries the same meaning as every other colour (section 4).

The icon sources live in the HouseShare repo at `assets/svg/` and are published nowhere an app can fetch them. If you do not have the repo, ask someone who does to run the export in 16.2 for the icons you need and give you the output. Do not work around this by drawing or linking an icon. The hello-node starter ships `design/icons.svg`, a prebuilt sprite of every icon in the table below, so a seed copied from it already has them.

### 16.1 Find the icon

The icon's id is its file name without `.svg`: `assets/svg/icon-add.svg` is `icon-add`. Names describe the **object drawn, not the purpose**. The search icon is `icon-find`, close is `icon-cross`, notifications are `icon-bell`. A search for a purpose word will miss.

Before deciding an icon does not exist:

1. If you have the repo, list `assets/svg` once and scan the whole list.
2. Check the lookup below. It covers the generic needs that most often send people to another library.
3. Unsure what a name draws? Open the file (the shapes read plainly) or view it in the style guide icon table at `https://coho-design.s3.eu-west-2.amazonaws.com/front-end/latest/style-guide-sample.html#icon-table` (pictures and names, no descriptions).
4. Nothing fits? Say so when you hand over, and use the nearest COHO icon as a stand-in.

Do not read the compiled sprite or the TypeScript name constants to find a name. The folder listing is the same information at a fraction of the size.

| Need | Use | Notes |
|---|---|---|
| search | `icon-find` | magnifier |
| close, dismiss, clear | `icon-cross` | |
| done, selected | `icon-tick`; `icon-success` | bare check; check in a circle |
| add, create | `icon-add`; `icon-new` | plus; plus in a circle |
| remove | `icon-minus`; `icon-delete` | minus; bin |
| edit | `icon-edit` | pencil |
| more actions, overflow | `icon-more`; `icon-option` | vertical dots; horizontal dots |
| menu (hamburger) | `icon-description` | three lines, the nearest there is |
| settings | `icon-settings`; `icon-tune` | cog; sliders |
| refresh, loading | `icon-reload` | add `icon--rotate` to the svg while loading |
| info, warning, error | `icon-info`, `icon-info-reverse`; `icon-warning`; `icon-alert` | i in a circle; filled; ! in a circle; ! in a triangle |
| notification, mute | `icon-bell`; `icon-silence`, `icon-unsilence` | |
| show, hide | `icon-viewing`; `icon-hide` | eye; eye struck through |
| user, people | `icon-user`; `icon-users`; `icon-tenants` | one; two; two filled |
| home, property, building | `icon-house`; `icon-room`; `icon-block` | `icon-block` is a building, not a ban sign |
| email, phone | `icon-mail` or `icon-email`; `icon-phone` | outline or filled envelope; mobile |
| chat, unread | `icon-message`, `icon-conversation`; `icon-unread`; `icon-message-new` | bubble; bubble with a dot; bubble with a plus |
| send | `icon-send` | paper plane |
| download | `icon-download` | there is no upload icon |
| external link | `icon-new-window`; `icon-new-tab` | |
| link, copy, attach | `icon-link`; `icon-copy`; `icon-attach-file` | |
| lock | `icon-lock`; `icon-unlock` | |
| filter, sort | `icon-filter`; `icon-sort`, `icon-sort-up`, `icon-sort-none` | funnel; lines with an arrow |
| time, pending, in progress | `icon-clock`; `icon-hourglass`, `icon-pending`; `icon-processing` | clock; hourglass; cycling arrows |
| calendar | `icon-calendar` | |
| document, file, folder | `icon-document`; `icon-report`; `icon-file`; `icon-open` | blank page; page with lines; file box; open folder |
| image, video | `icon-picture`, `icon-images`; `icon-video`; `icon-slideshow` | |
| location | `icon-location`; `icon-pin` | map pin; push pin |
| favourite, rating | `icon-star`; `icon-love`; `icon-thumbs-up`, `icon-thumbs-down`; `icon-shortlist` | |
| money | `icon-rent`; `icon-finances`; `icon-credit-card`; `icon-bills`; `icon-deposit` | piggy bank; calculator; card; bills; cash |
| expand, collapse, fullscreen | `icon-maximise`; `icon-minimise`; `icon-expand` | |
| chevrons, arrows | `icon-arrow-up`, `-down`, `-left`, `-right`; `icon-up-arrow`, `icon-down-arrow`, `icon-left-arrow`, `icon-right-arrow` | chevrons; straight arrows |
| drag | `icon-drag-handle` | |
| help, guide | `icon-guide`; `icon-book` | open book; closed book. There is no question mark |
| stop, reject | `icon-stop`; `icon-reject` | raised hand; thumbs down |
| sign out | `icon-logout` | |
| tag, task | `icon-tag`, `icon-tags`; `icon-task` | label; clipboard with checks |
| light, dark mode | `icon-light`; `icon-dark` | sun; moon |
| shop, cart | `icon-shop`; `icon-cart` | bag; trolley |
| key | `icon-landlord`; `icon-keys` | single key; bunch (coloured) |
| browse, binoculars | `icon-looking` | |
| share, print, save, upload, globe, question mark | none | say so; nearest stand-ins are `icon-send`, `icon-report`, `icon-tick`, `icon-up-arrow`, `icon-location`, `icon-info` |

The rest of the set is domain imagery (rooms, amenities, compliance, interests, brands) whose names say what they draw.

### 16.2 Take the markup

Each `assets/svg/<id>.svg` is a complete, cleaned SVG with a `viewBox`. Build a small sprite holding only the icons the app uses, inline it once at the top of `<body>`, and reference symbols from it. The script below is also in the repo as `docs/design/atrium/tools/export-icons.mjs`:

```js
// node export-icons.mjs <path-to-HouseShare>/assets/svg icon-add icon-edit > icons.svg
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ...ids] = process.argv.slice(2);
const symbols = ids.map(id => {
  const svg = readFileSync(join(dir, `${id}.svg`), 'utf8');
  const viewBox = svg.match(/viewBox\s*=\s*"([^"]+)"/i)[1];
  const inner = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i)[1].trim();
  return `<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`;
});
process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" hidden>\n${symbols.join('\n')}\n</svg>\n`);
```

Paste the output as the first thing inside `<body>`. An icon is then two elements, mirroring how COHO's own app renders one: a wrapper that carries `icon` and any size modifier, and an inner `<svg>` whose classes are the icon's own name, which gives it its size, and any colour modifier. The colour goes on the inner `<svg>`, where COHO's own component puts it, so that it survives dark mode: on the wrapper the dark theme's grey would override it.

```html
<!-- Meaningful: say what it is -->
<span class="icon"><svg class="icon-info icon--cyan" role="img" aria-label="Information"><use href="#icon-info"></use></svg></span>

<!-- Decorative, next to text that already says what it is -->
<span class="icon icon--small"><svg class="icon-clock icon--grey" aria-hidden="true"><use href="#icon-clock"></use></svg></span>

<!-- Loading -->
<span class="icon"><svg class="icon-reload icon--teal icon--rotate" aria-hidden="true"><use href="#icon-reload"></use></svg></span>
```

The inner class and the `href` are always the same name. Leave either off and the icon has no size or no picture.

Commit the sprite to the app. Do not depend on the HouseShare repo at build time.

Never point `<use href>` at `https://coho.life/app/...svg#id` or the design S3 copy. Browsers refuse cross-origin `<use>`, and neither host sends CORS headers. Prefer the raw files over copying the compiled `svg-symbols.svg`: the compiled file holds one icon twice and shares some definitions in a way that pruning can break.

### 16.3 Colour and size

- About 235 icons are monochrome: no colour in the markup, so they take whatever `fill` CSS gives them, which is black unless you add a colour class to the inner svg. The colour classes are `icon--cyan`, `icon--teal`, `icon--green-xdark`, `icon--warning` and `icon--grey`. Inside a `button--icon` the button sets the colour and you add none. In dark mode the stylesheet turns a monochrome icon light grey by itself; the five colour classes keep their colours because they sit on the inner svg. One more, `icon--light-grey`, goes on the wrapper instead, where COHO puts it, so that in dark mode it yields to the stylesheet's default like a monochrome icon. It is for the drag handle (section 11) and nothing else.
- About 69 icons carry their own colours (brand marks, payment and compliance pictograms, the 80x80 illustrative set). Do not try to recolour them. They look the same in both themes.
- Seven draw with `stroke`, so a colour class does nothing: `coho-loader`, `coho-loader-old`, `loader`, `icon-waste-bin`, `icon-wifi-router`, `icon-xero-accounts`, `icon-xero-folder`. Avoid them.
- Size comes from the inner svg's own class: most icons render at 30px, the illustrative set at 80px. `icon--small` (22px) and `icon--tiny` (16px) go on the wrapper. `icon--inline` on the wrapper sits an icon in a line of text.
- If you inline many of the illustrative set, their internal ids (gradients, clip paths) can collide. Rename or scope them.

### 16.4 Colour means something

`icon--warning` (red) for destructive, error or overdue. `icon--cyan` for information. `icon--teal` for setup and progress. `icon--green-xdark` for success and payment. `icon--grey` for quiet, decorative use. `icon--light-grey`, on the wrapper, for the drag handle only. Do not pick an icon colour because it looks right.

### 16.5 Rules

- COHO icons only. Nothing from any other set, not even one glyph.
- No icon markup authored in the app: no hand-written or generated path data, no tracing from a screenshot.
- Keep the `icon-<name>` id and class so a reviewer can match the app against COHO's table.
- No CSS for icons. The stylesheet already sizes, colours and animates them.
- If nothing fits, say so when you hand over and use the nearest COHO icon. Adding an icon is work in the HouseShare repo, not in the app.

## 17. Sprite images

COHO's pictorial images (service hexagons, navigation icons, housemate interests, placeholder avatars, file-type and logo marks) are base64 PNGs in five JSON files. Unlike the SVG icons, these are published on a CDN that any app can fetch. They are opaque pictures and look the same in both themes.

### 17.1 What is there

Each file is the same shape. `r` is the image's **short code**, `d` is a base64 PNG, so every image is `data:image/png;base64,<d>`.

```json
{ "i": [ { "r": "rent", "d": "iVBORw0KGgo..." } ] }
```

| File | Holds | Images | Pixels | Example |
|---|---|---|---|---|
| `services.json` | Panel-header and property-service icons on a hexagon | 77 | 360x360 | rent collection is `rent` |
| `nav.json` | Side-navigation icons | 66 | 80x80 | organisation actions is `noac` |
| `interests.json` | Housemate interests | 15 | 360x360 | arts and crafts is `art` |
| `users.json` | Placeholder avatars | 10 | 360x360 | `3` |
| `default.json` | Placeholders, file types, logos, tenant types, genders | 41 | mixed | `placep`, `cohoblue` |

The COHO web app refers to these by a longer code (`rent-collection`, `nav-org-actions`, `arts-and-crafts`) and resolves it to the short code internally. The CDN files only know the short code. For a housemate interest, the long code is the kebab-case of the interest name (`Arts & Crafts` is `arts-and-crafts`).

### 17.2 Fetch at runtime

`https://public.coho.life/sprites/<file>.json` answers cross-origin GET requests from any origin. Send a plain GET with no custom headers, because a preflight is not answered. Four of the five files are served as `application/octet-stream`, so parse the body as text yourself rather than trusting the content type. `services.json` is 1.7MB: fetch each file once and cache it.

### 17.3 Decode at build time

When the app needs only a few images, decode them once and commit the PNGs:

```js
// node sprite-to-png.mjs services rent   -> rent.png
import { writeFileSync } from 'node:fs';
const [file, short] = process.argv.slice(2);
const { i } = JSON.parse(await (await fetch(`https://public.coho.life/sprites/${file}.json`)).text());
const hit = i.find(x => x.r === short);
if (!hit) throw new Error(`${short} is not in ${file}.json`);
writeFileSync(`${short}.png`, Buffer.from(hit.d, 'base64'));
```

Use the result as an ordinary image: `<img src="rent.png" alt="Rent collection" width="60" height="60">`.

### 17.4 Find a short code

- With the repo: `assets/images/json/json-references.txt` lists a human name for every short code, one section per file. To go from a long code to a short code, search `HouseShare.Web/src/app/services/lookup.service.ts` for the long code in quotes and read the `return` on the next line. Do not read that file whole.
- Without the repo: ask for the short code, or fetch the file and look at the `r` values. The names are abbreviations of what they show.

### 17.5 Codes that do not resolve

Four codes in COHO's own lookup point at images stored under a different name, so they render nothing: `document` (stored as `doc`), `how-to-rent-guide` (stored as `htrg`), `client-accounting` and `nav-property-custom-certificate`. Use the stored short code directly. `placeholder-audio` has no image at all.

## 18. Worked examples

Find the closest example and use it as the structural starting point. Replace the words and numbers. Keep the class names.

### Example A: dashboard with a summary strip and a list

Use for a summary of an app's state: key numbers, one list, one notice.

```html
<main class="u-padding-left--20 u-padding-right--20">
  <h1 class="heading--1 u-margin-top--20 u-margin-bottom--10">Cleaning rota</h1>
  <p class="lede u-margin-bottom--20">What needs your attention this week.</p>

  <section class="page__section page__section--narrow">
    <div class="heading--section">
      <h2 class="heading--2">This week</h2>
    </div>
    <div class="grid grid--12 grid-gap-md">
      <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
        <a class="card card__filters card__filters--action" href="#unassigned">
          <div class="card__count">4</div>
          <div class="card__title">Unassigned</div>
        </a>
      </div>
      <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
        <a class="card card__filters card__filters--progress" href="#pending">
          <div class="card__count">9</div>
          <div class="card__title">Pending</div>
        </a>
      </div>
      <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
        <a class="card card__filters card__filters--active" href="#done">
          <div class="card__count">31</div>
          <div class="card__title">Done</div>
        </a>
      </div>
      <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
        <a class="card card__filters card__filters--inactive" href="#cancelled">
          <div class="card__count">0</div>
          <div class="card__title">Cancelled</div>
        </a>
      </div>
    </div>
  </section>

  <section class="page__section page__section--narrow">
    <div class="form__message form__message--notification">
      <div class="form__message-text u-padding--10">4 shifts have no cleaner yet. Open Unassigned to fix them.</div>
    </div>
  </section>

  <section class="page__section page__section--narrow">
    <div class="heading--section heading--has-button">
      <h2 class="heading--2">Next shifts</h2>
      <div class="button__group">
        <div class="button__group-item">
          <button class="button button--small button--secondary">Add shift</button>
        </div>
      </div>
    </div>
    <table class="compact__table compact__table--narrow">
      <thead>
        <tr>
          <th class="width-120">Date</th>
          <th class="width-f-200 one-line">Property</th>
          <th class="width-120 one-line">Cleaner</th>
          <th class="width-f-100 u-text-align--right">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="width-120">Mon 13 Oct</td>
          <td class="width-f-200 one-line">12 Mill Lane</td>
          <td class="width-120 one-line">Priya</td>
          <td class="width-f-100 u-text-align--right"><span class="status--completed">Confirmed</span></td>
        </tr>
        <tr>
          <td class="width-120">Tue 14 Oct</td>
          <td class="width-f-200 one-line">4 Park View</td>
          <td class="width-120 one-line">Not assigned</td>
          <td class="width-f-100 u-text-align--right"><span class="status--stale">Open</span></td>
        </tr>
      </tbody>
    </table>
  </section>
</main>
```

What it shows: one `h1` and a lede at the top; every panel a `page__section page__section--narrow` with a `heading--section`; stat tiles on the page grid with one variant each; a notice between panels; one small secondary action in a title bar; both table classes and matching widths on `th` and `td`; pills on spans.

### Example B: form panel with a save action

Use for creating or editing one record, or an editable settings panel.

```html
<main class="u-padding-left--20 u-padding-right--20">
  <h1 class="heading--1 u-margin-top--20 u-margin-bottom--20">Rent settings</h1>

  <section class="page__section page__section--narrow">
    <div class="heading--section">
      <h2 class="heading--2">Payment</h2>
    </div>

    <form class="form" novalidate>
      <div class="form__grid form__grid-2--medium">
        <div class="form__grid-element">
          <label class="form__label" for="amount">Rent amount (£)</label>
          <input id="amount" type="number" min="0" step="0.01">
        </div>
        <div class="form__grid-element">
          <label class="form__label" for="due">Payment due day</label>
          <select id="due" class="form__select">
            <option value="">Choose a day</option>
            <option>1st</option>
            <option>15th</option>
            <option>28th</option>
          </select>
        </div>
      </div>

      <label class="form__label u-margin-top--20">Includes bills</label>
      <div class="form__radio-buttons">
        <label class="form__radio-button">
          <input type="radio" name="bills" value="yes">
          <div class="form__radio-button-label">Bills included</div>
        </label>
        <label class="form__radio-button">
          <input type="radio" name="bills" value="no" checked>
          <div class="form__radio-button-label">Bills separate</div>
        </label>
      </div>

      <div class="form__message form__message--error u-margin-top--20" role="alert">
        <div class="form__message-text u-padding--10">
          <ul>
            <li>Rent amount: enter an amount.</li>
          </ul>
        </div>
      </div>

      <hr class="u-margin-top--20">
      <div class="button__group">
        <div class="button__group-item">
          <button type="submit" class="button button--small">Save changes</button>
        </div>
        <div class="button__group-item">
          <button type="button" class="button button--cancel button--small">Cancel</button>
        </div>
      </div>
    </form>
  </section>
</main>
```

What it shows: a form grid only for the two fields that belong together; label and control as siblings; radios for a two-way choice with a label on each option; errors at the end of the body, shown only when there are errors; the footer below the grid, `hr` then buttons, primary first and cancel last, one size.

### Example C: list with filters and an empty state

Use for browsing many records of one kind.

```html
<main class="u-padding-left--20 u-padding-right--20">
  <h1 class="heading--1 u-margin-top--20 u-margin-bottom--20">Jobs</h1>

  <section class="page__section page__section--narrow">
    <div class="heading--section heading--has-button">
      <h2 class="heading--2">All jobs</h2>
      <div class="button__group">
        <div class="button__group-item">
          <button class="button button--small button--secondary">New job</button>
        </div>
      </div>
    </div>

    <div class="grid grid--12 grid-gap-md u-margin-bottom--20">
      <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
        <a class="card card__filters card__filters--action" href="#open">
          <div class="card__count">3</div>
          <div class="card__title">Open</div>
        </a>
      </div>
      <div class="grid-span-6 grid-span-sm-4 grid-span-md-3">
        <a class="card card__filters card__filters--inactive" href="#closed">
          <div class="card__count">0</div>
          <div class="card__title">Closed</div>
        </a>
      </div>
    </div>

    <!-- When the filtered list is empty, show this instead of the table -->
    <div class="form__message form__message--notification">
      <div class="form__message-text u-padding--10">No closed jobs yet. Jobs appear here once they are marked done.</div>
    </div>
  </section>
</main>
```

What it shows: stat tiles doubling as filters; a zero tile marked `--inactive`; an empty state that says what to do next instead of a blank panel.

### Example D: checklist with reorderable steps

Use for a list the user puts in order: the steps of a checklist, the stops on a round, the priority of jobs.

```html
<main class="u-padding-left--20 u-padding-right--20">
  <h1 class="heading--1 u-margin-top--20 u-margin-bottom--20">Move-out checklist</h1>

  <section class="page__section page__section--narrow">
    <div class="heading--section heading--has-button">
      <h2 class="heading--2">Steps</h2>
      <div class="button__group">
        <div class="button__group-item">
          <button class="button button--small button--secondary">Add step</button>
        </div>
      </div>
    </div>
    <div class="card__detail--step-wrapper">
      <div class="card__detail--step-list">
        <div class="card__detail--step-holder" data-id="inspect">
          <div class="card__detail--step-drag">
            <span class="icon icon--light-grey"><svg class="icon-drag-handle" aria-hidden="true"><use href="#icon-drag-handle"></use></svg></span>
          </div>
          <div class="card__detail--step-checkbox">
            <span class="card__detail--step-index">1</span>
            <label class="form__checkbox form__input--small">
              <input type="checkbox" aria-label="Inspect the property done">
              <div class="form__checkbox-label"></div>
            </label>
          </div>
          <div class="card__detail--step-description">
            <p>Inspect the property</p>
            <div class="card__detail--step-meta">
              <p class="u-text-color--grey u-text--small">Due Mon 27 Oct</p>
            </div>
          </div>
          <div class="card__detail--step-actions">
            <div class="button__group u-margin-bottom--none">
              <div class="button__group-item">
                <button type="button" class="button button--ghost button--tiny button--icon button--icon-only" aria-label="Edit Inspect the property">
                  <span class="icon"><svg class="icon-edit" aria-hidden="true"><use href="#icon-edit"></use></svg></span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="card__detail--step-holder" data-id="report">
          <div class="card__detail--step-drag">
            <span class="icon icon--light-grey"><svg class="icon-drag-handle" aria-hidden="true"><use href="#icon-drag-handle"></use></svg></span>
          </div>
          <div class="card__detail--step-checkbox">
            <span class="card__detail--step-index">2</span>
            <label class="form__checkbox form__input--small">
              <input type="checkbox" aria-label="Send the inspection report done">
              <div class="form__checkbox-label"></div>
            </label>
          </div>
          <div class="card__detail--step-description">
            <p>Send the inspection report</p>
            <div class="card__detail--step-meta">
              <p class="u-text-color--grey u-text--small">Due Wed 29 Oct</p>
            </div>
          </div>
          <div class="card__detail--step-actions">
            <div class="button__group u-margin-bottom--none">
              <div class="button__group-item">
                <button type="button" class="button button--ghost button--tiny button--icon button--icon-only" aria-label="Edit Send the inspection report">
                  <span class="icon"><svg class="icon-edit" aria-hidden="true"><use href="#icon-edit"></use></svg></span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="card__detail--step-holder" data-id="invoice">
          <div class="card__detail--step-drag">
            <span class="icon icon--light-grey"><svg class="icon-drag-handle" aria-hidden="true"><use href="#icon-drag-handle"></use></svg></span>
          </div>
          <div class="card__detail--step-checkbox">
            <span class="card__detail--step-index">3</span>
            <label class="form__checkbox form__input--small">
              <input type="checkbox" aria-label="Raise the invoice done">
              <div class="form__checkbox-label"></div>
            </label>
          </div>
          <div class="card__detail--step-description">
            <p>Raise the invoice</p>
            <div class="card__detail--step-meta">
              <p class="u-text-color--grey u-text--small">Due Fri 31 Oct</p>
            </div>
          </div>
          <div class="card__detail--step-actions">
            <div class="button__group u-margin-bottom--none">
              <div class="button__group-item">
                <button type="button" class="button button--ghost button--tiny button--icon button--icon-only" aria-label="Edit Raise the invoice">
                  <span class="icon"><svg class="icon-edit" aria-hidden="true"><use href="#icon-edit"></use></svg></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="order-error" class="form__message form__message--error u-margin-top--10" role="alert" hidden>
      <div class="form__message-text u-padding--10">The order could not be saved. Try again.</div>
    </div>
  </section>
</main>
<script src="reorder.js"></script>
<script>
  var list = document.querySelector('.card__detail--step-list');
  var notice = document.getElementById('order-error');
  list.addEventListener('coho:reorder', function (event) {
    notice.hidden = true;
    event.detail.save(fetch('/steps/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: event.detail.ids })
    }).then(function (response) {
      if (!response.ok) throw new Error('Save failed');
    }).catch(function (error) {
      notice.hidden = false;
      throw error;
    }));
  });
</script>
```

What it shows: the list in a panel with its add action in the title bar; three rows, each with a handle, a number over a checkbox, a name with a due line, and an icon-only edit button; the error notice after the list, hidden until a save fails; the reorder script linked unchanged, and the save call as the page's only drag-related code.

## 19. Anti-patterns: refuse and flag

Stop and say so if you find yourself doing any of these.

- **Component invention.** A new button style when primary, secondary, ghost and cancel cover it. A new card. A custom colour class. An icon from outside COHO's set, or drawn by hand.
- **Cross-contamination.** Material, Bootstrap, Tailwind, PrimeNG, Font Awesome, Heroicons, or their class names and conventions.
- **Typography errors.** Weight 400 body text. A heading without weight 800. A font size of your own. Text under 12px.
- **Button errors.** Reversed order. Mixed sizes in a group. Long labels. A submit button disabled because the form is invalid.
- **Layout errors.** Inline margin or padding. A table used for layout. The page grid inside a form. Custom column width classes.
- **Legibility.** White text on a light background. Interactive elements with no visible focus state. A control with no label.
- **Theme errors.** Reading `prefers-color-scheme`. A light or dark control of your own. `coho__dark` or `data-theme="dark"` written into markup. A page without the theme script.
- **Reorder errors.** A sortable library. `draggable="true"` on a row. Picking a row up anywhere but its handle. Up and down buttons for ordering. Drag CSS or drag code of your own. A `cdk-` class written into markup. The reorder script pasted with changes.

## 20. Store listing: icon, screenshot and copy

The Store shows the app before anyone opens it: a tile with its icon, a card with its first screenshot and intro, and a detail page with the rest. Produce all of it before you hand over, in a `store/` folder at the root of the app, so the person registering the app has one place to copy from. The Build an app / edit listing forms (and the Public API / MCP listing update) accept the icon, screenshots and copy — write the files and say where they are, or upload them yourself when you have a Store session.

| File | What it is |
|---|---|
| `store/icon.png` | The app icon (20.1) |
| `store/icon-brief.md` | The prompt or the make command that produced the icon, so a person can make it again |
| `store/screenshot.png` | The Store card picture (20.2) |
| `store/listing.md` | Every listing field, one heading per field (20.3) |

### 20.1 Icon

A square PNG, 1024 x 1024, that fills the whole canvas: one flat background colour and one simple symbol centred on it, filling about half the width. COHO rounds the corners itself and shows the icon at 44 to 56 px, so: no text or letters, no gradients, no shadow, no bevel, no border, no padding, no rounded corners, no transparency, no fine detail. With no icon the Store shows the app's initials on a coloured tile. That is fine for a draft, not for a listing.

Pick one pair from the table. The pastel set is the Store's own tile palette, so an icon made from it sits next to icon-less apps as one family. The saturated set is COHO's primary palette (section 4). Magenta is not in the table: it means the main action.

| Background | Hex | Symbol |
|---|---|---|
| Tile green | `#C9E4C5` | `#262626` |
| Tile pink | `#F6CCDD` | `#262626` |
| Tile purple | `#DCCFF2` | `#262626` |
| Tile blue | `#CEE2FF` | `#262626` |
| Tile mint | `#D1F0EF` | `#262626` |
| Tile peach | `#F3D6C0` | `#262626` |
| Blue | `#293B5B` | `#FFFFFF` |
| Primary | `#0951AA` | `#FFFFFF` |
| Cyan | `#1C9BD8` | `#FFFFFF` |
| Teal | `#1BB3AF` | `#FFFFFF` |
| Pumpkin | `#F09D5D` | `#FFFFFF` |

Two ways to make it. Try the first when your tool can generate images. Otherwise go straight to the second.

1. **Image model.** Prompt with the colours filled in:

   > Flat app icon for "{app name}", a {category} app for UK property managers that {what it does, one line}. One simple {symbol idea} symbol, centred, filling about half the canvas. Background solid {background hex}, edge to edge. Symbol solid {symbol hex}. Square, 1024 x 1024. Two flat colours only. No text or letters, no gradients, no shadow, no bevel, no border, no rounded corners, no device frame, no padding, no transparency.

   Save the result as `store/icon.png` and run the check below. If it fails, put the check's message into the prompt (for example "the background must reach every edge; the last image had a rounded square on white") and try again. Stop after three attempts and use the second way. A cut-out symbol on a transparent (or plain removable) background can be placed on a flat square with the make tool's `--mark`; a full opaque square with the wrong background is not rescued — compose with `--glyph` instead, or regenerate the mark as a cut-out.

2. **Compose it.** `npm run make:icon -- --background '#CEE2FF' --glyph icon-house` renders a flat square with a COHO icon from `design/icons.svg` (any id from section 16.1) through Playwright, and picks dark or white for the symbol from the background unless `--colour` says otherwise. Quote the hex (or pass bare `CEE2FF` without `#`): an unquoted `#` is a shell comment and the command fails. `--mark picture.png` places a cut-out picture instead of a glyph. With the repo, the tool is `node docs/design/atrium/tools/make-icon.js`. It needs `playwright` (`npm i playwright`, then `npx playwright install chromium`).

Whichever way, run `npm run check:icon` (with the repo, `node docs/design/atrium/tools/check-icon.js store/icon.png`). It reads PNG only and refuses an image that is not square, under 512 px, over 2 MB, has transparent corners, or has corners a different colour from the inside. Fix anything it reports.

Write `store/icon-brief.md`: the prompt and how many attempts it took, or the make command. A person who runs it again should get the same icon.

### 20.2 Screenshot

The first screenshot is the picture on the app's Store card and the banner on its detail page, with the app name over a fade across the bottom third. Capture 1440 x 900 at 2x with `npm run screenshot -- '<signed-launch-url>' store/screenshot.png` (with the repo, `node docs/design/atrium/tools/capture-screenshot.js`). COHO opens `/ui` only with a signed launch URL (`connectionReference` + `atriumSignature` — developer spec §6); unsigned `http://localhost:5100/ui` returns 401 and must not be used. After a local connection exists, mint a signed GET the same way the hello-node tests do (`registerQuickView` in `src/server.test.js`), then pass that full URL. Capture the screen that best shows what the app does, with the key content in the top two thirds: not a sign-in, an error or an empty state. The tool exits non-zero (and does not save) when the page looks like one of those. An agent with no signed screen has no screenshot, and the Store gives it a coloured card instead.

### 20.3 Copy

Write `store/listing.md` with one heading per field below, in this order, and the text under it. Write for a property manager deciding whether to connect, not for a developer. Long intro, full description, what's new, what it can do, prerequisites and background tasks are trimmed to their limits without warning, so stay inside them. Full name and short name are length-checked on save — keep them inside the limits too. Only the full name is required, and a listing with only a name is a draft, not a listing: fill them all.

| Field | Limit | Where it shows | Write it so that |
|---|---|---|---|
| Full name | 100 | The title everywhere. Its initials and a colour from its hash make the fallback tile | It names the app in two or three words. Leave out "COHO" and "app" |
| Short name | 40 | Never shown to managers. It names the API key and the hosted build | It is the full name shortened to letters, digits and spaces |
| Intro description | 500 | The card, clamped to about two lines, and the lead line on the detail page | The first sentence is the benefit. Two sentences at most |
| Full description | 4000 | "About this app" on the detail page. Folds behind Read more past 280 characters | It says what the app does, for whom, and what happens day to day. Plain paragraphs, no markup |
| Category | one of six | The card and detail subline, and the browse filter | It is exactly one of Lettings, Money, Property, People, Compliance, Insight. Anything else is rejected |
| What's new | 2000 | "What's changed" on the detail page, dated the day it is set | It says what changed in this version, in one paragraph. On first listing, what the app does on day one |
| What it can do | 2000 | "What it can do", directly under the list of data the app can see | It describes actions and outcomes, not the scopes, which COHO already lists above it |
| Pre-requisites | 2000 | A sidebar card | It lists what the organisation needs before connecting: data in COHO, an account elsewhere, a setting switched on. "None" if none |
| Background tasks | 2000 | A sidebar card, under a fixed warning that the app runs in the background | It matches the manifest's schedules and events: what runs, how often, and what it touches. "None" when the manifest declares none |

Price is not a field you write: every app is free today. Do not mention cost in the copy.

## 21. Before you finish

Fix anything you cannot tick.

1. Does the screen start from a worked example? Say which.
2. Is every panel a `page__section page__section--narrow` with a `heading--section` title?
3. Is there exactly one primary button in the view?
4. In every button group: right order, one size, each button in a `button__group-item`?
5. Does every class in the markup appear in this file? With the repo, `node docs/design/atrium/tools/check.js my-app.html` checks this and most of the rest of this list. In a seed copied from the hello-node starter, `npm run check:design` runs the same checker. Both read the page as written, before any script runs: check the source, or the server's response, never a rendered page, which carries what `reorder.js` adds.
6. No inline styles, no CSS beyond the pasted stylesheet, no hex codes, no new classes?
7. Does every colour, pill and tile variant say what it means?
8. Does every form control have a label, and are errors at the end of the form?
9. Are all icons COHO icons taken from `assets/svg`, with their `icon-` ids intact, and all images COHO sprites?
10. Is it usable at 360px wide with no sideways scrolling?
11. Did anything you needed not exist here? Check `design-gaps.md` first, then list the rest under "Gaps" in your reply, in the form section 22 gives.
12. Is there a `store/` folder with the icon, its brief, the screenshot and the listing copy, written as section 20 describes, and does `npm run check:icon` pass on the icon (with the repo, `node docs/design/atrium/tools/check-icon.js store/icon.png`)?
13. Does every screen read correctly in both themes? Open it with `?theme=dark` on the URL and again with `?theme=light`, and compare each against COHO's own screens in that theme. The checker cannot see colour; this one is on you.
14. If a list can be reordered: is `reorder.js` on the page unchanged, does every row carry `data-id`, does the page pass its request to `save` so that a failed save puts the rows back and shows the red notice, and does it work by mouse, by touch and from the keyboard? The checker sees the script and the markup; the rest is on you.

## 22. When nothing fits

1. Look again at section 3. Most needs are covered by a part you did not think of.
2. Use the nearest part as it is. Do not stretch it with custom CSS.
3. Check `design-gaps.md`, the log of every gap builders have hit and what was done about each. Yours may already be answered there.
4. Say so when you hand over: "Gap: I needed X. I used Y instead because Z." The maintainer adds it to the log. This is how the guide improves.
5. Never invent a class, a component or an icon to fill the gap.

## Appendix: what is deliberately not here

- Anything specific to COHO's Angular app: its `<svg-icon>`, `<loader-button>`, `<textbox>`, `<dropdown>` and `<checkbox>` components, its pipes, its reactive-forms rules. Those do nothing outside the app. The raw classes they render are what this guide documents.
- The legacy `row` and `col` grid and the element-named table column classes. Old work only.
- Super Admin styles and the "internal" brown palette. COHO's own screens only.
- Parts whose markup depends on Angular components not yet checked: tabs, accordions, modals, drop-down menus, date pickers, skeleton loaders, pagination. The overflow menu on COHO's checklist row stays out with the drop-down menus; the actions column of a reorderable list takes icon-only buttons until they are documented (section 11).
- Classes that exist in COHO but are not documented here yet, so the trimmed stylesheet leaves them out: the pound input group, rich radio tiles, text background badges, the full set of icon colours beyond the five semantic ones. They are added by documenting them here and regenerating the stylesheet.
