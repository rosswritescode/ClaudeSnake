(function () {
  'use strict';

  // ============================================================
  // Config
  // ============================================================
  const GRID_SIZES = { small: 15, medium: 20, large: 30 };
  const SPEEDS     = { slow: 200, normal: 120, fast: 65 };
  const SNAKE_COLOR = '#00ff41';
  const FOOD_COLOR  = '#ff4136';

  // ============================================================
  // State
  // ============================================================
  let gameState = 'start'; // 'start' | 'playing' | 'paused' | 'gameover'
  let snake, currentDir, nextDir, food, score;
  let highScore  = parseInt(localStorage.getItem('serpentine_hi') || '0', 10);
  let animId, lastMoveTime, dpr, cols, cellSize;
  let settings   = { size: 'medium', speed: 'normal' };

  // ============================================================
  // DOM refs
  // ============================================================
  const canvas     = document.getElementById('game-canvas');
  const ctx        = canvas.getContext('2d');
  const scoreEl    = document.getElementById('score-val');
  const hiEl       = document.getElementById('hi-val');
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
    const mid    = Math.floor(cols / 2);
    const midY   = Math.floor(cols / 2);
    const len    = Math.min(4, Math.floor(cols / 4));
    snake = [];
    for (let i = 0; i < len; i++) snake.push({ x: mid - i, y: midY });
    currentDir = { dx: 1, dy: 0 };
    nextDir    = null;
    score      = 0;
    placeFood();
    lastMoveTime = 0;
    updateHUD();
  }

  // ============================================================
  // Food
  // ============================================================
  function placeFood() {
    const occupied = new Set(snake.map(function (s) { return s.x + ',' + s.y; }));
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * cols),
        y: Math.floor(Math.random() * cols),
      };
    } while (occupied.has(pos.x + ',' + pos.y));
    food = pos;
  }

  // ============================================================
  // Direction queue—prevents 180° reversal
  // ============================================================
  function queueDir(dir) {
    const ref = nextDir || currentDir;
    if (dir.dx === -ref.dx && dir.dy === -ref.dy) return;
    nextDir = dir;
  }

  // ============================================================
  // Movement step
  // ============================================================
  function step() {
    if (nextDir) { currentDir = nextDir; nextDir = null; }

    const nx = snake[0].x + currentDir.dx;
    const ny = snake[0].y + currentDir.dy;

    if (nx < 0 || nx >= cols || ny < 0 || ny >= cols) { endGame(); return; }

    for (let i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === nx && snake[i].y === ny) { endGame(); return; }
    }

    snake.unshift({ x: nx, y: ny });

    if (nx === food.x && ny === food.y) {
      score++;
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('serpentine_hi', String(highScore));
      }
      updateHUD();
      placeFood();
    } else {
      snake.pop();
    }
  }

  // ============================================================
  // HUD
  // ============================================================
  function updateHUD() {
    scoreEl.textContent    = score;
    hiEl.textContent       = highScore;
    navScoreEl.textContent = score;
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

  function togglePause() {
    if (gameState === 'playing') {
      gameState = 'paused';
      cancelAnimationFrame(animId);
      animId = null;
      syncUI();
      draw(0);
    } else if (gameState === 'paused') {
      gameState    = 'playing';
      lastMoveTime = 0;
      syncUI();
      animId = requestAnimationFrame(gameLoop);
    }
  }

  function endGame() {
    gameState = 'gameover';
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    syncUI();
    draw(0);
  }

  function syncUI() {
    var labels = { start: 'START GAME', playing: 'PAUSE', paused: 'RESUME', gameover: 'PLAY AGAIN' };
    actionBtn.textContent = labels[gameState];
    restartBtn.hidden = (gameState !== 'playing' && gameState !== 'paused');
  }

  // ============================================================
  // Game loop
  // ============================================================
  function gameLoop(ts) {
    animId = requestAnimationFrame(gameLoop);
    if (ts - lastMoveTime >= SPEEDS[settings.speed]) {
      lastMoveTime = ts;
      step();
      if (gameState !== 'playing') return;
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
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);
    drawGrid(size);

    if (gameState === 'start')    { drawStartScreen(size); return; }

    drawFood(ts, size);
    drawSnake(size);

    if (gameState === 'paused')   drawOverlay(size, 'PAUSED',    '// TAP OR PRESS P TO RESUME', SNAKE_COLOR);
    if (gameState === 'gameover') drawGameOver(size);
  }

  function drawGrid(size) {
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth   = 0.5;
    for (var i = 0; i <= cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * cellSize, 0);    ctx.lineTo(i * cellSize, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cellSize);    ctx.lineTo(size, i * cellSize); ctx.stroke();
    }
  }

  function drawSnake() {
    var len = snake.length;
    snake.forEach(function (seg, i) {
      var alpha = i === 0 ? 1 : Math.max(0.2, 1 - (i / len) * 0.78);
      ctx.fillStyle   = 'rgba(0,255,65,' + alpha + ')';
      ctx.shadowColor = SNAKE_COLOR;
      ctx.shadowBlur  = i === 0 ? 14 : 0;
      var p = Math.max(1, cellSize * 0.07);
      ctx.fillRect(seg.x * cellSize + p, seg.y * cellSize + p, cellSize - p * 2, cellSize - p * 2);
    });
    ctx.shadowBlur = 0;
  }

  function drawFood(ts) {
    var pulse = 0.55 + 0.45 * Math.sin(ts / 300);
    ctx.globalAlpha = pulse;
    ctx.fillStyle   = FOOD_COLOR;
    ctx.shadowColor = FOOD_COLOR;
    ctx.shadowBlur  = 16;
    var p = Math.max(1, cellSize * 0.12);
    ctx.fillRect(food.x * cellSize + p, food.y * cellSize + p, cellSize - p * 2, cellSize - p * 2);
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
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
    ctx.fillText('SERPENTINE', size / 2, size * 0.4);
    ctx.shadowBlur = 0;

    var s = Math.max(6, Math.floor(size * 0.024));
    ctx.font      = pixelFont(s);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillText('SELECT OPTIONS + PRESS START', size / 2, size * 0.4 + t * 2.4);
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

    var t = Math.max(11, Math.floor(size * 0.046));
    ctx.font        = pixelFont(t);
    ctx.fillStyle   = FOOD_COLOR;
    ctx.shadowColor = FOOD_COLOR;
    ctx.shadowBlur  = 16;
    ctx.fillText('GAME OVER', size / 2, size * 0.35);
    ctx.shadowBlur = 0;

    var sc = Math.max(10, Math.floor(size * 0.042));
    ctx.font        = pixelFont(sc);
    ctx.fillStyle   = SNAKE_COLOR;
    ctx.shadowColor = SNAKE_COLOR;
    ctx.shadowBlur  = 10;
    ctx.fillText(String(score).padStart(5, '0'), size / 2, size * 0.35 + t * 2.2);
    ctx.shadowBlur = 0;

    var hi = Math.max(6, Math.floor(size * 0.021));
    ctx.font      = pixelFont(hi);
    var isNew     = score > 0 && score >= highScore;
    ctx.fillStyle = isNew ? '#ffd700' : '#444';
    var hiText    = isNew
      ? '// NEW HIGH SCORE!'
      : '// BEST: ' + String(highScore).padStart(5, '0');
    ctx.fillText(hiText, size / 2, size * 0.35 + t * 2.2 + sc * 2.5);

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
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (gameState === 'playing' || gameState === 'paused') {
        e.preventDefault();
        togglePause();
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (gameState === 'start' || gameState === 'gameover') startGame();
      else togglePause();
      return;
    }

    var dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();

    if (gameState === 'playing') {
      queueDir(dir);
    } else if (gameState === 'paused') {
      queueDir(dir);
      togglePause();
    } else if (gameState === 'start' || gameState === 'gameover') {
      startGame();
      queueDir(dir);
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
    var dx  = e.changedTouches[0].clientX - t0x;
    var dy  = e.changedTouches[0].clientY - t0y;
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    t0x = t0y = undefined;
    e.preventDefault();

    if (Math.max(adx, ady) < 20) {
      if (gameState === 'start' || gameState === 'gameover') startGame();
      else togglePause();
      return;
    }

    var dir = adx > ady
      ? (dx > 0 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 })
      : (dy > 0 ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });

    if (gameState === 'start' || gameState === 'gameover') {
      startGame();
      queueDir(dir);
    } else if (gameState === 'paused') {
      queueDir(dir);
      togglePause();
    } else {
      queueDir(dir);
    }
  }, { passive: false });

  // ============================================================
  // D-pad input
  // ============================================================
  var DPAD_DIRS = {
    up:    { dx: 0, dy: -1 }, down:  { dx: 0, dy: 1 },
    left:  { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
  };

  document.querySelectorAll('.dpad-btn').forEach(function (btn) {
    function press() {
      var dir = DPAD_DIRS[btn.dataset.dir];
      if (!dir) return;
      if (gameState === 'start' || gameState === 'gameover') {
        startGame();
        queueDir(dir);
      } else if (gameState === 'paused') {
        queueDir(dir);
        togglePause();
      } else {
        queueDir(dir);
      }
    }
    btn.addEventListener('click', press);
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });

  // ============================================================
  // Action & Restart buttons
  // ============================================================
  actionBtn.addEventListener('click', function () {
    if (gameState === 'start' || gameState === 'gameover') startGame();
    else togglePause();
  });

  restartBtn.addEventListener('click', startGame);

  // ============================================================
  // Settings buttons
  // ============================================================
  document.querySelectorAll('.setting-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var setting = btn.dataset.setting;
      var value   = btn.dataset.value;
      settings[setting] = value;
      document.querySelectorAll('.setting-btn[data-setting="' + setting + '"]').forEach(function (b) {
        b.classList.toggle('setting-btn--active', b.dataset.value === value);
      });
    });
  });

  // ============================================================
  // Window resize
  // ============================================================
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var wasPlaying = gameState === 'playing';
      if (wasPlaying) {
        cancelAnimationFrame(animId);
        animId    = null;
        gameState = 'paused';
        syncUI();
      }
      resizeCanvas();
      draw(0);
    }, 200);
  });

  // ============================================================
  // Visibility—auto-pause when tab hidden
  // ============================================================
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && gameState === 'playing') togglePause();
  });

  // ============================================================
  // Boot
  // ============================================================
  hiEl.textContent = highScore;
  syncUI();

  function boot() {
    resizeCanvas();
    draw(0);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(boot);
  } else {
    setTimeout(boot, 150);
  }

}());
