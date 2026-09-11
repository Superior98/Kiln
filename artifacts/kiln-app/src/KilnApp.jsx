import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import {
  Paperclip, Camera, History, ArrowUp, Sparkles, Play, Pause,
  Maximize2, Smartphone, Monitor, Code2, Image as ImageIcon,
  Upload, Search, CheckCircle2, AlertTriangle,
  ChevronDown, X, Menu, Wand2, Share2, Zap, User, FileCode2,
  RotateCw, Download, MessageSquare
} from 'lucide-react';

/* ---------------------------------------------------------------
   Projects — each one owns its own file set, asset set, and
   preview mode. This is the thing that makes the preview render
   "whatever the files describe": a 2D project drives a canvas
   preview, a 3D project drives a real three.js scene built from
   its own config files.
--------------------------------------------------------------- */

const PROJECTS = [
  { id: 'ember-runner', name: 'Ember Runner', type: '2D' },
  { id: 'skyward-drift', name: 'Skyward Drift', type: '3D' },
  { id: 'bramble-maze', name: 'Bramble Maze', type: '2D' },
];

// AI requests go through the shared API server so the Groq key stays
// server-side and is never exposed in the browser.
const ASSISTANT_API_PATH = '/api/assistant';
const CONFIG_3D = {
  fov: 75, near: 0.1, far: 1000,
  camPos: { x: 0, y: 50, z: 100 },
  hemiIntensity: 0.6,
  sunIntensity: 2.0,
  sunPos: { x: -50, y: 100, z: -50 },
  skyColor: 0x87ceeb,
  terrainSize: 200,
};

const PROJECT_FILES = {
  'ember-runner': {
    files: ['engine.js', 'player.js', 'level.js', 'config.js', 'README.md', 'game.json'],
    contents: {
      'engine.js':
`import { World } from 'physics';
import { Player } from './player.js';
import { loadLevel } from './level.js';

// Boots the game loop and wires up the scene.
export function startGame(canvas) {
  const world = new World({ gravity: -9.8 });
  const player = new Player(world);
  const level = loadLevel(world, 1);

  function tick(dt) {
    player.update(dt);
    world.step(dt);
    render(canvas, world);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  return { world, player, level };
}`,
      'player.js':
`export class Player {
  constructor(world) {
    this.body = world.addBody({ x: 0, y: 2 });
    this.speed = 6;
    this.jumpForce = 9;
  }

  update(dt) {
    // Read input and move the body.
    if (Input.left) this.body.vx = -this.speed;
    if (Input.right) this.body.vx = this.speed;
    if (Input.jumpPressed && this.body.grounded) {
      this.body.vy = this.jumpForce;
    }
  }
}`,
      'level.js':
`// Generates a simple platformer level.
export function loadLevel(world, index) {
  const platforms = [
    { x: 0, y: 0, w: 20, h: 1 },
    { x: 6, y: 3, w: 4, h: 1 },
    { x: 12, y: 5, w: 4, h: 1 },
  ];
  platforms.forEach(p => world.addStaticBox(p));
  return { platforms, index };
}`,
      'config.js':
`// Miscellaneous configuration
export const GRAVITY = -9.8;
export const PLAYER_SPEED = 6;
export const JUMP_FORCE = 9;
export const TARGET_FPS = 60;`,
      'README.md':
`# Ember Runner

Generated with Kiln. Ask Ember to add features,
swap art, or tune the physics and it edits these
files directly.`,
      'game.json':
`{
  "title": "Ember Runner",
  "kind": "platformer",
  "background": "#0c0a09",
  "accent": "#f59e0b",
  "instructions": "Arrow keys or A/D to move. Space to jump.",
  "player": { "x": 120, "y": 390, "w": 28, "h": 40, "color": "#f59e0b", "speed": 260, "jump": 480 },
  "platforms": [
    { "x": 0, "y": 470, "w": 960, "h": 70, "color": "#292524" },
    { "x": 270, "y": 365, "w": 180, "h": 22, "color": "#57534e" },
    { "x": 600, "y": 285, "w": 180, "h": 22, "color": "#57534e" }
  ],
  "enemies": [{ "x": 520, "y": 430, "size": 18, "color": "#ef4444", "speed": 45 }],
  "collectibles": [
    { "x": 350, "y": 325, "size": 12, "color": "#38bdf8" },
    { "x": 680, "y": 245, "size": 12, "color": "#38bdf8" }
  ]
}`
    }
  },

  'skyward-drift': {
    files: [
      'main.js', 'config.js', 'config.assets.js', 'config.camera.js',
      'config.colors.js', 'config.lighting.js', 'config.misc.js',
      'config.physics.js', 'config.render.js', 'README.md'
    ],
    contents: {
      'main.js':
`import * as THREE from 'three';
import {
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, INITIAL_CAMERA_POS,
  SUN_LIGHT_INTENSITY, SUN_LIGHT_POS, HEMI_LIGHT_INTENSITY,
  DEFAULT_SKY_COLOR, TERRAIN_SIZE, PHYSICS_GRAVITY,
  RENDER_DIV_ID, THREE_CANVAS_ID, COLORS,
} from './config.js';

// Boots the 3D scene using the shared config modules.
export function startGame() {
  const mount = document.getElementById(RENDER_DIV_ID);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DEFAULT_SKY_COLOR);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    mount.clientWidth / mount.clientHeight,
    CAMERA_NEAR,
    CAMERA_FAR
  );
  camera.position.set(INITIAL_CAMERA_POS.x, INITIAL_CAMERA_POS.y, INITIAL_CAMERA_POS.z);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.domElement.id = THREE_CANVAS_ID;
  mount.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(COLORS.white, COLORS.brown, HEMI_LIGHT_INTENSITY);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(COLORS.white, SUN_LIGHT_INTENSITY);
  sun.position.set(SUN_LIGHT_POS.x, SUN_LIGHT_POS.y, SUN_LIGHT_POS.z);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE),
    new THREE.MeshStandardMaterial({ color: COLORS.green })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  let velocityY = 0;

  function tick() {
    velocityY += PHYSICS_GRAVITY * 0.001;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { scene, camera, renderer };
}`,
      'config.js':
`// Central config entry point.
// Re-exports everything from the split config modules so existing
// \`import { X } from './config.js'\` statements keep working unchanged.

export * from './config.assets.js';
export * from './config.render.js';
export * from './config.physics.js';
export * from './config.camera.js';
export * from './config.lighting.js';
export * from './config.colors.js';
export * from './config.misc.js';`,
      'config.assets.js':
`// Asset definitions and related URLs
export const INITIAL_ASSETS = [{
  "name": "play",
  "shortid": "4xHr",
  "file_type": "png",
  "url": "https://play.rosebud.ai/assets/play.png?4xHr"
}];

export const BACKGROUND_MUSIC_URL = 'https://play.rosebud.ai/assets/rosebud_official_theme_02.mp3?YUny';
export const BACKGROUND_MUSIC_VOLUME = 0.10;

export const TERRAIN_TEXTURE_URL = 'https://develop.play.rosebud.ai/assets/Grass_04.png?MBRT';
export const TERRAIN_NORMAL_MAP_URL = 'https://develop.play.rosebud.ai/assets/Grass_04_Nrm.png?BQVT';`,
      'config.camera.js':
`// Camera and orbit controls configuration
export const CAMERA_FOV = 75;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1000;
export const INITIAL_CAMERA_POS = {
    x: 0,
    y: 50,
    z: 100
};

export const ORBIT_CONTROLS_DAMPING_FACTOR = 0.25;`,
      'config.colors.js':
`// Named color palette (hex values)
export const COLORS = {
    red: 0xFF0000,
    green: 0x00FF00,
    blue: 0x0000FF,
    yellow: 0xFFFF00,
    purple: 0x800080,
    orange: 0xFFA500,
    pink: 0xFFC0CB,
    brown: 0xA52A2A,
    black: 0x000000,
    white: 0xFFFFFF,
    gray: 0x808080,
    cyan: 0x00FFFF,
    magenta: 0xFF00FF,
    silver: 0xC0C0C0,
    gold: 0xFFD700,
    navy: 0x000080,
    teal: 0x008080
};`,
      'config.lighting.js':
`// Scene lighting configuration
export const SUN_LIGHT_INTENSITY = 2.0;
export const SUN_LIGHT_POS = {
    x: -50,
    y: 100,
    z: -50
};
export const HEMI_LIGHT_INTENSITY = 0.6;`,
      'config.misc.js':
`export const DONE_TYPING_INTERVAL = 300; // ms for AI response typing simulation`,
      'config.physics.js':
`// Physics engine configuration
export const PHYSICS_GRAVITY = -9.81;
export const PHYSICS_FRICTION = 0.01;
export const PHYSICS_RESTITUTION = 0;
export const PHYSICS_SOLVER_ITERATIONS = 10;
export const PHYSICS_SOLVER_TOLERANCE = 0.001;`,
      'config.render.js':
`// DOM element IDs and rendering / post-processing settings
export const RENDER_DIV_ID = 'renderDiv';
export const THREE_CANVAS_ID = 'threeRenderCanvas';

export const DEFAULT_SKY_COLOR = 0x87CEEB;
export const DEFAULT_GROUND_COLOR_REFLECTION = 0xFFFFFF; // White ground reflection for sky dome

export const BLOOM_STRENGTH = 0.2;
export const BLOOM_RADIUS = 0.4;
export const BLOOM_THRESHOLD = 0.9;
export const TONE_MAPPING_EXPOSURE = 1.2;

export const SKY_DOME_OFFSET = 33;
export const SKY_DOME_EXPONENT = 0.6;

export const TERRAIN_SIZE = 200;`,
      'README.md':
`# Skyward Drift

Generated with Kiln. This project is 3D — Ember edits
main.js plus the config.*.js modules, and the Preview
tab renders an actual three.js scene from those values.

Heads up before shipping: config.assets.js currently
points at play.rosebud.ai URLs. Swap those for assets
you host yourself before this leaves the prototype stage.`
      ,
      'game.json':
`{
  "title": "Skyward Drift",
  "kind": "explorer",
  "background": "#87ceeb",
  "accent": "#2f5d3a",
  "instructions": "Use the arrow keys to steer the explorer.",
  "player": { "x": 120, "y": 340, "w": 28, "h": 40, "color": "#f59e0b", "speed": 260, "jump": 480 },
  "platforms": [],
  "enemies": [],
  "collectibles": [
    { "x": 420, "y": 260, "size": 14, "color": "#38bdf8" },
    { "x": 620, "y": 220, "size": 14, "color": "#38bdf8" },
    { "x": 780, "y": 310, "size": 14, "color": "#38bdf8" }
  ]
}`
    }
  },

  'bramble-maze': {
    files: ['maze.js', 'player.js', 'config.js', 'README.md', 'game.json'],
    contents: {
      'maze.js':
`// Generates a random maze using recursive backtracking.
export function generateMaze(width, height) {
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ n: true, s: true, e: true, w: true, visited: false }))
  );

  function carve(x, y) {
    grid[y][x].visited = true;
    const dirs = shuffle(['n', 's', 'e', 'w']);
    for (const dir of dirs) {
      const [nx, ny] = step(x, y, dir);
      if (inBounds(nx, ny, width, height) && !grid[ny][nx].visited) {
        grid[y][x][dir] = false;
        grid[ny][nx][opposite(dir)] = false;
        carve(nx, ny);
      }
    }
  }

  carve(0, 0);
  return grid;
}`,
      'player.js':
`export class Player {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.torchRadius = 3;
  }

  move(dx, dy, maze) {
    // Only move through open passages.
    this.x += dx;
    this.y += dy;
  }
}`,
      'config.js':
`// Maze generation and rendering config
export const MAZE_WIDTH = 12;
export const MAZE_HEIGHT = 12;
export const CELL_SIZE = 32;
export const TORCH_FLICKER_SPEED = 0.08;`,
      'README.md':
`# Bramble Maze

Generated with Kiln. A torch-lit top-down maze —
ask Ember to resize the maze, add keys and doors,
or change the torch color.`,
      'game.json':
`{
  "title": "Bramble Maze",
  "kind": "topdown",
  "background": "#111827",
  "accent": "#a3e635",
  "instructions": "Use the arrow keys or WASD to explore the maze.",
  "player": { "x": 90, "y": 90, "w": 24, "h": 24, "color": "#a3e635", "speed": 220, "jump": 0 },
  "platforms": [
    { "x": 0, "y": 0, "w": 960, "h": 24, "color": "#365314" },
    { "x": 0, "y": 516, "w": 960, "h": 24, "color": "#365314" },
    { "x": 0, "y": 0, "w": 24, "h": 540, "color": "#365314" },
    { "x": 936, "y": 0, "w": 24, "h": 540, "color": "#365314" },
    { "x": 220, "y": 24, "w": 24, "h": 300, "color": "#4d7c0f" },
    { "x": 480, "y": 215, "w": 24, "h": 301, "color": "#4d7c0f" },
    { "x": 720, "y": 24, "w": 24, "h": 300, "color": "#4d7c0f" }
  ],
  "enemies": [{ "x": 740, "y": 420, "size": 16, "color": "#ef4444", "speed": 32 }],
  "collectibles": [
    { "x": 160, "y": 420, "size": 10, "color": "#facc15" },
    { "x": 360, "y": 120, "size": 10, "color": "#facc15" },
    { "x": 840, "y": 420, "size": 10, "color": "#facc15" }
  ]
}`
    }
  }
};

function loadProjectFiles() {
  const defaults = JSON.parse(JSON.stringify(PROJECT_FILES));
  try {
    const saved = JSON.parse(window.localStorage.getItem('kiln-project-files-v1') || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return Object.fromEntries(Object.entries(defaults).map(([id, base]) => {
      const existing = saved[id];
      if (!existing || typeof existing !== 'object') return [id, base];
      const files = Array.from(new Set([
        ...(Array.isArray(existing.files) ? existing.files : []),
        ...base.files,
      ]));
      return [
        id,
        {
          ...base,
          ...existing,
          files,
          contents: { ...base.contents, ...(existing.contents || {}) },
        },
      ];
    }));
  } catch {
    return defaults;
  }
}

// Real per-project asset lists. Each project starts empty — no
// placeholder gradients standing in for art that doesn't exist.
// Uploading (see AssetsPane) adds real entries with an actual
// `url` (an object URL for local files, or whatever URL the user
// pasted in).
const PROJECT_ASSETS = {
  'ember-runner': [],
  'skyward-drift': [],
  'bramble-maze': [],
};

const FALLBACK_GAME_SPEC = {
  title: 'Untitled Game',
  kind: 'platformer',
  background: '#0c0a09',
  accent: '#f59e0b',
  instructions: 'Arrow keys or A/D to move. Space to jump.',
  player: { x: 120, y: 390, w: 28, h: 40, color: '#f59e0b', speed: 260, jump: 480 },
  platforms: [{ x: 0, y: 470, w: 960, h: 70, color: '#292524' }],
  enemies: [],
  collectibles: [],
};

function parseGameSpec(projectFiles, fallbackTitle) {
  try {
    const parsed = JSON.parse(projectFiles?.contents?.['game.json'] || '');
    return {
      ...FALLBACK_GAME_SPEC,
      ...parsed,
      title: parsed.title || fallbackTitle,
      player: { ...FALLBACK_GAME_SPEC.player, ...(parsed.player || {}) },
      platforms: Array.isArray(parsed.platforms) ? parsed.platforms : FALLBACK_GAME_SPEC.platforms,
      enemies: Array.isArray(parsed.enemies) ? parsed.enemies : [],
      collectibles: Array.isArray(parsed.collectibles) ? parsed.collectibles : [],
    };
  } catch {
    return { ...FALLBACK_GAME_SPEC, title: fallbackTitle };
  }
}

const STARTER_PROMPTS = {
  '2D': ['A twin-stick space shooter', 'A platformer with double jump', 'An endless runner with coins'],
  '3D': ['A floating island explorer', 'A low-poly flight sim', 'A third-person collectathon'],
};

const SUGGESTIONS = {
  '2D': ['Add a scoring system', 'Give the player a dash move', 'Add background music', 'Spawn tougher enemies over time'],
  '3D': ['Add a day/night cycle', 'Give the camera a follow mode', 'Scatter collectible gems', 'Add ambient wind'],
};

/* ---------------------------------------------------------------
   Edit engine — this is what actually reads and writes a
   project's files in response to a prompt. It is intentionally
   simple pattern-matching, not a real code-generating model: it
   inspects the user's prompt for known keywords and, for each
   match, appends real working code to a real file in the
   project's file map. Every step it reports in the work log
   corresponds to a file it actually opened or actually wrote —
   nothing here is a canned/placeholder string.

   Returns { steps, filesRead, filesWritten, nextFiles, nextContents, summary }
   or throws an Error if something about the request or project
   state is invalid, which the caller turns into a real error
   state in the UI (see PreviewPane / handleSend).
--------------------------------------------------------------- */

const EDIT_RULES = [
  {
    match: /scor(e|ing)|point/i,
    apply2D: (contents) => ({
      file: 'engine.js',
      code: `\n\n// --- Scoring system (added by Ember) ---\nlet score = 0;\nexport function addScore(points = 1) {\n  score += points;\n  return score;\n}\nexport function getScore() {\n  return score;\n}`,
    }),
    apply3D: (contents) => ({
      file: 'main.js',
      code: `\n\n// --- Scoring system (added by Ember) ---\nlet score = 0;\nexport function addScore(points = 1) {\n  score += points;\n  return score;\n}`,
    }),
  },
  {
    match: /dash|sprint|boost/i,
    apply2D: () => ({
      file: 'player.js',
      code: `\n\n  dash() {\n    // Added by Ember: short burst of horizontal speed.\n    this.body.vx = (this.facing || 1) * this.speed * 3;\n  }`,
      insertBeforeLastBrace: true,
    }),
  },
  {
    match: /music|sound|audio|sfx/i,
    apply2D: (contents) => ({
      file: 'config.js',
      code: `\nexport const MUSIC_URL = 'assets/bg_music.mp3';\nexport const MUSIC_VOLUME = 0.4;`,
    }),
    apply3D: (contents) => ({
      file: 'config.assets.js',
      code: `\n\nexport const MUSIC_URL = 'assets/bg_music.mp3';\nexport const MUSIC_VOLUME = 0.4;`,
    }),
  },
  {
    match: /enem(y|ies)|monster|bat/i,
    apply2D: () => ({
      file: 'level.js',
      code: `\n\n// --- Enemy spawning (added by Ember) ---\nexport function spawnEnemies(world, count = 3) {\n  const enemies = [];\n  for (let i = 0; i < count; i++) {\n    enemies.push(world.addBody({ x: 4 + i * 5, y: 3, isEnemy: true }));\n  }\n  return enemies;\n}`,
    }),
  },
  {
    match: /day.?night|time of day|sun.*cycle/i,
    apply3D: () => ({
      file: 'config.lighting.js',
      code: `\n\nexport const DAY_NIGHT_CYCLE_SECONDS = 120;\nexport const NIGHT_SUN_INTENSITY = 0.15;`,
    }),
  },
  {
    match: /gem|collect|pickup/i,
    apply3D: () => ({
      file: 'main.js',
      code: `\n\n// --- Extra collectible gems (added by Ember) ---\nexport const EXTRA_GEM_COUNT = 4;`,
    }),
  },
  {
    match: /camera|follow/i,
    apply3D: () => ({
      file: 'config.camera.js',
      code: `\n\nexport const CAMERA_FOLLOW_ENABLED = true;\nexport const CAMERA_FOLLOW_SMOOTHING = 0.08;`,
    }),
  },
  {
    match: /wind|weather/i,
    apply3D: () => ({
      file: 'config.misc.js',
      code: `\n\nexport const WIND_STRENGTH = 0.4;\nexport const WIND_DIRECTION = { x: 1, z: 0.3 };`,
    }),
  },
  {
    match: /maze|resize|width|height/i,
    apply2D: (contents, project) => project.id === 'bramble-maze' ? ({
      file: 'config.js',
      code: `\n\nexport const MAZE_UPDATED_AT = ${Date.now()};`,
    }) : null,
  },
];

// Formats a resetsAt timestamp (ISO string or epoch ms) from the
// Worker into something short like "in 3h" or "tomorrow". Returns
// null on anything unparseable so the caller can fall back to
// generic copy instead of printing "Invalid Date".
function formatResetTime(resetsAt) {
  const ts = typeof resetsAt === 'number' ? resetsAt : Date.parse(resetsAt);
  if (Number.isNaN(ts)) return null;
  const diffMs = ts - Date.now();
  if (diffMs <= 0) return 'shortly';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

/* ---------------------------------------------------------------
   Tiny syntax highlighter (good enough for a mockup)
--------------------------------------------------------------- */

const TOKEN_RE = /(\/\/[^\n]*)|('[^']*'|"[^"]*"|`[^`]*`)|\b(const|let|var|function|return|import|from|export|default|if|else|new|class|async|await|extends|for|while|of|in)\b|(\b\d+(\.\d+)?\b)/g;

function highlightLine(line, keyPrefix) {
  const parts = [];
  let lastIndex = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > lastIndex) {
      parts.push(<span key={`${keyPrefix}-t-${lastIndex}`}>{line.slice(lastIndex, m.index)}</span>);
    }
    let cls = 'text-stone-200';
    if (m[1]) cls = 'text-stone-500 italic';
    else if (m[2]) cls = 'text-emerald-400';
    else if (m[3]) cls = 'text-orange-400';
    else if (m[4]) cls = 'text-sky-400';
    parts.push(<span key={`${keyPrefix}-m-${m.index}`} className={cls}>{m[0]}</span>);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < line.length) {
    parts.push(<span key={`${keyPrefix}-e`}>{line.slice(lastIndex)}</span>);
  }
  return parts;
}

/* ---------------------------------------------------------------
   Small building blocks
--------------------------------------------------------------- */

// App logo. Falls back to the flame glyph if assets/img_4177.png
// is missing or fails to load (e.g. not uploaded yet in Rosebud),
// so a bad/missing asset never turns into a broken-image icon.
function Logo({ size = 26 }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="kilnFlame" x1="0" y1="32" x2="26" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F59E0B" />
            <stop offset="1" stopColor="#FB923C" />
          </linearGradient>
        </defs>
        <path
          d="M16 2c1.5 4-3 6-3 10a5 5 0 1 0 10 0c0-2-1-3-1-3 1 3-1 5-2.5 5S17 12.5 18 10c1.3-3.2-.5-6-2-8Z"
          fill="url(#kilnFlame)"
        />
        <path d="M11 20a5 5 0 0 0 10 0c0-1.5-.6-2.6-1.2-3.4.2 1.6-.7 3-2 3-1.5 0-2-1.2-1.6-2.6-2 1-5.2 1.4-5.2 3Z" fill="#FDE68A" opacity="0.85" />
      </svg>
    );
  }
  return (
    <img
      src="assets/img_4177.png"
      alt="Kiln"
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

// Ember's avatar in chat. Same fallback pattern as Logo.
function EmberAvatar({ size = 32 }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: size, height: size, background: 'linear-gradient(135deg,#FB923C,#F59E0B)' }}
      >
        <Sparkles size={size * 0.55} className="text-stone-950" />
      </div>
    );
  }
  return (
    <img
      src="assets/img_4176.png"
      alt="Ember"
      width={size}
      height={size}
      className="rounded-full shrink-0 object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

function TypeBadge({ type }) {
  const is3D = type === '3D';
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
        is3D ? 'bg-sky-500/15 text-sky-400' : 'bg-amber-500/15 text-amber-400'
      }`}
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      {type}
    </span>
  );
}

function WorkLogCard({ steps, revealCount, done }) {
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-800 text-xs font-medium text-stone-400 flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <History size={13} />
        Work log · {steps.length} steps
      </div>
      <div className="px-3 py-2.5 space-y-2">
        {steps.slice(0, revealCount).map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm animate-[fadeIn_0.3s_ease-out]"
          >
            {i < revealCount - 1 || done ? (
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            ) : (
              <span className="relative flex h-3.5 w-3.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500" />
              </span>
            )}
            <span className="text-stone-300" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12.5px' }}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   2D preview — ambient canvas
--------------------------------------------------------------- */

function Preview2D({ isPlaying, gameSpec }) {
  const canvasRef = useRef(null);
  const playingRef = useRef(isPlaying);

  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const world = { width: 960, height: 540 };
    const keys = new Set();
    const state = {
      player: { ...gameSpec.player },
      velocityX: 0,
      velocityY: 0,
      grounded: false,
      score: 0,
      collected: new Set(),
      bullets: [],
      enemies: gameSpec.enemies.map(enemy => ({ ...enemy })),
      shootCooldown: 0,
      time: 0,
    };
    let raf;
    let last = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * (window.devicePixelRatio || 1)));
      canvas.height = Math.max(1, Math.floor(rect.height * (window.devicePixelRatio || 1)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onKeyDown = (event) => {
      keys.add(event.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event) => keys.delete(event.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const isDown = (...names) => names.some(name => keys.has(name));
    const overlaps = (a, b) =>
      a.x < b.x + (b.w ?? b.size * 2) &&
      a.x + a.w > b.x &&
      a.y < b.y + (b.h ?? b.size * 2) &&
      a.y + a.h > b.y;
    const resetPlayer = () => {
      state.player = { ...gameSpec.player };
      state.velocityX = 0;
      state.velocityY = 0;
      state.grounded = false;
    };

    const update = (dt) => {
      if (!playingRef.current) return;
      state.time += dt;
      const kind = gameSpec.kind;
      const left = isDown('arrowleft', 'a');
      const right = isDown('arrowright', 'd');
      const up = isDown('arrowup', 'w');
      const down = isDown('arrowdown', 's');
      const player = state.player;

      if (kind === 'topdown' || kind === 'shooter' || kind === 'explorer') {
        player.x += ((right ? 1 : 0) - (left ? 1 : 0)) * player.speed * dt;
        player.y += ((down ? 1 : 0) - (up ? 1 : 0)) * player.speed * dt;
      } else {
        state.velocityX = ((right ? 1 : 0) - (left ? 1 : 0)) * player.speed;
        state.velocityY += 920 * dt;
        if ((isDown(' ', 'arrowup', 'w') && state.grounded) || (isDown(' ', 'arrowup', 'w') && player.y > world.height)) {
          state.velocityY = -player.jump;
          state.grounded = false;
        }
        player.x += state.velocityX * dt;
        const previousBottom = player.y + player.h;
        player.y += state.velocityY * dt;
        state.grounded = false;
        for (const platform of gameSpec.platforms) {
          const nextBottom = player.y + player.h;
          if (
            state.velocityY >= 0 &&
            previousBottom <= platform.y &&
            nextBottom >= platform.y &&
            player.x + player.w > platform.x &&
            player.x < platform.x + platform.w
          ) {
            player.y = platform.y - player.h;
            state.velocityY = 0;
            state.grounded = true;
          }
        }
      }

      player.x = Math.max(0, Math.min(world.width - player.w, player.x));
      player.y = Math.max(-120, Math.min(world.height - player.h, player.y));

      if (kind === 'shooter') {
        state.shootCooldown -= dt;
        if (isDown(' ') && state.shootCooldown <= 0) {
          state.bullets.push({ x: player.x + player.w, y: player.y + player.h / 2 - 2, w: 16, h: 4 });
          state.shootCooldown = 0.22;
        }
        state.bullets = state.bullets
          .map(bullet => ({ ...bullet, x: bullet.x + 620 * dt }))
          .filter(bullet => bullet.x < world.width + 30);
      }

      state.enemies.forEach((enemy, index) => {
        if (kind === 'shooter') {
          enemy.x -= Math.cos(state.time + index) * enemy.speed * dt;
        } else {
          enemy.x += Math.sin(state.time * 1.4 + index) * enemy.speed * dt;
        }
        if (overlaps(player, { ...enemy, w: enemy.size * 2, h: enemy.size * 2 })) {
          resetPlayer();
          state.score = Math.max(0, state.score - 1);
        }
      });

      state.bullets = state.bullets.filter((bullet) => {
        const hitIndex = state.enemies.findIndex(enemy =>
          overlaps(bullet, { ...enemy, w: enemy.size * 2, h: enemy.size * 2 })
        );
        if (hitIndex < 0) return true;
        state.enemies.splice(hitIndex, 1);
        state.score += 10;
        return false;
      });

      gameSpec.collectibles.forEach((item, index) => {
        if (!state.collected.has(index) && overlaps(player, { ...item, w: item.size * 2, h: item.size * 2 })) {
          state.collected.add(index);
          state.score += 5;
        }
      });
    };

    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      update(dt);

      const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
      const offsetX = (canvas.width - world.width * scale) / 2;
      const offsetY = (canvas.height - world.height * scale) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      ctx.fillStyle = gameSpec.background;
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = gameSpec.accent;
      ctx.lineWidth = 1;
      for (let x = 0; x < world.width; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.height); ctx.stroke();
      }
      for (let y = 0; y < world.height; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.width, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      gameSpec.platforms.forEach(platform => {
        ctx.fillStyle = platform.color || '#292524';
        ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
        ctx.fillStyle = gameSpec.accent;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(platform.x, platform.y, platform.w, 3);
        ctx.globalAlpha = 1;
      });
      gameSpec.collectibles.forEach((item, index) => {
        if (state.collected.has(index)) return;
        ctx.save();
        ctx.translate(item.x + item.size, item.y + item.size);
        ctx.rotate(state.time * 2);
        ctx.fillStyle = item.color || '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(0, -item.size); ctx.lineTo(item.size, 0);
        ctx.lineTo(0, item.size); ctx.lineTo(-item.size, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });
      state.enemies.forEach(enemy => {
        ctx.fillStyle = enemy.color || '#ef4444';
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.size, enemy.y + enemy.size, enemy.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(enemy.x + enemy.size - 7, enemy.y + enemy.size - 3, 4, 4);
        ctx.fillRect(enemy.x + enemy.size + 3, enemy.y + enemy.size - 3, 4, 4);
      });
      ctx.fillStyle = gameSpec.player.color || '#f59e0b';
      ctx.fillRect(state.player.x, state.player.y, state.player.w, state.player.h);
      ctx.fillStyle = '#fff7ed';
      ctx.fillRect(state.player.x + state.player.w * 0.58, state.player.y + 9, 5, 5);
      ctx.fillStyle = '#fef3c7';
      state.bullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h));

      ctx.fillStyle = '#fff7ed';
      ctx.font = 'bold 16px IBM Plex Mono, monospace';
      ctx.fillText(gameSpec.title, 22, 30);
      ctx.font = '13px IBM Plex Mono, monospace';
      ctx.fillStyle = '#d6d3d1';
      ctx.fillText(`SCORE ${state.score}`, 22, 52);
      ctx.fillStyle = '#a8a29e';
      ctx.fillText(gameSpec.instructions, 22, world.height - 18);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameSpec]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ---------------------------------------------------------------
   3D preview — real three.js scene built from the project's own
   camera / lighting / render config values (see config.*.js in
   the Code tab for Skyward Drift).
--------------------------------------------------------------- */

function Preview3D({ isPlaying, onError, gameSpec }) {
  const mountRef = useRef(null);
  const playingRef = useRef(isPlaying);

  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const cfg = CONFIG_3D;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(gameSpec.background || cfg.skyColor);
    scene.fog = new THREE.Fog(gameSpec.background || cfg.skyColor, 140, 320);

    const camera = new THREE.PerspectiveCamera(
      cfg.fov,
      Math.max(mount.clientWidth, 1) / Math.max(mount.clientHeight, 1),
      cfg.near,
      cfg.far
    );

    // Real failure path: if the browser/device can't create a
    // WebGL context (old GPU, disabled hardware acceleration, etc),
    // three.js throws here. Report it up instead of leaving a blank
    // black box.
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      onError?.(`Couldn't start WebGL: ${err.message}`);
      return;
    }
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a2a1a, cfg.hemiIntensity);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, cfg.sunIntensity);
    sun.position.set(cfg.sunPos.x, cfg.sunPos.y, cfg.sunPos.z);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.terrainSize, cfg.terrainSize, 1, 1),
      new THREE.MeshStandardMaterial({ color: gameSpec.accent || 0x2f5d3a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2.4, 5, 16),
      new THREE.MeshStandardMaterial({ color: gameSpec.player.color || 0xf59e0b, roughness: 0.4, metalness: 0.1 })
    );
    body.position.y = 4;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.4 })
    );
    head.position.y = 7.5;
    player.add(body, head);
    scene.add(player);

    const gems = [];
    const gemCount = Math.max(1, gameSpec.collectibles.length || 6);
    for (let i = 0; i < gemCount; i++) {
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.4, 0),
        new THREE.MeshStandardMaterial({
          color: gameSpec.collectibles[i]?.color || 0x38bdf8,
          emissive: gameSpec.collectibles[i]?.color || 0x0ea5e9,
          emissiveIntensity: 0.35,
        })
      );
      const angle = (i / gemCount) * Math.PI * 2;
      const collectible = gameSpec.collectibles[i];
      gem.position.set(
        collectible ? (collectible.x - 480) / 12 : Math.cos(angle) * 22,
        collectible ? Math.max(2, 12 - collectible.y / 80) : 6 + Math.sin(i) * 2,
        collectible ? (collectible.y - 270) / 12 : Math.sin(angle) * 22,
      );
      scene.add(gem);
      gems.push(gem);
    }

    let raf;
    let t = 0;
    const orbitRadius = cfg.camPos.z;
    const animate = () => {
      if (playingRef.current) {
        t += 0.01;
        player.rotation.y += 0.015;
        player.position.y = Math.sin(t * 2) * 0.6;
        gems.forEach(g => { g.rotation.y += 0.02; g.rotation.x += 0.01; });
        camera.position.x = Math.sin(t * 0.2) * orbitRadius;
        camera.position.z = Math.cos(t * 0.2) * orbitRadius;
        camera.position.y = cfg.camPos.y - Math.sin(t * 0.15) * 8;
      }
      camera.lookAt(0, 6, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    camera.position.set(cfg.camPos.x || 0.001, cfg.camPos.y, cfg.camPos.z);
    animate();

    const handleResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ground.geometry.dispose(); ground.material.dispose();
      body.geometry.dispose(); body.material.dispose();
      head.geometry.dispose(); head.material.dispose();
      gems.forEach(g => { g.geometry.dispose(); g.material.dispose(); });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [gameSpec, onError]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

/* ---------------------------------------------------------------
   Preview pane shell — chrome is shared, the guts render whatever
   the project's file type calls for.
--------------------------------------------------------------- */

function UnavailablePreview({ message, onRetry }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-6">
      <AlertTriangle size={40} strokeWidth={1.8} className="text-amber-500 mb-5" />
      <p className="text-base md:text-lg text-stone-100 mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        This game hit a real build error.
      </p>
      {message && (
        <p className="text-xs text-stone-500 mb-5 max-w-sm break-words">{message}</p>
      )}
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:border-amber-500/60 hover:text-amber-300 transition-colors flex items-center gap-2"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        <RotateCw size={14} /> Retry
      </button>
    </div>
  );
}

function PreviewPane({ project, projectFiles, buildError }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [device, setDevice] = useState('desktop');
  // Local error state, but it is only ever set by a real failure:
  // either a build error bubbled up from KilnApp (a failed
  // generation) or a runtime failure thrown by Preview3D itself
  // (e.g. WebGL unavailable). There is no manual toggle for this.
  const [renderError, setRenderError] = useState(null);
  const is3D = project.type === '3D';
  const gameSpec = useMemo(
    () => parseGameSpec(projectFiles, project.name),
    [projectFiles, project.name],
  );

  useEffect(() => { setRenderError(null); }, [project.id]);

  const activeError = buildError || renderError;

  const caption = activeError
    ? `Build error: ${activeError}`
    : `Live ${gameSpec.kind} runtime — the preview reads game.json after every applied Ember change.`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-11 border-b border-stone-800 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 text-stone-500">
          <button
            onClick={() => setRenderError(null)}
            className="p-1.5 rounded hover:bg-stone-800 hover:text-stone-200 transition-colors"
            title="Reload preview"
          >
            <RotateCw size={15} />
          </button>
          <button
            onClick={() => setDevice(d => d === 'desktop' ? 'mobile' : 'desktop')}
            className={`p-1.5 rounded transition-colors ${device === 'mobile' ? 'bg-amber-500/15 text-amber-400' : 'hover:bg-stone-800 hover:text-stone-200'}`}
            title="Toggle device preview"
          >
            {device === 'desktop' ? <Monitor size={15} /> : <Smartphone size={15} />}
          </button>
          <button className="p-1.5 rounded hover:bg-stone-800 hover:text-stone-200 transition-colors">
            <Maximize2 size={15} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-500" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          <TypeBadge type={project.type} />
          <span className={`h-1.5 w-1.5 rounded-full ${activeError ? 'bg-red-500' : isPlaying ? 'bg-emerald-400' : 'bg-stone-600'}`} />
          {activeError ? 'failed' : isPlaying ? 'live' : 'paused'}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0 bg-[#121017]">
        <div
          className={`relative rounded-xl overflow-hidden border border-stone-800 bg-black shadow-2xl transition-all duration-300 ${
            device === 'desktop' ? 'w-full max-w-3xl aspect-video' : 'w-full max-w-[300px] aspect-[9/16]'
          }`}
        >
          {activeError ? (
            <UnavailablePreview message={activeError} onRetry={() => setRenderError(null)} />
          ) : is3D ? (
            <Preview3D isPlaying={isPlaying} onError={setRenderError} gameSpec={gameSpec} />
          ) : (
            <Preview2D isPlaying={isPlaying} gameSpec={gameSpec} />
          )}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <span className="text-[11px] px-2 py-1 rounded-full bg-black/50 text-amber-300 border border-amber-500/20" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              {project.name}
            </span>
          </div>
          {!activeError && (
            <button
              onClick={() => setIsPlaying(p => !p)}
              className="absolute inset-0 flex items-center justify-center group"
            >
              <span className="h-14 w-14 rounded-full bg-black/40 border border-white/10 flex items-center justify-center group-hover:bg-black/60 transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100">
                {isPlaying ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white ml-0.5" />}
              </span>
            </button>
          )}
        </div>
        <p className="text-xs text-stone-600 mt-3 text-center max-w-sm">
          {caption}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Assets pane
--------------------------------------------------------------- */

const MAX_UPLOAD_BYTES = 19 * 1024 * 1024; // 19MB, matches the copy in the dialog
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

function AssetsPane({ assets, setAssets, onLog }) {
  const [selected, setSelected] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { setSelected([]); }, [assets]);

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const deleteSelected = () => {
    setAssets(prev => prev.filter(a => !selected.includes(a.id)));
    setSelected([]);
  };

  // Turns a real File object into an asset entry with a real,
  // previewable object URL. No canned name/gradient — name and
  // type come straight off the file the user actually picked.
  const addFile = (file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`${file.name} is over 19MB — pick a smaller file.`);
      return;
    }
    const url = URL.createObjectURL(file);
    const isImage = file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
    const asset = { id: Date.now() + Math.random(), name: file.name, url, isImage, sizeBytes: file.size };
    setAssets(prev => [...prev, asset]);
    onLog?.(`Uploaded ${file.name} to assets`);
    setUploadError(null);
    setShowUpload(false);
  };

  const addFromUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    let name;
    try {
      name = decodeURIComponent(new URL(trimmed).pathname.split('/').pop() || trimmed);
    } catch {
      setUploadError('That doesn\'t look like a valid URL.');
      return;
    }
    const isImage = IMAGE_EXT_RE.test(name) || IMAGE_EXT_RE.test(trimmed);
    setAssets(prev => [...prev, { id: Date.now() + Math.random(), name, url: trimmed, isImage }]);
    onLog?.(`Added ${name} from URL to assets`);
    setUrlInput('');
    setUploadError(null);
    setShowUpload(false);
  };

  const handleFileInputChange = (e) => {
    Array.from(e.target.files || []).forEach(addFile);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    Array.from(e.dataTransfer.files || []).forEach(addFile);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="h-11 border-b border-stone-800 flex items-center gap-2 px-3 shrink-0">
        <div className="flex items-center gap-1.5 text-stone-500 text-sm flex-1 max-w-xs bg-stone-900 border border-stone-800 rounded-md px-2 py-1">
          <Search size={13} />
          <span className="text-stone-600">Search assets…</span>
        </div>
        <div className="flex-1" />
        {selected.length > 0 && (
          <>
            <span className="text-xs text-stone-500 mr-1">{selected.length} selected</span>
            <button
              onClick={deleteSelected}
              className="text-xs px-2.5 py-1.5 rounded-md border border-red-900/60 text-red-400 hover:bg-red-950/40"
            >
              Delete
            </button>
          </>
        )}
        <button
          onClick={() => setShowUpload(true)}
          className="text-xs px-2.5 py-1.5 rounded-md border border-stone-700 text-stone-300 hover:bg-stone-800 flex items-center gap-1.5"
        >
          <Upload size={13} /> Upload
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {assets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-stone-600 gap-2">
            <ImageIcon size={28} strokeWidth={1.5} />
            <p className="text-sm">No assets yet.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="text-xs text-amber-400 underline underline-offset-2"
            >
              Upload your first file
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {assets.map(a => {
              const isSel = selected.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleSelect(a.id)}
                  className={`text-left rounded-lg border overflow-hidden transition-all ${isSel ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-stone-800 hover:border-stone-700'}`}
                >
                  <div className="aspect-square bg-stone-900 relative flex items-center justify-center overflow-hidden">
                    {a.isImage && a.url ? (
                      <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={22} className="text-stone-600" />
                    )}
                    {isSel && (
                      <span className="absolute top-1.5 left-1.5 h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center">
                        <CheckCircle2 size={12} className="text-stone-950" />
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5 bg-stone-900 text-[11px] text-stone-400 truncate" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {a.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showUpload && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30 p-6">
          <div className="bg-stone-900 border border-stone-800 rounded-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-stone-100" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Add art</h3>
              <button onClick={() => { setShowUpload(false); setUploadError(null); }} className="text-stone-500 hover:text-stone-200">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-3">Paste a URL, or drop a file under 19MB.</p>
            <div className="flex gap-2 mb-3">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addFromUrl(); }}
                placeholder="Enter URL here…"
                className="flex-1 bg-stone-950 border border-stone-800 rounded-md px-2.5 py-1.5 text-sm text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-500/50"
              />
              <button onClick={addFromUrl} className="text-xs px-3 py-1.5 rounded-md bg-stone-800 text-stone-300 hover:bg-stone-700">Add</button>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-lg py-6 text-center cursor-pointer transition-colors ${
                dragActive ? 'border-amber-500 bg-amber-500/5' : 'border-stone-700 hover:border-amber-500/40'
              }`}
            >
              <p className="text-sm text-stone-400">Drag and drop, or</p>
              <p className="text-sm text-amber-400 underline">browse for art</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
            {uploadError && (
              <p className="text-xs text-red-400 mt-3 flex items-center gap-1.5">
                <AlertTriangle size={12} /> {uploadError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Code pane — reads whichever project is active
--------------------------------------------------------------- */

function CodePane({ project, projectFiles, lastTouchedFile }) {
  const files = projectFiles.files;
  const contents = projectFiles.contents;
  const [selected, setSelected] = useState(files[0]);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => { setSelected(files[0]); }, [project.id]);

  // Jump to whichever file Ember just wrote, so the user can see
  // the real diff land instead of having to hunt for it.
  useEffect(() => {
    if (lastTouchedFile && files.includes(lastTouchedFile)) {
      setSelected(lastTouchedFile);
    }
  }, [lastTouchedFile]);

  const handleCheckpoint = () => {
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 1800);
  };

  const handleExport = () => {
    const blob = new Blob([contents[selected] || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selected;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = (contents[selected] || '').split('\n');

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-48 border-r border-stone-800 overflow-y-auto py-2 shrink-0">
        {files.map(f => (
          <button
            key={f}
            onClick={() => setSelected(f)}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 border-l-2 transition-colors ${
              selected === f
                ? 'border-amber-500 bg-stone-900 text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-300 hover:bg-stone-900/50'
            }`}
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12.5px' }}
          >
            <FileCode2 size={13} className="shrink-0" />
            <span className="truncate">{f}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-11 border-b border-stone-800 flex items-center justify-between px-3 shrink-0">
          <span className="text-xs text-stone-500" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{selected}</span>
          <div className="flex items-center gap-2">
            {savedNote && <span className="text-xs text-emerald-400">Checkpoint saved</span>}
            <button onClick={handleCheckpoint} className="text-xs px-2.5 py-1 rounded-md border border-stone-700 text-stone-400 hover:bg-stone-800">
              Checkpoint
            </button>
            <button onClick={handleExport} className="text-xs px-2.5 py-1 rounded-md border border-stone-700 text-stone-400 hover:bg-stone-800 flex items-center gap-1.5">
              <Download size={12} /> Export
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', lineHeight: '1.6' }}>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="w-8 text-right pr-4 text-stone-700 select-none shrink-0">{i + 1}</span>
              <span className="whitespace-pre text-stone-200">{highlightLine(line, `l${i}`)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Chat panel
--------------------------------------------------------------- */

function ChatPanel({ project, messages, input, setInput, onSend, isGenerating, onClose }) {
  const scrollRef = useRef(null);
  const starters = STARTER_PROMPTS[project.type];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="h-full flex flex-col bg-stone-950">
      <div className="h-14 border-b border-stone-800 flex items-center justify-between px-3.5 shrink-0">
        <div className="flex items-center gap-2">
          <EmberAvatar size={26} />
          <div>
            <div className="text-sm font-medium text-stone-100 leading-none">Ember</div>
            <div className="text-[11px] text-emerald-400 leading-none mt-0.5">online</div>
          </div>
        </div>
        <button onClick={onClose} className="md:hidden text-stone-500 hover:text-stone-200">
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-stone-400 mb-3">Tell Ember what to build and it'll scaffold a playable {project.type} game.</p>
            <div className="flex flex-wrap gap-1.5">
              {starters.map(p => (
                <button
                  key={p}
                  onClick={() => onSend(p)}
                  className="text-xs px-2.5 py-1.5 rounded-full border border-stone-800 text-stone-400 hover:border-amber-500/40 hover:text-amber-300 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => {
          if (m.role === 'system') {
            // System notes (e.g. an asset upload) get a plain,
            // centered log line rather than a chat bubble.
            return (
              <div key={m.id} className="text-center text-[11px] text-stone-600" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                {m.text}
              </div>
            );
          }
          return (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-2'}>
              {m.role === 'assistant' && <EmberAvatar size={22} />}
              <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'flex-1'}`}>
                {m.role === 'user' ? (
                  <div className="bg-stone-800 rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-stone-100">
                    {m.text}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {m.steps && <WorkLogCard steps={m.steps} revealCount={m.revealCount} done={!!m.text} />}
                    {m.text && (
                      <div className="bg-stone-900 border border-stone-800 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-stone-300">
                        {m.text}
                      </div>
                    )}
                    {m.suggestion && (
                      <button
                        onClick={() => onSend(m.suggestion)}
                        className="text-xs px-3 py-1.5 rounded-full border border-amber-600/40 text-amber-400 hover:bg-amber-500/10 flex items-center gap-1.5"
                      >
                        {m.suggestion}
                        <ArrowUp size={12} className="rotate-45" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-stone-800 p-3 shrink-0">
        <div className="flex items-end gap-2 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 focus-within:border-amber-500/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            rows={1}
            placeholder="Ask Ember… or drag, drop, or paste an image"
            className="flex-1 bg-transparent text-sm text-stone-200 placeholder-stone-600 resize-none focus:outline-none max-h-24"
          />
          <button
            onClick={() => onSend()}
            disabled={isGenerating || !input.trim()}
            className="h-7 w-7 rounded-full bg-amber-500 disabled:bg-stone-700 disabled:text-stone-500 text-stone-950 flex items-center justify-center shrink-0 transition-colors"
          >
            <ArrowUp size={14} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-0.5">
          <button className="text-[11px] px-2 py-1 rounded-md border border-stone-800 text-stone-500 flex items-center gap-1">
            ember <ChevronDown size={11} />
          </button>
          <div className="flex items-center gap-2.5 text-stone-600">
            <Paperclip size={14} className="hover:text-stone-300 cursor-pointer transition-colors" />
            <Camera size={14} className="hover:text-stone-300 cursor-pointer transition-colors" />
            <Wand2 size={14} className="hover:text-stone-300 cursor-pointer transition-colors" />
            <History size={14} className="hover:text-stone-300 cursor-pointer transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   App shell
--------------------------------------------------------------- */

export default function KilnApp() {
  const [activeTab, setActiveTab] = useState('preview');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [assetsByProject, setAssetsByProject] = useState(PROJECT_ASSETS);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [chatOpenMobile, setChatOpenMobile] = useState(false);
  // Project files are the source of truth for both the Code tab and the
  // live preview. Keep them in local storage so a build survives reloads.
  const [filesByProject, setFilesByProject] = useState(loadProjectFiles);
  const [lastBuildError, setLastBuildError] = useState(null);
  const [lastTouchedFile, setLastTouchedFile] = useState(null);

  useEffect(() => {
    window.localStorage.setItem('kiln-project-files-v1', JSON.stringify(filesByProject));
  }, [filesByProject]);

  const project = useMemo(() => PROJECTS.find(p => p.id === projectId), [projectId]);
  const assets = assetsByProject[projectId];
  const setAssets = useCallback((updater) => {
    setAssetsByProject(prev => ({
      ...prev,
      [projectId]: typeof updater === 'function' ? updater(prev[projectId]) : updater,
    }));
  }, [projectId]);
  const projectFiles = filesByProject[projectId];

  // Switching projects clears in-flight chat state so a 2D work log
  // doesn't linger while looking at a 3D project, and vice versa.
  useEffect(() => {
    setMessages([]);
    setIsGenerating(false);
    setLastBuildError(null);
    setLastTouchedFile(null);
  }, [projectId]);

  const runAssistantResponse = useCallback(async (currentProject, userPrompt) => {
    setIsGenerating(true);
    setLastBuildError(null);
    const id = `a-${Date.now()}`;
    const currentFiles = filesByProject[currentProject.id];

    // Step 1 of the real work log: what Ember actually has open.
    // This is the true file list for this project, not a placeholder.
    const steps = [`Read ${currentFiles.files.length} files: ${currentFiles.files.join(', ')}`];
    setMessages(prev => [...prev, { id, role: 'assistant', steps: [...steps], revealCount: 1, text: null, suggestion: null }]);

    const bump = (label) => {
      steps.push(label);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, steps: [...steps], revealCount: steps.length } : m));
    };
    const pace = () => new Promise(resolve => setTimeout(resolve, 260));

    let replyText;
    let suggestion = null;
    let touchedFile = null;

    try {
      await pace();

      bump('Asking Ember to generate a playable game definition');
      await pace();

      const response = await fetch(ASSISTANT_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'build',
          prompt: userPrompt,
          project: { name: currentProject.name, type: currentProject.type },
          currentGame: parseGameSpec(currentFiles, currentProject.name),
          files: currentFiles.files,
          temperature: 0.45,
          maxTokens: 3000,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Build service responded with status ${response.status}`);
      }
      const data = await response.json();

      const generatedFiles = Array.isArray(data.files) ? data.files : [];
      if (!generatedFiles.length || !data.game) {
        throw new Error('Ember did not return an applicable game change.');
      }
      bump(`Validated ${generatedFiles.map(file => file.path).join(', ')}`);
      await pace();

      const nextContents = { ...currentFiles.contents };
      const editsMade = [];
      for (const file of generatedFiles) {
        if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
          throw new Error('Ember returned a malformed file change.');
        }
        if (!currentFiles.files.includes(file.path)) {
          throw new Error(`Ember returned an unknown project file: ${file.path}`);
        }
        if (file.content.length > 100_000) {
          throw new Error(`Ember returned an oversized file: ${file.path}`);
        }
        if (file.path === 'game.json') {
          try {
            JSON.parse(file.content);
          } catch {
            throw new Error(`Ember returned invalid JSON for ${file.path}.`);
          }
        }
        nextContents[file.path] = file.content;
        editsMade.push(file.path);
      }

      setFilesByProject(prev => ({
        ...prev,
        [currentProject.id]: { ...prev[currentProject.id], contents: nextContents },
      }));
      touchedFile = editsMade[0];
      bump(`Applied ${[...new Set(editsMade)].join(', ')}`);
      await pace();
      bump('Reloaded the live preview from the saved game definition');

      const suggestionList = SUGGESTIONS[currentProject.type] || [];
      suggestion = suggestionList[Math.floor(Math.random() * suggestionList.length)] || null;
      replyText = data.summary?.trim() || data.reply?.trim() || `Built ${data.game.title}.`;
    } catch (err) {
      bump(`Error: ${err.message}`);
      replyText = `Ember hit a snag: ${err.message}`;
      setLastBuildError(err.message);
    }

    setMessages(prev => prev.map(m => m.id === id
      ? { ...m, text: replyText, suggestion }
      : m
    ));
    if (touchedFile) setLastTouchedFile(touchedFile);
    setIsGenerating(false);
  }, [filesByProject]);

  const handleSend = useCallback((text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isGenerating) return;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setInput('');
    setChatOpenMobile(true);
    runAssistantResponse(project, trimmed);
  }, [input, isGenerating, runAssistantResponse, project]);

  const handleAssetLog = useCallback((label) => {
    setMessages(prev => {
      // Assets uploads don't need a full assistant turn — just a
      // lightweight system note so there's still a visible record
      // of what changed, consistent with "log exactly what it did".
      return [...prev, { id: `sys-${Date.now()}`, role: 'system', text: label }];
    });
  }, []);

  const tabs = [
    { id: 'preview', label: 'Preview', icon: Play },
    { id: 'assets', label: 'Assets', icon: ImageIcon },
    { id: 'code', label: 'Code', icon: Code2 },
  ];

  return (
    <div className="w-full h-full min-h-0 bg-[#0b090d] text-stone-200 flex flex-col overflow-hidden border border-amber-900/50 shadow-[0_0_45px_rgba(245,158,11,0.08)] relative">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Top bar */}
      <div className="h-20 border-b border-amber-900/40 bg-[#0b090d] flex items-center justify-between px-5 shrink-0" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setChatOpenMobile(true)} className="md:hidden text-stone-400">
            <Menu size={18} />
          </button>
          <Logo size={24} />
          <span className="font-semibold text-stone-100 hidden sm:inline" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Kiln</span>
          <div className="relative">
            <button
              onClick={() => setProjectOpen(o => !o)}
              className="flex items-center gap-2 text-sm text-stone-100 bg-amber-500/5 border border-amber-600/60 rounded-lg px-3 py-2 hover:border-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              {project.name}
              <TypeBadge type={project.type} />
              <ChevronDown size={13} className="text-stone-500" />
            </button>
            {projectOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-stone-900 border border-stone-800 rounded-lg overflow-hidden shadow-xl z-40">
                {PROJECTS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setProjectId(p.id); setProjectOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-800 flex items-center justify-between ${p.id === projectId ? 'text-amber-400' : 'text-stone-300'}`}
                  >
                    {p.name}
                    <TypeBadge type={p.type} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="hidden sm:flex items-center gap-1 text-xs text-stone-400 bg-stone-900 border border-stone-800 rounded-full px-2.5 py-1"
          >
            <Zap size={12} className="text-amber-400" />
            Groq AI
          </div>
          <button className="hidden sm:flex text-sm px-3 py-1.5 rounded-md border border-stone-700 text-stone-300 hover:bg-stone-800 items-center gap-1.5">
            <Share2 size={14} /> Share
          </button>
          <button className="text-sm px-3 py-1.5 rounded-md bg-amber-500 text-stone-950 font-medium hover:bg-amber-400">
            Publish
          </button>
          <button className="h-8 w-8 rounded-full bg-stone-800 flex items-center justify-center text-stone-400">
            <User size={15} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="absolute top-20 right-0 z-20 w-1/2 h-20 border-b border-amber-900/40 flex shrink-0" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 text-sm uppercase tracking-wider border-t-2 transition-colors ${
                active ? 'border-amber-400 bg-amber-500/10 text-stone-50' : 'border-transparent text-stone-500 hover:text-stone-300 hover:bg-stone-900/60'
              }`}
            >
              <Icon size={18} /> <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Chat: drawer on mobile, static column on md+ */}
        <div
          className={`absolute inset-y-0 left-0 z-30 w-[85%] max-w-sm border-r border-amber-900/40 transition-transform duration-300 md:translate-x-0 md:relative md:-top-20 md:h-[calc(100%+5rem)] md:w-1/2 md:max-w-none md:shrink-0 ${
            chatOpenMobile ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <ChatPanel
            project={project}
            messages={messages}
            input={input}
            setInput={setInput}
            onSend={handleSend}
            isGenerating={isGenerating}
            onClose={() => setChatOpenMobile(false)}
          />
        </div>
        {chatOpenMobile && (
          <div className="absolute inset-0 bg-black/50 z-20 md:hidden" onClick={() => setChatOpenMobile(false)} />
        )}

        <div className="flex-1 min-w-0 flex min-h-0 pt-20" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          {activeTab === 'preview' && <PreviewPane project={project} projectFiles={projectFiles} buildError={lastBuildError} />}
          {activeTab === 'assets' && <AssetsPane assets={assets} setAssets={setAssets} onLog={handleAssetLog} />}
          {activeTab === 'code' && <CodePane project={project} projectFiles={projectFiles} lastTouchedFile={lastTouchedFile} />}
        </div>
      </div>

      {/* Mobile chat toggle */}
      {!chatOpenMobile && (
        <button
          onClick={() => setChatOpenMobile(true)}
          className="md:hidden absolute bottom-4 left-4 h-11 w-11 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center shadow-lg z-10"
        >
          <MessageSquare size={18} />
        </button>
      )}
    </div>
  );
}