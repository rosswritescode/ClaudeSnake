(function () {
  'use strict';

  // ============================================================
  // Config
  // ============================================================
  const GRID_SIZES = { small: 15, medium: 20, large: 30 };
  const SPEEDS     = { slow: 200, normal: 120, fast: 65 };
  const SNAKE_COLOR = '#ffffff';
  // Speed bonus windows are configurable via settings (speedT1, speedT2 in seconds)

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
  let breakHistory = [];    // { name, color, base, bonus } per pot/foul event
  let animId, lastMoveTime, dpr, cols, cellSize;
  let frameNumber = 1;
  let countdownUntil = 0;
  let showContinueHint = false;
  let totalScore = 0;
  let framesCompleted = 0;
  let hiScore = parseInt(localStorage.getItem('serpentine_hi_score') || '0', 10);
  let settings = { size: 'small', speed: 'slow', reds: 3, timer: 0, walls: 'wrap', speedT1: 1, speedT2: 2, carry: 'on' };

  function canRestart() { return Date.now() - gameEndTime >= 1000; }

  // ============================================================
  // DOM refs
  // ============================================================
  const canvas     = document.getElementById('game-canvas');
  const ctx        = canvas.getContext('2d');
  const hudALabel  = document.getElementById('hud-a-label');
  const hudAVal    = document.getElementById('hud-a-val');
  const hudBLabel  = document.getElementById('hud-b-label');
  const hudBVal    = document.getElementById('hud-b-val');
  const hudCItem   = document.getElementById('hud-c-item');
  const hudCLabel  = document.getElementById('hud-c-label');
  const hudCVal    = document.getElementById('hud-c-val');
  const onEl       = document.getElementById('on-val');
  const navScoreEl = document.getElementById('nav-score-val');
  const actionBtn  = document.getElementById('action-btn');
  const restartBtn = document.getElementById('restart-btn');
  const shareEl    = document.getElementById('share-line');

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
    breakHistory    = [];
    lastMoveTime    = 0;
    timerStartTime  = Date.now();
    foulUntil        = 0;
    frameNumber      = 1;
    countdownUntil   = 0;
    showContinueHint = false;
    totalScore       = 0;
    framesCompleted  = 0;
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
    showPotMessage('POT IN ORDER!', null, '#f0d000');
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
    if (elapsed < settings.speedT1 * 1000) return 2;
    if (elapsed < (settings.speedT1 + settings.speedT2) * 1000) return 1;
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
      breakHistory.push({ name: 'RED', color: '#cc2200', base: 1, bonus: speedR });
      updateHighBreak();
      updateHUD();
      showPotMessage('RED  +1', speedR > 0 ? '+' + speedR + ' BONUS' : null, '#cc2200');
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
        breakHistory.push({ name: ball.name.toUpperCase(), color: ball.color, base: ball.value, bonus: speedC });
        updateHighBreak();
        updateHUD();
        showPotMessage(ball.name.toUpperCase() + '  +' + ball.value, speedC > 0 ? '+' + speedC + ' BONUS' : null, ball.color);
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
          breakHistory.push({ name: ball.name.toUpperCase(), color: ball.color, base: ball.value, bonus: speedE });
          updateHighBreak();
          updateHUD();
          showPotMessage(ball.name.toUpperCase() + '  +' + ball.value, speedE > 0 ? '+' + speedE + ' BONUS' : null, ball.color);
          colourBalls.shift();
          if (colourBalls.length === 0) { winGame(); return; }
          ate = true;
        } else {
          // Wrong order — penalty, not game over
          var penalty = Math.max(4, ball.value);
          currentBreak = Math.max(0, currentBreak - penalty);
          breakHistory.push({ name: 'FOUL', color: '#ff4136', base: -penalty, bonus: 0 });
          foulUntil = Date.now() + 500;
          showPotMessage('FOUL!  -' + penalty, null, '#ff4136');
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
    if (settings.carry === 'on') {
      hudALabel.textContent = 'FRAME';
      hudAVal.textContent   = frameNumber;
      hudBLabel.textContent = 'SCORE';
      hudBVal.textContent   = sessionScore();
      hudCLabel.textContent = '×' + frameNumber;
      hudCVal.textContent   = currentBreak * frameNumber;
      hudCItem.hidden       = false;
    } else {
      hudALabel.textContent = 'BREAK';
      hudAVal.textContent   = currentBreak;
      hudBLabel.textContent = 'BEST';
      hudBVal.textContent   = highBreak;
      hudCItem.hidden       = true;
    }
    navScoreEl.textContent = currentBreak;

    if (onEl) {
      if (phase === 'red') {
        onEl.textContent      = 'RED';
        onEl.style.color      = '#cc2200';
        onEl.style.textShadow = '0 0 8px rgba(204,34,0,0.7)';
      } else if (phase === 'endgame' && colourBalls.length > 0) {
        const tgt = colourBalls[0];
        onEl.textContent      = tgt.name.toUpperCase();
        onEl.style.color      = tgt.color;
        onEl.style.textShadow = '0 0 8px ' + tgt.color + '99';
      } else {
        onEl.textContent      = 'COLOUR';
        onEl.style.color      = '#f0d000';
        onEl.style.textShadow = '0 0 8px rgba(240,208,0,0.7)';
      }
    }
  }

  // ============================================================
  // Pot message (brief canvas overlay text after potting)
  // ============================================================
  function showPotMessage(main, bonus, color) {
    potMessage = { main: main, bonus: bonus, color: color, startTs: null };
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

  function sessionScore() {
    // In 'win' state, totalScore already includes the just-won frame's contribution.
    // In all other states (gameover, timeup, playing), add the current partial frame.
    if (gameState === 'win') return totalScore;
    return totalScore + currentBreak * frameNumber;
  }

  function updateHiScore() {
    if (settings.carry !== 'on') return;
    var ss = sessionScore();
    if (ss > hiScore) {
      hiScore = ss;
      localStorage.setItem('serpentine_hi_score', String(hiScore));
    }
  }

  function endGame() {
    gameState = 'gameover';
    gameEndTime = Date.now();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    updateHiScore();
    showContinueHint = false;
    syncUI();
    draw(0);
    actionBtn.disabled = true;
    setTimeout(function () { actionBtn.disabled = false; showContinueHint = true; draw(0); }, 1000);
  }

  function winGame() {
    if (settings.carry === 'on') {
      totalScore += currentBreak * frameNumber;
      framesCompleted++;
    }
    gameState = 'win';
    gameEndTime = Date.now();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    showContinueHint = false;
    syncUI();
    draw(0);
    actionBtn.disabled = true;
    setTimeout(function () { actionBtn.disabled = false; showContinueHint = true; draw(0); }, 1000);
  }

  function nextFrame() {
    frameNumber++;
    phase         = 'red';
    redCount      = 0;
    redBall       = null;
    colourBalls   = [];
    colourOffsets = COLOUR_DEFS.map(function () { return { dx: 0, dy: 0 }; });
    potMessage       = null;
    lastPotTime      = 0;
    breakHistory     = [];
    currentBreak     = 0;
    foulUntil        = 0;
    showContinueHint = false;
    timerStartTime   = Date.now();
    placeRed();
    updateHUD();
    countdownUntil = Date.now() + 3000;
    gameState = 'playing';
    syncUI();
    lastMoveTime = 0;
    animId = requestAnimationFrame(gameLoop);
  }

  function timeUp() {
    gameState = 'timeup';
    gameEndTime = Date.now();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    updateHighBreak();
    updateHiScore();
    showContinueHint = false;
    syncUI();
    draw(0);
    actionBtn.disabled = true;
    setTimeout(function () { actionBtn.disabled = false; showContinueHint = true; draw(0); }, 1000);
  }

  function syncUI() {
    var labels = { start: 'START GAME', playing: 'PLAYING...', gameover: 'PLAY AGAIN', win: 'PLAY AGAIN', timeup: 'PLAY AGAIN' };
    if (settings.carry === 'on' && gameState === 'win') labels.win = 'NEXT FRAME';
    actionBtn.textContent = labels[gameState] || 'START GAME';
    actionBtn.hidden = (gameState === 'playing');
    restartBtn.hidden = (gameState !== 'playing');

    if (shareEl) {
      var showShare = settings.carry === 'on' &&
        (gameState === 'gameover' || gameState === 'timeup' || gameState === 'win');
      if (showShare) {
        shareEl.textContent = 'SCORE ' + sessionScore() + '  ·  FRAME ' + frameNumber;
        shareEl.hidden = false;
      } else {
        shareEl.hidden = true;
      }
    }
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
      if (Date.now() >= foulUntil && Date.now() >= countdownUntil) {
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
    if (countdownUntil > 0 && Date.now() < countdownUntil) drawCountdown(size);

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

  function drawCountdown(size) {
    var remaining = Math.ceil((countdownUntil - Date.now()) / 1000);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, size, size);

    var nf = Math.max(20, Math.floor(size * 0.20));
    ctx.font        = pixelFont(nf);
    ctx.fillStyle   = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 28;
    ctx.textAlign   = 'center';
    ctx.fillText(String(remaining), size / 2, size / 2 + nf * 0.38);
    ctx.shadowBlur  = 0;

    var sf = Math.max(6, Math.floor(size * 0.022));
    ctx.font      = pixelFont(sf);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('FRAME ' + frameNumber, size / 2, size / 2 - nf * 0.55);
    ctx.textAlign = 'left';
  }

  // Depleting bar showing available speed bonus; label at shrinking tip reads 2/1/0 BONUS PTS
  function drawSpeedBar(size) {
    if (lastPotTime === 0 || gameState !== 'playing') return;
    var elapsed    = Date.now() - lastPotTime;
    var totalMs    = (settings.speedT1 + settings.speedT2 + 1) * 1000; // +1s tail shows "0"
    if (elapsed >= totalMs) return;
    var fraction   = 1 - elapsed / totalMs;
    var bonus      = calcSpeedBonus(elapsed);
    var fontSize   = Math.max(6, Math.floor(size * 0.017));
    var h          = fontSize + 5;
    var barW       = Math.max(1, size * fraction);

    ctx.fillStyle   = bonus > 0 ? '#c8a530' : '#3a3a3a';
    ctx.shadowColor = bonus > 0 ? '#c8a530' : 'transparent';
    ctx.shadowBlur  = bonus > 0 ? 5 : 0;
    ctx.fillRect(0, size - h, barW, h);
    ctx.shadowBlur  = 0;

    ctx.font      = pixelFont(fontSize);
    ctx.fillStyle = bonus === 2 ? '#ffffff' : bonus === 1 ? '#ffd700' : '#555';
    ctx.textAlign = 'right';
    ctx.fillText(bonus + ' BONUS PTS', barW - 3, size - 2);
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
    var s = Math.max(8, Math.floor(size * 0.032));
    ctx.font = pixelFont(s);

    var mainText  = potMessage.main;
    var bonusPart = potMessage.bonus ? '  ' + potMessage.bonus : '';
    var mainW     = ctx.measureText(mainText).width;
    var bonusW    = bonusPart ? ctx.measureText(bonusPart).width : 0;
    var startX    = size / 2 - (mainW + bonusW) / 2;
    var y         = size * 0.12;

    ctx.textAlign   = 'left';
    ctx.fillStyle   = potMessage.color;
    ctx.shadowColor = potMessage.color;
    ctx.shadowBlur  = 12;
    ctx.fillText(mainText, startX, y);
    ctx.shadowBlur = 0;

    if (bonusPart) {
      ctx.fillStyle = '#c8a530';
      ctx.fillText(bonusPart, startX + mainW, y);
    }

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

  function drawEndScreen(size, title, titleColor) {
    ctx.fillStyle = 'rgba(5,5,5,0.94)';
    ctx.fillRect(0, 0, size, size);

    // Title
    var tf = Math.max(10, Math.floor(size * 0.044));
    ctx.font        = pixelFont(tf);
    ctx.fillStyle   = titleColor;
    ctx.shadowColor = titleColor;
    ctx.shadowBlur  = 16;
    ctx.textAlign   = 'center';
    ctx.fillText(title, size / 2, size * 0.07 + tf);
    ctx.shadowBlur  = 0;

    // Break history rows
    var rf      = Math.max(5, Math.floor(size * 0.019));
    var rowH    = rf + Math.max(3, Math.floor(rf * 0.55));
    var listTop = size * 0.17;
    var listBot = size * 0.80;
    var maxRows = Math.floor((listBot - listTop) / rowH);

    // If history is longer than fits, truncate from the top
    var start = Math.max(0, breakHistory.length - maxRows);
    if (start > 0) {
      ctx.font      = pixelFont(rf);
      ctx.fillStyle = '#444';
      ctx.textAlign = 'center';
      ctx.fillText('...', size / 2, listTop + rf);
      listTop += rowH;
      start = Math.max(0, breakHistory.length - (maxRows - 1));
    }

    var colName  = size * 0.06;
    var colBase  = size * 0.54;
    var colBonus = size * 0.95;

    ctx.font = pixelFont(rf);
    for (var i = start; i < breakHistory.length; i++) {
      var e = breakHistory[i];
      var y = listTop + (i - start) * rowH + rf;

      // Ball name
      ctx.fillStyle = e.color;
      ctx.textAlign = 'left';
      ctx.fillText(e.name, colName, y);

      // Base value (or negative for fouls)
      var baseStr = (e.base >= 0 ? '+' : '') + e.base;
      ctx.fillStyle = e.base < 0 ? '#ff4136' : 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText(baseStr, colBase, y);

      // Bonus
      if (e.bonus > 0) {
        ctx.fillStyle = '#c8a530';
        ctx.fillText('+' + e.bonus + ' BONUS', colBonus, y);
      }
    }

    // Divider
    ctx.strokeStyle = '#282828';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.05, size * 0.82);
    ctx.lineTo(size * 0.95, size * 0.82);
    ctx.stroke();

    var sf = Math.max(8, Math.floor(size * 0.036));
    var hf = Math.max(5, Math.floor(size * 0.018));
    ctx.textAlign = 'center';

    if (settings.carry === 'on') {
      // SCORE — main metric
      var ss = sessionScore();
      ctx.font        = pixelFont(sf);
      ctx.fillStyle   = SNAKE_COLOR;
      ctx.shadowColor = SNAKE_COLOR;
      ctx.shadowBlur  = 8;
      ctx.fillText('SCORE  ' + String(ss).padStart(4, '0'), size / 2, size * 0.87);
      ctx.shadowBlur  = 0;

      // Context: frame + this-frame break
      ctx.font      = pixelFont(hf);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('FRAME ' + frameNumber, size / 2, size * 0.925);

      // Hi score comparison
      var ssNew = ss > 0 && ss >= hiScore;
      ctx.fillStyle = ssNew ? '#ffd700' : '#444';
      ctx.fillText(ssNew ? '// NEW HIGH SCORE!' : '// BEST: ' + String(hiScore).padStart(4, '0'),
        size / 2, size * 0.965);
    } else {
      // Carry OFF — original layout
      ctx.font        = pixelFont(sf);
      ctx.fillStyle   = SNAKE_COLOR;
      ctx.shadowColor = SNAKE_COLOR;
      ctx.shadowBlur  = 8;
      ctx.fillText('BREAK  ' + String(currentBreak).padStart(3, '0'), size / 2, size * 0.89);
      ctx.shadowBlur  = 0;

      var isNew = currentBreak > 0 && currentBreak >= highBreak;
      ctx.font      = pixelFont(hf);
      ctx.fillStyle = isNew ? '#ffd700' : '#444';
      ctx.fillText(isNew ? '// NEW HIGH BREAK!' : '// BEST: ' + String(highBreak).padStart(3, '0'),
        size / 2, size * 0.96);
    }

    if (showContinueHint) {
      var cf = Math.max(4, Math.floor(size * 0.015));
      ctx.font      = pixelFont(cf);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.textAlign = 'center';
      ctx.fillText('TAP  /  PRESS  TO  CONTINUE', size / 2, size * 0.993);
    }

    ctx.textAlign = 'left';
  }

  function drawGameOver(size)     { drawEndScreen(size, 'GAME OVER',  '#cc2200'); }
  function drawWinScreen(size) {
    var title = settings.carry === 'on' ? 'F.' + frameNumber + ' CLEAR' : 'FRAME OVER';
    drawEndScreen(size, title, '#ffd700');
  }
  function drawTimeUpScreen(size) { drawEndScreen(size, "TIME'S UP",  '#ff8c00'); }

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
      if (gameState === 'win' && settings.carry === 'on' && canRestart()) { nextFrame(); return; }
      if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) startGame();
      return;
    }
    var dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (gameState === 'playing') {
      queueDir(dir);
    } else if (gameState === 'win' && settings.carry === 'on' && canRestart()) {
      nextFrame(); queueDir(dir);
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
      if (gameState === 'win' && settings.carry === 'on' && canRestart()) { nextFrame(); return; }
      if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) startGame();
      return;
    }

    var dir = adx > ady
      ? (dx > 0 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 })
      : (dy > 0 ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });

    if (gameState === 'win' && settings.carry === 'on' && canRestart()) { nextFrame(); queueDir(dir); }
    else if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) { startGame(); queueDir(dir); }
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
      if (gameState === 'win' && settings.carry === 'on' && canRestart()) { nextFrame(); queueDir(dir); }
      else if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) { startGame(); queueDir(dir); }
      else if (gameState === 'playing') queueDir(dir);
    }
    btn.addEventListener('click', press);
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });

  // ============================================================
  // Action & Restart buttons
  // ============================================================
  actionBtn.addEventListener('click', function () {
    if (gameState === 'win' && settings.carry === 'on' && canRestart()) { nextFrame(); return; }
    if ((gameState === 'start' || gameState === 'gameover' || gameState === 'win' || gameState === 'timeup') && canRestart()) startGame();
  });

  restartBtn.addEventListener('click', startGame);

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
  hudBVal.textContent = highBreak;
  syncUI();
  updateHUD();

  function boot() { resizeCanvas(); draw(0); }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(boot);
  } else {
    setTimeout(boot, 150);
  }

}());
