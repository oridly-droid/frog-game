const canvas = document.getElementById("prototype-canvas");
const ctx = canvas.getContext("2d");
const buttons = Array.from(document.querySelectorAll(".pose-btn"));

const state = {
  pose: "idle",
  time: 0,
  width: 0,
  height: 0,
  dpr: 1,
  baseScale: 1,
};

const silhouette = {
  fill: "#111511",
  mid: "#1c231c",
  rear: "#1a2019",
  edge: "rgba(240, 235, 210, 0.08)",
  groundShadow: "rgba(19, 23, 18, 0.14)",
  swordWrap: "#242a24",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRectPath(targetCtx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  targetCtx.beginPath();
  targetCtx.moveTo(x + r, y);
  targetCtx.arcTo(x + width, y, x + width, y + height, r);
  targetCtx.arcTo(x + width, y + height, x, y + height, r);
  targetCtx.arcTo(x, y + height, x, y, r);
  targetCtx.arcTo(x, y, x + width, y, r);
  targetCtx.closePath();
}

function setPose(nextPose) {
  state.pose = nextPose;
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.pose === nextPose);
  });
  draw();
}

function resize() {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  state.dpr = dpr;
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.round(state.width * dpr);
  canvas.height = Math.round(state.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.baseScale = Math.min(state.width, state.height) * 0.19;
  draw();
}

function getPoseConfig() {
  const bob = Math.sin(state.time * 2.8) * 0.9;

  const configs = {
    idle: {
      labelZh: "待机剪影",
      bodyLean: -0.12,
      headTilt: -0.04,
      crouch: 1.08,
      hipDrop: 0,
      chestShift: -0.02,
      frontLeg: { hip: 0.68, knee: 1.52, ankle: -0.22 },
      backLeg: { hip: -0.78, knee: 1.16, ankle: 0.34 },
      frontArm: { shoulder: 0.74, elbow: 1.46, wrist: 0.34 },
      backArm: { shoulder: -1.08, elbow: -0.36, wrist: 0.18 },
      swordMode: "back",
      swordAngle: -1.14,
      swordShiftX: -0.18,
      swordShiftY: -0.1,
      slashArc: null,
      bodyOffsetX: 0,
      bodyOffsetY: bob,
      faceFocus: 0.12,
    },
    walk: {
      labelZh: "前倾行走剪影",
      bodyLean: 0.28,
      headTilt: -0.12,
      crouch: 1.02,
      hipDrop: 3,
      chestShift: 12,
      frontLeg: { hip: 0.24, knee: 1.02, ankle: -0.4 },
      backLeg: { hip: -1.28, knee: 1.38, ankle: 0.54 },
      frontArm: { shoulder: 1.02, elbow: 1.66, wrist: 0.52 },
      backArm: { shoulder: -1.34, elbow: -0.82, wrist: 0.06 },
      swordMode: "back",
      swordAngle: -0.92,
      swordShiftX: -0.2,
      swordShiftY: -0.14,
      slashArc: null,
      bodyOffsetX: 8,
      bodyOffsetY: bob * 0.6,
      faceFocus: 0.22,
    },
    pounce: {
      labelZh: "第二段前扑斩剪影",
      bodyLean: 0.72,
      headTilt: 0.22,
      crouch: 0.94,
      hipDrop: -6,
      chestShift: 34,
      frontLeg: { hip: -0.24, knee: 0.26, ankle: -0.72 },
      backLeg: { hip: -1.82, knee: 0.8, ankle: 0.78 },
      frontArm: { shoulder: -0.08, elbow: -0.74, wrist: -1.12 },
      backArm: { shoulder: -1.22, elbow: -2.04, wrist: -0.42 },
      swordMode: "attack",
      swordAngle: -1.78,
      swordShiftX: 0.58,
      swordShiftY: -0.18,
      slashArc: {
        radius: 0.98,
        start: -1.44,
        end: 0.08,
      },
      bodyOffsetX: 36,
      bodyOffsetY: -6,
      faceFocus: 0.34,
    },
  };

  return configs[state.pose] || configs.idle;
}

function drawBackground() {
  ctx.clearRect(0, 0, state.width, state.height);

  const sky = ctx.createLinearGradient(0, 0, 0, state.height);
  sky.addColorStop(0, "#d8d0bc");
  sky.addColorStop(0.48, "#c4b18a");
  sky.addColorStop(1, "#ab966c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#84734d";
  for (let i = 0; i < 28; i += 1) {
    const x = (i * 137) % (state.width + 180) - 90;
    const y = state.height * 0.58 + ((i * 47) % 220) - 80;
    ctx.beginPath();
    ctx.ellipse(x, y, 64 + (i % 3) * 18, 22 + (i % 5) * 6, (i % 7) * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#8e7a51";
  ctx.fillRect(0, state.height * 0.78, state.width, state.height * 0.22);

  ctx.fillStyle = "rgba(39, 56, 28, 0.24)";
  ctx.beginPath();
  ctx.ellipse(state.width * 0.5, state.height * 0.83, state.width * 0.36, state.height * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(32, 53, 25, 0.16)";
  ctx.beginPath();
  ctx.ellipse(state.width * 0.22, state.height * 0.79, state.width * 0.16, state.height * 0.065, -0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(state.width * 0.79, state.height * 0.8, state.width * 0.2, state.height * 0.07, 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrainingPost() {
  const postX = state.width * 0.79;
  const postY = state.height * 0.76;
  const postHeight = state.baseScale * 1.7;
  const postWidth = state.baseScale * 0.14;

  ctx.save();
  ctx.translate(postX, postY);

  ctx.fillStyle = "rgba(16, 20, 15, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 12, state.baseScale * 0.34, state.baseScale * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3f3321";
  roundRectPath(ctx, -postWidth * 0.5, -postHeight, postWidth, postHeight, postWidth * 0.46);
  ctx.fill();

  ctx.fillStyle = "#4d3f27";
  roundRectPath(ctx, -state.baseScale * 0.32, -postHeight * 0.56, state.baseScale * 0.64, state.baseScale * 0.18, state.baseScale * 0.09);
  ctx.fill();

  ctx.fillStyle = "#2f2518";
  roundRectPath(ctx, -state.baseScale * 0.18, -postHeight * 0.78, state.baseScale * 0.36, state.baseScale * 0.12, state.baseScale * 0.06);
  ctx.fill();

  ctx.restore();
}

function drawWebbedHand(x, y, angle, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(-size * 0.14, 0);
  ctx.quadraticCurveTo(size * 0.06, -size * 0.24, size * 0.34, -size * 0.14);
  ctx.quadraticCurveTo(size * 0.26, size * 0.08, size * 0.38, size * 0.28);
  ctx.quadraticCurveTo(size * 0.08, size * 0.2, -size * 0.14, size * 0.3);
  ctx.quadraticCurveTo(-size * 0.08, size * 0.04, -size * 0.12, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawWebbedFoot(x, y, angle, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(-size * 0.26, 0);
  ctx.quadraticCurveTo(size * 0.18, -size * 0.22, size * 0.62, -size * 0.08);
  ctx.quadraticCurveTo(size * 0.44, size * 0.16, size * 0.7, size * 0.34);
  ctx.quadraticCurveTo(size * 0.18, size * 0.28, -size * 0.12, size * 0.3);
  ctx.quadraticCurveTo(-size * 0.24, size * 0.1, -size * 0.26, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawSword(x, y, angle, mode = "back") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (mode === "attack") {
    ctx.fillStyle = silhouette.fill;
    ctx.beginPath();
    ctx.moveTo(-0.06, -0.88);
    ctx.lineTo(0.08, -0.88);
    ctx.lineTo(0.18, -0.06);
    ctx.lineTo(0.02, 0.14);
    ctx.lineTo(-0.14, -0.04);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = silhouette.swordWrap;
    roundRectPath(ctx, -0.2, -0.02, 0.4, 0.12, 0.05);
    ctx.fill();

    ctx.fillStyle = silhouette.fill;
    roundRectPath(ctx, -0.055, 0.04, 0.11, 0.34, 0.04);
    ctx.fill();
  } else {
    ctx.fillStyle = silhouette.fill;
    ctx.beginPath();
    ctx.moveTo(-0.06, -0.8);
    ctx.lineTo(0.06, -0.8);
    ctx.lineTo(0.06, 0.18);
    ctx.lineTo(-0.06, 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = silhouette.swordWrap;
    roundRectPath(ctx, -0.15, -0.02, 0.3, 0.12, 0.055);
    ctx.fill();

    ctx.fillStyle = silhouette.fill;
    roundRectPath(ctx, -0.035, 0.08, 0.07, 0.26, 0.035);
    ctx.fill();
  }

  ctx.restore();
}

function drawLimb(baseX, baseY, upperLen, lowerLen, angles, thickness, isLeg, color = silhouette.fill) {
  const kneeX = baseX + Math.cos(angles.hip) * upperLen;
  const kneeY = baseY + Math.sin(angles.hip) * upperLen;
  const footX = kneeX + Math.cos(angles.knee) * lowerLen;
  const footY = kneeY + Math.sin(angles.knee) * lowerLen;

  ctx.lineCap = "round";

  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(kneeX, kneeY);
  ctx.stroke();

  ctx.lineWidth = thickness * 0.98;
  ctx.beginPath();
  ctx.moveTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(kneeX, kneeY, thickness * 0.34, 0, Math.PI * 2);
  ctx.fill();

  if (isLeg) {
    drawWebbedFoot(footX, footY, angles.ankle, thickness * 1.34);
  } else {
    drawWebbedHand(footX, footY, angles.wrist, thickness * 1.18);
  }

  return { kneeX, kneeY, endX: footX, endY: footY };
}

function drawFrogWarrior() {
  const pose = getPoseConfig();
  const groundY = state.height * 0.77;
  const centerX = state.width * 0.46 + pose.bodyOffsetX;
  const centerY = groundY - state.baseScale * 0.86 + pose.bodyOffsetY;
  const scale = state.baseScale;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);

  ctx.fillStyle = silhouette.groundShadow;
  ctx.beginPath();
  ctx.ellipse(0.12 + pose.bodyLean * 0.12, 1.04, 0.96, 0.2, 0.04, 0, Math.PI * 2);
  ctx.fill();

  const hipX = -0.14;
  const hipY = 0.42 + pose.hipDrop / scale;
  const shoulderX = 0.06 + pose.chestShift / scale;
  const shoulderY = -0.18;

  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate(pose.bodyLean);

  const backLeg = drawLimb(hipX - 0.02, hipY + 0.08, 0.5, 0.38, pose.backLeg, 0.24, true, silhouette.rear);

  ctx.fillStyle = silhouette.fill;
  ctx.beginPath();
  ctx.moveTo(-0.38, 0.5);
  ctx.quadraticCurveTo(-0.56, 0.04, -0.24, -0.22);
  ctx.quadraticCurveTo(0.02, -0.42, 0.34, -0.28);
  ctx.quadraticCurveTo(0.56, -0.08, 0.54, 0.16);
  ctx.quadraticCurveTo(0.46, 0.46, 0.12, 0.56);
  ctx.quadraticCurveTo(-0.1, 0.62, -0.38, 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = silhouette.mid;
  ctx.beginPath();
  ctx.moveTo(-0.2, 0.28);
  ctx.quadraticCurveTo(-0.04, -0.1, 0.22, -0.12);
  ctx.quadraticCurveTo(0.38, -0.08, 0.4, 0.14);
  ctx.quadraticCurveTo(0.3, 0.38, 0.02, 0.42);
  ctx.quadraticCurveTo(-0.12, 0.42, -0.2, 0.28);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(0.18, -0.26);
  ctx.rotate(pose.headTilt);

  ctx.beginPath();
  ctx.ellipse(0.02, 0, 0.48, 0.24, 0.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-0.18, -0.16, 0.16, 0.18, -0.18, 0, Math.PI * 2);
  ctx.ellipse(0.2, -0.16, 0.16, 0.18, 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0.18, -0.03);
  ctx.quadraticCurveTo(0.52, -0.02, 0.58, 0.1);
  ctx.quadraticCurveTo(0.46, 0.18, 0.12, 0.12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = silhouette.edge;
  ctx.beginPath();
  ctx.ellipse(0.2, 0, 0.12, 0.06, 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = silhouette.edge;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.arc(0.18, 0.08, 0.16, 0.24, 2.84);
  ctx.stroke();
  ctx.restore();

  const backArm = drawLimb(shoulderX - 0.12, shoulderY + 0.02, 0.34, 0.28, pose.backArm, 0.17, false, silhouette.rear);
  const frontLeg = drawLimb(hipX + 0.2, hipY - 0.02, 0.58, 0.42, pose.frontLeg, 0.28, true, silhouette.fill);
  const frontArm = drawLimb(shoulderX + 0.14, shoulderY + 0.1, 0.38, 0.32, pose.frontArm, 0.2, false, silhouette.fill);

  if (pose.swordMode === "attack") {
    drawSword(frontArm.endX + pose.swordShiftX, frontArm.endY + pose.swordShiftY, pose.swordAngle, "attack");
  } else {
    drawSword(-0.34 + pose.swordShiftX, -0.18 + pose.swordShiftY, pose.swordAngle, "back");
  }

  if (pose.slashArc) {
    ctx.strokeStyle = "rgba(17, 21, 17, 0.18)";
    ctx.lineWidth = 0.11;
    ctx.beginPath();
    ctx.arc(0.44, 0.04, pose.slashArc.radius, pose.slashArc.start, pose.slashArc.end);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function draw() {
  drawBackground();
  drawTrainingPost();
  drawFrogWarrior();
}

function update(dt) {
  state.time += dt;
  draw();
}

let rafId = 0;
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  rafId = requestAnimationFrame(loop);
}

buttons.forEach((button) => {
  button.addEventListener("click", () => setPose(button.dataset.pose));
});

window.addEventListener("keydown", (event) => {
  if (event.key === "1") setPose("idle");
  if (event.key === "2") setPose("walk");
  if (event.key === "3") setPose("pounce");
});

window.addEventListener("resize", resize);

window.render_game_to_text = () =>
  JSON.stringify(
    {
      prototype: "Frog Warrior V2 Silhouette Test 01",
      pose: state.pose,
      poseZh: getPoseConfig().labelZh,
      silhouette: "upright frog warrior with back sword",
      notes: [
        "大眼、宽嘴、蹼手蹼脚",
        "短躯干、强下盘、弯膝前倾",
        "背后斜刀，不是人类剑士直立姿态",
      ],
    },
    null,
    2,
  );

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    state.time += 1 / 60;
  }
  draw();
};

window.toggleFullscreen = async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
};

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    window.toggleFullscreen().catch(() => {});
  }
});

resize();
cancelAnimationFrame(rafId);
rafId = requestAnimationFrame(loop);
