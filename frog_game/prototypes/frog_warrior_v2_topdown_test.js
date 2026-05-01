const canvas = document.getElementById("prototype-canvas")
const ctx = canvas.getContext("2d")
const BUILD_VERSION = window.BUILD_VERSION || "2026-03-24-topdown-06"
const ASSET_VERSION = `?v=${encodeURIComponent(BUILD_VERSION)}`
const buildBadge = document.getElementById("build-badge")
const debugState = document.getElementById("debug-state")
const debugDirection = document.getElementById("debug-direction")
const debugMoveFrameIndex = document.getElementById("debug-move-frame-index")
const debugMoveAnimTime = document.getElementById("debug-move-anim-time")
const debugTargetSprite = document.getElementById("debug-target-sprite")
const debugActualSprite = document.getElementById("debug-actual-sprite")
const debugBuild = document.getElementById("debug-build")

document.title = `Frog Warrior V2 Topdown Test - ${BUILD_VERSION}`
if(buildBadge){
    buildBadge.textContent = `Build ${BUILD_VERSION}`
}
if(debugBuild){
    debugBuild.textContent = BUILD_VERSION
}

const DPR = Math.min(window.devicePixelRatio || 1, 1.5)
const SPRITE_ROOT = "./assets/frog_warrior_v2"
const WORLD_SCALE = 1.08
const MOVE_SPEED = 240
const DASH_SPEED = 520
const DASH_TIME = 0.16
const ATTACK_ONE_TOTAL = 0.28
const ATTACK_TWO_TOTAL = 0.38
const COMBO_BUFFER = 0.24
const AOE_TOTAL = 0.48

const keys = new Set()
const touchState = {
    left: false,
    right: false,
    up: false,
    down: false,
    dash: false,
    attack: false,
    aoe: false,
}

const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facingX: 1,
    facingY: 0,
    mode: "idle",
    moveBlend: 0,
    walkCycle: 0,
    idleBob: 0,
    dashTimer: 0,
    attackTimer: 0,
    attackStep: 0,
    attackQueued: false,
    comboWindow: 0,
    attackHit: false,
    aoeTimer: 0,
    aoeHit: false,
    moveAnimTime: 0,
    moveFrameIndex: 0,
    moveDirection: "down",
    spriteScale: 1.12,
    renderOffsetY: 0,
    renderOffsetX: 0,
    renderRotation: 0,
    renderScaleX: 1,
    renderScaleY: 1,
    shadowScaleX: 1,
    shadowAlpha: 0.24,
    targetFrameName: "frog_main_idle_std.png",
    actualFrameName: "frog_main_idle_std.png",
}

const dummy = {
    x: 0,
    y: 0,
    flash: 0,
    wobble: 0,
    hitCount: 0,
}

const lilyPads = []
const pebbles = []
let bounds = {left: 96, right: 960, top: 120, bottom: 640}
let lastTime = performance.now()

function loadSprite(src){
    const image = new Image()
    image.src = `${src}${ASSET_VERSION}`
    return image
}

const spriteImages = {
    idle: loadSprite(`${SPRITE_ROOT}/frog_main_idle_std.png`),
    dash: loadSprite(`${SPRITE_ROOT}/frog_main_attack_std.png`),
    moveFallback: loadSprite(`${SPRITE_ROOT}/frog_main_move.png`),
    attackFallback: loadSprite(`${SPRITE_ROOT}/frog_main_attack_std.png`),
    moveDirectional: {
        down: [
            loadSprite(`${SPRITE_ROOT}/frog_move_down_1.png`),
            loadSprite(`${SPRITE_ROOT}/frog_move_down_2.png`),
        ],
        up: [
            loadSprite(`${SPRITE_ROOT}/frog_move_up_1.png`),
            loadSprite(`${SPRITE_ROOT}/frog_move_up_2.png`),
        ],
        right: [
            loadSprite(`${SPRITE_ROOT}/frog_move_right_1.png`),
            loadSprite(`${SPRITE_ROOT}/frog_move_right_2.png`),
        ],
        left: [
            loadSprite(`${SPRITE_ROOT}/frog_move_left_1.png`),
            loadSprite(`${SPRITE_ROOT}/frog_move_left_2.png`),
        ],
    },
    aoeFrames: {
        prep: loadSprite(`${SPRITE_ROOT}/aoe_attack_1_std.png`),
        strike: loadSprite(`${SPRITE_ROOT}/aoe_attack_2_std.png`),
        recover: loadSprite(`${SPRITE_ROOT}/aoe_attack_3_std.png`),
    },
}

const spriteNames = {
    idle: "frog_main_idle_std.png",
    dash: "frog_main_attack_std.png",
    moveFallback: "frog_main_move.png",
    attackFallback: "frog_main_attack_std.png",
    moveDirectional: {
        down: ["frog_move_down_1.png", "frog_move_down_2.png"],
        up: ["frog_move_up_1.png", "frog_move_up_2.png"],
        right: ["frog_move_right_1.png", "frog_move_right_2.png"],
        left: ["frog_move_left_1.png", "frog_move_left_2.png"],
    },
    aoeFrames: {
        prep: "aoe_attack_1_std.png",
        strike: "aoe_attack_2_std.png",
        recover: "aoe_attack_3_std.png",
    },
}

const spriteDrawConfig = {
    idle: {height: 192, anchorX: 0.5, anchorY: 0.818, xOffset: 0, yOffset: 0},
    move: {height: 192, anchorX: 0.5, anchorY: 0.818, xOffset: 0, yOffset: 0},
    attack: {height: 192, anchorX: 0.5, anchorY: 0.817, xOffset: 0, yOffset: 0},
    dash: {height: 192, anchorX: 0.5, anchorY: 0.817, xOffset: 0, yOffset: 0},
    aoe: {height: 192, anchorX: 0.5, anchorY: 0.818, xOffset: 0, yOffset: 0},
}

function lerp(current, target, alpha){
    return current + (target - current) * alpha
}

function resize(){
    const width = Math.max(700, Math.round(window.innerWidth))
    const height = Math.max(420, Math.round(window.innerHeight))
    canvas.width = Math.round(width * DPR)
    canvas.height = Math.round(height * DPR)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

    bounds = {
        left: width * 0.08,
        right: width * 0.92,
        top: height * 0.18,
        bottom: height * 0.82,
    }

    if(!player.x){
        player.x = width * 0.38
        player.y = height * 0.58
    }else{
        player.x = Math.min(bounds.right, Math.max(bounds.left, player.x))
        player.y = Math.min(bounds.bottom, Math.max(bounds.top, player.y))
    }

    dummy.x = width * 0.68
    dummy.y = height * 0.55
    buildScene(width, height)
}

function buildScene(width, height){
    lilyPads.length = 0
    pebbles.length = 0
    for(let i = 0; i < 14; i++){
        lilyPads.push({
            x: 60 + (i / 13) * (width - 120),
            y: 80 + ((i * 53) % Math.max(160, height - 160)),
            rx: 36 + (i % 4) * 8,
            ry: 24 + (i % 3) * 6,
            rot: ((i % 5) - 2) * 0.14,
        })
    }
    for(let i = 0; i < 180; i++){
        pebbles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            rx: 2 + Math.random() * 4,
            ry: 1 + Math.random() * 3,
            rot: Math.random() * Math.PI,
            alpha: 0.12 + Math.random() * 0.18,
        })
    }
}

function inputAxis(){
    let x = 0
    let y = 0
    if(keys.has("ArrowLeft") || keys.has("KeyA") || touchState.left) x -= 1
    if(keys.has("ArrowRight") || keys.has("KeyD") || touchState.right) x += 1
    if(keys.has("ArrowUp") || keys.has("KeyW") || touchState.up) y -= 1
    if(keys.has("ArrowDown") || keys.has("KeyS") || touchState.down) y += 1
    if(x !== 0 && y !== 0){
        const len = Math.hypot(x, y)
        x /= len
        y /= len
    }
    return {x, y}
}

function requestDash(){
    touchState.dash = false
    if(player.dashTimer > 0 || player.attackStep > 0 || player.aoeTimer > 0){
        return
    }
    const axis = inputAxis()
    if(axis.x !== 0 || axis.y !== 0){
        player.facingX = axis.x
        player.facingY = axis.y
    }
    player.dashTimer = DASH_TIME
    player.mode = "dash"
}

function requestAttack(){
    touchState.attack = false
    if(player.aoeTimer > 0){
        return
    }
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

function requestAoe(){
    touchState.aoe = false
    if(player.aoeTimer > 0 || player.attackStep > 0 || player.dashTimer > 0){
        return
    }
    player.aoeTimer = AOE_TOTAL
    player.aoeHit = false
    player.mode = "aoe"
    player.vx *= 0.18
    player.vy *= 0.18
}

function processInput(dt){
    const axis = inputAxis()
    const moving = axis.x !== 0 || axis.y !== 0
    if(moving){
        player.facingX = axis.x
        player.facingY = axis.y
        if(Math.abs(axis.x) > Math.abs(axis.y)){
            player.moveDirection = axis.x >= 0 ? "right" : "left"
        }else if(Math.abs(axis.y) > Math.abs(axis.x)){
            player.moveDirection = axis.y >= 0 ? "down" : "up"
        }
    }

    if(player.attackStep === 0 && player.dashTimer <= 0 && player.aoeTimer <= 0){
        const targetVX = axis.x * MOVE_SPEED
        const targetVY = axis.y * MOVE_SPEED
        player.vx += (targetVX - player.vx) * Math.min(1, dt * 14)
        player.vy += (targetVY - player.vy) * Math.min(1, dt * 14)
        player.mode = moving ? "walk" : "idle"
    }else{
        player.vx *= Math.pow(0.02, dt)
        player.vy *= Math.pow(0.02, dt)
    }

    if(!moving && player.attackStep === 0 && player.dashTimer <= 0 && player.aoeTimer <= 0){
        player.vx *= Math.pow(0.002, dt)
        player.vy *= Math.pow(0.002, dt)
    }

    player.moveBlend += ((moving ? 1 : 0) - player.moveBlend) * Math.min(1, dt * 10)
    player.walkCycle += Math.hypot(player.vx, player.vy) * dt * 0.022
    player.idleBob += dt * 2.3
    if(moving && player.attackStep === 0 && player.dashTimer <= 0 && player.aoeTimer <= 0){
        const speedRatio = Math.min(1.08, Math.hypot(player.vx, player.vy) / MOVE_SPEED)
        player.moveAnimTime += dt * (6.2 + speedRatio * 2.4)
        player.moveFrameIndex = Math.floor(player.moveAnimTime) % 2
    }else{
        player.moveAnimTime = 0
        player.moveFrameIndex = 0
    }
}

function updateDash(dt){
    if(player.dashTimer <= 0){
        return
    }
    player.dashTimer -= dt
    player.mode = "dash"
    player.vx = player.facingX * DASH_SPEED
    player.vy = player.facingY * DASH_SPEED
    if(player.dashTimer <= 0){
        player.dashTimer = 0
        player.mode = "idle"
    }
}

function tryAttackHit(range){
    if(player.attackHit){
        return
    }
    const dx = dummy.x - player.x
    const dy = dummy.y - player.y
    const facingDot = dx * player.facingX + dy * player.facingY
    if(Math.hypot(dx, dy) <= range && facingDot > -8){
        player.attackHit = true
        dummy.flash = 0.18
        dummy.wobble = 0.22
        dummy.hitCount += 1
    }
}

function tryAoeHit(range){
    if(player.aoeHit){
        return
    }
    const dx = dummy.x - player.x
    const dy = dummy.y - player.y
    if(Math.hypot(dx, dy) <= range){
        player.aoeHit = true
        dummy.flash = 0.22
        dummy.wobble = 0.3
        dummy.hitCount += 1
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
        player.vy *= Math.pow(0.02, dt)
        if(active){
            tryAttackHit(92)
        }
        if(player.attackTimer <= 0){
            if(player.attackQueued && player.comboWindow > 0){
                player.attackStep = 2
                player.attackTimer = ATTACK_TWO_TOTAL
                player.attackQueued = false
                player.attackHit = false
                player.mode = "attack2"
                player.vx = player.facingX * 260
                player.vy = player.facingY * 260
            }else{
                player.attackStep = 0
                player.mode = "idle"
            }
        }
        return
    }

    if(player.attackStep === 2){
        player.mode = "attack2"
        const active = player.attackTimer < 0.24 && player.attackTimer > 0.06
        if(active){
            player.vx = player.facingX * 300
            player.vy = player.facingY * 300
            tryAttackHit(118)
        }
        if(player.attackTimer <= 0){
            player.attackStep = 0
            player.mode = "idle"
        }
    }
}

function getAoePhase(){
    if(player.aoeTimer <= 0){
        return null
    }
    const remaining = Math.max(0, player.aoeTimer)
    const t = 1 - remaining / AOE_TOTAL
    if(t < 0.26){
        return "prep"
    }
    if(t < 0.68){
        return "strike"
    }
    return "recover"
}

function updateAoe(dt){
    if(player.aoeTimer <= 0){
        return
    }
    player.aoeTimer -= dt
    player.mode = "aoe"
    player.vx *= Math.pow(0.01, dt)
    player.vy *= Math.pow(0.01, dt)
    const phase = getAoePhase()
    if(phase === "strike"){
        tryAoeHit(148)
    }
    if(player.aoeTimer <= 0){
        player.aoeTimer = 0
        player.aoeHit = false
        player.mode = "idle"
    }
}

function updateDummy(dt){
    dummy.flash = Math.max(0, dummy.flash - dt)
    dummy.wobble = Math.max(0, dummy.wobble - dt)
}

function updatePhysics(dt){
    player.x += player.vx * dt
    player.y += player.vy * dt
    player.x = Math.max(bounds.left, Math.min(bounds.right, player.x))
    player.y = Math.max(bounds.top, Math.min(bounds.bottom, player.y))
}

function getPlayerSpriteState(){
    if(player.aoeTimer > 0 || player.mode === "aoe"){
        return "aoe"
    }
    if(player.mode === "dash"){
        return "dash"
    }
    if(player.attackStep > 0 || player.mode === "attack1" || player.mode === "attack2"){
        return "attack"
    }
    if(player.mode === "walk"){
        return "move"
    }
    return "idle"
}

function getMoveFrameIndex(){
    return Math.max(0, Math.min(1, player.moveFrameIndex))
}

function getMoveDirection(){
    const vx = player.vx
    const vy = player.vy
    if(Math.abs(vx) > Math.abs(vy)){
        return vx >= 0 ? "right" : "left"
    }
    if(Math.abs(vy) > Math.abs(vx)){
        return vy >= 0 ? "down" : "up"
    }
    if(player.mode === "walk"){
        if(Math.abs(player.facingX) > Math.abs(player.facingY)){
            return player.facingX >= 0 ? "right" : "left"
        }
        return player.facingY >= 0 ? "down" : "up"
    }
    return player.moveDirection || "down"
}

function getAttackPhase(){
    if(player.mode === "dash"){
        return "dash"
    }
    if(player.attackStep === 0){
        return null
    }

    const total = player.attackStep === 2 ? ATTACK_TWO_TOTAL : ATTACK_ONE_TOTAL
    const remaining = Math.max(0, player.attackTimer)
    const t = 1 - remaining / total

    if(t < 0.28){
        return "prep"
    }
    if(t < 0.64){
        return "strike"
    }
    return "recover"
}

function getAttackMotionProfile(){
    const isSecondStrike = player.attackStep === 2 || player.mode === "attack2"
    const isDash = player.mode === "dash" && player.attackStep === 0
    if(isDash){
        return {
            targetY: 2.5,
            targetX: 7,
            targetScaleX: 1.035,
            targetScaleY: 0.975,
            targetRotation: player.facingX !== 0 ? player.facingX * 0.028 : 0.018 * player.facingY,
        }
    }
    const total = isSecondStrike ? ATTACK_TWO_TOTAL : ATTACK_ONE_TOTAL
    const remaining = Math.max(0, player.attackTimer)
    const t = 1 - remaining / total
    let targetY = 0
    let targetX = 0
    let targetScaleX = 1
    let targetScaleY = 1
    let targetRotation = 0

    if(t < 0.28){
        const p = t / 0.28
        targetY = isSecondStrike ? 8 * p : 6 * p
        targetScaleY = 1 - 0.065 * p
        targetScaleX = 1 + 0.038 * p
        targetRotation = (isSecondStrike ? 0.02 : 0.014) * p * (player.facingX !== 0 ? player.facingX : 0.6 * player.facingY)
    }else if(t < 0.58){
        const p = (t - 0.28) / 0.30
        targetY = (isSecondStrike ? 8 : 6) + ((isSecondStrike ? -11 : -6) - (isSecondStrike ? 8 : 6)) * p
        targetX = (isSecondStrike ? 10 : 5) * p
        targetScaleY = (isSecondStrike ? 0.935 : 0.955) + ((isSecondStrike ? 1.055 : 1.03) - (isSecondStrike ? 0.935 : 0.955)) * p
        targetScaleX = (isSecondStrike ? 1.038 : 1.028) + ((isSecondStrike ? 1.065 : 1.042) - (isSecondStrike ? 1.038 : 1.028)) * p
        targetRotation = ((isSecondStrike ? -0.03 : -0.018) + (isSecondStrike ? 0.012 : 0.008) * p) * (player.facingX !== 0 ? player.facingX : 0.6 * player.facingY)
    }else{
        const p = (t - 0.58) / 0.42
        targetY = (isSecondStrike ? -11 : -6) * (1 - p)
        targetX = (isSecondStrike ? 10 : 5) * (1 - p)
        targetScaleY = (isSecondStrike ? 1.055 : 1.03) + (1 - (isSecondStrike ? 1.055 : 1.03)) * p
        targetScaleX = (isSecondStrike ? 1.065 : 1.042) + (1 - (isSecondStrike ? 1.065 : 1.042)) * p
        targetRotation = (isSecondStrike ? 0.012 : 0.008) * (1 - p) * (player.facingX !== 0 ? player.facingX : 0.6 * player.facingY)
    }
    return {targetY, targetX, targetScaleX, targetScaleY, targetRotation}
}

function getAoeMotionProfile(){
    const phase = getAoePhase() || "strike"
    if(phase === "prep"){
        return {
            targetY: 7,
            targetX: 0,
            targetScaleX: 1.03,
            targetScaleY: 0.95,
            targetRotation: 0,
        }
    }
    if(phase === "strike"){
        return {
            targetY: -8,
            targetX: 0,
            targetScaleX: 1.06,
            targetScaleY: 1.03,
            targetRotation: 0.06 * (player.facingX !== 0 ? player.facingX : (player.facingY >= 0 ? 1 : -1)),
        }
    }
    return {
        targetY: -2,
        targetX: 0,
        targetScaleX: 1.02,
        targetScaleY: 1.01,
        targetRotation: 0.015 * (player.facingX !== 0 ? player.facingX : (player.facingY >= 0 ? 1 : -1)),
    }
}

function getMoveMotionProfile(){
    const major = Math.sin(player.walkCycle * 2.25)
    const sway = Math.sin(player.walkCycle * 1.12)
    const speedRatio = Math.min(1, Math.hypot(player.vx, player.vy) / MOVE_SPEED)
    const lateralBias = Math.abs(player.facingX) >= Math.abs(player.facingY) ? player.facingX : player.facingY * 0.22
    const directionalTilt = player.facingX !== 0 ? player.facingX : player.facingY * 0.18

    return {
        targetY: major * 2.8 * speedRatio,
        targetX: sway * 0.42 * lateralBias * speedRatio,
        targetRotation: major * 0.01 * directionalTilt,
        targetScaleX: 1 + major * 0.007 * speedRatio,
        targetScaleY: 1 - major * 0.012 * speedRatio,
        shadowScaleX: 1 + Math.max(0, -major) * 0.075 * speedRatio,
        shadowAlpha: 0.205 + Math.max(0, -major) * 0.03 * speedRatio,
    }
}

function updateSpriteMotion(dt){
    let targetY = 0
    let targetX = 0
    let targetRotation = 0
    let targetScaleX = 1
    let targetScaleY = 1
    let targetShadowScaleX = 1
    let targetShadowAlpha = 0.24
    const spriteState = getPlayerSpriteState()

    if(spriteState === "aoe"){
        const profile = getAoeMotionProfile()
        targetY = profile.targetY
        targetX = profile.targetX
        targetRotation = profile.targetRotation || 0
        targetScaleX = profile.targetScaleX
        targetScaleY = profile.targetScaleY
        targetShadowScaleX = 1.1
        targetShadowAlpha = 0.19
    }else if(spriteState === "attack"){
        const profile = getAttackMotionProfile()
        targetY = profile.targetY
        targetX = profile.targetX
        targetRotation = profile.targetRotation || 0
        targetScaleX = profile.targetScaleX
        targetScaleY = profile.targetScaleY
        targetShadowScaleX = 1.06
        targetShadowAlpha = 0.2
    }else if(spriteState === "move"){
        const profile = getMoveMotionProfile()
        targetY = profile.targetY
        targetX = profile.targetX
        targetRotation = profile.targetRotation
        targetScaleX = profile.targetScaleX
        targetScaleY = profile.targetScaleY
        targetShadowScaleX = profile.shadowScaleX
        targetShadowAlpha = profile.shadowAlpha
    }else{
        const breath = Math.sin(player.idleBob * 1.15)
        targetY = breath * 3
        targetScaleY = 1 + breath * 0.015
        targetScaleX = 1 - breath * 0.01
        targetShadowScaleX = 1 + Math.max(0, breath) * 0.05
        targetShadowAlpha = 0.22 + Math.max(0, breath) * 0.03
    }

    const blend = 1 - Math.exp(-dt * (spriteState === "attack" ? 18 : 12))
    player.renderOffsetY = lerp(player.renderOffsetY, targetY, blend)
    player.renderOffsetX = lerp(player.renderOffsetX, targetX, blend)
    player.renderRotation = lerp(player.renderRotation, targetRotation, blend)
    player.renderScaleX = lerp(player.renderScaleX, targetScaleX, blend)
    player.renderScaleY = lerp(player.renderScaleY, targetScaleY, blend)
    player.shadowScaleX = lerp(player.shadowScaleX, targetShadowScaleX, blend)
    player.shadowAlpha = lerp(player.shadowAlpha, targetShadowAlpha, blend)
}

function getSpriteVisualSelection(){
    const spriteState = getPlayerSpriteState()
    if(spriteState === "move"){
        const direction = getMoveDirection()
        const frameIndex = getMoveFrameIndex()
        const directionalFrames = spriteImages.moveDirectional[direction] || spriteImages.moveDirectional.down
        const directionalNames = spriteNames.moveDirectional[direction] || spriteNames.moveDirectional.down
        const frameImage = directionalFrames[frameIndex]
        const targetFrame = directionalNames[frameIndex]
        const useFallback = !frameImage?.complete || !frameImage?.naturalWidth
        return {
            image: useFallback ? spriteImages.moveFallback : frameImage,
            config: spriteDrawConfig.move,
            targetFrame,
            actualFrame: useFallback ? spriteNames.moveFallback : targetFrame,
        }
    }
    if(spriteState === "aoe"){
        const phase = getAoePhase() || "strike"
        const phaseImage = spriteImages.aoeFrames[phase]
        const targetFrame = spriteNames.aoeFrames[phase]
        const useFallback = !phaseImage?.complete || !phaseImage?.naturalWidth
        return {
            image: useFallback ? spriteImages.attackFallback : phaseImage,
            config: spriteDrawConfig.aoe,
            targetFrame,
            actualFrame: useFallback ? spriteNames.attackFallback : targetFrame,
        }
    }
    if(spriteState === "attack"){
        return {
            image: spriteImages.attackFallback,
            config: spriteDrawConfig.attack,
            targetFrame: spriteNames.attackFallback,
            actualFrame: spriteNames.attackFallback,
        }
    }
    if(spriteState === "dash"){
        return {
            image: spriteImages.dash,
            config: spriteDrawConfig.dash,
            targetFrame: spriteNames.dash,
            actualFrame: spriteNames.dash,
        }
    }
    return {
        image: spriteImages.idle,
        config: spriteDrawConfig.idle,
        targetFrame: spriteNames.idle,
        actualFrame: spriteNames.idle,
    }
}

function update(dt){
    processInput(dt)
    updateDash(dt)
    updateAttack(dt)
    updateAoe(dt)
    updatePhysics(dt)
    updateDummy(dt)
    updateSpriteMotion(dt)
}

function drawBackground(width, height){
    const water = ctx.createLinearGradient(0, 0, width, height)
    water.addColorStop(0, "#4e7d66")
    water.addColorStop(0.5, "#3f6a56")
    water.addColorStop(1, "#2e5648")
    ctx.fillStyle = water
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = "rgba(184, 216, 170, 0.14)"
    ctx.beginPath()
    ctx.ellipse(width * 0.2, height * 0.26, width * 0.22, height * 0.16, -0.25, 0, Math.PI * 2)
    ctx.ellipse(width * 0.78, height * 0.74, width * 0.28, height * 0.22, 0.14, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#8b7749"
    ctx.beginPath()
    ctx.moveTo(bounds.left, bounds.top + 50)
    ctx.bezierCurveTo(bounds.left + 120, bounds.top - 30, bounds.right - 160, bounds.top + 20, bounds.right, bounds.top + 80)
    ctx.bezierCurveTo(bounds.right + 10, bounds.bottom - 120, bounds.right - 120, bounds.bottom + 20, bounds.left + 80, bounds.bottom)
    ctx.bezierCurveTo(bounds.left - 40, bounds.bottom - 60, bounds.left - 20, bounds.top + 150, bounds.left, bounds.top + 50)
    ctx.fill()

    ctx.fillStyle = "rgba(116, 92, 51, 0.12)"
    for(const pebble of pebbles){
        ctx.save()
        ctx.translate(pebble.x, pebble.y)
        ctx.rotate(pebble.rot)
        ctx.beginPath()
        ctx.ellipse(0, 0, pebble.rx * 4.4, pebble.ry * 4, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    for(const pebble of pebbles){
        ctx.fillStyle = `rgba(244,232,203,${pebble.alpha})`
        ctx.save()
        ctx.translate(pebble.x, pebble.y)
        ctx.rotate(pebble.rot)
        ctx.beginPath()
        ctx.ellipse(0, 0, pebble.rx, pebble.ry, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    for(const pad of lilyPads){
        ctx.save()
        ctx.translate(pad.x, pad.y)
        ctx.rotate(pad.rot)
        ctx.fillStyle = "rgba(103, 164, 79, 0.22)"
        ctx.beginPath()
        ctx.ellipse(0, 0, pad.rx, pad.ry, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "rgba(138, 201, 110, 0.18)"
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, pad.rx * 0.94, -0.16, 0.22, false)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
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

function drawPlayerSprite(){
    const selection = getSpriteVisualSelection()
    player.targetFrameName = selection.targetFrame
    player.actualFrameName = selection.actualFrame
    const image = selection.image
    if(!image?.complete || !image.naturalWidth){
        player.actualFrameName = "fallback_draw_blob"
        return false
    }

    const config = selection.config
    const scale = player.spriteScale
    const drawHeight = config.height * scale
    const drawWidth = drawHeight * (image.naturalWidth / image.naturalHeight)
    const spriteState = getPlayerSpriteState()
    const useFacingFlip = spriteState !== "move"
    const facingSign = useFacingFlip && player.facingX < -0.18 ? -1 : 1
    const baseX = player.x + config.xOffset * facingSign * scale
    const baseY = player.y + config.yOffset * scale
    const x = baseX + player.renderOffsetX * facingSign
    const y = baseY + player.renderOffsetY

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(player.renderRotation)
    ctx.scale(facingSign * player.renderScaleX, player.renderScaleY)

    ctx.fillStyle = `rgba(17, 24, 12, ${player.shadowAlpha})`
    ctx.beginPath()
    ctx.ellipse(0, 14 * scale, 34 * scale * player.shadowScaleX, 10 * scale, 0, 0, Math.PI * 2)
    ctx.fill()

    const drawX = -drawWidth * config.anchorX
    const drawY = -drawHeight * config.anchorY
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
    ctx.restore()
    return true
}

function drawFallbackPlayer(){
    ctx.save()
    ctx.translate(player.x, player.y)
    ctx.fillStyle = "#9ac45a"
    ctx.beginPath()
    ctx.ellipse(0, -32, 28, 26, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#eff0d3"
    ctx.beginPath()
    ctx.ellipse(0, -12, 20, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
}

function drawPlayer(){
    if(!drawPlayerSprite()){
        drawFallbackPlayer()
    }
}

function updateDebugHud(){
    const selection = getSpriteVisualSelection()
    if(debugState){
        debugState.textContent = player.mode
    }
    if(debugDirection){
        debugDirection.textContent = player.moveDirection
    }
    if(debugMoveFrameIndex){
        debugMoveFrameIndex.textContent = String(player.moveFrameIndex)
    }
    if(debugMoveAnimTime){
        debugMoveAnimTime.textContent = player.moveAnimTime.toFixed(2)
    }
    if(debugTargetSprite){
        debugTargetSprite.textContent = selection.targetFrame
    }
    if(debugActualSprite){
        debugActualSprite.textContent = player.actualFrameName
    }
    if(debugBuild){
        debugBuild.textContent = BUILD_VERSION
    }
}

function render(){
    const width = canvas.width / DPR
    const height = canvas.height / DPR
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width * -0.02, height * -0.02)
    ctx.scale(WORLD_SCALE, WORLD_SCALE)
    drawBackground(width, height)
    drawDummy()
    drawPlayer()
    ctx.restore()
    updateDebugHud()
}

function frame(now){
    const dt = Math.min(1 / 30, (now - lastTime) / 1000)
    lastTime = now
    update(dt)
    render()
    requestAnimationFrame(frame)
}

window.render_game_to_text = function renderGameToText(){
    const selection = getSpriteVisualSelection()
    return JSON.stringify({
        mode: player.mode,
        note: "origin=(0,0) top-left, x->right, y->down",
        player: {
            x: Math.round(player.x),
            y: Math.round(player.y),
            vx: Number(player.vx.toFixed(1)),
            vy: Number(player.vy.toFixed(1)),
            facingX: Number(player.facingX.toFixed(2)),
            facingY: Number(player.facingY.toFixed(2)),
            attackStep: player.attackStep,
            dashTimer: Number(player.dashTimer.toFixed(2)),
            spriteState: getPlayerSpriteState(),
            spriteFrame: selection.actualFrame,
            targetSprite: selection.targetFrame,
            direction: player.moveDirection,
            moveFrameIndex: player.moveFrameIndex,
            moveAnimTime: Number(player.moveAnimTime.toFixed(2)),
            buildVersion: BUILD_VERSION,
            renderRotation: Number(player.renderRotation.toFixed(3)),
            },
        dummy: {
            x: Math.round(dummy.x),
            y: Math.round(dummy.y),
            hitCount: dummy.hitCount,
            flashing: dummy.flash > 0,
        },
    })
}

window.addEventListener("resize", resize)

window.addEventListener("keydown", event => {
    if(event.repeat){
        if(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(event.code)){
            keys.add(event.code)
        }
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
    if(["KeyL", "KeyU"].includes(event.code)){
        requestAoe()
        return
    }
    if(event.code === "Space"){
        return
    }
    keys.add(event.code)
})

window.addEventListener("keyup", event => {
    keys.delete(event.code)
})

canvas.addEventListener("pointerdown", event => {
    if(event.pointerType === "mouse" && event.button === 0){
        requestAttack()
    }
})

for(const button of document.querySelectorAll(".touch-btn")){
    const action = button.dataset.action
    const setPressed = value => {
        if(action in touchState){
            touchState[action] = value
        }
        if(action === "dash" && value){
            requestDash()
        }
        if(action === "attack" && value){
            requestAttack()
        }
        if(action === "aoe" && value){
            requestAoe()
        }
    }

    button.addEventListener("touchstart", event => {
        event.preventDefault()
        setPressed(true)
    }, {passive: false})

    button.addEventListener("touchend", event => {
        event.preventDefault()
        setPressed(false)
    }, {passive: false})

    button.addEventListener("touchcancel", () => setPressed(false))
    button.addEventListener("pointerdown", event => {
        if(event.pointerType !== "mouse"){
            setPressed(true)
        }
    })
    button.addEventListener("pointerup", () => setPressed(false))
    button.addEventListener("pointercancel", () => setPressed(false))
}

resize()
render()
requestAnimationFrame(frame)
