# Agent rules for this app's UI

- Before writing or changing any UI, read `design/design.md` (the COHO design guide for Atrium apps) and use only the parts and classes it documents.
- Pages link `/design/coho.css` unchanged, or paste it into a `<style>` block unchanged. Write no CSS of your own: no inline styles, no other UI or icon library.
- Icons come from `design/icons.svg` only. Copy the `<symbol>`s you use into the page's hidden sprite, as `src/ui.html` does.
- Before finishing, run `npm run check:design` and work through the checklist in section 19 of the guide. Check `design/design-gaps.md` for gaps already answered, then list any that remain.
