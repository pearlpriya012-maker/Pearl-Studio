/* Pearl Studio — song reel template catalogue (data only) */

window.PS_REEL_FORMAT = { width: 1080, height: 1920, label: "Reel (9:16)" };

window.PS_REEL_STYLES = [
  {
    style: "karaoke-glow",
    name: "Karaoke Glow",
    bg: "#0a0716",
    textColor: "#f0e6ff",
    accent: "#c4b5fd",
    accent2: "#2dd4bf",
  },
  {
    style: "waveform-pulse",
    name: "Waveform Pulse",
    bg: "#040208",
    textColor: "#ffffff",
    accent: "#e879f9",
  },
  {
    style: "vinyl-diary",
    name: "Vinyl Diary",
    bg: "#0e0800",
    textColor: "#fef3c7",
    accent: "#fbbf24",
  },
  {
    style: "notes-karaoke",
    name: "Notes Unfiltered Karaoke",
    bg: "#1c1c1e",
    textColor: "#f2f2f7",
    accent: "#ffd60a",
  },
  {
    style: "cinematic-lyrics",
    name: "Cinematic Lyrics",
    bg: "#0c0a08",
    textColor: "#ffffff",
    accent: "#ffb7d5",
  },
  {
    style: "neon-pulse",
    name: "Neon Pulse",
    bg: "#0a0410",
    textColor: "#ffffff",
    accent: "#ff2fb0",
    accent2: "#22e5ff",
  },
  {
    style: "typewriter-ticker",
    name: "Typewriter Ticker",
    bg: "#f0efe9",
    textColor: "#0a0a0a",
    accent: "#ff2b1f",
  },
  {
    style: "confetti-pop",
    name: "Confetti Pop",
    bg: "#fff4e8",
    textColor: "#3a1f12",
    accent: "#ff6b4a",
    accent2: "#ffd166",
  },
  {
    style: "star-chart-karaoke",
    name: "Star Chart Karaoke",
    bg: "#06061a",
    textColor: "#e8e6ff",
    accent: "#f0c869",
  },
  {
    style: "old-film-reel",
    name: "Old Film Reel",
    bg: "#241d16",
    textColor: "#f2e9da",
    accent: "#d99a5b",
  },
];

window.PS_getReelStyle = function (style) {
  return window.PS_REEL_STYLES.find((s) => s.style === style) || window.PS_REEL_STYLES[0];
};

// A fresh song-reel project. `lyrics` is an array of { text, time } where
// `time` is a start timestamp in seconds (relative to the full song, not
// the trimmed clip) or null until synced.
window.PS_defaultReelState = function () {
  const s = window.PS_REEL_STYLES[0];
  return {
    style: s.style,
    bg: s.bg,
    textColor: s.textColor,
    accent: s.accent,
    accent2: s.accent2 || null,
    songTitle: "",
    artist: "",
    albumArt: null,
    handle: "@love.notezunfiltered",
    lyrics: [],
    clipStart: 0,
    clipEnd: 30,
    audioDuration: 0,
    waveformPeaks: null,
    elements: [],
  };
};

// Splits pasted/typed lyrics into cues, one per non-empty line, resetting
// any previous sync timestamps.
window.PS_lyricsToCues = function (text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line, time: null }));
};
