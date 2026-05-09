(function () {
  'use strict';

  // ============================================================
  // Config
  // ============================================================
  const GRID_SIZES = { small: 15, medium: 20, large: 30 };
  const SPEEDS     = { slow: 200, normal: 120, fast: 65 };
  const SNAKE_COLOR = '#ffffff';
  const SPEED_WINDOW = 6000; // bar visible for 6s; <3s = +2, 3-5s = +1, 5s+ = +0

  // Snooker colour ball definitions (name, snooker value, display colour)
  const COLOUR_DEFS = [
    { name: 'yellow', value: 2, color: '#f0d000' },
    { name: 'green',  value: 3, color: '#00aa44' },
    { name: 'brown',  value: 4, color: '#8b4010' },
    { name: 'blue',   value: 5, color: '#0077cc' },
    { name: 'pink',   value: 6, color: '#ff5fa0' },
    { name: 'black',  value: 7, color: '#111111' },
  ];

  // Canonical snooker spot positions — yellow/green/brown on baulk line,
  // blue centre, pink pyramid spot, black top spot.
  function getBaseColourPositions() {
    return [
      { ...COLOUR_DEFS[0], origIdx: 0, x: Math.floor(cols * 0.25), y: Math.floor(cols * 0.75) }, // yellow
      { ...COLOUR_DEFS[1], origIdx: 1, x: Math.floor(cols * 0.75), y: Math.floor(cols * 0.75) }, // green
      { ...COLOUR_DEFS[2], origIdx: 2, x: Math.floor(cols * 0.50), y: Math.floor(cols * 0.75) }, // brown
      { ...COLOUR_DEFS[3], origIdx: 3, x: Math.floor(cols * 0.50), y: Math.floor(cols * 0.50) }, // blue
      { ...COLOUR_DEFS[4], origIdx: 4, x: Math.floor(cols * 0.50), y: Math.floor(cols * 0.27) }, // pink
      { ...COLOUR_DEFS[5], origIdx: 5, x: Math.floor(cols * 0.50), y: Math.floor(cols * 0.10) }, // black
    ];
  }

  // Apply accumulated drift offsets — used during red/colour phase.
  function getShiftedColourPositions() {
    return getBaseColourPositions().map(function (ball) {
      return Object.assign({}, ball, {
        x: Math.max(1, Math.min(cols - 2, ball.x + colourOffsets[ball.origIdx].dx)),
        y: Math.max(1, Math.min(cols - 2, ball.y + colourOffsets[ball.origIdx].dy)),
      });
    });
  }

  // After a colour is potted: nudge 2 random balls 2–3 cells, avoiding overlaps.
  function shiftRandomColours() {
    var dirs  = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    var bases = getBaseColourPositions();
    var positions = getShiftedColourPositions(); // live positions for collision checks
    var order = [0, 1, 2, 3, 4, 5];
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (var k = 0; k < 2; k++) {
      var bi = order[k];
      // Try each direction (randomised) until a non-colliding position is found
      var shuffled = dirs.slice().sort(function () { return Math.random() - 0.5; });
      for (var d = 0; d < shuffled.length; d++) {
        var dist = 2 + Math.floor(Math.random() * 2);
        var newOx = colourOffsets[bi].dx + shuffled[d].dx * dist;
        var newOy = colourOffsets[bi].dy + shuffled[d].dy * dist;
        var nx = Math.max(1, Math.min(cols - 2, bases[bi].x + newOx));
        var ny = Math.max(1, Math.min(cols - 2, bases[bi].y + newOy));
        var ok = true;
        for (var m = 0; m < positions.length; m++) {
          if (m !== bi && positions[m].x === nx && positions[m].y === ny) { ok = false; break; }
        }
        if (ok) {
          colourOffsets[bi].dx = newOx;
          colourOffsets[bi].dy = newOy;
          positions[bi] = { x: nx, y: ny }; // update so next ball checks against this
          break;
        }
      }
    }
  }

  // ============================================================
  // State
  // ============================================================
  let gameState = 'start'; // 'start' | 'playing' | 'gameover' | 'win' | 'timeup'
  let gameEndTime = 0;
  let timerStartTime = 0;
  let foulUntil = 0; // Date.now() + 500 during post-foul freeze
  let snake, currentDir, nextDir;
  let phase = 'red';        // 'red' | 'colour' | 'endgame'
  let redBall = null;       // { x, y } — the single red on the table
  let colourBalls = [];     // array of colour ball objects when phase === 'colour' | 'endgame'
  let colourOffsets = [];   // [{dx,dy}] per COLOUR_DEFS index — drift from original spot
  let redCount = 0;         // reds potted; at 8 triggers endgame
  let currentBreak = 0;
  let highBreak = parseInt(localStorage.getItem('serpentine_hi_break') || '0', 10);
  let potMessage = null;    // { text, color, startTs }
  let lastPotTime = 0;      // Date.now() of most recent pot; 0 = none yet this game
  let animId, lastMoveTime, dpr, cols, cellSize;
  let settings = { size: 'small', speed: 'normal', reds: 5, timer: 0, walls: 'wrap' };

  function canRestart() { return Date.now() - gameEndTime >= 3000; }

  // ============================================================
  // DOM refs
  // ============================================================
  const canvas     = document.getElementById('game-canvas');
  const ctx        = canvas.getContext('2d');
  const scoreEl    = document.getElementById('score-val');
  const hiEl       = document.getElementById('hi-val');
  const onEl       = document.getElementById('on-val');
  const navScoreEl = document.getElementById('nav-score-val');
  const actionBtn  = document.getElementById('action-btn');
  const restartBtn = document.getElementById('restart-btn');

  // ============================================================
  // Canvas sizing
  // ============================================================
  function resizeCanvas() {
    const wrap = document.querySelector('.canvas-wrap');
    dpr        = window.devicePixelRatio || 1;
    const size = wrap.clientWidth;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    cols     = GRID_SIZES[settings.size];
    cellSize = size / cols;
  }

  // ============================================================
  // Game init
  // ============================================================
  function initGame() {
    resizeCanvas();
    const mid  = Math.floor(cols / 2);
    const midY = Math.floor(cols / 2);
    const len  = Math.min(4, Math.floor(cols / 4));
    snake = [];
    for (let i = 0; i < len; i++) snake.push({ x: mid - i, y: midY });
    currentDir   = { dx: 1, dy: 0 };
    nextDir      = null;
    phase         = 'red';
    redCount      = 0;
    currentBreak  = 0;
    colourBalls   = [];
    colourOffsets = COLOUR_DEFS.map(function () { return { dx: 0, dy: 0 }; });
    potMessage      = null;
    lastPotTime     = 0;
    lastMoveTime    = 0;
    timerStartTime  = Date.now();
    foulUntil       = 0;
    placeRed();
    updateHUD();
  }

  // ============================================================
  // Ball placement
  // ============================================================
  function placeRed() {
    // Avoid snake cells and current (shifted) colour spots
    const snakeKeys = new Set(snake.map(function (s) { return s.x + ',' + s.y; }));
    const spotKeys  = new Set(getShiftedColourPositions().map(function (s) { return s.x + ',' + s.y; }));
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * cols) };
    } while (snakeKeys.has(pos.x + ',' + pos.y) || spotKeys.has(pos.x + ',' + pos.y));
    redBall = pos;
  }

  function placeColours() {
    colourBalls = getShiftedColourPositions();
    redBall = null;
  }

  function startEndgame() {
    // Endgame uses the current shifted positions, not canonical spots
    phase = 'endgame';
    colourBalls = getShiftedColourPositions();
    redBall = null;
    updateHUD();
    showPotMessage('POT IN ORDER!', '#f0d000');
  }

  // ============================================================
  // Direction queue — prevents 180° reversal
  // ============================================================
  function queueDir(dir) {
    const ref = nextDir || currentDir;
    if (dir.dx === -ref.dx && dir.dy === -ref.dy) return;
    nextDir = dir;
  }

  function calcSpeedBonus(elapsed) {
    if (elapsed < 3000) return 2;
    if (elapsed < 5000) return 1;
    return 0;
  }

  // ============================================================
  // Movement step
  // ============================================================
  function step() {
    if (nextDir) { currentDir = nextDir; nextDir = null; }

    let nx = snake[0].x + currentDir.dx;
    let ny = snake[0].y + currentDir.dy;

    // Wall collision — solid ends game; wrap teleports to opposite side
    if (nx < 0 || nx >= cols || ny < 0 || ny >= cols) {
      if (settings.walls === 'solid') { endGame(); return; }
      nx = (nx + cols) % cols;
      ny = (ny + cols) % cols;
    }

    // Self collision — skip last segment (it's about to vacate)
    for (let i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === nx && snake[i].y === ny) { endGame(); return; }
    }

    snake.unshift({ x: nx, y: ny });

    let ate = false;

    if (phase === 'red' && redBall && nx === redBall.x && ny === redBall.y) {
      // Potted the red
      redCount++;
      var nowR = Date.now();
      var speedR = lastPotTime > 0 ? calcSpeedBonus(nowR - lastPotTime) : 0;
      lastPotTime = nowR;
      currentBreak += 1 + speedR;
      updateHighBreak();
      updateHUD();
      showPotMessage('RED  +' + (1 + speedR) + (speedR ? '  *' : ''), '#cc2200');
      phase = 'colour';
      placeColours();
      ate = true;

    } else if (phase === 'colour') {
      const idx = colourBalls.findIndex(function (b) { return b.x === nx && b.y === ny; });
      if (idx !== -1) {
        const ball = colourBalls[idx];
        colourOffsets[ball.origIdx] = { dx: 0, dy: 0 }; // reset to original spot
        var nowC = Date.now();
        var speedC = lastPotTime > 0 ? calcSpeedBonus(nowC - lastPotTime) : 0;
        lastPotTime = nowC;
        currentBreak += ball.value + speedC;
        updateHighBreak();
        updateHUD();
        showPotMessage(ball.name.toUpperCase() + '  +' + (ball.value + speedC) + (speedC ? '  *' : ''), ball.color);
        if (redCount >= settings.reds) {
          startEndgame();
        } else {
          shiftRandomColours();
          phase = 'red';
          colourBalls = [];
          placeRed();
        }
        ate = true;
      }
    } else if (phase === 'endgame') {
      const idx = colourBalls.findIndex(function (b) { return b.x === nx && b.y === ny; });
      if (idx !== -1) {
        const ball = colourBalls[idx];
        if (idx === 0) {
          // Correct order — pot it
          var nowE = Date.now();
          var speedE = lastPotTime > 0 ? calcSpeedBonus(nowE - lastPotTime) : 0;
          lastPotTime = nowE;
          currentBreak += ball.value + speedE;
          updateHighBreak();
          updateHUD();
          showPotMessage(ball.name.toUpperCase() + '  +' + (ball.value + speedE) + (speedE ? '  *' : ''), ball.color);
          colourBalls.shift();
          if (colourBalls.length === 0) { winGame(); return; }
          ate = true;
        } else {
          // Wrong order — penalty, not game over
          var penalty = Math.max(4, ball.value);
          currentBreak = Math.max(0, currentBreak - penalty);
          foulUntil = Date.now() + 500;
          showPotMessage('FOUL!  -' + penalty, '#ff4136');
          updateHUD();
          // ate stays false — snake doesn't grow, ball stays on table
        }
      }
    }

    if (!ate) snake.pop();
  }

  function updateHighBreak() {
    if (currentBreak > highBreak) {
      highBreak = currentBreak;
      localStorage.setItem('serpentine_hi_break', String(highBreak));
    }
  }

  // ============================================================
  // HUD
  // ============================================================
  function updateHUD() {
    scoreEl.textContent    = currentBreak;
    hiEl.textContent       = highBreak;
    navScoreEl.textContent = currentBreak;

    if (onEl) {
      if (phase === 'red') {
        onEl.textContent  = 'RED';
        onEl.style.color  = '#cc2200';
        onEl.style.textShadow = '0 0 8px rgba(204,34,0,0.7)';
      } else if (phase === 'endgame' && colourBalls.length > 0) {
        const tgt = colourBalls[0];
        onEl.textContent  = tgt.name.toUpperCase();
        onEl.style.color  = tgt.color;
        onEl.style.textShadow = '0 0 8px ' + tgt.color + '99';
      } else {
        onEl.textContent  = 'COLOUR';
        onEl.style.color  = '#f0d000';
        onEl.style.textShadow = '0 0 8px rgba(240,208,0,0.7)';
      }
    }
  }

  // ============================================================
  // Pot message (brief canvas overlay text after potting)
  // ============================================================
  function showPotMessage(text, color) {
    potMessage = { text: text, color: color, startTs: null };
  }

  // ============================================================
  // Game state transitions
  // ============================================================
  function startGame() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    initGame();
    gameState = 'playing';
    syncUI();
    animId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    gameState = 'gameover';
    gameEndTime = Date.now();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    syncUI();
    draw(0);
    actionBtn.disabled = true;
    setTimeout(function () { actionBtn.disabled = false; }, 3000);
  }

  function winGame() {
    gameState = 'win';
    gameEndTime = Date.now();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    syncUI();
    draw(0);
    actionBtn.disabled = true;
    setTimeout(function () { actionBtn.disabled = false; }, 3000);
  }

  function timeUp() {
    gameState = 'timeup';
    gameEndTime = Date.now();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    updateHighBreak();
    syncUI();
    draw(0);
    actionBtn.disabled = true;
    setTimeout(function () { actionBtn.disabled = false; }, 3000);
  }

  function syncUI() {
    var labels = { start: 'START GAME', playing: 'PLAYING...', gameover: 'PLAY AGAIN', win: 'PLAY AGAIN', timeup: 'PLAY AGAIN' };
    actionBtn.textContent = labels[gameState] || 'START GAME';
    actionBtn.hidden = (gameState === 'playing');
    restartBtn.hidden = (gameState !== 'playing');
  }

  // ============================================================
  // Game loop
  // ============================================================
  function gameLoop(ts) {
    animId = requestAnimationFrame(gameLoop);
    if (settings.timer > 0 && Date.now() - timerStartTime >= settings.timer * 1000) {
      timeUp(); return;
    }
    if (ts - lastMoveTime >= SPEEDS[settings.speed]) {
      lastMoveTime = ts;
      if (Date.now() >= foulUntil) {
        step();
        if (gameState !== 'playing') return;
      }
    }
    draw(ts);
  }

  // ============================================================
  // Rendering
  // ============================================================
  function canvasSize() { return canvas.width / dpr; }
  function pixelFont(px) { return px + 'px "Press Start 2P", monospace'; }

  function draw(ts) {
    var size = canvasSize();
    ctx.fillStyle = '#0d4d1a';
    ctx.fillRect(0, 0, size, size);
    drawGrid(size);

    if (gameState === 'start') { drawStartScreen(size); return; }

    // Balls
    if (phase === 'red' && redBall)               drawRedBall(ts);
    if (phase === 'colour' || phase === 'endgame') drawColourBalls(ts);

    drawSnake();
    drawOnIndicator(size);
    drawTimer(size, ts);
    drawSpeedBar(size);
    if (potMessage) drawPotMessage(size, ts);

    if (gameState === 'gameover') drawGameOver(size);
    if (gameState === 'win')      drawWinScreen(size);
    if (gameState === 'timeup')   drawTimeUpScreen(size);
  }

  function drawGrid(size) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth   = 0.5;
    for (var i = 0; i <= cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * cellSize, 0);    ctx.lineTo(i * cellSize, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cellSize);    ctx.lineTo(size, i * cellSize); ctx.stroke();
    }
  }

  function drawSnake() {
    var foulFlash = foulUntil > 0 && Date.now() < foulUntil;
    var flashMod  = foulFlash ? 0.15 + 0.85 * Math.abs(Math.sin(Date.now() / 45)) : 1;
    var len = snake.length;
    snake.forEach(function (seg, i) {
      var alpha = (i === 0 ? 1 : Math.max(0.25, 1 - (i / len) * 0.72)) * flashMod;
      ctx.fillStyle   = 'rgba(255,255,255,' + alpha + ')';
      ctx.shadowColor = SNAKE_COLOR;
      ctx.shadowBlur  = i === 0 ? 14 : 0;
      var p = Math.max(1, cellSize * 0.07);
      ctx.fillRect(seg.x * cellSize + p, seg.y * cellSize + p, cellSize - p * 2, cellSize - p * 2);
    });
    ctx.shadowBlur = 0;
  }

  // Draw a single snooker ball at grid position (gx, gy)
  function drawBall(gx, gy, color, alpha) {
    var cx = (gx + 0.5) * cellSize;
    var cy = (gy + 0.5) * cellSize;
    var r  = Math.max(3, cellSize * 0.38);

    if (alpha !== undefined) ctx.globalAlpha = alpha;

    // Ball body
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Specular highlight — top-left offset white circle
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.30, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function drawRedBall(ts) {
    var pulse = 0.65 + 0.35 * Math.sin(ts / 300);
    drawBall(redBall.x, redBall.y, '#cc2200', pulse);
  }

  function drawColourBalls(ts) {
    var breathe = 0.8 + 0.2 * Math.sin(ts / 600);
    colourBalls.forEach(function (ball, i) {
      var alpha = (phase === 'endgame' && i === 0)
        ? 0.55 + 0.45 * Math.abs(Math.sin(ts / 260))  // target: fast strong pulse
        : breathe;                                      // all others: normal breathe
      drawBall(ball.x, ball.y, ball.color, alpha);
    });
  }

  // Small "ON: RED" / "ON: COLOUR" indicator in top-right of canvas
  function drawOnIndicator(size) {
    if (gameState !== 'playing') return;
    ctx.textAlign = 'right';
    var s = Math.max(5, Math.floor(size * 0.022));
    ctx.font = pixelFont(s);
    var label, color;
    if (phase === 'red') {
      label = 'ON: RED'; color = '#cc2200';
    } else if (phase === 'endgame' && colourBalls.length > 0) {
      label = 'ON: ' + colourBalls[0].name.toUpperCase(); color = colourBalls[0].color;
    } else {
      label = 'ON: COLOUR'; color = '#f0d000';
    }
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 6;
    ctx.fillText(label, size - 6, s + 8);
    ctx.shadowBlur  = 0;
    ctx.textAlign   = 'left';
  }

  function drawTimer(size, ts) {
    if (settings.timer === 0 || gameState !== 'playing') return;
    var elapsed   = (Date.now() - timerStartTime) / 1000;
    var remaining = Math.max(0, settings.timer - elapsed);
    var mins  = Math.floor(remaining / 60);
    var secs  = Math.floor(remaining % 60);
    var label = mins + ':' + (secs < 10 ? '0' : '') + secs;
    var isLow = remaining <= 10;

    var s = Math.max(5, Math.floor(size * 0.022));
    ctx.font      = pixelFont(s);
    ctx.textAlign = 'left';

    if (isLow) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(ts / 150));
      ctx.fillStyle   = '#ff4136';
      ctx.shadowColor = '#ff4136';
      ctx.shadowBlur  = 8;
    } else {
      ctx.fillStyle   = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur  = 0;
    }

    ctx.fillText(label, 6, s + 8);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // Depleting bar at canvas bottom: gold for +2 (0-3s), gold for +1 (3-5s), grey for +0 (5-6s)
  function drawSpeedBar(size) {
    if (lastPotTime === 0 || gameState !== 'playing') return;
    var elapsed = Date.now() - lastPotTime;
    if (elapsed >= SPEED_WINDOW) return;
    var fraction  = 1 - elapsed / SPEED_WINDOW;
    var bonus     = calcSpeedBonus(elapsed);
    var fontSize  = Math.max(7, Math.floor(size * 0.026));
    var h         = fontSize + 4;
    var barW      = Math.max(1, size * fraction);

    ctx.fillStyle   = bonus > 0 ? '#c8a530' : '#3a3a3a';
    ctx.shadowColor = bonus > 0 ? '#c8a530' : 'transparent';
    ctx.shadowBlur  = bonus > 0 ? 5 : 0;
    ctx.fillRect(0, size - h, barW, h);
    ctx.shadowBlur  = 0;

    ctx.font      = pixelFont(fontSize);
    ctx.fillStyle = bonus === 2 ? '#ffffff' : bonus === 1 ? '#ffd700' : '#555';
    ctx.textAlign = 'center';
    ctx.fillText(String(bonus), Math.max(barW, fontSize), size - 2);
    ctx.textAlign = 'left';
  }

  // Pot confirmation message — fades in then out over ~1.4s
  function drawPotMessage(size, ts) {
    if (!potMessage) return;
    if (!potMessage.startTs) potMessage.startTs = ts;
    var elapsed  = ts - potMessage.startTs;
    var duration = 1400;
    if (elapsed > duration) { potMessage = null; return; }
    var alpha = elapsed < 250 ? elapsed / 250 : 1 - (elapsed - 250) / (duration - 250);
    alpha = Math.max(0, Math.min(1, alpha));

    ctx.globalAlpha = alpha;
    ctx.textAlign   = 'center';
    var s = Math.max(8, Math.floor(size * 0.032));
    ctx.font        = pixelFont(s);
    ctx.fillStyle   = potMessage.color;
    ctx.shadowColor = potMessage.color;
    ctx.shadowBlur  = 12;
    ctx.fillText(potMessage.text, size / 2, size * 0.12);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign   = 'left';
  }

  function drawStartScreen(size) {
    ctx.fillStyle = 'rgba(10,10,10,0.92)';
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';

    var t = Math.max(12, Math.floor(size * 0.054));
    ctx.font        = pixelFont(t);
    ctx.fillStyle   = SNAKE_COLOR;
    ctx.shadowColor = SNAKE_COLOR;
    ctx.shadowBlur  = 22;
    ctx.fillText('MAX SNAKE', size / 2, size * 0.38);
    ctx.shadowBlur = 0;

    var s = Math.max(6, Math.floor(size * 0.022));
    ctx.font      = pixelFont(s);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillText(settings.reds + ' REDS · COLOURS IN ORDER', size / 2, size * 0.38 + t * 2.2);

    var s2 = Math.max(5, Math.floor(size * 0.018));
    ctx.font      = pixelFont(s2);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillText('SELECT OPTIONS + PRESS START', size / 2, size * 0.38 + t * 2.2 + s * 2.4);
    ctx.textAlign = 'left';
  }

  function drawOverlay(size, title, sub, color) {
    ctx.fillStyle = 'rgba(10,10,10,0.86)';
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';

    var t = Math.max(12, Math.floor(size * 0.048));
    ctx.font        = pixelFont(t);
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 18;
    ctx.fillText(title, size / 2, size / 2 - t * 0.4);
    ctx.shadowBlur = 0;

    var s = Math.max(6, Math.floor(size * 0.022));
    ctx.font      = pixelFont(s);
    ctx.fillStyle = '#444';
    ctx.fillText(sub, size / 2, size / 2 + s * 3.2);
    ctx.textAlign = 'left';
  }

  function drawGameOver(size) {
    ctx.fillStyle = 'rgba(10,10,10,0.88)';
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';

    // "GAME OVER"
    var t = Math.max(11, Math.floor(size * 0.046));
    ctx.font        = pixelFont(t);
    ctx.fillStyle   = '#cc2200';
    ctx.shadowColor = '#cc2200';
    ctx.shadowBlur  = 16;
    ctx.fillText('GAME OVER', size / 2, size * 0.30);
    ctx.shadowBlur = 0;

    // "BREAK" label
    var bl = Math.max(5, Math.floor(size * 0.020));
    ctx.font      = pixelFont(bl);
    ctx.fillStyle = '#444';
    ctx.fillText('BREAK', size / 2, size * 0.30 + t * 2.0);

    // Break number
    var sc = Math.max(10, Math.floor(size * 0.044));
    ctx.font        = pixelFont(sc);
    ctx.fillStyle   = SNAKE_COLOR;
    ctx.shadowColor = SNAKE_COLOR;
    ctx.shadowBlur  = 10;
    ctx.fillText(String(currentBreak).padStart(3, '0'), size / 2, size * 0.30 + t * 2.0 + bl * 2.0 + sc * 0.9);
    ctx.shadowBlur = 0;

    // High break line
    var hi = Math.max(6, Math.floor(size * 0.021));
    ctx.font      = pixelFont(hi);
    var isNew     = currentBreak > 0 && currentBreak >= highBreak;
    ctx.fillStyle = isNew ? '#ffd700' : '#444';
    ctx.fillText(
      isNew ? '// NEW HIGH BREAK!' : '// BEST: ' + String(highBreak).padStart(3, '0'),
      size / 2,
      size * 0.30 + t * 2.0 + bl * 2.0 + sc * 0.9 + hi * 3.2
    );

    ctx.textAlign = 'left';
  }

  function drawWinScreen(size) {
    ctx.fillStyle = 'rgba(10,10,10,0.92)';
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';

    var t = Math.max(11, Math.floor(size * 0.046));
    ctx.font        = pixelFont(t);
    ctx.fillStyle   = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 22;
    ctx.fillText('FRAME OVER', size / 2, size * 0.28);
    ctx.shadowBlur  = 0;

    var bl = Math.max(5, Math.floor(size * 0.020));
    ctx.font      = pixelFont(bl);
    ctx.fillStyle = '#444';
    ctx.fillText('BREAK', size / 2, size * 0.28 + t * 2.0);

    var sc = Math.max(10, Math.floor(size * 0.044));
    ctx.font        = pixelFont(sc);
    ctx.fillStyle   = SNAKE_COLOR;
    ctx.shadowColor = SNAKE_COLOR;
    ctx.shadowBlur  = 10;
    ctx.fillText(String(currentBreak).padStart(3, '0'), size / 2, size * 0.28 + t * 2.0 + bl * 2.0 + sc * 0.9);
    ctx.shadowBlur  = 0;

    var hi = Math.max(6, Math.floor(size * 0.021));
    ctx.font      = pixelFont(hi);
    var isNew     = currentBreak > 0 && currentBreak >= highBreak;
    ctx.fillStyle = isNew ? '#ffd700' : '#444';
    ctx.fillText(
      isNew ? '// NEW HIGH BREAK!' : '// BEST: ' + String(highBreak).padStart(3, '0'),
      size / 2,
      size * 0.28 + t * 2.0 + bl * 2.0 + sc * 0.9 + hi * 3.2
    );

    ctx.textAlign = 'left';
  }

  function drawTimeUpScreen(size) {
    ctx.fillStyle = 'rgba(10,10,10,0.92)';
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';

    var t = Math.max(11, Math.floor(size * 0.046));
    ctx.font        = pixelFont(t);
    ctx.fillStyle   = '#ff8c00';
    ctx.shadowColor = '#ff8c00';
    ctx.shadowBlur  = 22;
    ctx.fillText("TIME'S UP", size / 2, size * 0.28);
    ctx.shadowBlur  = 0;

    var bl = Math.max(5, Math.floor(size * 0.020));
    ctx.font      = pixelFont(bl);
    ctx.fillStyle = '#444';
    ctx.fillText('BREAK', size / 2, size * 0.28 + t * 2.0);

    var sc = Math.max(10, Math.floor(size * 0.044));
    ctx.font        = pixelFont(sc);
    ctx.fillStyle   = SNAKE_COLOR;
    ctx.shadowColor = SNAKE_COLOR;
    ctx.shadowBlur  = 10;
    ctx.fillText(String(currentBreak).padStart(3, '0'), size / 2, size * 0.28 + t * 2.0 + bl * 2.0 + sc * 0.9);
    ctx.shadowBlur  = 0;

    var hi = Math.max(6, Math.floor(size * 0.021));
    ctx.font      = pixelFont(hi);
    var isNew     = currentBreak > 0 && currentBreak >= highBreak;
    ctx.fillStyle = isNew ? '#ffd700' : '#444';
    ctx.fillText(
      isNew ? '// NEW HIGH BREAK!' : '// BEST: ' + String(highBreak).padStart(3, '0'),
      size / 2,
      size * 0.28 + t * 2.0 + bl * 2.0 + sc * 0.9 + hi * 3.2
    );

    ctx.textAlign = 'left';
  }

  // ============================================================
  // Keyboard input
  // ============================================================
  var KEY_DIRS = {
    ArrowUp:    { dx: 0, dy: -1 }, ArrowDown:  { dx: 0, dy: 1 },
    ArrowLeft:  { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
    w: { dx: 0, dy: -1 }, s: { dx: 0, dy: 1 },
    a: { dx: -1, dy: 0 }, d: { dx: 1, dy: 0 },
    W: { dx: 0, dy: -1 }, S: { dx: 0, dy: 1 },
    A: { dx: -1, dy: 0 }, D: { dx: 1, dy: 0 },
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) startGame();
      return;
    }
    var dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (gameState === 'playing') {
      queueDir(dir);
    } else if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) {
      startGame(); queueDir(dir);
    }
  });

  // ============================================================
  // Touch / swipe input
  // ============================================================
  var t0x, t0y;

  canvas.addEventListener('touchstart', function (e) {
    t0x = e.touches[0].clientX;
    t0y = e.touches[0].clientY;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    if (t0x === undefined) return;
    var dx = e.changedTouches[0].clientX - t0x;
    var dy = e.changedTouches[0].clientY - t0y;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    t0x = t0y = undefined;
    e.preventDefault();

    if (Math.max(adx, ady) < 20) {
      if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) startGame();
      return;
    }

    var dir = adx > ady
      ? (dx > 0 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 })
      : (dy > 0 ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });

    if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) { startGame(); queueDir(dir); }
    else if (gameState === 'playing') queueDir(dir);
  }, { passive: false });

  // ============================================================
  // D-pad input
  // ============================================================
  var DPAD_DIRS = {
    up: { dx: 0, dy: -1 }, down:  { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
  };

  document.querySelectorAll('.dpad-btn').forEach(function (btn) {
    function press() {
      var dir = DPAD_DIRS[btn.dataset.dir];
      if (!dir) return;
      if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) { startGame(); queueDir(dir); }
      else if (gameState === 'playing') queueDir(dir);
    }
    btn.addEventListener('click', press);
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });

  // ============================================================
  // Action & Restart buttons
  // ============================================================
  actionBtn.addEventListener('click', function () {
    if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) startGame();
  });

  restartBtn.addEventListener('click', startGame);

  // ============================================================
  // Settings buttons
  // ============================================================
  document.querySelectorAll('.setting-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var setting = btn.dataset.setting;
      var value   = btn.dataset.value;
      settings[setting] = (setting === 'reds' || setting === 'timer') ? parseInt(value, 10) : value;
      document.querySelectorAll('.setting-btn[data-setting="' + setting + '"]').forEach(function (b) {
        b.classList.toggle('setting-btn--active', b.dataset.value === value);
      });
      if (gameState === 'start') draw(0);
    });
  });

  // ============================================================
  // Window resize — pause if playing, resize canvas, redraw
  // ============================================================
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeCanvas();
      if (gameState !== 'playing') draw(0);
    }, 200);
  });

  // ============================================================
  // Boot
  // ============================================================
  hiEl.textContent = highBreak;
  syncUI();
  updateHUD();

  function boot() { resizeCanvas(); draw(0); }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(boot);
  } else {
    setTimeout(boot, 150);
  }

}());
