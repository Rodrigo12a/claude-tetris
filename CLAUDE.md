# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris rendered on HTML5 Canvas. Three files, no dependencies, no build step, no tests, no linter, no `package.json`.

## Running

Open `index.html` directly, or serve statically (`python3 -m http.server 8000` / `npx serve .`) and visit the port. Verification is manual: play it in a browser and watch the console.

## Architecture (`game.js`)

Single global script (`<script src="game.js">`, no modules). All state lives in one module-level `let` declaration near the top; `init()` initializes/resets every field and is also the restart-button handler. Functions read that shared state directly rather than taking it as parameters — notably `collide(shape, x, y)` closes over the global `board`.

Key conventions to preserve when editing:

- **Cell values are color indices.** `PIECES` and `COLORS` are both 1-indexed with `null` at slot 0, so `0` means "empty" everywhere — in the board matrix and in piece shape matrices alike. A piece's cells all hold its own type number, which is why `merge()` can copy shape cells straight into the board and `drawBlock` can look the color up from any cell. Slots 1–7 are the tetrominoes; 8–12 are the power-ups, so any new piece kind must extend **both** arrays in lockstep.
- **Rotation is not SRS.** `rotateCW` is a plain transpose+reverse over the piece's square matrix; `tryRotate` retries the rotated shape at x-offsets `[0, -1, 1, -2, 2]` and silently drops the rotation if all fail. The I piece is a 4×4 matrix so this rotates it correctly by accident of size.
- **Canvas size is duplicated.** `COLS`, `ROWS`, `BLOCK` in `game.js` must stay in sync with the hardcoded `width`/`height` on `<canvas id="board">` in `index.html` (COLS×BLOCK by ROWS×BLOCK). Same for `#next-canvas` vs. the `NB` constant in `drawNext()`.
- **Loop lifecycle.** `loop()` is the only `requestAnimationFrame` driver, storing its handle in `animId`. Pausing cancels the frame; resuming must reset `lastTime = performance.now()` before re-entering `loop`, otherwise the accumulated `dt` spike drops the piece several rows at once. Any new "stop the loop" path needs the same care.
- **No lock delay.** `lockPiece()` merges, clears lines and spawns immediately on the first blocked descent, so there is no sliding window after landing.
- **Power-ups are pieces, not a parallel system.** Types 8–12 (`POWERUP_BOMB`…`POWERUP_FREEZE`) are 1×1 shapes that reuse the ordinary piece pipeline — `collide`, `tryRotate`, `ghostY` and `drawBlock` need no special cases. Two rules keep it that way: `randomPiece()` only rolls 1–7, so specials are generated deliberately by `randomPowerPiece()`; and `lockPiece()` calls `applyPowerup()` *instead of* `merge()`, so a special is consumed on landing and values 8–12 never reach `board`. Code that scans the board can therefore still assume every cell is `0` or a tetromino. `clearLines()` runs after the effect on purpose — that is what lets Gravedad complete rows.
- **Timers ride on `dt`.** `freezeMs` (Congelar) counts down from the `dt` that `loop()` already computes, not from an absolute `performance.now()` deadline. Because `togglePause()` resets `lastTime` on resume, paused time is excluded for free. Any future timed effect should do the same.

Ending the game is a two-part handshake, and both halves are load-bearing: `endGame()` calls `cancelAnimationFrame(animId)`, but that cannot cancel the frame already executing, so `loop()` also bails with `if (gameOver) return;` after `draw()` instead of scheduling the next one. Keep new "stop the loop" paths at the `loop()` level rather than adding more cancels. `endGame()` likewise calls `draw()` itself — without it a game ended by a manual drop never paints its last piece.

## UI language

All user-facing strings, the README and code comments are in Spanish. Keep new UI text and comments in Spanish; identifiers are in English.
