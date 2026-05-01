/**
 * This prototype isolates a frog warrior V2 character study.
 * It is responsible for the standalone motion/shape test page and does not affect the main game.
 */

const canvas = document.getElementById("prototype-canvas")
const ctx = canvas.getContext("2d")

const DPR = Math.min(window.devicePixelRatio || 1, 1.5)
const GRAVITY = 1800
const FLOOR_Y_RATIO = 0.76
const MOVE_SPEED = 210
const JUMP_CHARGE_TIME = 0.1
const JUMP_SPEED = 620
const DASH_TIME = 0.16
const DASH_SPEED = 520
const ATTACK_ONE_TOTAL = 0.28
const ATTACK_TWO_TOTAL = 0.38
const COMBO_BUFFER = 0.24
const WORLD_SCALE = 1.18
const SPRITE_ROOT = "./assets/frog_warrior_v2"

const keys = new Set()
const touchState = {
    left: false,
    right: false,
    jump: false,
    dash: false,
    attack: false,
}

const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: true,
    mode: "idle",
    moveBlend: 0,
    walkCycle: 0,
    idleBob: 0,
    jumpCharge: 0,
    jumpChargeTimer: 0,
    landingTimer: 0,
    dashTimer: 0,
    attackTimer: 0,
    attackStep: 0,
    attackQueued: false,
    comboWindow: 0,
    attackHit: false,
    spriteScale: 1.15,
    renderOffsetY: 0,
    renderOffsetX: 0,
    renderScaleX: 1,
    renderScaleY: 1,
}

const dummy = {
    x: 0,
    y: 0,
    flash: 0,
    wobble: 0,
    hp: 999,
    hitCount: 0,
}

const reeds = []
const pebbles = []
const stones = []
let floorY = 0
let lastTime = performance.now()

function loadSprite(src){
    const image = new Image()
    image.src = src
    return image
}

const spriteImages = {
    idle: loadSprite(`${SPRITE_ROOT}/frog_1.png`),
    move: loadSprite(`${SPRITE_ROOT}/frog_2.png`),
    attack: loadSprite(`${SPRITE_ROOT}/frog_3.png`),
}

const spriteDrawConfig = {
    idle: {height: 182, anchorX: 0.5, anchorY: 0.965, xOffset: 0, yOffset: 8},
    move: {height: 182, anchorX: 0.48, anchorY: 0.965, xOffset: 2, yOffset: 8},
    attack: {height: 176, anchorX: 0.46, anchorY: 0.93, xOffset: 16, yOffset: 2},
}

function lerp(current, target, alpha){
    return current + (target - current) * alpha
}

function resize(){
    const width = Math.max(640, Math.round(window.innerWidth))
    const height = Math.max(360, Math.round(window.innerHeight))
    canvas.width = Math.round(width * DPR)
    canvas.height = Math.round(height * DPR)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

    floorY = height * FLOOR_Y_RATIO
    if(!player.x){
        player.x = width * 0.38
        player.y = floorY
    }else{
        player.x = Math.min(width - 80, player.x)
        player.y = Math.min(floorY, player.y)
    }

    dummy.x = width * 0.56
    dummy.y = floorY - 6
    buildScene(width, height)
}

function buildScene(width, height){
    reeds.length = 0
    pebbles.length = 0
    stones.length = 0

    for(let i = 0; i < 18; i++){
        reeds.push({
            x: (i / 18) * width + (i % 3) * 22,
            y: floorY + 24 + (i % 5) * 26,
            h: 16 + (i % 4) * 8,
            tilt: (i % 2 === 0 ? -1 : 1) * (0.2 + (i % 3) * 0.08),
        })
    }

    for(let i = 0; i < 120; i++){
        pebbles.push({
            x: Math.random() * width,
            y: floorY - 180 + Math.random() * (height - floorY + 200),
            rx: 2 + Math.random() * 4,
            ry: 1 + Math.random() * 3,
            rot: Math.random() * Math.PI,
            alpha: 0.24 + Math.random() * 0.22,
        })
    }

    stones.push(
        {x: width * 0.2, y: floorY + 44, w: 132, h: 54, rot: -0.14},
        {x: width * 0.56, y: floorY + 56, w: 164, h: 62, rot: 0.08},
        {x: width * 0.86, y: floorY + 42, w: 120, h: 52, rot: -0.1},
    )
}

function inputLeft(){
    return keys.has("ArrowLeft") || keys.has("KeyA") || touchState.left
}

function inputRight(){
    return keys.has("ArrowRight") || keys.has("KeyD") || touchState.right
}

function requestJump(){
    touchState.jump = false
    if(player.mode === "jumpCharge" || !player.onGround || player.dashTimer > 0 || player.attackStep > 0){
        return
    }
    player.mode = "jumpCharge"
    player.jumpChargeTimer = JUMP_CHARGE_TIME
}

function requestDash(){
    touchState.dash = false
    if(player.dashTimer > 0 || player.mode === "jumpCharge" || player.attackStep > 0){
        return
    }
    player.dashTimer = DASH_TIME
    player.mode = "dash"
    player.vy = 0
    if(Math.abs(player.vx) > 24){
        player.facing = Math.sign(player.vx)
    }
}

function requestAttack(){
    touchState.attack = false
    if(player.attackStep === 0){
        player.attackStep = 1
        player.attackTimer = ATTACK_ONE_TOTAL
        player.attackQueued = false
        player.attackHit = false
        player.comboWindow = COMBO_BUFFER
        player.mode = "attack1"
        return
    }

    if(player.attackStep === 1){
        player.attackQueued = true
    }
}

function processInput(dt){
    let move = 0
    if(inputLeft()) move -= 1
    if(inputRight()) move += 1

    if(move !== 0){
        player.facing = move
    }

    const moving = move !== 0
    player.moveBlend += ((moving ? 1 : 0) - player.moveBlend) * Math.min(1, dt * 10)

    if(player.onGround && player.attackStep === 0 && player.dashTimer <= 0 && player.mode !== "jumpCharge"){
        const targetSpeed = move * MOVE_SPEED
        player.vx += (targetSpeed - player.vx) * Math.min(1, dt * 14)
        player.mode = moving ? "walk" : "idle"
    }else if(player.attackStep === 0 && player.dashTimer <= 0){
        const airTarget = move * MOVE_SPEED * 0.78
        player.vx += (airTarget - player.vx) * Math.min(1, dt * 4.5)
    }

    if(player.onGround && !moving && player.attackStep === 0 && player.dashTimer <= 0 && player.mode !== "jumpCharge"){
        player.vx *= Math.pow(0.002, dt)
    }

    player.walkCycle += Math.abs(player.vx) * dt * 0.024
    player.idleBob += dt * 2.3

}

function updateJumpCharge(dt){
    if(player.mode !== "jumpCharge"){
        return
    }

    player.jumpChargeTimer -= dt
    player.vx *= Math.pow(0.01, dt)
    if(player.jumpChargeTimer <= 0){
        player.vy = -JUMP_SPEED
        player.onGround = false
        player.mode = "jump"
    }
}

function updateDash(dt){
    if(player.dashTimer <= 0){
        return
    }

    player.dashTimer -= dt
    player.mode = "dash"
    player.vx = player.facing * DASH_SPEED
    player.vy = 0
    if(player.dashTimer <= 0){
        player.dashTimer = 0
        player.mode = player.onGround ? "idle" : "fall"
    }
}

function updateAttack(dt){
    if(player.attackStep === 0){
        if(player.comboWindow > 0){
            player.comboWindow = Math.max(0, player.comboWindow - dt)
        }
        return
    }

    player.attackTimer -= dt
    if(player.attackStep === 1){
        player.mode = "attack1"
        const active = player.attackTimer < 0.18 && player.attackTimer > 0.06
        player.vx *= Math.pow(0.02, dt)
        if(active){
            tryAttackHit(84, 32)
        }
        if(player.attackTimer <= 0){
            if(player.attackQueued && player.comboWindow > 0){
                player.attackStep = 2
                player.attackTimer = ATTACK_TWO_TOTAL
                player.attackQueued = false
                player.attackHit = false
                player.mode = "attack2"
                player.vx = player.facing * 240
                player.vy = Math.min(player.vy, -120)
                player.onGround = false
            }else{
                player.attackStep = 0
                player.mode = player.onGround ? "idle" : "fall"
            }
        }
        return
    }

    if(player.attackStep === 2){
        player.mode = "attack2"
        const active = player.attackTimer < 0.24 && player.attackTimer > 0.06
        if(active){
            player.vx = player.facing * 280
            tryAttackHit(108, 42)
        }
        if(player.attackTimer <= 0){
            player.attackStep = 0
            player.mode = player.onGround ? "land" : "fall"
            player.landingTimer = Math.max(player.landingTimer, 0.1)
        }
    }
}

function tryAttackHit(range, radius){
    if(player.attackHit){
        return
    }
    const dx = dummy.x - player.x
    const dy = (dummy.y - 30) - (player.y - 34)
    if(Math.abs(dx) <= range && dx * player.facing > -8 && Math.abs(dy) <= radius){
        player.attackHit = true
        dummy.flash = 0.18
        dummy.wobble = 0.22
        dummy.hitCount += 1
    }
}

function updateDummy(dt){
    dummy.flash = Math.max(0, dummy.flash - dt)
    dummy.wobble = Math.max(0, dummy.wobble - dt)
}

function updatePhysics(dt){
    if(player.dashTimer <= 0 && player.mode !== "jumpCharge"){
        player.vy += GRAVITY * dt
    }

    player.x += player.vx * dt
    player.y += player.vy * dt

    const width = canvas.width / DPR
    player.x = Math.max(72, Math.min(width - 72, player.x))

    if(player.y >= floorY){
        if(!player.onGround){
            player.landingTimer = 0.13
        }
        player.onGround = true
        player.y = floorY
        player.vy = 0
        if(player.attackStep === 0 && player.dashTimer <= 0 && player.mode !== "jumpCharge"){
            player.mode = Math.abs(player.vx) > 24 ? "walk" : "land"
        }
    }else{
        player.onGround = false
        if(player.attackStep === 0 && player.dashTimer <= 0 && player.mode !== "jumpCharge"){
            player.mode = player.vy < 0 ? "jump" : "fall"
        }
    }

    player.landingTimer = Math.max(0, player.landingTimer - dt)
}

function update(dt){
    processInput(dt)
    updateJumpCharge(dt)
    updateDash(dt)
    updateAttack(dt)
    updatePhysics(dt)
    updateDummy(dt)
    updateSpriteMotion(dt)
}

function getAttackMotionProfile(){
    const isSecondStrike = player.attackStep === 2 || player.mode === "attack2"
    const total = isSecondStrike ? ATTACK_TWO_TOTAL : ATTACK_ONE_TOTAL
    const remaining = Math.max(0, player.attackTimer)
    const t = 1 - remaining / total

    let targetY = 0
    let targetX = 0
    let targetScaleX = 1
    let targetScaleY = 1

    if(t < 0.28){
        const p = t / 0.28
        targetY = isSecondStrike ? 7 * p : 5 * p
        targetScaleY = 1 - 0.06 * p
        targetScaleX = 1 + 0.04 * p
    }else if(t < 0.58){
        const p = (t - 0.28) / 0.30
        targetY = (isSecondStrike ? 7 : 5) + ((isSecondStrike ? -13 : -7) - (isSecondStrike ? 7 : 5)) * p
        targetX = (isSecondStrike ? 10 : 5) * p
        targetScaleY = (isSecondStrike ? 0.94 : 0.96) + ((isSecondStrike ? 1.08 : 1.04) - (isSecondStrike ? 0.94 : 0.96)) * p
        targetScaleX = (isSecondStrike ? 1.04 : 1.03) + ((isSecondStrike ? 1.08 : 1.05) - (isSecondStrike ? 1.04 : 1.03)) * p
    }else{
        const p = (t - 0.58) / 0.42
        targetY = (isSecondStrike ? -13 : -7) * (1 - p)
        targetX = (isSecondStrike ? 10 : 5) * (1 - p)
        targetScaleY = (isSecondStrike ? 1.08 : 1.04) + (1 - (isSecondStrike ? 1.08 : 1.04)) * p
        targetScaleX = (isSecondStrike ? 1.08 : 1.05) + (1 - (isSecondStrike ? 1.08 : 1.05)) * p
    }

    return {targetY, targetX, targetScaleX, targetScaleY}
}

function updateSpriteMotion(dt){
    let targetY = 0
    let targetX = 0
    let targetScaleX = 1
    let targetScaleY = 1
    const spriteState = getPlayerSpriteState()

    if(spriteState === "attack"){
        const profile = getAttackMotionProfile()
        targetY = profile.targetY
        targetX = profile.targetX
        targetScaleX = profile.targetScaleX
        targetScaleY = profile.targetScaleY
    }else if(spriteState === "move"){
        const bounce = Math.sin(player.walkCycle * 2.1)
        targetY = bounce * 5.8
        targetScaleY = 1 - bounce * 0.035
        targetScaleX = 1 + bounce * 0.025
        if(player.mode === "jump" || player.mode === "fall"){
            targetY += player.vy < 0 ? -10 : -4
            targetScaleY = player.vy < 0 ? 1.06 : 1.03
            targetScaleX = player.vy < 0 ? 0.97 : 0.985
        }
    }else{
        targetY = Math.sin(player.idleBob * 1.15) * 3
        targetScaleY = 1 + Math.sin(player.idleBob * 1.15) * 0.015
        targetScaleX = 1 - Math.sin(player.idleBob * 1.15) * 0.01
    }

    if(player.landingTimer > 0 && spriteState !== "attack"){
        const p = player.landingTimer / 0.13
        targetY = 8 * p
        targetScaleY = 0.94
        targetScaleX = 1.04
    }

    const blend = 1 - Math.exp(-dt * (spriteState === "attack" ? 18 : 12))
    player.renderOffsetY = lerp(player.renderOffsetY, targetY, blend)
    player.renderOffsetX = lerp(player.renderOffsetX, targetX, blend)
    player.renderScaleX = lerp(player.renderScaleX, targetScaleX, blend)
    player.renderScaleY = lerp(player.renderScaleY, targetScaleY, blend)
}

function drawBackground(width, height){
    const sky = ctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, "#6ea46f")
    sky.addColorStop(0.44, "#5a8f61")
    sky.addColorStop(1, "#396346")
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = "rgba(181, 210, 162, 0.16)"
    ctx.beginPath()
    ctx.ellipse(width * 0.16, floorY - 210, width * 0.24, 150, -0.14, 0, Math.PI * 2)
    ctx.ellipse(width * 0.82, floorY - 190, width * 0.28, 168, 0.12, 0, Math.PI * 2)
    ctx.fill()

    const ground = ctx.createRadialGradient(width * 0.5, floorY - 30, 120, width * 0.5, floorY + 80, width * 0.66)
    ground.addColorStop(0, "#b79259")
    ground.addColorStop(1, "#876a3f")
    ctx.fillStyle = ground
    ctx.beginPath()
    ctx.moveTo(width * 0.07, floorY + 120)
    ctx.bezierCurveTo(width * 0.12, floorY - 140, width * 0.34, floorY - 232, width * 0.52, floorY - 210)
    ctx.bezierCurveTo(width * 0.72, floorY - 192, width * 0.9, floorY - 110, width * 0.93, floorY + 108)
    ctx.quadraticCurveTo(width * 0.54, floorY + 160, width * 0.07, floorY + 120)
    ctx.fill()

    ctx.fillStyle = "rgba(87, 67, 35, 0.12)"
    for(const pebble of pebbles){
        ctx.save()
        ctx.translate(pebble.x, pebble.y)
        ctx.rotate(pebble.rot)
        ctx.beginPath()
        ctx.ellipse(0, 0, pebble.rx * 4.6, pebble.ry * 4.2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    for(const pebble of pebbles){
        ctx.fillStyle = `rgba(245,235,205,${pebble.alpha})`
        ctx.save()
        ctx.translate(pebble.x, pebble.y)
        ctx.rotate(pebble.rot)
        ctx.beginPath()
        ctx.ellipse(0, 0, pebble.rx, pebble.ry, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    for(const stone of stones){
        ctx.save()
        ctx.translate(stone.x, stone.y)
        ctx.rotate(stone.rot)
        ctx.fillStyle = "rgba(96, 115, 98, 0.82)"
        ctx.beginPath()
        ctx.ellipse(0, 0, stone.w * 0.5, stone.h * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "rgba(177, 198, 170, 0.18)"
        ctx.beginPath()
        ctx.ellipse(-stone.w * 0.08, -stone.h * 0.14, stone.w * 0.26, stone.h * 0.18, -0.3, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    for(const reed of reeds){
        ctx.strokeStyle = "rgba(42, 82, 42, 0.85)"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(reed.x, reed.y)
        ctx.quadraticCurveTo(reed.x + reed.tilt * 8, reed.y - reed.h * 0.4, reed.x + reed.tilt * 12, reed.y - reed.h)
        ctx.stroke()
        ctx.strokeStyle = "rgba(118, 174, 95, 0.7)"
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(reed.x + reed.tilt * 8, reed.y - reed.h * 0.56)
        ctx.lineTo(reed.x + reed.tilt * 15, reed.y - reed.h * 0.82)
        ctx.stroke()
    }
}

function drawDummy(){
    const wobble = Math.sin((1 - dummy.wobble / 0.22) * Math.PI * 8) * dummy.wobble * 18
    ctx.save()
    ctx.translate(dummy.x + wobble, dummy.y)
    ctx.fillStyle = dummy.flash > 0 ? "#ffd38c" : "#8b633a"
    ctx.beginPath()
    ctx.roundRect(-22, -86, 44, 112, 12)
    ctx.fill()
    ctx.fillStyle = "rgba(39, 23, 10, 0.45)"
    ctx.beginPath()
    ctx.ellipse(0, 34, 34, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#c9975c"
    ctx.beginPath()
    ctx.ellipse(0, -94, 34, 18, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#fff4cf"
    ctx.font = "700 14px sans-serif"
    ctx.textAlign = "center"
    ctx.fillText(`木桩 ${dummy.hitCount}`, 0, -118)
    ctx.restore()
}

function getPose(){
    const pose = {
        bodyTilt: 0,
        bodyStretch: 1,
        bodySquash: 1,
        hipOffsetY: 0,
        headLift: 0,
        swordDraw: 0,
        swordAngle: -0.92,
        armLead: 0.18,
        rearLegBend: 0.18,
        frontLegBend: 0.18,
        lunge: 0,
        swordTrail: null,
    }

    pose.bodyTilt = Math.sin(player.idleBob * 2.2) * 0.02
    pose.hipOffsetY = Math.sin(player.idleBob * 2.4) * 2.2
    pose.headLift = Math.sin(player.idleBob * 2.2) * 1.6

    if(player.mode === "walk"){
        const stride = Math.sin(player.walkCycle)
        pose.bodyTilt = player.facing * 0.12 + stride * 0.04
        pose.hipOffsetY = 6 + Math.abs(stride) * 4
        pose.frontLegBend = 0.24 + Math.max(0, stride) * 0.34
        pose.rearLegBend = 0.28 + Math.max(0, -stride) * 0.38
        pose.armLead = 0.12 + Math.max(0, stride) * 0.2
    }else if(player.mode === "jumpCharge"){
        const t = 1 - player.jumpChargeTimer / JUMP_CHARGE_TIME
        pose.bodySquash = 1 + t * 0.16
        pose.bodyStretch = 1 - t * 0.14
        pose.hipOffsetY = 10 + t * 9
        pose.bodyTilt = player.facing * 0.12
        pose.rearLegBend = 0.58
        pose.frontLegBend = 0.44
    }else if(player.mode === "jump"){
        pose.bodyStretch = 1.12
        pose.bodySquash = 0.92
        pose.hipOffsetY = -8
        pose.bodyTilt = player.facing * 0.18
        pose.rearLegBend = 0.62
        pose.frontLegBend = 0.28
    }else if(player.mode === "fall"){
        pose.bodyStretch = 1.08
        pose.bodyTilt = player.facing * 0.1
        pose.hipOffsetY = -2
        pose.rearLegBend = 0.4
        pose.frontLegBend = 0.34
    }else if(player.mode === "dash"){
        pose.bodyStretch = 1.08
        pose.bodySquash = 0.92
        pose.bodyTilt = player.facing * 0.28
        pose.hipOffsetY = 2
        pose.swordDraw = 0.3
        pose.swordAngle = player.facing * 0.35
        pose.rearLegBend = 0.64
        pose.frontLegBend = 0.22
        pose.lunge = 20
    }else if(player.mode === "attack1"){
        const t = 1 - player.attackTimer / ATTACK_ONE_TOTAL
        pose.bodyTilt = player.facing * (t < 0.35 ? 0.12 : 0.2)
        pose.bodySquash = t < 0.35 ? 1.12 : 0.96
        pose.bodyStretch = t < 0.35 ? 0.94 : 1.02
        pose.hipOffsetY = t < 0.35 ? 8 : 2
        pose.swordDraw = 1
        pose.swordAngle = -1.28 + player.facing * (t * 1.42)
        pose.armLead = 0.36
        pose.frontLegBend = 0.26
        pose.rearLegBend = 0.44
        pose.lunge = t * 12
        if(player.attackTimer < 0.18 && player.attackTimer > 0.06){
            pose.swordTrail = {
                length: 52 * player.spriteScale,
                width: 12 * player.spriteScale,
                angle: -0.72 + t * 1.08,
                alpha: 0.34,
            }
        }
    }else if(player.mode === "attack2"){
        const t = 1 - player.attackTimer / ATTACK_TWO_TOTAL
        pose.bodyTilt = player.facing * (0.26 + t * 0.24)
        pose.bodyStretch = 1.08
        pose.bodySquash = 0.94
        pose.hipOffsetY = -4 + t * 3
        pose.swordDraw = 1
        pose.swordAngle = -1.08 + player.facing * (0.52 + t * 1.52)
        pose.frontLegBend = 0.14
        pose.rearLegBend = 0.72
        pose.lunge = 22 + t * 24
        if(player.attackTimer < 0.24 && player.attackTimer > 0.06){
            pose.swordTrail = {
                length: 84 * player.spriteScale,
                width: 18 * player.spriteScale,
                angle: -0.98 + t * 1.8,
                alpha: 0.42,
            }
        }
    }else if(player.landingTimer > 0){
        const t = player.landingTimer / 0.13
        pose.bodySquash = 1.1 + t * 0.06
        pose.bodyStretch = 0.92
        pose.hipOffsetY = 9
        pose.bodyTilt = player.facing * 0.05
        pose.frontLegBend = 0.34
        pose.rearLegBend = 0.4
    }

    return pose
}

function drawWebbedFoot(x, y, scaleX, scaleY, facing){
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scaleX * facing, scaleY)
    ctx.fillStyle = "#8ca74c"
    ctx.beginPath()
    ctx.moveTo(-12, -2)
    ctx.quadraticCurveTo(-3, 7, 3, 10)
    ctx.quadraticCurveTo(12, 7, 15, 1)
    ctx.quadraticCurveTo(8, 4, 1, 4)
    ctx.quadraticCurveTo(-7, 4, -12, -2)
    ctx.fill()
    ctx.fillStyle = "#cfa35a"
    for(const offset of [-8, 1, 10]){
        ctx.beginPath()
        ctx.ellipse(offset, 1, 2.8, 4.2, 0, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.restore()
}

function drawWebbedHand(x, y, facing, open = 1){
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(facing, 1)
    ctx.fillStyle = "#9bbd56"
    ctx.beginPath()
    ctx.moveTo(-7, -3)
    ctx.quadraticCurveTo(-6, 8, 3, 11)
    ctx.quadraticCurveTo(12, 8, 13, 0)
    ctx.quadraticCurveTo(10, 5, 7, 5)
    ctx.quadraticCurveTo(4 + open * 2, 7 + open * 2, 1, 7)
    ctx.quadraticCurveTo(-3 - open, 6, -7, -3)
    ctx.fill()

    ctx.fillStyle = "#cfa35a"
    for(const [tx, ty, rx] of [[8, 2, 2.6], [3, 5, 2.5], [-2, 4, 2.2]]){
        ctx.beginPath()
        ctx.ellipse(tx, ty, rx, 3.8, 0, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.restore()
}

function drawLimbBlob(points, color){
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for(let i = 1; i < points.length; i++){
        const prev = points[i - 1]
        const cur = points[i]
        const midX = (prev[0] + cur[0]) * 0.5
        const midY = (prev[1] + cur[1]) * 0.5
        ctx.quadraticCurveTo(prev[0], prev[1], midX, midY)
    }
    const first = points[0]
    const last = points[points.length - 1]
    ctx.quadraticCurveTo(last[0], last[1], first[0], first[1])
    ctx.closePath()
    ctx.fill()
}

function drawPlayer(){
    if(drawPlayerSprite()){
        return
    }

    const pose = getPose()
    const x = player.x + pose.lunge * player.facing
    const y = player.y + pose.hipOffsetY
    const scale = player.spriteScale
    const bodyW = 40 * pose.bodySquash * scale
    const bodyH = 46 * pose.bodyStretch * scale
    const bodyTilt = pose.bodyTilt
    const eyeOffset = 15 * scale

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(player.facing, 1)

    ctx.fillStyle = "rgba(17, 24, 12, 0.26)"
    ctx.beginPath()
    ctx.ellipse(0, 20, 34 * scale, 10 * scale, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.rotate(bodyTilt)

    const rearLegTop = [-15 * scale, 10 * scale]
    const rearKnee = [-26 * scale - pose.rearLegBend * 8 * scale, 24 * scale + pose.rearLegBend * 10 * scale]
    const rearFoot = [-16 * scale - pose.rearLegBend * 5 * scale, 48 * scale]
    drawLimbBlob([
        [rearLegTop[0] - 9 * scale, rearLegTop[1] - 2 * scale],
        [rearKnee[0] - 8 * scale, rearKnee[1] - 4 * scale],
        [rearFoot[0] - 5 * scale, rearFoot[1] - 3 * scale],
        [rearFoot[0] + 4 * scale, rearFoot[1] + 4 * scale],
        [rearKnee[0] + 6 * scale, rearKnee[1] + 8 * scale],
        [rearLegTop[0] + 6 * scale, rearLegTop[1] + 8 * scale],
    ], "#809742")
    drawWebbedFoot(rearFoot[0], rearFoot[1], 1.1 * scale, 1.04 * scale, 1)

    const frontLegTop = [12 * scale, 9 * scale]
    const frontKnee = [18 * scale + pose.frontLegBend * 16 * scale, 22 * scale + pose.frontLegBend * 11 * scale]
    const frontFoot = [26 * scale + pose.frontLegBend * 10 * scale, 46 * scale]
    drawLimbBlob([
        [frontLegTop[0] - 8 * scale, frontLegTop[1] - 2 * scale],
        [frontKnee[0] - 10 * scale, frontKnee[1] - 4 * scale],
        [frontFoot[0] - 8 * scale, frontFoot[1] - 4 * scale],
        [frontFoot[0] + 7 * scale, frontFoot[1] + 4 * scale],
        [frontKnee[0] + 8 * scale, frontKnee[1] + 8 * scale],
        [frontLegTop[0] + 10 * scale, frontLegTop[1] + 6 * scale],
    ], "#97b955")
    drawWebbedFoot(frontFoot[0], frontFoot[1], 1.18 * scale, 1.08 * scale, 1)

    if(pose.swordDraw < 0.6){
        if(pose.swordTrail){
            ctx.save()
            ctx.translate(18 * scale, -4 * scale)
            ctx.rotate(pose.swordTrail.angle)
            const trail = ctx.createLinearGradient(0, -10 * scale, 0, pose.swordTrail.length)
            trail.addColorStop(0, `rgba(255,248,214,${pose.swordTrail.alpha})`)
            trail.addColorStop(0.52, `rgba(210,255,222,${pose.swordTrail.alpha * 0.72})`)
            trail.addColorStop(1, "rgba(193,255,225,0)")
            ctx.fillStyle = trail
            ctx.beginPath()
            ctx.moveTo(0, -8 * scale)
            ctx.quadraticCurveTo(14 * scale, -4 * scale, pose.swordTrail.width, 18 * scale)
            ctx.quadraticCurveTo(10 * scale, pose.swordTrail.length * 0.72, 0, pose.swordTrail.length)
            ctx.quadraticCurveTo(-10 * scale, pose.swordTrail.length * 0.72, -pose.swordTrail.width, 18 * scale)
            ctx.quadraticCurveTo(-14 * scale, -6 * scale, 0, -8 * scale)
            ctx.fill()
            ctx.restore()
        }
        ctx.save()
        ctx.translate(20 * scale, -4 * scale)
        ctx.rotate(pose.swordAngle)
        ctx.fillStyle = "#d4d7d3"
        ctx.beginPath()
        ctx.moveTo(-2 * scale, -42 * scale)
        ctx.lineTo(4 * scale, -42 * scale)
        ctx.lineTo(6 * scale, -2 * scale)
        ctx.lineTo(0, 6 * scale)
        ctx.lineTo(-4 * scale, -2 * scale)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = "#4d3620"
        ctx.beginPath()
        ctx.roundRect(-3 * scale, 2 * scale, 6 * scale, 18 * scale, 3 * scale)
        ctx.fill()
        ctx.fillStyle = "#bb9553"
        ctx.beginPath()
        ctx.roundRect(-12 * scale, 1 * scale, 24 * scale, 4 * scale, 3 * scale)
        ctx.fill()
        ctx.restore()
    } else {
        ctx.save()
        ctx.translate(-8 * scale, -12 * scale)
        ctx.rotate(-1.1)
        ctx.fillStyle = "#3d2c1d"
        ctx.beginPath()
        ctx.roundRect(-5 * scale, -22 * scale, 10 * scale, 46 * scale, 6 * scale)
        ctx.fill()
        ctx.fillStyle = "#69462b"
        ctx.beginPath()
        ctx.roundRect(-8 * scale, -16 * scale, 16 * scale, 6 * scale, 3 * scale)
        ctx.fill()
        ctx.restore()
    }

    ctx.fillStyle = "#a5bc59"
    ctx.beginPath()
    ctx.moveTo(-bodyW * 0.42, 6 * scale)
    ctx.quadraticCurveTo(-bodyW * 0.54, -14 * scale, -bodyW * 0.26, -bodyH * 0.2)
    ctx.quadraticCurveTo(0, -bodyH * 0.54, bodyW * 0.28, -bodyH * 0.36)
    ctx.quadraticCurveTo(bodyW * 0.5, -bodyH * 0.24, bodyW * 0.5, 0)
    ctx.quadraticCurveTo(bodyW * 0.48, bodyH * 0.18, bodyW * 0.2, bodyH * 0.34)
    ctx.quadraticCurveTo(-bodyW * 0.06, bodyH * 0.5, -bodyW * 0.38, bodyH * 0.32)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = "#d2b177"
    ctx.beginPath()
    ctx.moveTo(-10 * scale, -10 * scale)
    ctx.lineTo(9 * scale, -11 * scale)
    ctx.quadraticCurveTo(18 * scale, -4 * scale, 20 * scale, 12 * scale)
    ctx.lineTo(15 * scale, 24 * scale)
    ctx.quadraticCurveTo(4 * scale, 28 * scale, -8 * scale, 24 * scale)
    ctx.quadraticCurveTo(-16 * scale, 8 * scale, -10 * scale, -10 * scale)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = "#36271b"
    ctx.lineWidth = 1.8 * scale
    ctx.beginPath()
    ctx.moveTo(-2 * scale, -2 * scale)
    ctx.lineTo(3 * scale, 2 * scale)
    ctx.moveTo(-3 * scale, 7 * scale)
    ctx.lineTo(2 * scale, 10 * scale)
    ctx.stroke()

    ctx.strokeStyle = "#3a2a1f"
    ctx.lineWidth = 5.6 * scale
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(10 * scale, -18 * scale)
    ctx.lineTo(-6 * scale, 18 * scale)
    ctx.stroke()
    ctx.lineWidth = 1.4 * scale
    ctx.strokeStyle = "rgba(255,235,190,0.18)"
    ctx.beginPath()
    ctx.moveTo(12 * scale, -18 * scale)
    ctx.lineTo(-4 * scale, 18 * scale)
    ctx.stroke()

    const rearArmTop = [-16 * scale, -7 * scale]
    const rearElbow = [-24 * scale, 8 * scale]
    const rearHand = [-18 * scale, 22 * scale]
    drawLimbBlob([
        [rearArmTop[0] - 7 * scale, rearArmTop[1] - 4 * scale],
        [rearElbow[0] - 6 * scale, rearElbow[1] - 4 * scale],
        [rearHand[0] - 5 * scale, rearHand[1] - 3 * scale],
        [rearHand[0] + 3 * scale, rearHand[1] + 3 * scale],
        [rearElbow[0] + 5 * scale, rearElbow[1] + 6 * scale],
        [rearArmTop[0] + 5 * scale, rearArmTop[1] + 6 * scale],
    ], "#8aa24a")
    drawWebbedHand(rearHand[0], rearHand[1], 1, 0.8)

    const frontArmTop = [14 * scale, -6 * scale]
    const frontElbow = [28 * scale + pose.armLead * 9 * scale, 4 * scale]
    const frontHand = [34 * scale + pose.armLead * 6 * scale, 18 * scale]
    drawLimbBlob([
        [frontArmTop[0] - 7 * scale, frontArmTop[1] - 5 * scale],
        [frontElbow[0] - 8 * scale, frontElbow[1] - 5 * scale],
        [frontHand[0] - 7 * scale, frontHand[1] - 4 * scale],
        [frontHand[0] + 6 * scale, frontHand[1] + 4 * scale],
        [frontElbow[0] + 7 * scale, frontElbow[1] + 8 * scale],
        [frontArmTop[0] + 7 * scale, frontArmTop[1] + 7 * scale],
    ], "#a3c05a")
    drawWebbedHand(frontHand[0], frontHand[1], 1, 1)

    ctx.fillStyle = "#a7be59"
    ctx.beginPath()
    ctx.moveTo(-6 * scale, -bodyH * 0.34)
    ctx.quadraticCurveTo(4 * scale, -bodyH * 0.62, 24 * scale, -bodyH * 0.55)
    ctx.quadraticCurveTo(34 * scale, -bodyH * 0.5, 38 * scale, -bodyH * 0.34)
    ctx.quadraticCurveTo(34 * scale, -bodyH * 0.18, 18 * scale, -bodyH * 0.1)
    ctx.quadraticCurveTo(-4 * scale, -bodyH * 0.1, -10 * scale, -bodyH * 0.26)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = "#eef1e3"
    ctx.beginPath()
    ctx.ellipse(-eyeOffset, -bodyH * 0.42, 8 * scale, 11 * scale, -0.12, 0, Math.PI * 2)
    ctx.ellipse(eyeOffset, -bodyH * 0.42, 8 * scale, 11 * scale, 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#10140d"
    ctx.beginPath()
    ctx.arc(-eyeOffset + 1.2 * scale, -bodyH * 0.41, 4 * scale, 0, Math.PI * 2)
    ctx.arc(eyeOffset + 0.8 * scale, -bodyH * 0.41, 4 * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    ctx.beginPath()
    ctx.arc(-eyeOffset - 0.8 * scale, -bodyH * 0.45, 1.6 * scale, 0, Math.PI * 2)
    ctx.arc(eyeOffset - 0.9 * scale, -bodyH * 0.46, 1.6 * scale, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#edf0cf"
    ctx.beginPath()
    ctx.moveTo(-20 * scale, -bodyH * 0.22)
    ctx.quadraticCurveTo(-8 * scale, -6 * scale, 9 * scale, -8 * scale)
    ctx.quadraticCurveTo(24 * scale, -8 * scale, 25 * scale, -bodyH * 0.18)
    ctx.quadraticCurveTo(18 * scale, bodyH * 0.02, -2 * scale, bodyH * 0.06)
    ctx.quadraticCurveTo(-18 * scale, bodyH * 0.02, -20 * scale, -bodyH * 0.22)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = "#352417"
    ctx.lineWidth = 2.4 * scale
    ctx.beginPath()
    ctx.moveTo(-16 * scale, -bodyH * 0.16)
    ctx.quadraticCurveTo(4 * scale, -bodyH * 0.06, 20 * scale, -bodyH * 0.12)
    ctx.stroke()

    ctx.fillStyle = "#4a3a25"
    ctx.beginPath()
    ctx.ellipse(-21 * scale, -bodyH * 0.36, 2.2 * scale, 3.2 * scale, 0, 0, Math.PI * 2)
    ctx.ellipse(-11 * scale, -bodyH * 0.37, 2.2 * scale, 3.2 * scale, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
    ctx.restore()
}

function getPlayerSpriteState(){
    if(player.attackStep > 0 || player.mode === "attack1" || player.mode === "attack2" || player.mode === "dash"){
        return "attack"
    }

    if(
        player.mode === "walk" ||
        player.mode === "jumpCharge" ||
        player.mode === "jump" ||
        player.mode === "fall" ||
        (!player.onGround && Math.abs(player.vx) > 24)
    ){
        return "move"
    }

    return "idle"
}

function drawPlayerSprite(){
    const spriteState = getPlayerSpriteState()
    const image = spriteImages[spriteState]
    if(!image?.complete || !image.naturalWidth){
        return false
    }

    const config = spriteDrawConfig[spriteState]
    const scale = player.spriteScale
    const drawHeight = config.height * scale
    const drawWidth = drawHeight * (image.naturalWidth / image.naturalHeight)
    const baseX = player.x + config.xOffset * player.facing * scale
    const baseY = player.y + config.yOffset * scale
    const x = baseX + player.renderOffsetX * player.facing
    const y = baseY + player.renderOffsetY

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(player.facing * player.renderScaleX, player.renderScaleY)

    ctx.fillStyle = "rgba(17, 24, 12, 0.24)"
    ctx.beginPath()
    ctx.ellipse(0, 14 * scale, 34 * scale, 10 * scale, 0, 0, Math.PI * 2)
    ctx.fill()

    const drawX = -drawWidth * config.anchorX
    const drawY = -drawHeight * config.anchorY
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
    ctx.restore()
    return true
}

function render(){
    const width = canvas.width / DPR
    const height = canvas.height / DPR
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width * -0.04, height * -0.035)
    ctx.scale(WORLD_SCALE, WORLD_SCALE)
    drawBackground(width, height)
    drawDummy()
    drawPlayer()
    ctx.restore()
}

function frame(now){
    const dt = Math.min(1 / 30, (now - lastTime) / 1000)
    lastTime = now
    update(dt)
    render()
    requestAnimationFrame(frame)
}

window.render_game_to_text = function renderGameToText(){
    return JSON.stringify({
        mode: player.mode,
        note: "origin=(0,0) top-left, x->right, y->down",
        player: {
            x: Math.round(player.x),
            y: Math.round(player.y),
            vx: Number(player.vx.toFixed(1)),
            vy: Number(player.vy.toFixed(1)),
            facing: player.facing,
            onGround: player.onGround,
            attackStep: player.attackStep,
            dashTimer: Number(player.dashTimer.toFixed(2)),
            spriteState: getPlayerSpriteState(),
            renderOffsetY: Number(player.renderOffsetY.toFixed(2)),
        },
        dummy: {
            x: Math.round(dummy.x),
            y: Math.round(dummy.y),
            hitCount: dummy.hitCount,
            flashing: dummy.flash > 0,
        },
    })
}

window.advanceTime = function advanceTime(ms){
    const dt = 1 / 60
    const steps = Math.max(1, Math.round(ms / (1000 / 60)))
    for(let i = 0; i < steps; i++){
        update(dt)
    }
    render()
}

window.addEventListener("resize", resize)

window.addEventListener("keydown", event => {
    if(event.repeat){
        if(["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)){
            keys.add(event.code)
        }
        return
    }
    if(["Space", "KeyW", "ArrowUp"].includes(event.code)){
        requestJump()
        return
    }
    if(["ShiftLeft", "ShiftRight", "KeyK"].includes(event.code)){
        requestDash()
        return
    }
    if(event.code === "KeyJ"){
        requestAttack()
        return
    }
    if(event.code === "KeyF"){
        if(document.fullscreenElement){
            document.exitFullscreen()
        }else{
            document.documentElement.requestFullscreen?.()
        }
        return
    }
    keys.add(event.code)
})

window.addEventListener("keyup", event => {
    keys.delete(event.code)
})

canvas.addEventListener("pointerdown", event => {
    if(event.button === 0){
        requestAttack()
    }
})

window.addEventListener("pointerup", () => {
    keys.delete("Mouse0")
})

for(const button of document.querySelectorAll(".touch-btn")){
    const action = button.dataset.action
    const setPressed = value => {
        if(action === "left" || action === "right"){
            touchState[action] = value
            return
        }
        if(value){
            touchState[action] = true
            if(action === "jump") requestJump()
            if(action === "dash") requestDash()
            if(action === "attack") requestAttack()
        }else{
            touchState[action] = false
        }
    }

    button.addEventListener("pointerdown", event => {
        event.preventDefault()
        button.setPointerCapture(event.pointerId)
        setPressed(true)
    })
    button.addEventListener("pointerup", () => setPressed(false))
    button.addEventListener("pointercancel", () => setPressed(false))
    button.addEventListener("pointerleave", () => {
        if(action === "left" || action === "right"){
            setPressed(false)
        }
    })
}

resize()
render()
requestAnimationFrame(frame)
