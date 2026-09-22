/* Pearl Studio — template catalogue
 * Each template is a pure data description. assets/js/renderer.js turns a
 * template + user state into pixels on a canvas.
 *
 * Title/subtitle text supports *word* markup — the wrapped word(s) render
 * in the style's accent color, everything else in the main text color.
 */

window.PS_FORMATS = {
  post: { width: 1080, height: 1080, label: "Square Post" },
  story: { width: 1080, height: 1920, label: "Story" },
  reel: { width: 1080, height: 1920, label: "Reel Cover" },
};

// Families group related styles for browsing (see editor.js / home.js).
// Order here is display order.
window.PS_FAMILIES = [
  "K-drama",
  "Overthinker in Love",
  "Friendship",
  "Healing",
  "Confidence Journey",
  "Cosmic",
  "Moods",
  "Photo Uploads",
];

// Style catalogue: one entry per visual style. Each style is instantiated
// once per format below, so editing colors/defaults here updates all three
// aspect ratios for that style at once.
const STYLE_DEFS = [
  {
    style: "kdrama-fade",
    name: "K-drama · Fade In",
    family: "K-drama",
    bg: "#10080f",
    textColor: "#fdf2f8",
    accent: "#ffb7d5",
    defaults: {
      title: "10 years of K-dramas\nand I still cry at *episode one*\nlike it's my very first time.",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "kdrama-petals",
    name: "K-drama · Petals",
    family: "K-drama",
    bg: "#0d0512",
    textColor: "#fdf2f8",
    accent: "#ffb7d5",
    hasKicker: true,
    defaults: {
      title: "10 years of tears\nand I regret *nothing.*",
      subtitle: "",
      handle: "@love.notezunfiltered",
      kicker: "한국 드라마",
    },
  },
  {
    style: "kdrama-cine",
    name: "K-drama · Cinematic",
    family: "K-drama",
    bg: "#08040c",
    textColor: "#fdf2f8",
    accent: "#ffb7d5",
    defaults: {
      title: "Some stories stay with you\nlong after the *credits roll.*",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "love-pop",
    name: "Love · Bubble Pop",
    family: "Overthinker in Love",
    bg: "#0d0918",
    textColor: "#e9d5ff",
    accent: "#c084fc",
    accent2: "#f472b6",
    hasKicker: true,
    subtitleColor: "#fbcfe8",
    defaults: {
      title: "He texts me *good morning* every day.\nI still checked her profile.",
      subtitle: "The problem is me. I know. 💜",
      handle: "@love.notezunfiltered",
      kicker: "overthinker in love",
    },
  },
  {
    style: "love-particles",
    name: "Love · Particles",
    family: "Overthinker in Love",
    bg: "#0a0614",
    textColor: "#e9d5ff",
    accent: "#c084fc",
    defaults: {
      title: "Research. Not insecurity.\nI am a *scientist* of my own anxiety.",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "love-cine",
    name: "Love · Cinematic",
    family: "Overthinker in Love",
    bg: "#060310",
    textColor: "#e9d5ff",
    accent: "#c084fc",
    accent2: "#7c3aed",
    defaults: {
      title: "He called me beautiful.\nI *fact-checked* his ex.",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "conf-fade",
    name: "Confidence · Fade In",
    family: "Confidence Journey",
    bg: "#0c0a04",
    textColor: "#fef3c7",
    accent: "#f59e0b",
    hasKicker: true,
    subtitleColor: "#c4b5fd",
    defaults: {
      title: "Some days we feel *beautiful.*\nSome days we really don't.\nBut honestly?",
      subtitle: "A little trust in ourselves and a genuine smile — that's what confidence is made of.",
      handle: "@love.notezunfiltered",
      kicker: "GLOW",
    },
  },
  {
    style: "conf-stars",
    name: "Confidence · Stars",
    family: "Confidence Journey",
    bg: "#080610",
    textColor: "#fef9ee",
    accent: "#f59e0b",
    subtitleColor: "#c4b5fd",
    defaults: {
      title: "Trust yourself.\nSmile anyway.\nThat's *confidence.*",
      subtitle: "it really is.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "conf-cine",
    name: "Confidence · Cinematic",
    family: "Confidence Journey",
    bg: "#060500",
    textColor: "#fef9ee",
    accent: "#f59e0b",
    subtitleColor: "#c4b5fd",
    defaults: {
      title: "We are not broken.\nWe are *becoming.*",
      subtitle: "slowly. beautifully. together.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "journal",
    name: "Midnight Journal",
    family: "Moods",
    bg: "#08080a",
    textColor: "#f0eeff",
    accent: "#a78bfa",
    hasKicker: true,
    defaults: {
      title: "he's asleep. I'm still thinking about *everything* and nothing at the same time.",
      subtitle: "",
      handle: "@love.notezunfiltered",
      kicker: "— from the notes app",
    },
  },
  {
    style: "neon",
    name: "Neon Heartbreak",
    family: "Moods",
    bg: "#040208",
    textColor: "#ffffff",
    accent: "#e879f9",
    defaults: {
      title: "she's just a *name* I can't stop searching.",
      subtitle: "it's not love. it's anxiety.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "golden",
    name: "Golden Hour",
    family: "Moods",
    bg: "#0e0800",
    textColor: "#fef3c7",
    accent: "#fbbf24",
    defaults: {
      title: "on good days, I am *golden.*\non bad days, I am still here.",
      subtitle: "both count.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "ocean",
    name: "Ocean Depth",
    family: "Moods",
    bg: "#020d0e",
    textColor: "#ccfbf1",
    accent: "#2dd4bf",
    defaults: {
      title: "some feelings are too *deep* to explain.\nso I just sit with them.",
      subtitle: "and that's okay too.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "cherry",
    name: "Cherry Blossom Rain",
    family: "Moods",
    bg: "#0e060c",
    textColor: "#fdf2f8",
    accent: "#ff9ec5",
    defaults: {
      title: "she fell in love with *every story*\nbefore she found her own.",
      subtitle: "still writing it.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "aurora",
    name: "Aurora",
    family: "Moods",
    bg: "#040210",
    textColor: "#f0e6ff",
    accent: "#c4b5fd",
    accent2: "#2dd4bf",
    defaults: {
      title: "somewhere between who I was\nand who I'm *becoming,*\nI found peace.",
      subtitle: "still finding it, actually.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "polaroid",
    name: "Polaroid Memory",
    family: "Photo Uploads",
    bg: "#f5f0e8",
    textColor: "#1a1a2e",
    accent: "#a855f7",
    hasImage: true,
    defaults: {
      title: "we were *beautiful*\neven when we didn't know it.",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "full-bleed",
    name: "Full-Bleed Caption",
    family: "Photo Uploads",
    bg: "#14161d",
    textColor: "#ffffff",
    accent: "#fbbf24",
    hasImage: true,
    defaults: {
      title: "she was *golden*\neven in the dark.",
      subtitle: "still glowing, honestly.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "framed",
    name: "Framed Snapshot",
    family: "Photo Uploads",
    bg: "#0c0a12",
    textColor: "#f0eeff",
    accent: "#818cf8",
    hasImage: true,
    defaults: {
      title: "we were *beautiful*\neven when we didn't know it.",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "duotone",
    name: "Duotone Mood",
    family: "Photo Uploads",
    bg: "#1a0a12",
    textColor: "#ffffff",
    accent: "#fb7185",
    accent2: "#f59e0b",
    hasImage: true,
    defaults: {
      title: "some days I *glow.*\nOn others I just show up.",
      subtitle: "both are enough.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "circle",
    name: "Circle Portrait",
    family: "Photo Uploads",
    bg: "#0a0a12",
    textColor: "#f0eeff",
    accent: "#93c5fd",
    hasImage: true,
    defaults: {
      title: "we were *soft*\neven in the dark.",
      subtitle: "still are.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "ride-or-die",
    name: "Ride or Die",
    family: "Friendship",
    bg: "#fff4e8",
    textColor: "#3a1f12",
    accent: "#ff6b4a",
    accent2: "#ffd166",
    defaults: {
      title: "she's not just my *best friend*\nshe's my witness.",
      subtitle: "here for the good, the bad, and the 2am car rides.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "letting-go",
    name: "Letting Go",
    family: "Healing",
    bg: "#141310",
    textColor: "#f2ece6",
    accent: "#c9a89a",
    defaults: {
      title: "I'm not over it.\nI'm just *choosing peace* over it.",
      subtitle: "and that's enough, for now.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "cosmic-diary",
    name: "Cosmic Diary",
    family: "Cosmic",
    bg: "#06061a",
    textColor: "#e8e6ff",
    accent: "#f0c869",
    defaults: {
      title: "mercury retrograde\nmade me do it,\n*allegedly.*",
      subtitle: "blaming the stars, not myself.",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "notes-app",
    name: "Notes App Screenshot",
    family: "Moods",
    bg: "#1c1c1e",
    textColor: "#f2f2f7",
    accent: "#ffd60a",
    defaults: {
      title: "i keep rereading\nthe *same text*\nlike it'll change.",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
  {
    style: "quote-classic",
    name: "Quote Card Classic",
    family: "Moods",
    bg: "#f7f5f2",
    textColor: "#141414",
    accent: "#b5651d",
    defaults: {
      title: "Be *soft.*\nDo not let the world\nmake you hard.",
      subtitle: "",
      handle: "@love.notezunfiltered",
    },
  },
];

const FORMAT_IDS = ["post", "story", "reel"];

window.PS_TEMPLATES = STYLE_DEFS.flatMap((s) =>
  FORMAT_IDS.map((format) => ({
    id: `${s.style}-${format}`,
    style: s.style,
    name: s.name,
    family: s.family,
    format,
    width: window.PS_FORMATS[format].width,
    height: window.PS_FORMATS[format].height,
    bg: s.bg,
    textColor: s.textColor,
    accent: s.accent,
    accent2: s.accent2 || null,
    subtitleColor: s.subtitleColor || null,
    hasImage: !!s.hasImage,
    hasKicker: !!s.hasKicker,
    defaults: { ...s.defaults },
  }))
);

window.PS_getTemplate = function (id) {
  return window.PS_TEMPLATES.find((t) => t.id === id);
};
