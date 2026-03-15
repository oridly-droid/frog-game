#!/bin/zsh
set -e

FILE="frog_game_v6.html"

cp "$FILE" "${FILE%.html}_before_v9.html"

python3 - <<'PY'
from pathlib import Path

p = Path("frog_game_v6.html")
text = p.read_text(encoding="utf-8")

text = text.replace(
    "<title>青蛙守卫池塘 v8 电影感升级版</title>",
    "<title>青蛙守卫池塘 v9 机动升级版</title>"
)
text = text.replace(
    "<h2>🐸 青蛙守卫池塘 v8 电影感升级版</h2>",
    "<h2>🐸 青蛙守卫池塘 v9 机动升级版</h2>"
)
text = text.replace(
    '<div class="card">关卡<br><strong id="wave">1</strong></div>',
    '<div class="card">关卡<br><strong id="wave">1</strong></div>\n    <div class="card">冲刺<br><strong id="dash">就绪</strong></div>'
)
text = text.replace(
    '<div id="tips">键盘：↑ ↓ ← → 或 W A S D 移动，空格发射。鼠标：移动提供温和牵引，按住左键自动吐泡泡。<br>这版把“控制系统”完全重写：键盘是主控，鼠标只是辅助，不再出现加速度失控。</div>',
    '<div id="tips">键盘：↑ ↓ ← → 或 W A S D 移动，空格发射，Shift 冲刺。鼠标：移动提供温和牵引，按住左键自动吐泡泡。<br>这版加入“短距冲刺”：可用来脱离包围或快速切位。</div>'
)
text = text.replace(
    'const waveEl = document.getElementById("wave");',
    'const waveEl = document.getElementById("wave");\nconst dashEl = document.getElementById("dash");'
)
text = text.replace(
    'let hitFlash = 0;',
    'let hitFlash = 0;\nlet dashUntil = 0;\nlet dashCooldownUntil = 0;'
)
text = text.replace(
    '  waveEl.innerText = wave;',
    '  waveEl.innerText = wave;\n  const now = performance.now();\n  dashEl.innerText = dashCooldownUntil <= now ? "就绪" : f"{((dashCooldownUntil - now) / 1000):.1f}s";'
)
text = text.replace(
    'function shoot() {\n',
    '''function shoot() {\n'''
)
text = text.replace(
    '  addRipple(frog.x + 28, frog.y + 16, "rgba(160,230,255,0.28)");\n}\n',
    '''  addRipple(frog.x + 28, frog.y + 16, "rgba(160,230,255,0.28)");\n}\n\nfunction startDash() {\n  const now = performance.now();\n  if (gameOver) return;\n  if (dashCooldownUntil > now) return;\n  dashUntil = now + 220;\n  dashCooldownUntil = now + 2400;\n  screenShake = Math.max(screenShake, 6);\n  addRipple(frog.x + frog.w / 2, frog.y + frog.h / 2, "rgba(160,255,220,0.30)");\n  addBurst(frog.x + frog.w / 2, frog.y + frog.h / 2, "#9ff7c2", 14);\n  updateUI();\n}\n'''
)
text = text.replace(
    '  const finalDX = dx + assistX;',
    '  const currentSpeed = performance.now() < dashUntil ? frog.baseSpeed * 2.2 : frog.baseSpeed;\n  const finalDX = dx + assistX;'
)
text = text.replace(
    '      frog.x += (tx / dist) * frog.baseSpeed * 1.25;',
    '      frog.x += (tx / dist) * currentSpeed * 1.25;'
)
text = text.replace(
    '      frog.y += (ty / dist) * frog.baseSpeed * 1.25;',
    '      frog.y += (ty / dist) * currentSpeed * 1.25;'
)
text = text.replace(
    '    frog.x += cappedDX * frog.baseSpeed;',
    '    frog.x += cappedDX * currentSpeed;'
)
text = text.replace(
    '    frog.y += cappedDY * frog.baseSpeed;',
    '    frog.y += cappedDY * currentSpeed;'
)
text = text.replace(
    '  updateMovement();',
    '  updateMovement();\n  if (performance.now() < dashUntil) {\n    addBurst(frog.x + frog.w / 2, frog.y + frog.h / 2, "#9ff7c2", 2);\n  }'
)
text = text.replace(
    '  keys[e.code] = true;',
    '  keys[e.code] = true;\n  if (e.code === "ShiftLeft" || e.code === "ShiftRight") startDash();'
)
text = text.replace(
    '  // v6 青蛙呼吸光晕',
    '  if (performance.now() < dashUntil) {\n    ctx.fillStyle = "rgba(159,247,194,0.22)";\n    ctx.beginPath();\n    ctx.arc(22, 22, 36, 0, Math.PI * 2);\n    ctx.fill();\n  }\n\n  // v6 青蛙呼吸光晕'
)

p.write_text(text, encoding="utf-8")
PY

echo "v9 upgrade complete"
