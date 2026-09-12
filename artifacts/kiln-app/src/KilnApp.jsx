import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import {
  Paperclip, Camera, History, ArrowUp, Sparkles, Play, Pause,
  Maximize2, Smartphone, Monitor, Code2, Image as ImageIcon,
  Upload, Search, CheckCircle2, AlertTriangle,
  ChevronDown, X, Menu, Wand2, Share2, Zap, User, FileCode2,
  RotateCw, Download, MessageSquare, ExternalLink, Trophy, Skull
} from 'lucide-react';
import { CodeSandbox } from './components/code-sandbox.tsx';

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
const MODELS_API_PATH = '/api/assistant/models';
const PUBLISH_API_PATH = '/api/publish';
// Fallback shown before the real list loads from /api/assistant/models —
// mirrors the server's own PREFERRED_MODELS order so the "best" pick matches.
const FALLBACK_MODELS = [
  { id: 'openai/gpt-oss-20b', best: true },
  { id: 'openai/gpt-oss-120b', best: false },
  { id: 'llama-3.3-70b-versatile', best: false },
  { id: 'llama-3.1-8b-instant', best: false },
];
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
    files: ['engine.js', 'player.js', 'level.js', 'config.js', 'README.md', 'game.json', 'game.js'],
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
    files: ['maze.js', 'player.js', 'config.js', 'README.md', 'game.json', 'game.js'],
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

function slugifyPreview(name) {
  return (name || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'game';
}

function formatRelativeTime(isoOrTimestamp) {
  const then = typeof isoOrTimestamp === 'number' ? isoOrTimestamp : new Date(isoOrTimestamp).getTime();
  if (Number.isNaN(then)) return '';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSeconds < 60) return 'less than a minute ago';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `about ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function formatMetricSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number < 1 ? number.toFixed(3) : number.toFixed(2)}s`;
}

function formatMetricCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : '—';
}

function GroqMetricsCard({ metrics }) {
  if (!metrics) return null;
  const limits = metrics.rateLimits || {};
  const hasLimits = Object.values(limits).some(Boolean);
  return (
    <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 overflow-hidden">
      <div className="px-3 py-2 border-b border-amber-900/30 text-xs font-medium text-amber-300 flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <Zap size={13} />
        Groq telemetry
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 text-[11px] text-stone-400" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <span>Prompt tokens <strong className="text-stone-200">{formatMetricCount(metrics.promptTokens)}</strong></span>
        <span>Output tokens <strong className="text-stone-200">{formatMetricCount(metrics.completionTokens)}</strong></span>
        <span>Total tokens <strong className="text-stone-200">{formatMetricCount(metrics.totalTokens)}</strong></span>
        <span>Generation <strong className="text-stone-200">{formatMetricCount(metrics.tokensPerSecond)} t/s</strong></span>
        <span>Server time <strong className="text-stone-200">{formatMetricSeconds(metrics.totalTime)}</strong></span>
        <span>Round trip <strong className="text-stone-200">{formatMetricSeconds(metrics.clientElapsedTime)}</strong></span>
      </div>
      {hasLimits && (
        <div className="border-t border-amber-900/30 px-3 py-2 text-[11px] text-stone-500 space-y-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          <div className="text-stone-400">Current Groq rate limits</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>Requests left: <strong className="text-stone-300">{limits.remainingRequests || '—'}</strong></span>
            <span>Tokens left: <strong className="text-stone-300">{limits.remainingTokens || '—'}</strong></span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>Token reset: <strong className="text-stone-300">{limits.resetTokens || '—'}</strong></span>
            <span>Request reset: <strong className="text-stone-300">{limits.resetRequests || '—'}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
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

function Modal({ title, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24 px-4" onClick={onClose}>
      <div
        className={`w-full ${width} bg-stone-950 border border-stone-800 rounded-xl shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-semibold text-stone-100">{title}</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-200">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 pt-3">{children}</div>
      </div>
    </div>
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
      // Only handle keys for gameplay when the player isn't typing
      // somewhere else on the page (e.g. the Ember prompt box). Without
      // this check, this global window listener swallows every space
      // and arrow key press anywhere in the app, including inside text
      // inputs — which is exactly what made the prompt box unable to
      // type spaces.
      const target = event.target;
      const isTypingTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTypingTarget) return;
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

function WinLoseOverlay({ outcome, onPlayAgain }) {
  const isWin = outcome === 'win';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm text-center px-6 z-10">
      {isWin
        ? <Trophy size={40} strokeWidth={1.8} className="text-amber-400 mb-4" />
        : <Skull size={40} strokeWidth={1.8} className="text-stone-400 mb-4" />}
      <p
        className={`text-xl md:text-2xl mb-5 ${isWin ? 'text-amber-300' : 'text-stone-200'}`}
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {isWin ? 'You win!' : 'Game over'}
      </p>
      <button
        onClick={onPlayAgain}
        className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:border-amber-500/60 hover:text-amber-300 transition-colors flex items-center gap-2"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        <RotateCw size={14} /> Play again
      </button>
    </div>
  );
}

function PreviewPane({ project, projectFiles, assets, buildError, previewBoxRef }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [device, setDevice] = useState('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // Local error state, but it is only ever set by a real failure:
  // either a build error bubbled up from KilnApp (a failed
  // generation) or a runtime failure thrown by Preview3D/CodeSandbox
  // itself (e.g. WebGL unavailable, or a generated-code crash). There
  // is no manual toggle for this.
  const [renderError, setRenderError] = useState(null);
  const [outcome, setOutcome] = useState(null); // null | 'win' | 'lose', code-mode only
  const [restartNonce, setRestartNonce] = useState(0);
  const is3D = project.type === '3D';
  const gameSpec = useMemo(
    () => parseGameSpec(projectFiles, project.name),
    [projectFiles, project.name],
  );
  // A project is in "real code" mode purely based on whether it has
  // real game.js content - not a request-time toggle (see codeMode in
  // KilnApp), so the preview always reflects the files that actually
  // exist rather than a setting that could drift out of sync with them.
  const codeContent = projectFiles.contents['game.js'];
  const hasCode = !is3D && typeof codeContent === 'string' && codeContent.trim().length > 0;

  useEffect(() => { setRenderError(null); setOutcome(null); }, [project.id]);
  useEffect(() => { setOutcome(null); }, [codeContent]);

  const activeError = buildError || renderError;

  const caption = activeError
    ? `Build error: ${activeError}`
    : hasCode
    ? 'Live runtime — running real game.js in a sandboxed iframe.'
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
          <button
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else previewBoxRef?.current?.requestFullscreen?.();
            }}
            className={`p-1.5 rounded transition-colors ${isFullscreen ? 'bg-amber-500/15 text-amber-400' : 'hover:bg-stone-800 hover:text-stone-200'}`}
            title="Toggle fullscreen"
          >
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
          ref={previewBoxRef}
          className={`relative rounded-xl overflow-hidden border border-stone-800 bg-black shadow-2xl transition-all duration-300 ${
            isFullscreen ? 'w-screen h-screen max-w-none aspect-auto' :
            device === 'desktop' ? 'w-full max-w-3xl aspect-video' : 'w-full max-w-[300px] aspect-[9/16]'
          }`}
        >
          {activeError ? (
            <UnavailablePreview message={activeError} onRetry={() => setRenderError(null)} />
          ) : hasCode ? (
            <CodeSandbox
              code={codeContent}
              assets={assets}
              restartSignal={restartNonce}
              running={isPlaying}
              onError={setRenderError}
              onWin={() => setOutcome('win')}
              onLose={() => setOutcome('lose')}
            />
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
          {outcome && (
            <WinLoseOverlay
              outcome={outcome}
              onPlayAgain={() => { setOutcome(null); setRestartNonce(n => n + 1); }}
            />
          )}
          {!activeError && !outcome && (
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

function CleanContextModal({ onCancel, onConfirm }) {
  return (
    <Modal title="Clean up chat context?" onClose={onCancel}>
      <p className="text-sm text-stone-400">Start a fresh chat context for future edits.</p>
      <p className="text-sm text-stone-400 mt-3">
        Your project files and version history stay unchanged. This helps Ember focus on the
        current project state instead of earlier chat messages.
      </p>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onCancel}
          className="text-sm px-3.5 py-2 rounded-md border border-stone-700 text-stone-300 hover:bg-stone-800"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="text-sm px-3.5 py-2 rounded-md bg-red-500/90 hover:bg-red-500 text-white flex items-center gap-1.5"
        >
          <Wand2 size={14} /> Clean Context
        </button>
      </div>
    </Modal>
  );
}

function VersionHistoryModal({ versions, onClose, onRestore }) {
  return (
    <Modal title="Version History" onClose={onClose} width="max-w-lg">
      <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-3">
        {versions.length === 0 && (
          <p className="text-sm text-stone-500">No edits yet — versions show up here once Ember applies a change.</p>
        )}
        {versions.map((v, i) => (
          <div
            key={v.id}
            className={`rounded-lg border px-3.5 py-3 ${i === 0 ? 'border-amber-500/50 bg-amber-500/5' : 'border-stone-800'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm text-stone-200">{v.label}</div>
              {i === 0 && (
                <span className="text-[10px] uppercase tracking-wide text-amber-400 border border-amber-500/40 rounded-full px-2 py-0.5 shrink-0">
                  Current
                </span>
              )}
            </div>
            <div className="text-xs text-stone-500 mt-1">{formatRelativeTime(v.timestamp)}</div>
            {i !== 0 && (
              <button
                onClick={() => onRestore(v)}
                className="mt-2 text-xs px-2.5 py-1 rounded-md border border-stone-700 text-stone-300 hover:bg-stone-800"
              >
                Restore this version
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ModelMenu({ models, selectedModel, onSelect, onClose }) {
  return (
    <div className="absolute bottom-full left-0 mb-2 w-56 bg-stone-900 border border-stone-800 rounded-lg shadow-2xl overflow-hidden z-40">
      {models.map((m) => (
        <button
          key={m.id}
          onClick={() => { onSelect(m.id); onClose(); }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-stone-800 ${
            m.id === selectedModel ? 'text-amber-400' : 'text-stone-300'
          }`}
        >
          <span className="truncate">{m.id}</span>
          {m.best && (
            <span className="text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 shrink-0">
              Best
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ShareModal({ onClose, publishInfo, onPublish, isPublishing }) {
  const shareUrl = publishInfo ? `${window.location.origin}/play/${publishInfo.slug}` : null;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked (permissions, non-secure context);
      // the link is still visible and selectable in the input either way.
    }
  };

  if (!publishInfo) {
    return (
      <Modal title="Share" onClose={onClose}>
        <p className="text-sm text-stone-400">Publish your project first to get a shareable link.</p>
        <button
          onClick={onPublish}
          disabled={isPublishing}
          className="mt-4 w-full text-sm px-3.5 py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-500 text-stone-950 font-medium flex items-center justify-center gap-1.5"
        >
          🚀 {isPublishing ? 'Publishing…' : 'Publish'}
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="Share" onClose={onClose}>
      <div className="text-xs uppercase tracking-wide text-stone-500 mb-1.5">Share link</div>
      <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 rounded-md px-3 py-2">
        <span className="flex-1 text-sm text-stone-300 truncate">{shareUrl}</span>
        <button onClick={() => window.open(shareUrl, '_blank', 'noopener')} title="Open" className="text-stone-500 hover:text-stone-200 shrink-0">
          <ExternalLink size={15} />
        </button>
        <button onClick={copyLink} title="Copy link" className="text-stone-500 hover:text-stone-200 shrink-0">
          {copied ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Share2 size={15} />}
        </button>
      </div>
      <p className="text-xs text-stone-500 mt-2">
        Anyone with this link can play it while this server stays running. There's no accounts or
        hosting system behind this yet, so the link won't survive a server restart.
      </p>
    </Modal>
  );
}

function PublishModal({ onClose, project, publishInfo, onPublish, isPublishing, buildError }) {
  const previewSlug = publishInfo?.slug ?? slugifyPreview(project.name);
  const previewUrl = `${window.location.origin}/play/${previewSlug}`;

  return (
    <Modal title="Publish" onClose={onClose}>
      <div className="flex items-center gap-1.5 text-sm text-stone-300">
        <span className={`h-2 w-2 rounded-full ${publishInfo ? 'bg-emerald-400' : 'bg-stone-600'}`} />
        {publishInfo ? `Live · ${formatRelativeTime(publishInfo.publishedAt)}` : 'Not published'}
      </div>

      {!publishInfo && (
        <p className="text-xs text-stone-500 mt-3 mb-1">Your game URL will be:</p>
      )}
      {!publishInfo && <p className="text-sm text-stone-400 break-all mb-4">{previewUrl}</p>}

      {buildError ? (
        <button
          disabled
          className="w-full text-sm px-3.5 py-2.5 rounded-md border border-stone-700 text-stone-500 flex items-center justify-center gap-1.5 cursor-not-allowed"
          title={buildError}
        >
          🚀 Errors Detected
        </button>
      ) : (
        <button
          onClick={onPublish}
          disabled={isPublishing}
          className="w-full text-sm px-3.5 py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-500 text-stone-950 font-medium flex items-center justify-center gap-1.5"
        >
          🚀 {isPublishing ? 'Publishing…' : publishInfo ? 'Publish update' : 'Publish'}
        </button>
      )}

      {publishInfo && (
        <button
          onClick={() => window.open(previewUrl, '_blank', 'noopener')}
          className="w-full mt-2 text-sm px-3.5 py-2.5 rounded-md border border-stone-700 text-stone-300 hover:bg-stone-800 flex items-center justify-center gap-1.5"
        >
          <Share2 size={14} /> Share
        </button>
      )}
    </Modal>
  );
}

function AvatarMenu({ onClose, sessionUsage, onOpenProjects }) {
  return (
    <div className="absolute top-full right-0 mt-2 w-64 bg-stone-900 border border-stone-800 rounded-lg shadow-2xl overflow-hidden z-40 text-sm">
      <div className="px-4 py-3 border-b border-stone-800 space-y-1.5">
        <div className="flex items-center gap-1.5 text-stone-300">
          <Zap size={13} className="text-amber-400" />
          {sessionUsage.requests} request{sessionUsage.requests === 1 ? '' : 's'} this session
        </div>
        <div className="flex items-center gap-1.5 text-stone-500 text-xs">
          {formatMetricCount(sessionUsage.totalTokens)} total Groq tokens used
        </div>
      </div>
      <button
        onClick={() => { onOpenProjects(); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-stone-300 hover:bg-stone-800 flex items-center gap-2"
      >
        <FileCode2 size={14} /> My Projects
      </button>
    </div>
  );
}

function ChatPanel({
  project, messages, input, setInput, onSend, isGenerating, onClose,
  pendingAttachment, onPickFile, onScreenshot, onRemoveAttachment,
  models, selectedModel, onSelectModel, onOpenClean, onOpenHistory,
  codeMode, onToggleCodeMode,
}) {
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
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
                    {m.attachment && (
                      <img src={m.attachment} alt="Attached" className="rounded-lg mb-1.5 max-h-32 object-cover" />
                    )}
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
                    {m.metrics && <GroqMetricsCard metrics={m.metrics} />}
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
        {pendingAttachment && (
          <div className="relative inline-block mb-2">
            <img
              src={pendingAttachment}
              alt="Attached"
              className="h-16 w-16 object-cover rounded-lg border border-stone-800"
            />
            <button
              onClick={onRemoveAttachment}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 border border-stone-700 flex items-center justify-center text-stone-300 hover:text-white"
            >
              <X size={11} />
            </button>
          </div>
        )}
        <div
          className="flex items-end gap-2 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 focus-within:border-amber-500/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) onPickFile(file);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              const item = Array.from(e.clipboardData.items || []).find((i) => i.type.startsWith('image/'));
              const file = item?.getAsFile();
              if (file) onPickFile(file);
            }}
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
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setShowModelMenu((v) => !v)}
                className="text-[11px] px-2 py-1 rounded-md border border-stone-800 text-stone-500 flex items-center gap-1 hover:border-stone-700 hover:text-stone-300"
              >
                {selectedModel} <ChevronDown size={11} />
              </button>
              {showModelMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowModelMenu(false)} />
                  <ModelMenu
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={onSelectModel}
                    onClose={() => setShowModelMenu(false)}
                  />
                </>
              )}
            </div>
            {project.type === '2D' && (
              <button
                onClick={onToggleCodeMode}
                title={codeMode
                  ? 'Ember will write real game.js code for new requests'
                  : 'Ember will fill in the game.json schema for new requests'}
                className={`text-[11px] px-2 py-1 rounded-md border flex items-center gap-1 transition-colors ${
                  codeMode
                    ? 'border-amber-600/60 bg-amber-500/10 text-amber-300'
                    : 'border-stone-800 text-stone-500 hover:border-stone-700 hover:text-stone-300'
                }`}
              >
                <Code2 size={11} /> Code mode {codeMode ? 'on' : 'off'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-stone-600">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPickFile(file);
                e.target.value = '';
              }}
            />
            <Paperclip
              size={14}
              onClick={() => fileInputRef.current?.click()}
              className="hover:text-stone-300 cursor-pointer transition-colors"
            />
            <Camera
              size={14}
              onClick={onScreenshot}
              className="hover:text-stone-300 cursor-pointer transition-colors"
            />
            <Wand2
              size={14}
              onClick={onOpenClean}
              className="hover:text-stone-300 cursor-pointer transition-colors"
            />
            <History
              size={14}
              onClick={onOpenHistory}
              className="hover:text-stone-300 cursor-pointer transition-colors"
            />
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
  const [sessionUsage, setSessionUsage] = useState({ requests: 0, totalTokens: 0 });
  const [assetsByProject, setAssetsByProject] = useState(PROJECT_ASSETS);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [chatOpenMobile, setChatOpenMobile] = useState(false);
  // Project files are the source of truth for both the Code tab and the
  // live preview. Keep them in local storage so a build survives reloads.
  const [filesByProject, setFilesByProject] = useState(loadProjectFiles);
  const [lastBuildError, setLastBuildError] = useState(null);
  const [lastTouchedFile, setLastTouchedFile] = useState(null);
  // Per-project opt-in: when on, new Ember requests ask for real game.js
  // code (see the "code" responseFormat on the server) instead of the
  // fixed game.json schema. The *preview*, separately, always renders
  // whichever one the project actually has real content for - see
  // PreviewPane - so turning this off again doesn't retroactively hide
  // code a project has already adopted.
  const [codeModeByProject, setCodeModeByProject] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('kiln-code-mode-v1') || '{}'); }
    catch { return {}; }
  });

  // New, previously-decorative controls: attachments, model choice,
  // version history, and the share/publish flow.
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState(FALLBACK_MODELS[0].id);
  const [versionsByProject, setVersionsByProject] = useState({});
  const [publishedByProject, setPublishedByProject] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('kiln-published-v1') || '{}'); }
    catch { return {}; }
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const previewBoxRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem('kiln-project-files-v1', JSON.stringify(filesByProject));
  }, [filesByProject]);

  useEffect(() => {
    window.localStorage.setItem('kiln-published-v1', JSON.stringify(publishedByProject));
  }, [publishedByProject]);

  useEffect(() => {
    window.localStorage.setItem('kiln-code-mode-v1', JSON.stringify(codeModeByProject));
  }, [codeModeByProject]);

  useEffect(() => {
    fetch(MODELS_API_PATH)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.models?.length) {
          setModels(data.models);
          setSelectedModel((current) =>
            data.models.some((m) => m.id === current) ? current : data.models[0].id
          );
        }
      })
      .catch(() => {
        // Server may not have GROQ_API_KEY configured yet; fall back list stays.
      });
  }, []);

  const project = useMemo(() => PROJECTS.find(p => p.id === projectId), [projectId]);
  const assets = assetsByProject[projectId];
  const setAssets = useCallback((updater) => {
    setAssetsByProject(prev => ({
      ...prev,
      [projectId]: typeof updater === 'function' ? updater(prev[projectId]) : updater,
    }));
  }, [projectId]);
  const projectFiles = filesByProject[projectId];
  const versions = versionsByProject[projectId] || [];
  const publishInfo = publishedByProject[projectId] || null;
  const codeMode = !!codeModeByProject[projectId];
  const toggleCodeMode = useCallback(() => {
    setCodeModeByProject(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  }, [projectId]);

  // Switching projects clears in-flight chat state so a 2D work log
  // doesn't linger while looking at a 3D project, and vice versa.
  useEffect(() => {
    setMessages([]);
    setIsGenerating(false);
    setLastBuildError(null);
    setLastTouchedFile(null);
    setPendingAttachment(null);
  }, [projectId]);

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const handlePickFile = useCallback(async (file) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessages(prev => [...prev, { id: `s-${Date.now()}`, role: 'system', text: 'That image is too large to attach (8MB max).' }]);
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setPendingAttachment(dataUrl);
  }, []);

  const handleScreenshot = useCallback(() => {
    const canvas = previewBoxRef.current?.querySelector('canvas');
    if (!canvas) return;
    try {
      setPendingAttachment(canvas.toDataURL('image/png'));
    } catch {
      setMessages(prev => [...prev, { id: `s-${Date.now()}`, role: 'system', text: 'Could not capture the preview (canvas is empty or blocked).' }]);
    }
  }, []);

  const handleCleanContext = useCallback(() => {
    setMessages([]);
    setShowCleanModal(false);
  }, []);

  const handleRestoreVersion = useCallback((version) => {
    setFilesByProject(prev => ({
      ...prev,
      [projectId]: { ...prev[projectId], contents: version.contents },
    }));
    setVersionsByProject(prev => ({
      ...prev,
      [projectId]: [
        { id: `v-${Date.now()}`, label: `Restored: ${version.label}`, timestamp: Date.now(), contents: version.contents },
        ...(prev[projectId] || []),
      ],
    }));
    setShowHistoryModal(false);
  }, [projectId]);

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    try {
      const response = await fetch(PUBLISH_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKey: projectId,
          projectName: project.name,
          projectType: project.type,
          files: projectFiles.contents,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Publish failed.');
      setPublishedByProject(prev => ({ ...prev, [projectId]: { slug: data.slug, publishedAt: data.publishedAt } }));
      setShowPublishModal(true);
      setShowShareModal(false);
    } catch (err) {
      setMessages(prev => [...prev, { id: `s-${Date.now()}`, role: 'system', text: `Publish failed: ${err.message}` }]);
    } finally {
      setIsPublishing(false);
    }
  }, [projectId, project, projectFiles]);

  const runAssistantResponse = useCallback(async (currentProject, userPrompt, attachment) => {
    setIsGenerating(true);
    setLastBuildError(null);
    const id = `a-${Date.now()}`;
    const currentFiles = filesByProject[currentProject.id];
    const currentAssets = assetsByProject[currentProject.id] || [];
    // Code mode only applies to 2D projects - the sandbox that actually
    // runs game.js is canvas-only (see code-sandbox.tsx). A 3D project
    // always uses the schema path regardless of the stored toggle value.
    const useCodeMode = currentProject.type === '2D' && !!codeModeByProject[currentProject.id];

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
    let responseMetrics = null;

    try {
      await pace();

      bump(useCodeMode
        ? 'Asking Ember to write real game code'
        : 'Asking Ember to generate a playable game definition');
      await pace();

      const response = await fetch(ASSISTANT_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useCodeMode ? {
          mode: 'build',
          responseFormat: 'code',
          prompt: userPrompt,
          project: { name: currentProject.name, type: currentProject.type },
          currentCode: currentFiles.contents['game.js'] || '',
          assets: currentAssets.map(a => ({ name: a.name, isImage: a.isImage })),
          temperature: 0.45,
          maxTokens: 3000,
          model: selectedModel,
          image: attachment || undefined,
        } : {
          mode: 'build',
          prompt: userPrompt,
          project: { name: currentProject.name, type: currentProject.type },
          currentGame: parseGameSpec(currentFiles, currentProject.name),
          files: currentFiles.files,
          temperature: 0.45,
          maxTokens: 3000,
          model: selectedModel,
          image: attachment || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      responseMetrics = data.metrics || null;
      if (responseMetrics) {
        setSessionUsage(prev => ({
          requests: prev.requests + 1,
          totalTokens: prev.totalTokens + (Number(responseMetrics.totalTokens) || 0),
        }));
      }
      if (!response.ok) {
        throw new Error(data.error || `Build service responded with status ${response.status}`);
      }

      const generatedFiles = Array.isArray(data.files) ? data.files : [];
      if (!generatedFiles.length || (!useCodeMode && !data.game)) {
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
      const editLabel = `Applied ${[...new Set(editsMade)].join(', ')}`;
      setVersionsByProject(prev => ({
        ...prev,
        [currentProject.id]: [
          { id: `v-${Date.now()}`, label: editLabel, timestamp: Date.now(), contents: nextContents },
          ...(prev[currentProject.id] || []),
        ],
      }));
      touchedFile = editsMade[0];
      bump(editLabel);
      await pace();
      bump(useCodeMode ? 'Reloaded the live preview from the updated code' : 'Reloaded the live preview from the saved game definition');

      const suggestionList = SUGGESTIONS[currentProject.type] || [];
      suggestion = suggestionList[Math.floor(Math.random() * suggestionList.length)] || null;
      replyText = data.summary?.trim() || data.reply?.trim() || (useCodeMode ? 'Updated the game code.' : `Built ${data.game.title}.`);
    } catch (err) {
      bump(`Error: ${err.message}`);
      replyText = `Ember hit a snag: ${err.message}`;
      setLastBuildError(err.message);
    }

    setMessages(prev => prev.map(m => m.id === id
      ? { ...m, text: replyText, suggestion, metrics: responseMetrics }
      : m
    ));
    if (touchedFile) setLastTouchedFile(touchedFile);
    setIsGenerating(false);
  }, [filesByProject, assetsByProject, codeModeByProject, selectedModel]);

  const handleSend = useCallback((text) => {
    const trimmed = (text ?? input).trim();
    if ((!trimmed && !pendingAttachment) || isGenerating) return;
    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed || 'Take a look at this image.',
      attachment: pendingAttachment,
    }]);
    setInput('');
    const attachment = pendingAttachment;
    setPendingAttachment(null);
    setChatOpenMobile(true);
    runAssistantResponse(project, trimmed || 'Take a look at this image and suggest an edit.', attachment);
  }, [input, isGenerating, runAssistantResponse, project, pendingAttachment]);

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
            title={`${sessionUsage.requests} monitored Groq request${sessionUsage.requests === 1 ? '' : 's'} this session`}
          >
            <Zap size={12} className="text-amber-400" />
            Groq AI
            {sessionUsage.totalTokens > 0 && (
              <span className="text-stone-500">· {formatMetricCount(sessionUsage.totalTokens)} tokens</span>
            )}
          </div>
          <button
            onClick={() => setShowShareModal(true)}
            className="hidden sm:flex text-sm px-3 py-1.5 rounded-md border border-stone-700 text-stone-300 hover:bg-stone-800 items-center gap-1.5"
          >
            <Share2 size={14} /> Share
          </button>
          <button
            onClick={() => setShowPublishModal(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-amber-500 text-stone-950 font-medium hover:bg-amber-400"
          >
            Publish
          </button>
          <div className="relative">
            <button
              onClick={() => setShowAvatarMenu(v => !v)}
              className="h-8 w-8 rounded-full bg-stone-800 flex items-center justify-center text-stone-400 hover:text-stone-200"
            >
              <User size={15} />
            </button>
            {showAvatarMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowAvatarMenu(false)} />
                <AvatarMenu
                  sessionUsage={sessionUsage}
                  onClose={() => setShowAvatarMenu(false)}
                  onOpenProjects={() => setProjectOpen(true)}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {showCleanModal && (
        <CleanContextModal onCancel={() => setShowCleanModal(false)} onConfirm={handleCleanContext} />
      )}
      {showHistoryModal && (
        <VersionHistoryModal
          versions={versions}
          onClose={() => setShowHistoryModal(false)}
          onRestore={handleRestoreVersion}
        />
      )}
      {showShareModal && (
        <ShareModal
          onClose={() => setShowShareModal(false)}
          publishInfo={publishInfo}
          onPublish={handlePublish}
          isPublishing={isPublishing}
        />
      )}
      {showPublishModal && (
        <PublishModal
          onClose={() => setShowPublishModal(false)}
          project={project}
          publishInfo={publishInfo}
          onPublish={handlePublish}
          isPublishing={isPublishing}
          buildError={lastBuildError}
        />
      )}

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
            pendingAttachment={pendingAttachment}
            onPickFile={handlePickFile}
            onScreenshot={handleScreenshot}
            onRemoveAttachment={() => setPendingAttachment(null)}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            onOpenClean={() => setShowCleanModal(true)}
            onOpenHistory={() => setShowHistoryModal(true)}
            codeMode={codeMode}
            onToggleCodeMode={toggleCodeMode}
          />
        </div>
        {chatOpenMobile && (
          <div className="absolute inset-0 bg-black/50 z-20 md:hidden" onClick={() => setChatOpenMobile(false)} />
        )}

        <div className="flex-1 min-w-0 flex min-h-0 pt-20" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          {activeTab === 'preview' && (
            <PreviewPane project={project} projectFiles={projectFiles} assets={assets} buildError={lastBuildError} previewBoxRef={previewBoxRef} />
          )}
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