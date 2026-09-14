// Bramble Maze — standalone sandbox game implementation.
// The app can copy this into a project's game.js when seeding the maze.

const CELL = 32;
const COLS = 21;
const ROWS = 15;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const PLAYER_SPEED = 150;
const ENEMY_SPEED = 72;

const canvas = Kiln.canvas;
const ctx = Kiln.ctx;
const keys = new Set();
let maze = [];
let walls = [];
let player;
let enemy;
let goal;
let gems = [];
let score = 0;
let outcome = false;
let elapsed = 0;
let previousTime = 0;

function shuffle(values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function index(x, y) { return y * COLS + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }

function generateMaze() {
  const grid = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ n: true, e: true, s: true, w: true, visited: false }))
  );

  function carve(x, y) {
    grid[y][x].visited = true;
    const directions = shuffle([
      [0, -1, 'n', 's'], [1, 0, 'e', 'w'], [0, 1, 's', 'n'], [-1, 0, 'w', 'e'],
    ]);
    for (const [dx, dy, wall, opposite] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny) || grid[ny][nx].visited) continue;
      grid[y][x][wall] = false;
      grid[ny][nx][opposite] = false;
      carve(nx, ny);
    }
  }

  carve(0, 0);
  return grid;
}

function buildWalls() {
  walls = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = maze[y][x];
      const px = x * CELL;
      const py = y * CELL;
      if (cell.n) walls.push({ x: px, y: py, w: CELL, h: 3 });
      if (cell.w) walls.push({ x: px, y: py, w: 3, h: CELL });
      if (cell.e) walls.push({ x: px + CELL - 3, y: py, w: 3, h: CELL });
      if (cell.s) walls.push({ x: px, y: py + CELL - 3, w: CELL, h: 3 });
    }
  }
}

function neighbors(cell) {
  const [x, y] = cell;
  const result = [];
  const current = maze[y][x];
  if (!current.n && y > 0) result.push([x, y - 1]);
  if (!current.e && x < COLS - 1) result.push([x + 1, y]);
  if (!current.s && y < ROWS - 1) result.push([x, y + 1]);
  if (!current.w && x > 0) result.push([x - 1, y]);
  return result;
}

function bfs(start) {
  const queue = [start];
  const distance = new Map([[index(start[0], start[1]), 0]]);
  let farthest = start;
  while (queue.length) {
    const current = queue.shift();
    const d = distance.get(index(current[0], current[1]));
    if (d > distance.get(index(farthest[0], farthest[1]))) farthest = current;
    for (const next of neighbors(current)) {
      const key = index(next[0], next[1]);
      if (distance.has(key)) continue;
      distance.set(key, d + 1);
      queue.push(next);
    }
  }
  return { farthest, distance };
}

function cellCenter(cell) {
  return { x: cell[0] * CELL + CELL / 2, y: cell[1] * CELL + CELL / 2 };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function blocked(nextX, nextY) {
  const box = { x: nextX - 10, y: nextY - 10, w: 20, h: 20 };
  return walls.some(wall => rectsOverlap(box, wall));
}

function moveEntity(entity, dx, dy) {
  const nextX = entity.x + dx;
  if (!blocked(nextX, entity.y)) entity.x = Math.max(10, Math.min(WIDTH - 10, nextX));
  const nextY = entity.y + dy;
  if (!blocked(entity.x, nextY)) entity.y = Math.max(10, Math.min(HEIGHT - 10, nextY));
}

function makeEnemyPath(start, target) {
  const queue = [start];
  const parent = new Map([[index(start[0], start[1]), null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current[0] === target[0] && current[1] === target[1]) break;
    for (const next of neighbors(current)) {
      const key = index(next[0], next[1]);
      if (parent.has(key)) continue;
      parent.set(key, current);
      queue.push(next);
    }
  }
  const path = [];
  let cursor = target;
  while (cursor) {
    path.push(cursor);
    cursor = parent.get(index(cursor[0], cursor[1]));
  }
  return path.reverse();
}

function reset() {
  Kiln.resetOutcome();
  maze = generateMaze();
  buildWalls();
  const result = bfs([0, 0]);
  const goalCell = result.farthest;
  const goalPos = cellCenter(goalCell);
  player = { ...cellCenter([0, 0]), r: 10 };
  goal = { ...goalPos, r: 12 };
  const enemyCell = cellCenter([Math.max(1, Math.floor(COLS / 2)), Math.max(1, Math.floor(ROWS / 2))]);
  enemy = { ...enemyCell, r: 10, path: makeEnemyPath([Math.max(1, Math.floor(COLS / 2)), Math.max(1, Math.floor(ROWS / 2))], goalCell), pathIndex: 0, progress: 0 };
  gems = [];
  const candidates = Array.from(result.distance.keys()).filter(k => k !== 0 && k !== index(goalCell[0], goalCell[1]));
  shuffle(candidates).slice(0, 8).forEach(k => {
    const x = k % COLS;
    const y = Math.floor(k / COLS);
    gems.push({ ...cellCenter([x, y]), r: 6, collected: false });
  });
  score = 0;
  outcome = false;
  elapsed = 0;
  Kiln.setScore(0);
}

function updateEnemy(dt) {
  if (!enemy.path.length) return;
  const targetCell = enemy.path[Math.min(enemy.pathIndex + 1, enemy.path.length - 1)];
  const target = cellCenter(targetCell);
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 2) {
    enemy.pathIndex = (enemy.pathIndex + 1) % enemy.path.length;
    return;
  }
  const amount = Math.min(distance, ENEMY_SPEED * dt);
  enemy.x += (dx / distance) * amount;
  enemy.y += (dy / distance) * amount;
}

function update(dt) {
  if (Kiln.isKeyDown('r')) {
    reset();
    return;
  }
  if (outcome) return;
  elapsed += dt;

  let dx = 0;
  let dy = 0;
  if (Kiln.isKeyDown('arrowleft') || Kiln.isKeyDown('a')) dx -= 1;
  if (Kiln.isKeyDown('arrowright') || Kiln.isKeyDown('d')) dx += 1;
  if (Kiln.isKeyDown('arrowup') || Kiln.isKeyDown('w')) dy -= 1;
  if (Kiln.isKeyDown('arrowdown') || Kiln.isKeyDown('s')) dy += 1;
  const length = Math.hypot(dx, dy) || 1;
  moveEntity(player, (dx / length) * PLAYER_SPEED * dt, (dy / length) * PLAYER_SPEED * dt);
  updateEnemy(dt);

  for (const gem of gems) {
    if (!gem.collected && Math.hypot(player.x - gem.x, player.y - gem.y) < 18) {
      gem.collected = true;
      score += 10;
      Kiln.setScore(score);
    }
  }

  if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < 18) {
    outcome = true;
    Kiln.lose();
    return;
  }
  if (Math.hypot(player.x - goal.x, player.y - goal.y) < 22) {
    outcome = true;
    score += Math.max(0, 100 - Math.floor(elapsed));
    Kiln.setScore(score);
    Kiln.win();
  }
}

function draw() {
  const width = Kiln.width;
  const height = Kiln.height;
  const scale = Math.min(width / WIDTH, height / HEIGHT);
  const ox = (width - WIDTH * scale) / 2;
  const oy = (height - HEIGHT * scale) / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#070b08';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#111a12';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = 'rgba(163,230,53,0.18)';
  ctx.lineWidth = 1;
  for (let y = 0; y <= HEIGHT; y += CELL) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }
  for (let x = 0; x <= WIDTH; x += CELL) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
  }

  ctx.strokeStyle = '#365314';
  ctx.lineWidth = 3;
  for (const wall of walls) {
    ctx.fillStyle = '#182116';
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
  }

  for (const gem of gems) {
    if (gem.collected) continue;
    ctx.fillStyle = '#bef264';
    ctx.shadowColor = '#a3e635';
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(gem.x, gem.y, gem.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = '#84cc16';
  ctx.beginPath(); ctx.arc(goal.x, goal.y, goal.r + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ecfccb';
  ctx.beginPath(); ctx.arc(goal.x, goal.y, 4, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.arc(player.x, player.y, player.r - 3, 0, Math.PI * 2); ctx.fill();

  // Torch-style visibility mask: the world is dim except for a warm radius around the player.
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const gradient = ctx.createRadialGradient(player.x, player.y, 20, player.x, player.y, 190 + Math.sin(elapsed * 17) * 12);
  gradient.addColorStop(0, 'rgba(255,220,140,0.02)');
  gradient.addColorStop(0.55, 'rgba(8,12,8,0.35)');
  gradient.addColorStop(1, 'rgba(2,4,2,0.88)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();

  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 15px IBM Plex Mono, monospace';
  ctx.fillText('BRAMBLE MAZE', 14, 22);
  ctx.font = '12px IBM Plex Mono, monospace';
  ctx.fillStyle = '#a3a3a3';
  ctx.fillText('WASD / ARROWS • R RESTART', 14, HEIGHT - 14);
  ctx.fillText(`GEMS ${score / 10}`, WIDTH - 100, 22);

  ctx.restore();
}

Kiln.onFrame((dt) => {
  const safeDt = Math.min(dt, 0.05);
  update(safeDt);
  draw();
  previousTime += safeDt;
});

reset();
Kiln.ready();
