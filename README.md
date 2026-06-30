# ⊹ Extension Manager ⊹

A lightweight enhancer for SillyTavern's native **Manage Extensions** popup.

It does not replace the native dialog — it post-processes it when it opens:

- **Your installed extensions on top.** Built-in (SillyTavern) extensions are
  grouped into a dropdown at the bottom, collapsed by default.
- **Clean info line.** Each extension shows `Name (version - branch) — author`,
  sourced from its manifest so it appears instantly.
- **Sorted by name.** Installed extensions are always listed alphabetically;
  built-ins stay at the bottom.
- **Faster.** Version data is cached and the panel is usable immediately; a
  small progress ring replaces the blocking "loading…" banner.
- **Search.** Filter installed extensions by name as you type.
- **Bulk editing.** A *Select* mode adds per-row checkboxes plus a bar to
  bulk **enable / disable / delete** (with select all / none).
- **Icon toolbar.** Update all, update enabled and refresh as compact icons.
- **Copy install URL** per extension.
- **Nice toggles.** On/off switches that look consistent across every theme.
- **Mobile-friendly.** The popup goes full-screen on phones with a responsive,
  touch-sized layout.

Everything is configurable from the extension's settings panel and degrades
gracefully if SillyTavern's markup changes.

## Install

Use **Extensions → Install Extension** with this repository URL:

```
https://github.com/aceeenvw/extension-manager
```

or drop the folder into `data/<user>/extensions/`.

## Settings

Open the **⊹ EXTENSION MANAGER ⊹** panel in the Extensions tab to toggle:
enhancements on/off, collapse built-ins, bulk editing, update check on open,
and each optional button.

## Author

aceenvw

## License

AGPL-3.0-or-later
