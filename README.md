# Pearl Studio

A small, static, client-side tool for creating Instagram-ready graphics from
templates — export as **PNG** or **MP4** — with no backend and no account.

## Project structure

```
Pearl Studio/
├── index.html                  # Landing page — browse templates
├── editor.html                 # Template editor app
├── reels.html                  # Song Reels app (lyric videos)
├── .nojekyll                   # Tells GitHub Pages to serve as-is
├── assets/
│   ├── css/
│   │   ├── base.css            # Shared design tokens, reset, buttons
│   │   ├── home.css            # Landing page layout
│   │   ├── editor.css          # Editor app layout (shared by reels.html)
│   │   └── reels.css           # Song Reels page-specific layout
│   ├── js/
│   │   ├── templates-data.js   # Template catalogue (data only)
│   │   ├── renderer.js         # Canvas drawing engine (data -> pixels)
│   │   ├── editor.js           # Editor UI wiring
│   │   ├── home.js             # Landing page template gallery
│   │   ├── export-png.js       # PNG export + shared download helper
│   │   ├── export-video.js     # MP4 export (record + optional transcode)
│   │   ├── reels-data.js       # Song reel template catalogue (data only)
│   │   ├── reels-renderer.js   # Lyric-reel canvas drawing engine
│   │   ├── reels.js            # Song Reels UI wiring (audio, sync, export)
│   │   ├── export-reel-video.js  # MP4 export with a real embedded audio track
│   │   ├── elements-data.js    # Add-on elements catalogue (data only)
│   │   ├── elements-renderer.js  # Add-on elements canvas drawing + hit-testing
│   │   └── elements-ui.js      # Shared "Elements" panel wiring (editor + reels)
│   └── img/
│       └── favicon.svg
└── README.md
```

## Templates

25 visual styles × three Instagram formats = 75 templates, all built around
the `love.notezunfiltered` aesthetic, grouped into families (`window.PS_FAMILIES`
in `templates-data.js`) for browsing in both the landing page and the editor:

- **K-drama** — Fade In, Petals, Cinematic
- **Overthinker in Love** — Bubble Pop, Particles, Cinematic
- **Friendship** — Ride or Die
- **Healing** — Letting Go
- **Confidence Journey** — Fade In, Stars, Cinematic
- **Cosmic** — Cosmic Diary
- **Moods** — Midnight Journal, Neon Heartbreak, Golden Hour, Ocean Depth,
  Cherry Blossom Rain, Aurora, Notes App Screenshot, Quote Card Classic
- **Photo Uploads** — Polaroid Memory, Full-Bleed Caption, Framed Snapshot,
  Duotone Mood, Circle Portrait (support zoom + drag-to-reposition on the
  uploaded photo)

Templates are plain data objects in `assets/js/templates-data.js`. Each style
has a matching draw function in `assets/js/renderer.js`. To add a new style,
add an entry to `STYLE_DEFS` (including its `family`) and a `draw<Style>()`
function, then register it in `STYLE_RENDERERS`.

Title/subtitle text supports `*word*` markup — the wrapped word(s) render in
the style's accent color, everything else in the main text color.

## Layout controls

- **Extra photos** — add any number of images from the editor's Layout
  section; each becomes a draggable, resizable layer rendered on top of the
  template (drag on the canvas to move, use its size slider to resize).
  These are separate from a template's own built-in photo slot (Polaroid,
  Framed, etc.), which still has its own zoom/pan controls.
- **Text position** — drag anywhere on the canvas that isn't a photo to
  nudge the title/subtitle/handle/background-text together as one group
  (`state.textOffsetX/Y`, applied in every `draw<Style>()` function). A
  "Reset text position" button clears it back to each template's default
  layout.

Both are plain fields on the per-template state object (`state.images`,
`state.textOffsetX/Y`), so PNG and MP4 export pick them up automatically —
nothing export-side needed to change.

## Elements (add-on widgets, stickers, tags, doodles)

A Canva-style "Elements" section — available on both the template editor and
Song Reels — for dropping extra decoration on top of a template or reel:

- **Music player** — Spotify Card, Frosted Glass, Vinyl Chip, Retro Cassette
  Badge. Editable song title/artist text and accent color.
- **Stickers** — Heart, Sparkle, Star, Flame, Note, Flower. Recolorable.
- **Tags & badges** — Neon pill tag, Circle stamp, Doodle arrow. Editable
  label text and color.
- **Doodles** — Highlighter stroke, Scribble + sparkle. Editable phrase and
  color.

Click a catalogue thumbnail to add it (it lands centered); drag it on the
canvas to reposition, or use its row in the list below the catalogue to
recolor, resize, rotate, edit its text, or delete it (the × on each row).

Elements idle-animate — the vinyl/cassette spin, EQ bars bounce, stickers
pulse/twinkle/bob, the neon tag glows, and so on — driven by
`PS_drawElements(ctx, W, H, elements, timeSec)`'s `timeSec` clock. Each page
feeds it whatever clock is natural there: the editor passes wall-clock time
for a live idle preview (a small always-on `requestAnimationFrame` loop that
only runs while at least one element is present) and the clip-relative time
during MP4 export (so motion is smooth regardless of how fast frames are
captured); Song Reels passes the audio's own `currentTime`, so element
motion is automatically in sync with playback in both preview and the
audio-embedded export. Each element gets its own animation phase offset
(hashed from its id) so several of the same sticker don't pulse in lockstep.

The catalogue and the
per-element editor are both built by the shared `assets/js/elements-ui.js`,
driven by the shared `assets/js/elements-data.js` (catalogue + defaults) and
`assets/js/elements-renderer.js` (canvas drawing + hit-testing) — the same
three files back both pages. Elements are stored as a plain `elements[]`
array on the per-template state / reel state (`x`/`y` center as a 0..1
fraction, `width` as a 0..1 fraction, height derived from a fixed aspect per
type), drawn in a single pass appended after everything else
(`PS_render`/`PS_renderReel`), so PNG/MP4 export — and the Song Reels
audio-embedded export — pick them up automatically.

## Song Reels (`reels.html`)

A separate lyric-video app: upload a song, paste its lyrics, sync each line
to a timestamp, and export a 1080×1920 reel with the audio track actually
embedded (the regular template editor's MP4 export is silent — this one
isn't). Kept as its own page/data/renderer rather than folded into the
existing 25-template system, since the data shape is fundamentally
different (a timed lyric sequence + audio, not a fixed title/subtitle).

- **Ten templates** (`window.PS_REEL_STYLES` in `reels-data.js`): Karaoke
  Glow (3-line lyric stack), Waveform Pulse (a real waveform decoded from
  the uploaded audio, not decorative), Vinyl Diary (spinning album-art
  disc), Notes Unfiltered Karaoke (each line types itself out, styled like
  the Notes App Screenshot template), Cinematic Lyrics (full-bleed album
  art with a Ken Burns pan + letterbox bars — needs uploaded art to shine,
  otherwise shows an "add a photo" placeholder), Neon Pulse (glowing
  neon-outlined line over a brick backdrop with a sweeping scan line),
  Typewriter Ticker (light-mode, a horizontally-scrolling ticker band of
  the current line), Confetti Pop (light-mode, a bursting confetti pop
  timed to each new line), Star Chart Karaoke (twinkling constellation
  behind the lyrics, stars/lines seeded per line), and Old Film Reel
  (sepia vignette, film grain, and sprocket holes framing a subtitle-bar
  current line).
- **Colors** — background, accent, and (for two-accent styles) a second
  accent are all editable per-reel from the "Colors" section, independent
  of the chosen template's defaults; "Reset to template colors" restores
  the selected style's original palette.
- **Sync** — paste lyrics, "Split into lines" turns them into cues, then
  "Start sync" plays the song and captures a timestamp on each "Tap" (or
  spacebar) press. Timestamps are also directly editable per line
  afterward. `window.PS_findCueIndex(lyrics, currentTime)` picks the active
  line during playback and export.
- **Export** (`export-reel-video.js`) decodes the song through the Web
  Audio API into a `MediaStreamAudioDestinationNode`, merges it with the
  canvas's `captureStream()`, and records both with `MediaRecorder` — the
  draw loop is driven by the audio element's own `currentTime`, not a
  synthetic timer, so lyric timing can't drift from playback. Falls back to
  the same ffmpeg.wasm webm→mp4 transcode as the template editor's export
  when the browser can't record `video/mp4` directly.

## How export works

- **PNG** — the current template is re-rendered at full resolution to an
  off-screen canvas and downloaded via `canvas.toBlob`.
- **MP4** — the template's built-in animation (fade-in / Ken Burns pan, or a
  character-by-character typewriter reveal — pick either from the editor's
  "Text animation" dropdown, and the clip length from "Animation duration",
  2–8s) is played on an off-screen canvas and captured with
  `canvas.captureStream()` + `MediaRecorder`. If the browser can record
  `video/mp4` directly (Safari), that's used as-is. Otherwise it records
  `video/webm` and transcodes to `.mp4` in-browser using
  [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (loaded from a CDN
  only when an MP4 export is requested). Everything happens on-device —
  nothing is uploaded to a server.

## Running locally

No build step or dependencies. Any static file server works, e.g.:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open `http://localhost:PORT/index.html`.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   pick your default branch and the `/ (root)` folder.
4. Save — GitHub will publish the site at
   `https://<username>.github.io/<repo>/`.

The `.nojekyll` file is already included so GitHub Pages serves the
`assets/` folder without Jekyll trying to process it first.
