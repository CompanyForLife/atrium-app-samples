# Agent rules for this app's UI

- Before writing or changing any UI, read `design/design.md` (the COHO design guide for Atrium apps) and use only the parts and classes it documents. These rules cite its sections by number and name; where the numbers have moved in a newer copy of the guide, follow the name.
- Pages link `/design/coho.css` unchanged, or paste it into a `<style>` block unchanged. Write no CSS of your own: no inline styles, no other UI or icon library.
- Icons come from `design/icons.svg` only. Copy the `<symbol>`s you use into the page's hidden sprite, as `src/ui.html` does.
- The theme is COHO's. `src/ui.html` and `src/configure.html` apply it with the theme script from section 1 of the guide (What you are building), which sets `coho__dark` on `<body>` from the signed `theme` query and the `atrium.quickView.theme` message. Never add a theme control or read the OS preference.
- A list the user puts in order is the reorderable list from section 11 of the guide (Reorderable list), reordered only by `design/reorder.js`, linked unchanged as `src/ui.html` does. Never add a sortable library or drag code of your own; the page writes only the save call.
- Before finishing, run `npm run check:design` and work through the checklist in section 20 of the guide (Before you finish). Check `design/design-gaps.md` for gaps already answered, then list any that remain.
