# Design gaps log

Every gap a builder has hit while following `design.md`, and what was done about it. Builders: check here before raising a gap (guide section 20). Maintainers: add a row for every gap a build reports, then close it by documenting a part, adding a rule, or declining with a reason.

A gap is closed by a guide version, never by a workaround in one app.

| # | Need | What the builder used | Raised by | Status |
|---|---|---|---|---|
| 1 | A neutral stat tile for a clickable total ("All keys") | `card__filters--inactive`, which the guide reserves for zero | Key management clean-room build, 13 Oct 2026 | Closed 0.3: a clickable total takes `--active`; `--inactive` is zero only (section 12) |
| 2 | A search box | A labelled text input inside a full form, with a rule and Search and Clear buttons | Key management build | Closed 0.3: filter bar documented (section 11) |
| 3 | A searchable select for hundreds of keys or people | Native `<select class="form__select">` | Key management build | Open. COHO's searchable dropdown is an Angular component. The native select stays the answer until one is documented |
| 4 | A red button for a destructive action and its confirmation | `button--ghost` for the action, `button--secondary` to confirm | Key management build | Closed 0.3: COHO has no red button. Destructive actions and their confirmation are ghost buttons after a notice (section 9) |
| 5 | An orange warning notice for an overdue record | `info-badge--red` plus orange text on the date | Key management build | Declined: notices are blue, green or red by design. Overdue is a red badge on the record (section 14); orange text marks the date |
| 6 | A label and value list for one record's facts | Rows built from `u-space-between`, `u-gap--20` and `u-border-bottom` | Key management build | Closed 0.3: label and value rows documented, with paragraphs for long text (section 7) |
| 7 | A date and time picker | Native `<input type="date">` and `<input type="time">` | Key management build | Open. COHO's picker is an Angular component. Native inputs stay the answer |
| 8 | Pagination, or "show more", for a long list | Nothing: ten rows with no sign there were more | Key management build | Open. Until pagination is documented, say how many are shown and offer the filter bar to narrow the list |
| 9 | Showing conditional fields on a static page | Both variants rendered, with comments saying when each appears | Key management build | Declined: a static page shows one state. Render the state the brief asks for and describe the others in the hand-over |
| 10 | The `one-line` rule said cells only, while every example put it on headers too | Followed the rule | Key management build | Closed 0.3: the rule now matches the examples and COHO's own tables (section 10) |
| 11 | Section 3 ordered cancel before the destructive action; rule 5 says cancel is always last | Followed rule 5 | Key management build | Closed 0.3: section 3 row fixed |
| 12 | An `h4` inside `form__section` skips a level when the form has no `h3` title | Avoided grouping the form | Key management build | Closed 0.3: the grouping heading is one level below the form's title (section 11) |
| 13 | "Optional" on a label | Wrote "(optional)" into the label text | Review of the build | Closed 0.3: `form__label-subtext` documented (section 11) |
| 14 | COHO's own empty-state pattern (`zero__state`) for an empty list | A notice, as section 3 directs | Review of the build | Open. Candidate for 0.4 |
