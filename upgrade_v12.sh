#!/bin/zsh
set -e

FILE="frog_game_v9.html"
cp "$FILE" "frog_game_v9_before_v12.html"

python3 - <<'PY'
from pathlib import Path

p = Path("frog_game_v9.html")
text = p.read_text(encoding="utf-8")

# 1) 版本号与提示
text = text.replace(
    "<title>青蛙守卫池塘 v11 角色演出升级版</title>",
    "<title>青蛙守卫池塘 v12 泡泡喷射与池塘强化版</title>"
)
text = text.replace(
    "<h2>🐸 青蛙守卫池塘 v11 角色演出升级版</h2>",
    "<h2>🐸 青蛙守卫池塘 v12 泡泡喷射与池塘强化版</h2>"
)
text = text.replace(
    '  <div id="tips">键盘：↑ ↓ ← → 或 W A S D 移动，空格发射，Shift 冲刺。鼠标：移动提供温和牵引，按住左键自动吐泡泡。<br>这版继续强化“角色演出”：吐泡泡会喷出水雾，敌人也会有更明显的动作表现与攻击前摇。</div>',
    '  <div id="tips">键盘：↑ ↓ ← → 或 W A S D 移动，空格发射，Shift 冲刺。鼠标：移动提供温和牵引，按住左键自动吐泡泡。<br>这版强化“泡泡从嘴里喷出”的同步感，并让池塘拥有更华丽的动态水纹、反射与漂浮感。</div>'
)

# 2) 池塘动态带
text = text.replace(
    "const fireflies = [];",
    'const fireflies = [];\nconst waterBands = [];'
)
text = text.replace(
    "  for (let i = 0; i < 10; i++) {\n    fireflies.push({\n      x: Math.random() * W,\n      y: 30 + Math.random() * 180,\n      s: 0.5 + Math.random(),\n      phase: Math.random() * Math.PI * 2\n    });\n  }\n}",
    "  for (let i = 0; i < 10; i++) {\n    fireflies.push({\n      x: Math.random() * W,\n      y: 30 + Math.random() * 180,\n      s: 0.5 + Math.random(),\n      phase: Math.random() * Math.PI * 2\n    });\n  }\n  for (let i = 0; i < 8; i++) {\n    waterBands.push({\n      y: 110 + i * 52,\n      phase: Math.random() * Math.PI * 2,\n      speed: 0.6 + Math.random() * 0.8,\n      width: 120 + Math.random() * 120\n    });\n  }\n}"
)

# 3) 瞄准方向
text = text.replace(
    "let lastDashDirX = 1;\nlet lastDashDirY = 0;",
    "let lastDashDirX = 1;\nlet lastDashDirY = 0;\nlet lastAimX = 1;\nlet lastAimY = 0;"
)

# 4) shootBubble 改为带方向速度
text = text.replace(
    "function shootBubble(x, y, speed = 8.2, size = 7) {\n  bullets.push({ x, y, r: size, speed });\n}",
    '''function shootBubble(x, y, speed = 8.2, size = 7) {
  bullets.push({
    x,
    y,
    r: size,
    speed,
    vx: lastAimX * speed,
    vy: lastAimY * speed * 0.18
  });
}'''
)

# 5) 更贴嘴的发射点
text = text.replace(
    '  shootBubble(frog.x + frog.w * 0.56, frog.y + frog.h * 0.42, 8.1, 7);',
    '  shootBubble(frog.x + frog.w * 0.86, frog.y + frog.h * 0.40, 8.6, 7);'
)
text = text.replace(
    '    shootBubble(frog.x + 8, frog.y + frog.h * 0.55, 7.9, 6);',
    '    shootBubble(frog.x + 10, frog.y + frog.h * 0.52, 8.0, 6);'
)
text = text.replace(
    '    shootBubble(frog.x + frog.w + 4, frog.y + frog.h * 0.55, 7.9, 6);',
    '    shootBubble(frog.x + frog.w + 2, frog.y + frog.h * 0.52, 8.0, 6);'
)
text = text.replace(
    '  addBurst(frog.x + frog.w * 0.78, frog.y + frog.h * 0.44, "#9ae6ff", 3);',
    '  addBurst(frog.x + frog.w * 0.78, frog.y + frog.h * 0.44, "#9ae6ff", 3);\n  addRipple(frog.x + frog.w * 0.92, frog.y + frog.h * 0.40, "rgba(220,250,255,0.20)");'
)

# 6) 子弹按方向飞
text = text.replace(
    "    bullets[i].x += bullets[i].speed;",
    "    bullets[i].x += bullets[i].vx ?? bullets[i].speed;\n    bullets[i].y += bullets[i].vy ?? 0;"
)

# 7) 移动 / 冲刺时更新瞄准方向
text = text.replace(
    "      lastDashDirX = tx / dist;\n      lastDashDirY = ty / dist;",
    "      lastDashDirX = tx / dist;\n      lastDashDirY = ty / dist;\n      lastAimX = tx / dist;\n      lastAimY = ty / dist;"
)
text = text.replace(
    "    if (dx !== 0 || dy !== 0) {\n      lastDashDirX = dx;\n      lastDashDirY = dy;\n    } else {\n      lastDashDirX = cappedDX;\n      lastDashDirY = cappedDY;\n    }\n    frog.x += cappedDX * currentSpeed;",
    "    if (dx !== 0 || dy !== 0) {\n      lastDashDirX = dx;\n      lastDashDirY = dy;\n    } else {\n      lastDashDirX = cappedDX;\n      lastDashDirY = cappedDY;\n    }\n    lastAimX = cappedDX;\n    lastAimY = cappedDY;\n    frog.x += cappedDX * currentSpeed;"
)
text = text.replace(
    "  lastDashDirX = dx / len;\n  lastDashDirY = dy / len;",
    "  lastDashDirX = dx / len;\n  lastDashDirY = dy / len;\n  lastAimX = dx / len;\n  lastAimY = dy / len;"
)

# 8) 泡泡更像喷射出来
text = text.replace(
    "    ctx.arc(b.x - 4, b.y, b.r + 6, 0, Math.PI * 2);",
    "    ctx.ellipse(b.x - 5, b.y, b.r + 7, b.r + 4, 0, 0, Math.PI * 2);"
)
text = text.replace(
    "    ctx.arc(b.x - 1.5, b.y - 1.5, b.r * 0.45, 0, Math.PI * 2);\n    ctx.stroke();",
    "    ctx.arc(b.x - 1.5, b.y - 1.5, b.r * 0.45, 0, Math.PI * 2);\n    ctx.stroke();\n    ctx.fillStyle = \"rgba(255,255,255,0.35)\";\n    ctx.beginPath();\n    ctx.arc(b.x + 1.5, b.y + 1.2, b.r * 0.18, 0, Math.PI * 2);\n    ctx.fill();"
)

# 9) 池塘更华丽动态
text = text.replace(
    "  // v6 动态水面折射光（增加水面流动感）\n  const t = performance.now() * 0.001;\n  ctx.globalAlpha = 0.08;\n  for (let i = 0; i < 6; i++) {\n    const waveY = (i * 90 + t * 40) % (H + 120) - 60;\n    const grad = ctx.createLinearGradient(0, waveY, 0, waveY + 80);\n    grad.addColorStop(0, \"rgba(255,255,255,0)\");\n    grad.addColorStop(0.5, \"rgba(255,255,255,0.35)\");\n    grad.addColorStop(1, \"rgba(255,255,255,0)\");\n    ctx.fillStyle = grad;\n    ctx.fillRect(0, waveY, W, 80);\n  }\n  ctx.globalAlpha = 1;",
    '''  // v6 动态水面折射光（增加水面流动感）
  const t = performance.now() * 0.001;
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 6; i++) {
    const waveY = (i * 90 + t * 40) % (H + 120) - 60;
    const grad = ctx.createLinearGradient(0, waveY, 0, waveY + 80);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, waveY, W, 80);
  }
  waterBands.forEach((band, i) => {
    const waveOffset = Math.sin(t * band.speed + band.phase) * 26;
    const alpha = 0.035 + Math.sin(t * 1.5 + band.phase) * 0.015;
    ctx.fillStyle = `rgba(200,255,240,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(W * 0.5 + waveOffset, band.y, band.width, 12 + (i % 3) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;'''
)
text = text.replace(
    "  ctx.fillStyle = light;\n  ctx.fillRect(0, 0, W, H);",
    '''  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 5; i++) {
    const rx = (i * 190 + performance.now() * (0.03 + i * 0.003)) % (W + 180) - 90;
    const ry = 120 + i * 72 + Math.sin(performance.now() * 0.002 + i) * 8;
    const rg = ctx.createLinearGradient(rx, ry - 18, rx, ry + 18);
    rg.addColorStop(0, "rgba(255,255,255,0)");
    rg.addColorStop(0.5, "rgba(220,255,245,0.16)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 56, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }'''
)
text = text.replace(
    "    const y = 70 + i * 74;",
    "    const y = 70 + i * 74 + Math.sin(performance.now() * 0.002 + i) * 5;"
)

# 10) 嘴前水雾跟随瞄准方向
text = text.replace(
    "    ctx.ellipse(8 + shootAnim * 7, 6 - shootAnim * 1.2, 4 + shootAnim * 4, 2 + shootAnim * 1.4, 0, 0, Math.PI * 2);",
    "    ctx.ellipse(8 + shootAnim * 7 + lastAimX * 3, 6 - shootAnim * 1.2 + lastAimY * 2, 4 + shootAnim * 4, 2 + shootAnim * 1.4, 0, 0, Math.PI * 2);"
)
text = text.replace(
    "    ctx.arc(11 + shootAnim * 8, 5, 1.5 + shootAnim * 1.5, 0, Math.PI * 2);",
    "    ctx.arc(11 + shootAnim * 8 + lastAimX * 3, 5 + lastAimY * 2, 1.5 + shootAnim * 1.5, 0, Math.PI * 2);"
)

p.write_text(text, encoding="utf-8")
PY

echo "v12 upgrade complete"
