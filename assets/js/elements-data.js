/* Pearl Studio — add-on "Elements" catalogue (data only).
   Shared by the template editor and Song Reels: both draw elements the
   same way (assets/js/elements-renderer.js) and drag/resize/recolor them
   the same way (assets/js/elements-ui.js). */

window.PS_ELEMENT_CATALOG = [
  {
    category: "Music player",
    items: [
      { type: "music-player", variant: "spotify", name: "Spotify Card" },
      { type: "music-player", variant: "glass", name: "Frosted Glass" },
      { type: "music-player", variant: "vinyl", name: "Vinyl Chip" },
      { type: "music-player", variant: "cassette", name: "Retro Badge" },
    ],
  },
  {
    category: "Stickers",
    items: [
      { type: "sticker", variant: "heart", name: "Heart" },
      { type: "sticker", variant: "sparkle", name: "Sparkle" },
      { type: "sticker", variant: "star", name: "Star" },
      { type: "sticker", variant: "flame", name: "Flame" },
      { type: "sticker", variant: "note", name: "Note" },
      { type: "sticker", variant: "flower", name: "Flower" },
    ],
  },
  {
    category: "Tags & badges",
    items: [
      { type: "badge", variant: "neon-pill", name: "Neon pill tag" },
      { type: "badge", variant: "circle-stamp", name: "Circle stamp" },
      { type: "badge", variant: "doodle-arrow", name: "Doodle arrow" },
    ],
  },
  {
    category: "Doodles",
    items: [
      { type: "doodle", variant: "highlighter", name: "Highlighter stroke" },
      { type: "doodle", variant: "scribble-sparkle", name: "Scribble + sparkle" },
    ],
  },
];

// height / width for each element's drawing box, used both for hit-testing
// (drag/resize) and for scaling its internal layout consistently.
window.PS_ELEMENT_ASPECT = {
  "music-player:spotify": 0.42,
  "music-player:glass": 0.4,
  "music-player:vinyl": 0.22,
  "music-player:cassette": 0.42,
  "sticker:heart": 1,
  "sticker:sparkle": 1,
  "sticker:star": 1,
  "sticker:flame": 1,
  "sticker:note": 1,
  "sticker:flower": 1,
  "badge:neon-pill": 0.3,
  "badge:circle-stamp": 1,
  "badge:doodle-arrow": 0.36,
  "doodle:highlighter": 0.32,
  "doodle:scribble-sparkle": 0.32,
};

let elementIdCounter = 0;

// A fresh element instance. x/y are the CENTER as a 0..1 fraction of the
// canvas, width is a 0..1 fraction of canvas width (height follows from
// PS_ELEMENT_ASPECT), matching the existing free-photo-layer convention.
window.PS_defaultElement = function (type, variant, id) {
  const base = {
    id: id || "el-" + ++elementIdCounter,
    type,
    variant,
    x: 0.5,
    y: 0.5,
    width: 0.5,
    rotation: 0,
    color: "#2dd4bf",
  };
  if (type === "music-player") {
    base.width = 0.78;
    base.text = "Golden Hour";
    base.text2 = "notes unfiltered";
    base.color = variant === "cassette" ? "#fbbf24" : variant === "vinyl" ? "#e879f9" : variant === "glass" ? "#6d28d9" : "#1DB954";
    if (variant === "cassette") base.rotation = -6;
  } else if (type === "sticker") {
    base.width = 0.18;
    const colors = { heart: "#ff5c8a", sparkle: "#fbbf24", star: "#2dd4bf", flame: "#ff8a3d", note: "#c4b5fd", flower: "#f472b6" };
    base.color = colors[variant] || base.color;
  } else if (type === "badge") {
    if (variant === "neon-pill") {
      base.width = 0.62;
      base.text = "NEW EP OUT NOW";
      base.color = "#ff2fb0";
    } else if (variant === "circle-stamp") {
      base.width = 0.34;
      base.text = "100%";
      base.text2 = "MOOD";
      base.color = "#f0c869";
      base.rotation = -8;
    } else if (variant === "doodle-arrow") {
      base.width = 0.58;
      base.text = "tap for vibes";
      base.color = "#2dd4bf";
    }
  } else if (type === "doodle") {
    if (variant === "highlighter") {
      base.width = 0.6;
      base.text = "this hits different";
      base.color = "#fde68a";
    } else if (variant === "scribble-sparkle") {
      base.width = 0.6;
      base.text = "main character era";
      base.color = "#f472b6";
    }
  }
  return base;
};
