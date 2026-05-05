(function () {
  'use strict';

  // ============================================================
  // Module 1: Canvas Snake Animation
  // ============================================================

  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');

  const CELL = 20;
  const MOVE_INTERVAL = 120;

  let cols, rows, segments, direction, food, score, animFrameId, lastMoveTime, dpr;

  function resizeCanvas() {
    const wrapper = document.querySelector('.hero-canvas-wrapper');
    dpr = window.devicePixelRatio || 1;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    cols = Math.floor(w / CELL);
    rows = Math.floor(h / CELL);
    initSnake();
  }

  function initSnake() {
    const startX = Math.floor(cols / 3);
    const startY = Math.floor(rows / 2);
    const len = Math.min(8, Math.floor(cols / 4));
    segments = [];
    for (let i = 0; i < len; i++) {
      segments.push({ x: startX - i, y: startY });
    }
    direction = { dx: 1, dy: 0 };
    score = 0;
    placeFood();
    lastMoveTime = 0;
  }

  function placeFood() {
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * cols),
        y: Math.floor(Math.random() * rows),
      };
    } while (segments.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
  }

  function isBodyCollision(x, y, ignoreTail) {
    const limit = ignoreTail ? segments.length - 1 : segments.length;
    for (let i = 0; i < limit; i++) {
      if (segments[i].x === x && segments[i].y === y) return true;
    }
    return false;
  }

  function isWall(x, y) {
    return x < 0 || x >= cols || y < 0 || y >= rows;
  }

  function chooseDirection() {
    const head = segments[0];
    const candidates = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ].filter(d => {
      if (d.dx === -direction.dx && d.dy === -direction.dy) return false;
      const nx = head.x + d.dx;
      const ny = head.y + d.dy;
      return !isWall(nx, ny) && !isBodyCollision(nx, ny, true);
    });

    if (candidates.length === 0) return direction;

    candidates.sort((a, b) => {
      const da = Math.abs((head.x + a.dx) - food.x) + Math.abs((head.y + a.dy) - food.y);
      const db = Math.abs((head.x + b.dx) - food.x) + Math.abs((head.y + b.dy) - food.y);
      return da - db;
    });

    return candidates[0];
  }

  function moveSnake() {
    direction = chooseDirection();
    const head = segments[0];
    const newHead = { x: head.x + direction.dx, y: head.y + direction.dy };

    if (isWall(newHead.x, newHead.y) || isBodyCollision(newHead.x, newHead.y, false)) {
      initSnake();
      return;
    }

    segments.unshift(newHead);

    if (newHead.x === food.x && newHead.y === food.y) {
      score++;
      placeFood();
    } else {
      segments.pop();
    }
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 0.5;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, h);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(w, y * CELL);
      ctx.stroke();
    }
  }

  function drawFood(timestamp) {
    const pulse = 0.55 + 0.45 * Math.sin(timestamp / 300);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff4136';
    ctx.shadowColor = '#ff4136';
    ctx.shadowBlur = 16;
    ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawSnake() {
    const len = segments.length;
    segments.forEach((seg, i) => {
      const alpha = 1 - (i / len) * 0.75;
      ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
      if (i === 0) {
        ctx.shadowColor = '#00ff41';
        ctx.shadowBlur = 14;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.shadowBlur = 0;
  }

  function drawScore() {
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(0, 255, 65, 0.5)';
    ctx.fillText('SCORE: ' + score, 10, 16);
  }

  function draw(timestamp) {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.fillStyle = 'rgba(10, 10, 10, 0.88)';
    ctx.fillRect(0, 0, w, h);
    drawGrid();
    drawFood(timestamp);
    drawSnake();
    drawScore();
  }

  function gameLoop(timestamp) {
    animFrameId = requestAnimationFrame(gameLoop);
    if (timestamp - lastMoveTime >= MOVE_INTERVAL) {
      lastMoveTime = timestamp;
      moveSnake();
    }
    draw(timestamp);
  }

  function startAnimation() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function stopAnimation() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion) {
    resizeCanvas();
    startAnimation();

    let resizeTimeout;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 150);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopAnimation();
      } else {
        lastMoveTime = 0;
        startAnimation();
      }
    });
  }

  // ============================================================
  // Module 2: Countdown Timer
  // ============================================================

  const LAUNCH_DATE = new Date('2026-09-01T00:00:00Z');

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function updateCountdown() {
    const delta = LAUNCH_DATE - Date.now();
    const countdownEl = document.querySelector('.countdown');

    if (delta <= 0) {
      countdownEl.innerHTML = '<p class="launch-live">// WE ARE LIVE</p>';
      return;
    }

    document.getElementById('cd-days').textContent  = pad(Math.floor(delta / 864e5));
    document.getElementById('cd-hours').textContent = pad(Math.floor((delta % 864e5) / 36e5));
    document.getElementById('cd-mins').textContent  = pad(Math.floor((delta % 36e5) / 6e4));
    document.getElementById('cd-secs').textContent  = pad(Math.floor((delta % 6e4) / 1e3));
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  // ============================================================
  // Module 3: Form, Nav, Scroll, Cards
  // ============================================================

  // --- Email form ---
  document.getElementById('signup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const input    = document.getElementById('email-input');
    const feedback = document.getElementById('form-feedback');
    const email    = input.value.trim();
    const valid    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!email || !valid) {
      feedback.textContent  = '// INVALID SIGNAL. CHECK YOUR EMAIL.';
      feedback.className    = 'form-feedback form-feedback--error';
      input.focus();
      return;
    }

    input.disabled       = true;
    feedback.textContent = '// TRANSMITTING...';
    feedback.className   = 'form-feedback';

    setTimeout(function () {
      feedback.textContent = "// SIGNAL RECEIVED. YOU'RE ON THE LIST.";
      feedback.className   = 'form-feedback form-feedback--success';
      input.value          = '';
      input.disabled       = false;
    }, 800);
  });

  // --- Mobile nav toggle ---
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks  = document.querySelector('.nav-links');

  navToggle.addEventListener('click', function () {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navLinks.classList.toggle('nav-links--open');
  });

  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('nav-links--open');
    });
  });

  // --- Sticky header shrink ---
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', function () {
    header.classList.toggle('site-header--scrolled', window.scrollY > 50);
  }, { passive: true });

  // --- Feature card reveal ---
  if (!prefersReducedMotion) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll('.feature-card').forEach(function (card) {
      observer.observe(card);
    });
  }

}());
