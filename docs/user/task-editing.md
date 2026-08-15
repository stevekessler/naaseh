# Editing tasks

Open **Edit** from a task row, subtask, post-it, or task in the Personal Stack. The task opens in a modal so the surrounding view, filters, and rank remain in place. **Save changes** writes the editable fields together; **Cancel**, Escape, and the backdrop ask for confirmation when values changed and then return focus to the control that opened the modal.

The memo toolbar supports bold, italic, strikethrough, ordered lists, and unordered lists. Pasted content is reduced to those formats. Links, images, headings, tables, colors, scripts, and arbitrary HTML are not retained. Hidden memos encrypt both this structured document and its plain-text projection; locked text is absent from ordinary search and is searchable only in session memory while explicitly unlocked.

Choose **No due date**, **Date only**, or **Date and time**. An undated task displays no placeholder. Date-only work remains on the selected calendar date. Timed work is stored as an instant and displayed in the browser's current time zone. Times use five-minute choices; an older task with an off-grid minute keeps that exact value unless changed. Times that do not exist during a daylight-saving transition are rejected.

Task edits remain available offline. They are queued as one encrypted change. If another device changes the same task first, resolve the visible synchronization conflict rather than expecting field-by-field merging; rich memo documents are never silently merged.
