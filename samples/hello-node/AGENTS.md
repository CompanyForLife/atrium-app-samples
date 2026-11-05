# Atrium partner starter

- Register a Store Draft using manifest.example.json and build against it before Hosting, GitHub Connect or a zip.
- Before UI work, read https://docs.coho.life/atrium-design/llms-full.txt. Use the public at-* classes and --at-* tokens, system fonts and the supplied assets/atrium.css. No external web fonts.
- Pages use body class="at-app". Themes use data-color-mode, from the signed launch query and origin-checked atrium.quickView.theme messages. Keep signature verification and origin checks intact.
- COHO owns the quick-view frame and close control. Do not add another close button.
- Keep all buttons inside button__group-item within button__group; public at-inline supplies the group spacing.
- Edit your listing in Build an app / Edit listing. Supply an icon and a screenshot using the developer spec's Store-card guidance. The optional store/ folder stages copy before upload.
- Run npm test before finishing. Check keyboard access, reorder save errors, both themes and standalone configuration.
