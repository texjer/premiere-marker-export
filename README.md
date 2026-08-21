# Premiere Marker Export

A small Adobe Premiere Pro panel that exports marker spans or individual
timeline clips as separate files in Adobe Media Encoder.

![Marker Export panel turning timeline markers into video clips](docs/panel.png)

## What it does

Choose either export mode:

- **Marker spans** exports the timeline from each sequence marker to the
  **next** marker (or uses the marker's own duration, if it has one). The last
  marker just closes off the final segment — so **4 markers → 3 clips:**
- **Timeline clips** queues one export for every video clip on every video
  track, using that clip's timeline start and end. The exported file is the
  normal rendered sequence for that range, so overlays and the sequence audio
  mix are included; overlapping clips are queued as separate files.

![Four timeline markers producing three exported clips](docs/markers-to-clips.png)

Files are named `NNN_<marker-or-clip name>.<ext>`, where the extension comes
from the Adobe Media Encoder preset you choose.

---

## Install (the easy way)

This panel is **unsigned**, so installing it normally means fiddling with
debug-mode flags and hidden extension folders that differ per OS. Instead, let
[Claude Code](https://claude.com/claude-code) or
[Codex](https://openai.com/codex) do it.

Open Codex / Claude Code and paste this in as your message:

```
Can we install this Premiere panel for my OS: https://github.com/texjer/premiere-marker-export
```

The agent will clone the repo, detect macOS vs Windows, enable unsigned CEP
extensions, and install the panel into the right folder. Then fully quit and
reopen Premiere Pro and find it under **Window → Extensions → Marker Export**.

## Install (manual)

If you'd rather do it yourself:

1. Clone this repo:
   ```bash
   git clone https://github.com/texjer/premiere-marker-export.git
   cd premiere-marker-export
   ```
2. Run the installer for your platform from the repo root:

   **macOS / Linux**
   ```bash
   ./install.sh
   ```

   **Windows (PowerShell)**
   ```powershell
   ./install.ps1
   ```

Then **fully quit and reopen Premiere Pro** → **Window → Extensions → Marker Export**.

> The installers enable `PlayerDebugMode` (so Premiere will load this unsigned
> panel) and place the panel in your CEP extensions folder:
> - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
> - Windows: `%APPDATA%\Adobe\CEP\extensions\`

---

## Usage

1. Open a sequence. Choose **Marker spans** and add markers where you want
   clips to start/end, or choose **Timeline clips** to export every video clip
   already in the sequence.
2. **Make a preset.**

   ![Saving an export preset from Premiere's Export page](docs/save-preset.png)

   Since this plugin skips the normal "Export" process, you'll need to first
   start to export your video normally and then **Save Preset** (the **···**
   menu next to *Preset*). Then go back to our panel and select it by clicking
   **Set Preset…** and picking the file you just saved (see picture above).
3. Open the panel: **Window → Extensions → Marker Export**.
4. **Set Folder…** — choose where exports go.
5. **Set Preset…** — pick the `.epr` preset you saved. The dialog opens in your
   AME *Presets* folder, where saved presets live.
6. **Export Video Clips** — clips are queued and run in Adobe Media Encoder.

Your folder and preset are remembered between sessions.

---

## Uninstall

Delete the panel from your CEP extensions folder:

- macOS: `rm ~/Library/Application\ Support/Adobe/CEP/extensions/com.texs.markerexport`
- Windows: delete `%APPDATA%\Adobe\CEP\extensions\com.texs.markerexport`

(Or just tell Claude Code: *"Uninstall the Marker Export panel."*)

---

## Compatibility

- **Premiere Pro 2019–2026+** (CEP 9–13), on **macOS and Windows**.
- Requires **Adobe Media Encoder** installed (the panel queues exports to it).
- **HEVC/H.265:** Premiere Pro 25.5 and newer block scripted HEVC generation.
  The panel detects HEVC presets and explains the limitation instead of
  reporting jobs that AME will silently discard. Use H.264 or ProRes for
  automated exports, or export HEVC manually.

## Notes

- This is a **CEP** panel. CEP is deprecated in favor of UXP but still works in
  current Premiere; a UXP port may come later.
- The standalone `export-markers-as-clips.jsx` is the same logic without the
  panel — run it via Adobe's VS Code ExtendScript Debugger if you prefer.

## License

[MIT](LICENSE)
