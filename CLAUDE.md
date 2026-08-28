# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris rendered on HTML5 Canvas. Three files, no dependencies, no build step, no tests, no linter, no `package.json`.

## Running

Open `index.html` directly, or serve statically (`python3 -m http.server 8000` / `npx serve .`) and visit the port. Verification is manual: play it in a browser and watch the console.

## Architecture (`game.js`)

Single global script (`<script src="game.js">`, no modules). All state lives in one module-level `let` declaration near the top; `init()` initializes/resets every field and is also the restart-button handler. Functions read that shared state directly rather than taking it as parameters — notably `collide(shape, x, y)` closes over the global `board`.

Key conventions to preserve when editing:

- **Cell values are color indices.** `PIECES` and `COLORS` are both 1-indexed with `null` at slot 0, so `0` means "empty" everywhere — in the board matrix and in piece shape matrices alike. A piece's cells all hold its own type number, which is why `merge()` can copy shape cells straight into the board and `drawBlock` can look the color up from any cell.
- **Rotation is not SRS.** `rotateCW` is a plain transpose+reverse over the piece's square matrix; `tryRotate` retries the rotated shape at x-offsets `[0, -1, 1, -2, 2]` and silently drops the rotation if all fail. The I piece is a 4×4 matrix so this rotates it correctly by accident of size.
- **Canvas size is duplicated.** `COLS`, `ROWS`, `BLOCK` in `game.js` must stay in sync with the hardcoded `width`/`height` on `<canvas id="board">` in `index.html` (COLS×BLOCK by ROWS×BLOCK). Same for `#next-canvas` vs. the `NB` constant in `drawNext()`.
- **Loop lifecycle.** `loop()` is the only `requestAnimationFrame` driver, storing its handle in `animId`. Pausing cancels the frame; resuming must reset `lastTime = performance.now()` before re-entering `loop`, otherwise the accumulated `dt` spike drops the piece several rows at once. Any new "stop the loop" path needs the same care.
- **No lock delay.** `lockPiece()` merges, clears lines and spawns immediately on the first blocked descent, so there is no sliding window after landing.

Known quirk: `endGame()` calls `cancelAnimationFrame(animId)` on a frame that has already fired, and control returns to `loop()`, which schedules another frame. The game keeps simulating behind the Game Over overlay until restart. Fix it at the `loop()` level (bail after `lockPiece()` if `gameOver`) rather than adding more cancels.

## UI language

All user-facing strings, the README and code comments are in Spanish. Keep new UI text and comments in Spanish; identifiers are in English.
