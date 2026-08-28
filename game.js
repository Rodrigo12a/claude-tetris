'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#ff1744', // J - rojo brillante
  '#ffb74d', // L - orange
  // Power-ups (8-12): continúan la numeración, el valor de celda sigue siendo
  // también el índice de color.
  '#ff5252', // 8  Bomba
  '#40c4ff', // 9  Rayo
  '#e040fb', // 10 Tinte
  '#69f0ae', // 11 Gravedad
  '#b3e5fc', // 12 Congelar
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  // Power-ups: bloque único 1x1, así el punto de impacto es inequívoco
  [[8]],                                      // Bomba
  [[9]],                                      // Rayo
  [[10]],                                     // Tinte
  [[11]],                                     // Gravedad
  [[12]],                                     // Congelar
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---- Power-ups ----
// randomPiece() solo sortea 1-7, así que estas piezas solo se generan a
// propósito. Como nunca se fusionan, los valores 8-12 jamás llegan a `board`.
const POWERUP_BOMB = 8;
const POWERUP_LIGHTNING = 9;
const POWERUP_DYE = 10;
const POWERUP_GRAVITY = 11;
const POWERUP_FREEZE = 12;
const POWERUP_FIRST = POWERUP_BOMB;
const POWERUP_LAST = POWERUP_FREEZE;

const LINES_PER_POWERUP = 5;  // líneas limpiadas entre pieza y pieza especial
const FREEZE_MS = 5000;       // duración de Congelar
const NOTICE_MS = 1800;       // duración del aviso en pantalla
const POWERUP_SCORE = 5;      // puntos por bloque destruido (x nivel)

const POWERUP_META = {
  [POWERUP_BOMB]:      { name: 'BOMBA',    glyph: 'B', notice: 'BOMBA · área 3x3 destruida' },
  [POWERUP_LIGHTNING]: { name: 'RAYO',     glyph: 'R', notice: 'RAYO · fila y columna eliminadas' },
  [POWERUP_DYE]:       { name: 'TINTE',    glyph: 'T', notice: 'TINTE · bloques del color eliminados' },
  [POWERUP_GRAVITY]:   { name: 'GRAVEDAD', glyph: 'G', notice: 'GRAVEDAD · huecos compactados' },
  [POWERUP_FREEZE]:    { name: 'CONGELAR', glyph: 'C', notice: 'CONGELAR · caída pausada 5 s' },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const powerupName = document.getElementById('powerup-name');
const powerupNotice = document.getElementById('powerup-notice');

const GRID_COLORS = { dark: '#22222e', light: '#d0d3e0' };

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId,
    linesSincePowerup, powerupPending, freezeMs, noticeTimer;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerPiece() {
  const type = POWERUP_FIRST + Math.floor(Math.random() * (POWERUP_LAST - POWERUP_FIRST + 1));
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function isPowerup(type) {
  return type >= POWERUP_FIRST;
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesSincePowerup += cleared;
    if (linesSincePowerup >= LINES_PER_POWERUP) {
      linesSincePowerup %= LINES_PER_POWERUP;
      powerupPending = true;
    }
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

// ---- Efectos de los power-ups ----
// La pieza especial es 1x1, así que el punto de impacto es su única celda.

function clearCell(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS || !board[y][x]) return 0;
  board[y][x] = 0;
  return 1;
}

function powerBomb(x, y) {
  let destroyed = 0;
  for (let r = y - 1; r <= y + 1; r++)
    for (let c = x - 1; c <= x + 1; c++)
      destroyed += clearCell(c, r);
  return destroyed;
}

function powerLightning(x, y) {
  let destroyed = 0;
  for (let c = 0; c < COLS; c++) destroyed += clearCell(c, y);
  for (let r = 0; r < ROWS; r++) destroyed += clearCell(x, r);
  return destroyed;
}

function powerDye(x, y) {
  // El bloque sobre el que cayó: al ser 1x1 solo puede ser la celda de abajo.
  const target = y + 1 < ROWS ? board[y + 1][x] : 0;
  if (!target) return 0;
  let destroyed = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) destroyed += clearCell(c, r);
  return destroyed;
}

function powerGravity() {
  // Cada columna cae por separado: los bloques se apilan contra el fondo
  // conservando su orden y los huecos quedan arriba.
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) stack.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board[r][c] = stack.length ? stack.pop() : 0;
  }
}

function applyPowerup(type, x, y) {
  let destroyed = 0;
  let notice = POWERUP_META[type].notice;
  switch (type) {
    case POWERUP_BOMB:
      destroyed = powerBomb(x, y);
      break;
    case POWERUP_LIGHTNING:
      destroyed = powerLightning(x, y);
      break;
    case POWERUP_DYE:
      destroyed = powerDye(x, y);
      if (!destroyed) notice = 'TINTE · sin bloque debajo, sin efecto';
      break;
    case POWERUP_GRAVITY:
      powerGravity();
      break;
    case POWERUP_FREEZE:
      freezeMs = FREEZE_MS;
      break;
  }
  score += destroyed * POWERUP_SCORE * level;
  showNotice(notice);
  updateHUD();
}

function lockPiece() {
  // La pieza especial se consume: no deja bloques, solo aplica su efecto.
  if (isPowerup(current.type)) {
    applyPowerup(current.type, current.x, current.y);
  } else {
    merge();
  }
  // Tras Gravedad o Tinte pueden haber quedado filas completas nuevas.
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = powerupPending ? randomPowerPiece() : randomPiece();
  powerupPending = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function showNotice(text) {
  powerupNotice.textContent = text;
  powerupNotice.classList.remove('show');
  void powerupNotice.offsetWidth; // reinicia la animación si ya estaba visible
  powerupNotice.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => powerupNotice.classList.remove('show'), NOTICE_MS);
}

function hideNotice() {
  clearTimeout(noticeTimer);
  powerupNotice.classList.remove('show');
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  // El fantasma (alpha < 1) se pinta plano: sin resplandor ni glifo.
  const power = isPowerup(colorIndex) && (alpha ?? 1) === 1;
  context.globalAlpha = alpha ?? 1;
  if (power) {
    context.shadowColor = color;
    context.shadowBlur = 8 + 6 * Math.sin(performance.now() / 200);
  }
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.shadowBlur = 0; // si no, el resplandor contamina lo que se dibuje después
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (power) {
    context.fillStyle = 'rgba(255,255,255,0.95)';
    context.font = `700 ${Math.round(size * 0.5)}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWERUP_META[colorIndex].glyph, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = document.body.classList.contains('light') ? GRID_COLORS.light : GRID_COLORS.dark;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // Tras el game over la pieza actual solapa la pila (justo por eso terminó la
  // partida), así que se muestra solo el tablero asentado.
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  if (freezeMs > 0) drawFreeze();
}

function drawFreeze() {
  const color = COLORS[POWERUP_FREEZE];
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  ctx.fillStyle = color;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`❄ CONGELADO ${(freezeMs / 1000).toFixed(1)} s`, canvas.width / 2, 10);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (isPowerup(next.type)) {
    // El bloque 1x1 se pinta grande y centrado en el lienzo de 120x120.
    drawBlock(nextCtx, 0.5, 0.5, next.type, 60);
    powerupName.textContent = POWERUP_META[next.type].name;
    return;
  }
  powerupName.textContent = '';
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw(); // sin esto, al terminar con una caída manual no se pinta la última pieza
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeMs > 0) {
    // Congelar: la pieza no cae, pero se puede seguir moviendo y rotando.
    // Se descuenta con dt, así el tiempo en pausa no cuenta (togglePause
    // resetea lastTime al reanudar).
    freezeMs = Math.max(0, freezeMs - dt);
    dropAccum = 0;
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  // lockPiece() puede haber terminado la partida: no se programa otro frame,
  // porque el cancelAnimationFrame() de endGame() no puede cancelar éste.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesSincePowerup = 0;
  powerupPending = false;
  freezeMs = 0;
  hideNotice();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  document.body.classList.toggle('dark', theme !== 'light');
  themeToggle.checked = theme === 'light';
  if (current) draw();
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem('theme', theme);
  applyTheme(theme);
});

restartBtn.addEventListener('click', init);

initTheme();
init();
