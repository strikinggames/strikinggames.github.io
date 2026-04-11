(() => {
  const root = document.querySelector("[data-game-root]");
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-game-canvas]");
  const context = canvas.getContext("2d");
  const scoreValue = root.querySelector("[data-game-score]");
  const bestValue = root.querySelector("[data-game-best]");
  const heartElements = Array.from(root.querySelectorAll(".game-heart"));
  const tipElement = root.querySelector("[data-game-tip]");
  const menuOverlay = root.querySelector("[data-game-menu]");
  const gameOverOverlay = root.querySelector("[data-game-over]");
  const finalScoreElement = root.querySelector("[data-game-final-score]");
  const bestLineElement = root.querySelector("[data-game-best-line]");
  const startButton = root.querySelector("[data-game-start]");
  const retryButton = root.querySelector("[data-game-retry]");

  const VIEW_WIDTH = canvas.width;
  const VIEW_HEIGHT = canvas.height;
  const REFERENCE_ASPECT = 9 / 16;
  const VIEW_ASPECT = VIEW_WIDTH / VIEW_HEIGHT;
  const CAMERA_HALF_HEIGHT = clamp(
    9.6 * (REFERENCE_ASPECT / Math.max(0.1, VIEW_ASPECT)),
    8.2,
    12.5
  );
  const WORLD_HEIGHT = CAMERA_HALF_HEIGHT * 2;
  const PIXELS_PER_UNIT = VIEW_HEIGHT / WORLD_HEIGHT;
  const TOUCH_RADIUS = 0.62 * PIXELS_PER_UNIT;
  const GROUND_Y = VIEW_HEIGHT * 0.98;
  const SPAWN_Y = VIEW_HEIGHT * 0.02;
  const LANE_X_RATIOS = [0.1, 0.3, 0.5, 0.7, 0.9];
  const LANE_X_POSITIONS = LANE_X_RATIOS.map((ratio) => ratio * VIEW_WIDTH);
  const BEST_SCORE_KEY = "MeteorStrike.WebDemo.BestScore";
  const MAX_LIVES = 3;
  const POINTER_TRAIL_LIFETIME = 0.14;
  const EXPLOSION_FPS = 26;

  const spawnDelayCurve = [
    [0, 1.1],
    [45, 0.72],
    [90, 0.5],
    [140, 0.32],
    [210, 0.24],
  ];

  const fallSpeedCurve = [
    [0, 1],
    [45, 1.25],
    [90, 1.55],
    [140, 1.9],
    [210, 2.25],
  ];

  const meteorTypes = {
    normal: {
      key: "normal",
      sprite: "meteor_normal",
      points: 1,
      baseSpeed: 3.65,
      diameter: 1.0,
      colliderCoverage: 0.42,
      explosionScale: 1.0,
      floatingText: "+1",
      floatingColor: "#ffcf8b",
    },
    golden: {
      key: "golden",
      sprite: "meteor_golden",
      points: 5,
      baseSpeed: 3.9,
      diameter: 1.05,
      colliderCoverage: 0.44,
      explosionScale: 1.05,
      floatingText: "+5",
      floatingColor: "#fff3a0",
    },
    black: {
      key: "black",
      sprite: "meteor_black",
      points: 0,
      baseSpeed: 3.0,
      diameter: 1.0,
      colliderCoverage: 0.42,
      explosionScale: 0.95,
      floatingText: "-1 Life",
      floatingColor: "#ff8b8b",
    },
    splitting: {
      key: "splitting",
      sprite: "meteor_split",
      points: 0,
      baseSpeed: 3.35,
      diameter: 1.18,
      colliderCoverage: 0.46,
      explosionScale: 1.12,
      floatingText: "",
      floatingColor: "#ffd08a",
    },
    splitChild: {
      key: "splitChild",
      sprite: "meteor_split_child",
      points: 1,
      baseSpeed: 4.95,
      diameter: 0.62,
      colliderCoverage: 0.28,
      explosionScale: 0.7,
      floatingText: "+1",
      floatingColor: "#ffc57b",
    },
  };

  const pointer = {
    active: false,
    id: null,
    x: VIEW_WIDTH * 0.5,
    y: VIEW_HEIGHT * 0.82,
    prevX: VIEW_WIDTH * 0.5,
    prevY: VIEW_HEIGHT * 0.82,
    trail: [],
    interacted: false,
  };

  const state = {
    phase: "menu",
    score: 0,
    best: readBestScore(),
    lives: MAX_LIVES,
    elapsed: 0,
    spawnTimer: 0,
    meteors: [],
    explosions: [],
    floatingTexts: [],
    starsOffsetA: 0,
    starsOffsetB: 0,
    shakeTime: 0,
    shakeDuration: 0,
    shakeMagnitude: 0,
    assets: null,
    lastTime: performance.now(),
  };

  startButton.disabled = true;
  startButton.textContent = "Loading...";
  retryButton.disabled = true;

  updateHud();
  setTip("Load the demo assets", false);
  hideOverlay(gameOverOverlay);
  showOverlay(menuOverlay);

  const assetSources = {
    background: "assets/background_space.png",
    stars: "assets/stars_layer.png",
    heart: "assets/icon_heart.png",
    meteor_normal: "assets/meteor_normal.png",
    meteor_golden: "assets/meteor_golden.png",
    meteor_black: "assets/meteor_black.png",
    meteor_split: "assets/meteor_split.png",
    meteor_split_child: "assets/meteor_split_child.png",
    explosion_00: "assets/explosion_00.png",
    explosion_01: "assets/explosion_01.png",
    explosion_02: "assets/explosion_02.png",
    explosion_03: "assets/explosion_03.png",
    explosion_04: "assets/explosion_04.png",
    explosion_05: "assets/explosion_05.png",
    explosion_06: "assets/explosion_06.png",
    explosion_07: "assets/explosion_07.png",
  };

  Promise.all(
    Object.entries(assetSources).map(([key, source]) =>
      loadImage(source).then((image) => [key, image])
    )
  )
    .then((entries) => {
      state.assets = Object.fromEntries(entries);
      state.assets.explosions = Array.from({ length: 8 }, (_, index) => {
        return state.assets[`explosion_0${index}`];
      });

      startButton.disabled = false;
      retryButton.disabled = false;
      startButton.textContent = "Start Run";
      setTip("Hold and drag across meteors", false);
      startRun();
      requestAnimationFrame(frame);
    })
    .catch((error) => {
      console.error(error);
      setTip("Unable to load the web demo assets", false);
      startButton.textContent = "Load Failed";
    });

  startButton.addEventListener("click", () => {
    if (!state.assets) {
      return;
    }

    startRun();
  });

  retryButton.addEventListener("click", () => {
    if (!state.assets) {
      return;
    }

    startRun();
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("lostpointercapture", clearPointer);

  function frame(now) {
    const deltaSeconds = Math.min((now - state.lastTime) / 1000, 1 / 24);
    state.lastTime = now;

    updateBackground(deltaSeconds);
    updateEffects(deltaSeconds);

    if (state.phase === "playing") {
      updateGameplay(deltaSeconds);
    }

    render(now / 1000);
    requestAnimationFrame(frame);
  }

  function updateBackground(deltaSeconds) {
    state.starsOffsetA = (state.starsOffsetA + deltaSeconds * 22) % VIEW_HEIGHT;
    state.starsOffsetB = (state.starsOffsetB + deltaSeconds * 34) % VIEW_HEIGHT;
  }

  function updateGameplay(deltaSeconds) {
    state.elapsed += deltaSeconds;
    state.spawnTimer -= deltaSeconds;

    if (state.spawnTimer <= 0) {
      spawnMeteor(chooseMeteorKind());
      state.spawnTimer = currentSpawnDelay(state.elapsed);
    }

    if (pointer.active) {
      pushTrailPoint(pointer.x, pointer.y);
      scanPointerSegment(pointer.prevX, pointer.prevY, pointer.x, pointer.y);
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
    }

    for (let index = state.meteors.length - 1; index >= 0; index -= 1) {
      const meteor = state.meteors[index];
      if (meteor.removed) {
        continue;
      }

      meteor.rotation += meteor.rotationSpeed * deltaSeconds;

      if (meteor.type.key === "golden") {
        meteor.pulse = (meteor.pulse + deltaSeconds * 5) % (Math.PI * 2);
      }

      meteor.y += meteor.speed * deltaSeconds;

      if (pointer.active) {
        scanMeteorAgainstPoint(meteor, pointer.x, pointer.y);
        if (meteor.removed) {
          continue;
        }
      }

      if (meteor.y >= GROUND_Y) {
        handleGroundImpact(meteor);
      }
    }

    trimTrail();
  }

  function updateEffects(deltaSeconds) {
    for (let index = state.explosions.length - 1; index >= 0; index -= 1) {
      const explosion = state.explosions[index];
      explosion.time += deltaSeconds;

      if (explosion.time >= explosion.duration) {
        state.explosions.splice(index, 1);
      }
    }

    for (let index = state.floatingTexts.length - 1; index >= 0; index -= 1) {
      const floating = state.floatingTexts[index];
      floating.time += deltaSeconds;
      floating.y -= floating.speed * deltaSeconds;

      if (floating.time >= floating.duration) {
        state.floatingTexts.splice(index, 1);
      }
    }

    if (state.shakeTime > 0) {
      state.shakeTime = Math.max(0, state.shakeTime - deltaSeconds);
    }

    trimTrail();
  }

  function render(timeSeconds) {
    if (!state.assets) {
      context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      return;
    }

    context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    context.imageSmoothingEnabled = true;

    const shake = state.shakeTime > 0
      ? (state.shakeTime / Math.max(state.shakeDuration, 0.001)) * state.shakeMagnitude
      : 0;
    const shakeX = shake ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake ? (Math.random() - 0.5) * shake : 0;

    context.save();
    context.translate(shakeX, shakeY);

    drawBackground();
    drawLaneGuides();
    drawMeteors(timeSeconds);
    drawExplosions();
    drawTrail();
    drawFloatingTexts();
    drawGroundGlow();

    context.restore();
  }

  function drawBackground() {
    context.drawImage(state.assets.background, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    drawStarLayer(state.assets.stars, state.starsOffsetA, 0.2, 0.6);
    drawStarLayer(state.assets.stars, state.starsOffsetB, 0.28, 0.42);

    const topGlow = context.createLinearGradient(0, 0, 0, VIEW_HEIGHT * 0.24);
    topGlow.addColorStop(0, "rgba(255, 175, 82, 0.18)");
    topGlow.addColorStop(1, "rgba(255, 175, 82, 0)");
    context.fillStyle = topGlow;
    context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT * 0.24);
  }

  function drawStarLayer(image, offset, alpha, speedScale) {
    const layerHeight = VIEW_HEIGHT;
    const drawOffset = offset * speedScale;

    context.save();
    context.globalAlpha = alpha;
    context.drawImage(image, 0, drawOffset - layerHeight, VIEW_WIDTH, layerHeight);
    context.drawImage(image, 0, drawOffset, VIEW_WIDTH, layerHeight);
    context.restore();
  }

  function drawLaneGuides() {
    for (let index = 0; index < LANE_X_POSITIONS.length; index += 1) {
      const laneX = LANE_X_POSITIONS[index];
      const laneWidth = VIEW_WIDTH * 0.132;
      const left = laneX - laneWidth * 0.5;
      const gradient = context.createLinearGradient(0, 96, 0, VIEW_HEIGHT);
      gradient.addColorStop(0, "rgba(125, 220, 255, 0.03)");
      gradient.addColorStop(0.65, "rgba(125, 220, 255, 0)");
      gradient.addColorStop(1, "rgba(255, 112, 61, 0.08)");

      context.fillStyle = gradient;
      context.fillRect(left, 104, laneWidth, VIEW_HEIGHT - 180);

      context.strokeStyle = "rgba(159, 230, 255, 0.07)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(laneX, 112);
      context.lineTo(laneX, VIEW_HEIGHT - 64);
      context.stroke();
    }
  }

  function drawMeteors(timeSeconds) {
    for (let index = 0; index < state.meteors.length; index += 1) {
      const meteor = state.meteors[index];
      drawMeteorTail(meteor);

      const image = state.assets[meteor.type.sprite];
      const pulseScale = meteor.type.key === "golden"
        ? 1 + Math.sin(meteor.pulse + timeSeconds * 2.5) * 0.035
        : 1;

      context.save();
      context.translate(meteor.x, meteor.y);
      context.rotate((meteor.rotation * Math.PI) / 180);
      context.scale(pulseScale, pulseScale);
      context.drawImage(image, -meteor.size * 0.5, -meteor.size * 0.5, meteor.size, meteor.size);
      context.restore();
    }
  }

  function drawMeteorTail(meteor) {
    const tailLength = meteor.size * (meteor.type.key === "splitChild" ? 1.4 : 2.1);
    const tailWidth = meteor.size * (meteor.type.key === "splitChild" ? 0.18 : 0.24);
    const gradient = context.createLinearGradient(
      meteor.x,
      meteor.y - tailLength,
      meteor.x,
      meteor.y + meteor.size * 0.1
    );

    if (meteor.type.key === "golden") {
      gradient.addColorStop(0, "rgba(255, 239, 173, 0)");
      gradient.addColorStop(0.36, "rgba(255, 220, 114, 0.35)");
      gradient.addColorStop(1, "rgba(255, 158, 73, 0.02)");
    } else if (meteor.type.key === "black") {
      gradient.addColorStop(0, "rgba(194, 214, 232, 0)");
      gradient.addColorStop(0.34, "rgba(136, 162, 194, 0.22)");
      gradient.addColorStop(1, "rgba(42, 55, 69, 0.03)");
    } else {
      gradient.addColorStop(0, "rgba(255, 203, 136, 0)");
      gradient.addColorStop(0.34, "rgba(255, 164, 96, 0.32)");
      gradient.addColorStop(1, "rgba(255, 97, 48, 0.03)");
    }

    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(meteor.x - tailWidth * 0.5, meteor.y);
    context.lineTo(meteor.x + tailWidth * 0.5, meteor.y);
    context.lineTo(meteor.x + tailWidth * 0.16, meteor.y - tailLength);
    context.lineTo(meteor.x - tailWidth * 0.16, meteor.y - tailLength);
    context.closePath();
    context.fill();
  }

  function drawExplosions() {
    for (let index = 0; index < state.explosions.length; index += 1) {
      const explosion = state.explosions[index];
      const progress = explosion.time / explosion.duration;
      const frameIndex = Math.min(
        state.assets.explosions.length - 1,
        Math.floor(explosion.time * EXPLOSION_FPS)
      );
      const frame = state.assets.explosions[frameIndex];
      const glowRadius = explosion.size * (0.78 + progress * 0.38);

      context.save();
      context.globalAlpha = 0.35 * (1 - progress);
      const glow = context.createRadialGradient(
        explosion.x,
        explosion.y,
        0,
        explosion.x,
        explosion.y,
        glowRadius
      );
      glow.addColorStop(0, explosion.glow);
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(explosion.x, explosion.y, glowRadius, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.save();
      context.globalAlpha = 1 - progress * 0.45;
      context.drawImage(
        frame,
        explosion.x - explosion.size * 0.5,
        explosion.y - explosion.size * 0.5,
        explosion.size,
        explosion.size
      );
      context.restore();
    }
  }

  function drawTrail() {
    if (!pointer.trail.length) {
      return;
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    const glowPath = new Path2D();
    const linePath = new Path2D();

    for (let index = 0; index < pointer.trail.length; index += 1) {
      const point = pointer.trail[index];
      if (index === 0) {
        glowPath.moveTo(point.x, point.y);
        linePath.moveTo(point.x, point.y);
      } else {
        glowPath.lineTo(point.x, point.y);
        linePath.lineTo(point.x, point.y);
      }
    }

    context.strokeStyle = "rgba(125, 228, 255, 0.18)";
    context.lineWidth = 24;
    context.stroke(glowPath);

    context.strokeStyle = "rgba(167, 240, 255, 0.96)";
    context.lineWidth = 8;
    context.stroke(linePath);

    const latest = pointer.trail[pointer.trail.length - 1];
    context.strokeStyle = "rgba(167, 240, 255, 0.95)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(latest.x, latest.y, 23, 0, Math.PI * 2);
    context.stroke();

    context.globalAlpha = 0.14;
    context.beginPath();
    context.arc(latest.x, latest.y, TOUCH_RADIUS, 0, Math.PI * 2);
    context.fillStyle = "rgba(139, 225, 255, 0.9)";
    context.fill();
    context.restore();
  }

  function drawFloatingTexts() {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (let index = 0; index < state.floatingTexts.length; index += 1) {
      const floating = state.floatingTexts[index];
      const alpha = 1 - floating.time / floating.duration;

      context.globalAlpha = alpha;
      context.fillStyle = floating.color;
      context.font = "800 30px 'Avenir Next Condensed', 'Trebuchet MS', sans-serif";
      context.fillText(floating.text, floating.x, floating.y);
    }

    context.restore();
  }

  function drawGroundGlow() {
    const gradient = context.createLinearGradient(0, VIEW_HEIGHT - 150, 0, VIEW_HEIGHT);
    gradient.addColorStop(0, "rgba(255, 119, 68, 0)");
    gradient.addColorStop(0.5, "rgba(255, 119, 68, 0.08)");
    gradient.addColorStop(1, "rgba(255, 119, 68, 0.18)");
    context.fillStyle = gradient;
    context.fillRect(0, VIEW_HEIGHT - 180, VIEW_WIDTH, 180);

    context.strokeStyle = "rgba(255, 176, 94, 0.38)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, GROUND_Y);
    context.lineTo(VIEW_WIDTH, GROUND_Y);
    context.stroke();
  }

  function startRun() {
    state.phase = "playing";
    state.score = 0;
    state.lives = MAX_LIVES;
    state.elapsed = 0;
    state.spawnTimer = 0;
    state.meteors = [];
    state.explosions = [];
    state.floatingTexts = [];
    state.shakeTime = 0;
    state.shakeDuration = 0;
    state.shakeMagnitude = 0;
    pointer.active = false;
    pointer.id = null;
    pointer.x = VIEW_WIDTH * 0.5;
    pointer.y = VIEW_HEIGHT * 0.82;
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.trail = [];
    pointer.interacted = false;

    updateHud();
    setTip("Hold and drag across meteors", true);
    hideOverlay(menuOverlay);
    hideOverlay(gameOverOverlay);
  }

  function endRun() {
    state.phase = "gameover";
    pointer.active = false;
    pointer.id = null;
    pointer.trail = [];
    state.meteors = [];
    updateHud();
    finalScoreElement.textContent = `Final Score ${state.score}`;
    bestLineElement.textContent = `Best ${state.best}`;
    hideTip();
    showOverlay(gameOverOverlay);
  }

  function chooseMeteorKind() {
    const roll = Math.random();
    const goldenChance = state.elapsed >= 10 ? randomBetween(0.05, 0.08) : 0;

    if (state.elapsed >= 30) {
      if (roll < goldenChance) {
        return meteorTypes.golden;
      }
      if (roll < goldenChance + 0.13) {
        return meteorTypes.black;
      }
      if (roll < goldenChance + 0.29) {
        return meteorTypes.splitting;
      }
      return meteorTypes.normal;
    }

    if (state.elapsed >= 20) {
      if (roll < goldenChance) {
        return meteorTypes.golden;
      }
      if (roll < goldenChance + 0.22) {
        return meteorTypes.splitting;
      }
      return meteorTypes.normal;
    }

    if (state.elapsed >= 10 && roll < goldenChance) {
      return meteorTypes.golden;
    }

    return meteorTypes.normal;
  }

  function spawnMeteor(type, laneIndex = randomInt(0, LANE_X_POSITIONS.length - 1), y = SPAWN_Y, speedMultiplier = 1) {
    const size = type.diameter * PIXELS_PER_UNIT;
    const colliderRadius = type.colliderCoverage * 0.5 * size;
    const meteor = {
      type,
      laneIndex,
      x: LANE_X_POSITIONS[laneIndex],
      y,
      size,
      colliderRadius,
      speed:
        type.baseSpeed *
        PIXELS_PER_UNIT *
        currentFallMultiplier(state.elapsed) *
        speedMultiplier,
      rotation: randomBetween(0, 360),
      rotationSpeed: randomBetween(-130, 130),
      pulse: randomBetween(0, Math.PI * 2),
      removed: false,
    };

    state.meteors.push(meteor);
  }

  function spawnSplitChildren(parent) {
    const leftLane = Math.max(0, parent.laneIndex - 1);
    const rightLane = Math.min(LANE_X_POSITIONS.length - 1, parent.laneIndex + 1);
    const childY = parent.y - 0.14 * PIXELS_PER_UNIT;

    spawnMeteor(
      meteorTypes.splitChild,
      leftLane,
      childY,
      1.45 * randomBetween(1, 1.18)
    );
    spawnMeteor(
      meteorTypes.splitChild,
      rightLane,
      childY,
      1.45 * randomBetween(1, 1.18)
    );
  }

  function removeMeteor(meteor) {
    meteor.removed = true;
    const index = state.meteors.indexOf(meteor);
    if (index >= 0) {
      state.meteors.splice(index, 1);
    }
  }

  function handleMeteorTouch(meteor) {
    if (state.phase !== "playing" || meteor.removed) {
      return;
    }

    removeMeteor(meteor);

    if (meteor.type.key === "black") {
      loseLife(meteor.x, meteor.y, meteor.type.floatingText, meteor.type.floatingColor);
      spawnExplosion(meteor.x, meteor.y, meteor.size * 1.08, "rgba(255, 95, 95, 0.92)");
      return;
    }

    if (meteor.type.key === "splitting") {
      spawnSplitChildren(meteor);
      spawnExplosion(meteor.x, meteor.y, meteor.size * 1.18, "rgba(255, 178, 86, 0.92)");
      addShake(12, 0.1);
      return;
    }

    state.score += meteor.type.points;
    if (state.score > state.best) {
      state.best = state.score;
      writeBestScore(state.best);
    }

    updateHud();
    spawnExplosion(meteor.x, meteor.y, meteor.size * 1.08, "rgba(255, 180, 80, 0.92)");
    spawnFloatingText(meteor.x, meteor.y, meteor.type.floatingText, meteor.type.floatingColor);
    addShake(meteor.type.key === "golden" ? 12 : 8, 0.08);
  }

  function handleGroundImpact(meteor) {
    if (meteor.removed) {
      return;
    }

    removeMeteor(meteor);

    if (meteor.type.key === "black") {
      return;
    }

    spawnExplosion(meteor.x, GROUND_Y - meteor.size * 0.22, meteor.size, "rgba(255, 112, 76, 0.85)");
    loseLife(meteor.x, GROUND_Y - 36, "-1 Life", "#ff8b8b");
  }

  function loseLife(x, y, text, color) {
    state.lives = Math.max(0, state.lives - 1);
    spawnFloatingText(x, y, text, color);
    addShake(16, 0.12);
    updateHud();

    if (state.lives === 0) {
      endRun();
    }
  }

  function spawnExplosion(x, y, size, glow) {
    state.explosions.push({
      x,
      y,
      size,
      glow,
      time: 0,
      duration: state.assets.explosions.length / EXPLOSION_FPS,
    });
  }

  function spawnFloatingText(x, y, text, color) {
    if (!text) {
      return;
    }

    state.floatingTexts.push({
      x,
      y,
      text,
      color,
      speed: 88,
      time: 0,
      duration: 0.7,
    });
  }

  function addShake(magnitude, duration) {
    state.shakeMagnitude = Math.max(state.shakeMagnitude, magnitude);
    state.shakeDuration = Math.max(state.shakeDuration, duration);
    state.shakeTime = Math.max(state.shakeTime, duration);
  }

  function currentSpawnDelay(elapsedSeconds) {
    return Math.max(0.14, evaluateCurve(spawnDelayCurve, elapsedSeconds));
  }

  function currentFallMultiplier(elapsedSeconds) {
    const earlyBoost = lerp(1.3, 1.08, clamp(elapsedSeconds / 90, 0, 1));
    return Math.max(0.5, evaluateCurve(fallSpeedCurve, elapsedSeconds) * earlyBoost);
  }

  function evaluateCurve(curve, elapsedSeconds) {
    if (elapsedSeconds <= curve[0][0]) {
      return curve[0][1];
    }

    for (let index = 1; index < curve.length; index += 1) {
      const [currentTime, currentValue] = curve[index];
      const [previousTime, previousValue] = curve[index - 1];

      if (elapsedSeconds <= currentTime) {
        const t = (elapsedSeconds - previousTime) / (currentTime - previousTime);
        return lerp(previousValue, currentValue, t);
      }
    }

    return curve[curve.length - 1][1];
  }

  function scanPointerSegment(ax, ay, bx, by) {
    for (let index = state.meteors.length - 1; index >= 0; index -= 1) {
      const meteor = state.meteors[index];
      const radius = TOUCH_RADIUS + meteor.colliderRadius;
      const distanceSquared = distanceSquaredToSegment(meteor.x, meteor.y, ax, ay, bx, by);

      if (distanceSquared <= radius * radius) {
        handleMeteorTouch(meteor);
      }
    }
  }

  function scanMeteorAgainstPoint(meteor, x, y) {
    const radius = TOUCH_RADIUS + meteor.colliderRadius;
    const dx = meteor.x - x;
    const dy = meteor.y - y;

    if (dx * dx + dy * dy <= radius * radius) {
      handleMeteorTouch(meteor);
    }
  }

  function pushTrailPoint(x, y) {
    const now = performance.now() / 1000;
    const lastPoint = pointer.trail[pointer.trail.length - 1];

    if (lastPoint && Math.hypot(lastPoint.x - x, lastPoint.y - y) < 8) {
      lastPoint.x = x;
      lastPoint.y = y;
      lastPoint.time = now;
      return;
    }

    pointer.trail.push({ x, y, time: now });
  }

  function trimTrail() {
    const now = performance.now() / 1000;
    while (pointer.trail.length && now - pointer.trail[0].time > POINTER_TRAIL_LIFETIME) {
      pointer.trail.shift();
    }
  }

  function onPointerDown(event) {
    if (state.phase !== "playing" || pointer.id !== null) {
      return;
    }

    pointer.id = event.pointerId;
    pointer.active = true;
    pointer.interacted = true;
    updatePointerPosition(event, true);
    pushTrailPoint(pointer.x, pointer.y);
    hideTip();

    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
  }

  function onPointerMove(event) {
    if (state.phase !== "playing" || event.pointerId !== pointer.id) {
      return;
    }

    updatePointerPosition(event, false);
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (event.pointerId !== pointer.id) {
      return;
    }

    clearPointer();
    event.preventDefault();
  }

  function clearPointer() {
    pointer.active = false;
    pointer.id = null;
  }

  function updatePointerPosition(event, resetPrevious) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = VIEW_WIDTH / rect.width;
    const scaleY = VIEW_HEIGHT / rect.height;
    const x = clamp((event.clientX - rect.left) * scaleX, 0, VIEW_WIDTH);
    const y = clamp((event.clientY - rect.top) * scaleY, 96, VIEW_HEIGHT);

    if (resetPrevious) {
      pointer.prevX = x;
      pointer.prevY = y;
    }

    pointer.x = x;
    pointer.y = y;
  }

  function updateHud() {
    scoreValue.textContent = String(state.score);
    bestValue.textContent = String(state.best);

    for (let index = 0; index < heartElements.length; index += 1) {
      heartElements[index].classList.toggle("is-empty", index >= state.lives);
    }
  }

  function setTip(text, visible) {
    tipElement.textContent = text;
    tipElement.classList.toggle("is-hidden", !visible);
  }

  function hideTip() {
    tipElement.classList.add("is-hidden");
  }

  function showOverlay(element) {
    element.hidden = false;
  }

  function hideOverlay(element) {
    element.hidden = true;
  }

  function readBestScore() {
    try {
      return Number.parseInt(window.localStorage.getItem(BEST_SCORE_KEY) || "0", 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  function writeBestScore(value) {
    try {
      window.localStorage.setItem(BEST_SCORE_KEY, String(value));
    } catch (error) {
      // Ignore storage failures in local preview environments.
    }
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load ${source}`));
      image.src = source;
    });
  }

  function distanceSquaredToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLengthSquared = abx * abx + aby * aby || 1;
    const t = clamp((apx * abx + apy * aby) / abLengthSquared, 0, 1);
    const closestX = ax + abx * t;
    const closestY = ay + aby * t;
    const dx = px - closestX;
    const dy = py - closestY;
    return dx * dx + dy * dy;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(randomBetween(min, max + 1));
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
