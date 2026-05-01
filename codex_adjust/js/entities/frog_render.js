/**
 * This module draws the frog character.
 * It is responsible for frog visuals only and does not mutate gameplay state beyond render-time transforms.
 */


import { ctx, camera, frog } from "../core/state.js"
import { clamp, lerp } from "../core/utils.js"
import { BUILD_ID } from "../config/game_config.js"
import { getAttackPhase, getAoePhase } from "../systems/abilities.js"

const SPRITE_ROOT = new URL("../../prototypes/assets/frog_warrior_v2/", import.meta.url)
const ASSET_VERSION = `?v=${encodeURIComponent(BUILD_ID)}`

function loadSprite(name){
    const image = new Image()
    image.decoding = "async"
    image.src = `${new URL(name, SPRITE_ROOT).toString()}${ASSET_VERSION}`
    return image
}

const spriteImages = {
    idle: loadSprite("frog_main_idle_std.png"),
    attack: loadSprite("frog_main_attack_std.png"),
    dash: loadSprite("frog_main_attack_std.png"),
    attackFrames: {
        prep: loadSprite("attack_frame_1.png"),
        strike: loadSprite("attack_frame_2.png"),
        recover: loadSprite("attack_frame_3.png"),
    },
    moveDirectional: {
        down: [loadSprite("frog_move_down_1.png"), loadSprite("frog_move_down_2.png")],
        up: [loadSprite("frog_move_up_1.png"), loadSprite("frog_move_up_2.png")],
        left: [loadSprite("frog_move_left_1.png"), loadSprite("frog_move_left_2.png")],
        right: [loadSprite("frog_move_right_1.png"), loadSprite("frog_move_right_2.png")],
    },
    aoeFrames: {
        prep: loadSprite("aoe_attack_1_std.png"),
        strike: loadSprite("aoe_attack_2_std.png"),
        recover: loadSprite("aoe_attack_3_std.png"),
    },
}

const spriteNames = {
    idle: "frog_main_idle_std.png",
    attack: "frog_main_attack_std.png",
    dash: "frog_main_attack_std.png",
    attackFrames: {
        prep: "attack_frame_1.png",
        strike: "attack_frame_2.png",
        recover: "attack_frame_3.png",
    },
    moveDirectional: {
        down: ["frog_move_down_1.png", "frog_move_down_2.png"],
        up: ["frog_move_up_1.png", "frog_move_up_2.png"],
        left: ["frog_move_left_1.png", "frog_move_left_2.png"],
        right: ["frog_move_right_1.png", "frog_move_right_2.png"],
    },
    aoeFrames: {
        prep: "aoe_attack_1_std.png",
        strike: "aoe_attack_2_std.png",
        recover: "aoe_attack_3_std.png",
    },
}

const spriteDrawConfig = {
    idle: {height:124, anchorX:0.5, anchorY:0.818, xOffset:0, yOffset:0},
    move: {height:124, anchorX:0.5, anchorY:0.818, xOffset:0, yOffset:0},
    attackPrep: {height:58, anchorX:0.5, anchorY:0.979, xOffset:2, yOffset:1},
    attackStrike: {height:57, anchorX:0.5, anchorY:0.979, xOffset:10, yOffset:0},
    attackRecover: {height:56, anchorX:0.5, anchorY:0.972, xOffset:4, yOffset:0},
    dash: {height:124, anchorX:0.5, anchorY:0.818, xOffset:6, yOffset:0},
    aoe: {height:124, anchorX:0.5, anchorY:0.818, xOffset:0, yOffset:0},
}

const spriteMotion = {
    offsetX:0,
    offsetY:0,
    rotation:0,
    scaleX:1,
    scaleY:1,
    shadowScaleX:1,
    shadowAlpha:0.24,
}

function isSpriteReady(image){
    return !!image?.complete && !!image?.naturalWidth
}

function waitForSpriteReady(image){
    if(isSpriteReady(image)){
        return Promise.resolve(true)
    }

    return new Promise(resolve => {
        let settled = false

        const finish = ready => {
            if(settled){
                return
            }
            settled = true
            image.removeEventListener("load", onLoad)
            image.removeEventListener("error", onError)
            resolve(ready)
        }
        const onLoad = () => finish(isSpriteReady(image))
        const onError = () => finish(false)

        image.addEventListener("load", onLoad, {once:true})
        image.addEventListener("error", onError, {once:true})

        if(image.complete){
            finish(isSpriteReady(image))
        }
    })
}

function timeoutReady(ms){
    return new Promise(resolve => {
        window.setTimeout(() => resolve(false), ms)
    })
}

export function isInitialFrogSpriteReady(){
    return isSpriteReady(spriteImages.idle)
}

export async function waitForInitialFrogSpriteReady(timeoutMs = 0){
    if(!timeoutMs || timeoutMs <= 0){
        return waitForSpriteReady(spriteImages.idle)
    }

    return Promise.race([
        waitForSpriteReady(spriteImages.idle),
        timeoutReady(timeoutMs)
    ])
}

function getMoveDirection(){
    if(frog.moveDirection){
        return frog.moveDirection
    }
    if(Math.abs(frog.facingX) > Math.abs(frog.facingY)){
        return frog.facingX >= 0 ? "right" : "left"
    }
    return frog.facingY >= 0 ? "down" : "up"
}

function getMoveFrameIndex(){
    return Math.abs(Math.floor(frog.walkCycle * 0.85)) % 2
}

function getSpriteState(){
    if(frog.aoeTimer > 0){
        return "aoe"
    }
    if(frog.motionMode === "dash" && frog.jumpTimer > 0){
        return "dash"
    }
    if(frog.attackStep > 0){
        return "attack"
    }
    if(frog.moveBlend > 0.08 && (Math.abs(frog.lastMoveX) > 0.001 || Math.abs(frog.lastMoveY) > 0.001)){
        return "move"
    }
    return "idle"
}

function getSpriteVisualSelection(){
    const spriteState = getSpriteState()
    if(spriteState === "move"){
        const direction = getMoveDirection()
        const frameIndex = getMoveFrameIndex()
        const frames = spriteImages.moveDirectional[direction] || spriteImages.moveDirectional.down
        const names = spriteNames.moveDirectional[direction] || spriteNames.moveDirectional.down
        const image = frames[frameIndex]
        const name = names[frameIndex]
        if(isSpriteReady(image)){
            return {image, name, state:"move", config:spriteDrawConfig.move}
        }
    }
    if(spriteState === "aoe"){
        const phase = getAoePhase() || "strike"
        const image = spriteImages.aoeFrames[phase]
        const name = spriteNames.aoeFrames[phase]
        if(isSpriteReady(image)){
            return {image, name, state:"aoe", config:spriteDrawConfig.aoe}
        }
    }
    if(spriteState === "dash" && isSpriteReady(spriteImages.dash)){
        return {image:spriteImages.dash, name:spriteNames.dash, state:"dash", config:spriteDrawConfig.dash}
    }
    if(spriteState === "attack"){
        const phase = getAttackPhase() || "strike"
        const image = spriteImages.attackFrames[phase]
        const name = spriteNames.attackFrames[phase]
        const config =
            phase === "prep" ? spriteDrawConfig.attackPrep :
            phase === "recover" ? spriteDrawConfig.attackRecover :
            spriteDrawConfig.attackStrike
        if(isSpriteReady(image)){
            return {image, name, state:"attack", config}
        }
        if(isSpriteReady(spriteImages.attack)){
            return {image:spriteImages.attack, name:spriteNames.attack, state:"attack", config:spriteDrawConfig.attackStrike}
        }
    }
    if(isSpriteReady(spriteImages.idle)){
        return {image:spriteImages.idle, name:spriteNames.idle, state:"idle", config:spriteDrawConfig.idle}
    }
    return null
}

function updateSpriteMotion(spriteState){
    let targetX = 0
    let targetY = 0
    let targetRotation = 0
    let targetScaleX = 1
    let targetScaleY = 1
    let targetShadowScaleX = 1
    let targetShadowAlpha = 0.24
    const directionSign = frog.facingX !== 0 ? Math.sign(frog.facingX) : 1

    if(spriteState === "move"){
        const wave = Math.sin(frog.walkCycle * 2.1)
        targetY = wave * 1.8
        targetRotation = wave * 0.012 * directionSign
        targetScaleX = 1 + wave * 0.01 * frog.moveBlend
        targetScaleY = 1 - wave * 0.018 * frog.moveBlend
        targetShadowScaleX = 1 + Math.max(0, -wave) * 0.07
        targetShadowAlpha = 0.2 + Math.max(0, -wave) * 0.04
    }else if(spriteState === "attack"){
        const phase = getAttackPhase() || "strike"
        if(phase === "prep"){
            targetY = 5
            targetScaleY = 0.95
            targetScaleX = 1.03
        }else if(phase === "strike"){
            targetY = -6
            targetX = 6
            targetScaleX = 1.06
            targetScaleY = 1.02
            targetRotation = 0.024 * directionSign
        }else{
            targetY = -1
            targetX = 2
            targetScaleX = 1.02
            targetScaleY = 1.01
        }
        targetShadowScaleX = 1.06
        targetShadowAlpha = 0.2
    }else if(spriteState === "dash"){
        targetY = 2
        targetX = 10
        targetScaleX = 1.05
        targetScaleY = 0.97
        targetRotation = 0.03 * directionSign
        targetShadowScaleX = 1.08
        targetShadowAlpha = 0.18
    }else if(spriteState === "aoe"){
        const phase = getAoePhase() || "strike"
        if(phase === "prep"){
            targetY = 6
            targetScaleX = 1.02
            targetScaleY = 0.95
        }else if(phase === "strike"){
            targetY = -7
            targetScaleX = 1.07
            targetScaleY = 1.03
            targetRotation = 0.05 * directionSign
        }else{
            targetY = -2
            targetScaleX = 1.03
            targetScaleY = 1.01
            targetRotation = 0.015 * directionSign
        }
        targetShadowScaleX = 1.1
        targetShadowAlpha = 0.19
    }else{
        const breath = Math.sin(frog.idleCycle * 1.15)
        targetY = breath * 1.5
        targetScaleY = 1 + breath * 0.012
        targetScaleX = 1 - breath * 0.008
        targetShadowScaleX = 1 + Math.max(0, breath) * 0.04
        targetShadowAlpha = 0.22 + Math.max(0, breath) * 0.03
    }

    spriteMotion.offsetX = lerp(spriteMotion.offsetX, targetX, 0.24)
    spriteMotion.offsetY = lerp(spriteMotion.offsetY, targetY, 0.24)
    spriteMotion.rotation = lerp(spriteMotion.rotation, targetRotation, 0.24)
    spriteMotion.scaleX = lerp(spriteMotion.scaleX, targetScaleX, 0.24)
    spriteMotion.scaleY = lerp(spriteMotion.scaleY, targetScaleY, 0.24)
    spriteMotion.shadowScaleX = lerp(spriteMotion.shadowScaleX, targetShadowScaleX, 0.24)
    spriteMotion.shadowAlpha = lerp(spriteMotion.shadowAlpha, targetShadowAlpha, 0.24)
}

export function drawFrogPad(context, x, y, rx, ry, rotation, fill, outline, highlight){
    context.save()
    context.translate(x, y)
    context.rotate(rotation)

    context.fillStyle = outline
    context.beginPath()
    context.ellipse(0, 0, rx + 2, ry + 2, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = fill
    context.beginPath()
    context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = highlight
    context.beginPath()
    context.ellipse(-rx * 0.18, -ry * 0.22, rx * 0.34, ry * 0.24, -0.25, 0, Math.PI * 2)
    context.fill()

    context.restore()
}

export function drawFrogExtremity(context, x, y, rotation, config){
    context.save()
    context.translate(x, y)
    context.rotate(rotation)

    const spread = config.digitSpread
    const offsets = [-spread, 0, spread]

    for(const offset of offsets){
        const digitLength = config.digitLength * (offset === 0 ? 1.08 : 0.92)
        const digitBend = offset * 0.35 + config.splay
        const baseX = config.palmRx * 0.15
        const tipX = digitLength
        const tipY = offset + digitBend

        context.strokeStyle = config.outline
        context.lineCap = "round"
        context.lineWidth = config.digitWidth + 4
        context.beginPath()
        context.moveTo(baseX, offset * 0.55)
        context.quadraticCurveTo(baseX + digitLength * 0.45, offset * 0.35 + digitBend * 0.3, tipX, tipY)
        context.stroke()

        context.strokeStyle = config.fill
        context.lineWidth = config.digitWidth
        context.beginPath()
        context.moveTo(baseX, offset * 0.55)
        context.quadraticCurveTo(baseX + digitLength * 0.45, offset * 0.35 + digitBend * 0.3, tipX, tipY)
        context.stroke()

        context.fillStyle = config.outline
        context.beginPath()
        context.ellipse(tipX, tipY, config.tipRx + 1.6, config.tipRy + 1.6, 0, 0, Math.PI * 2)
        context.fill()

        context.fillStyle = config.fill
        context.beginPath()
        context.ellipse(tipX, tipY, config.tipRx, config.tipRy, 0, 0, Math.PI * 2)
        context.fill()
    }

    drawFrogPad(
        context,
        0,
        0,
        config.palmRx,
        config.palmRy,
        config.palmTilt,
        config.fill,
        config.outline,
        config.highlight
    )

    context.fillStyle = config.outline
    context.beginPath()
    context.arc(-config.palmRx * 0.28, 0, config.knuckleRadius + 1.6, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = config.fill
    context.beginPath()
    context.arc(-config.palmRx * 0.28, 0, config.knuckleRadius, 0, Math.PI * 2)
    context.fill()

    context.restore()
}

export function drawFrogLimb(context, start, joint, end, width, fill, outline, pad){
    context.save()
    context.lineCap = "round"
    context.lineJoin = "round"

    context.strokeStyle = outline
    context.lineWidth = width + 6
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(joint.x, joint.y)
    context.stroke()

    context.beginPath()
    context.moveTo(joint.x, joint.y)
    context.lineTo(end.x, end.y)
    context.stroke()

    context.strokeStyle = fill
    context.lineWidth = width * 1.04
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(joint.x, joint.y)
    context.stroke()

    context.strokeStyle = fill
    context.lineWidth = width * 0.88
    context.beginPath()
    context.moveTo(joint.x, joint.y)
    context.lineTo(joint.x, joint.y)
    context.lineTo(end.x, end.y)
    context.stroke()

    context.fillStyle = outline
    context.beginPath()
    context.arc(joint.x, joint.y, width * 0.38 + 2, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = fill
    context.beginPath()
    context.arc(joint.x, joint.y, width * 0.38, 0, Math.PI * 2)
    context.fill()

    const endAngle = Math.atan2(end.y - joint.y, end.x - joint.x)

    context.fillStyle = outline
    context.beginPath()
    context.arc(end.x, end.y, width * 0.28 + 1.2, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = fill
    context.beginPath()
    context.arc(end.x, end.y, width * 0.28, 0, Math.PI * 2)
    context.fill()

    drawFrogExtremity(context, end.x, end.y, endAngle + pad.rotation, {
        palmRx: pad.rx,
        palmRy: pad.ry,
        palmTilt: pad.palmTilt || 0,
        digitLength: pad.digitLength,
        digitSpread: pad.digitSpread,
        digitWidth: pad.digitWidth,
        tipRx: pad.tipRx,
        tipRy: pad.tipRy,
        splay: pad.splay || 0,
        knuckleRadius: pad.knuckleRadius || width * 0.22,
        fill: pad.fill,
        outline,
        highlight: pad.highlight
    })

    context.restore()
}

function drawProceduralFrog(){

    const x = frog.x - camera.x
    const y = frog.y - camera.y
    const s = frog.size
    const move = frog.moveBlend
    const step = frog.walkCycle
    const bob = frog.walkBob
    const facingAngle = Math.atan2(frog.facingY, frog.facingX) + Math.PI / 2
    const bodySway = Math.sin(step) * 0.08 * move + Math.sin(frog.idleCycle * 0.7) * 0.03 * (1 - move)

    const outline = "#163315"
    const bodyGreen = "#7ee236"
    const headGreen = "#90ef49"
    const limbGreen = "#6acb34"
    const belly = "#d8ff98"
    const bellyShade = "#b9e677"
    const shadowGreen = "#4ba729"
    const highlight = "#d9ff9a"
    const eyeWhite = "#f8fff2"
    const pupil = "#172013"

    const armSwingLeft = Math.sin(step + Math.PI) * move
    const armSwingRight = Math.sin(step) * move
    const legSwingLeft = Math.sin(step) * move
    const legSwingRight = Math.sin(step + Math.PI) * move
    const handSplay = 5.2 + move * 2.2
    const toeSplay = 4.8 + move * 1.8

    const leftArm = {
        shoulder:{x:-s * 0.50, y:-s * 0.04},
        elbow:{x:-s * (0.83 + armSwingLeft * 0.08), y:s * (0.04 + Math.abs(armSwingLeft) * 0.06)},
        hand:{x:-s * (0.96 + armSwingLeft * 0.14), y:s * (-0.06 - armSwingLeft * 0.24)}
    }

    const rightArm = {
        shoulder:{x:s * 0.50, y:-s * 0.04},
        elbow:{x:s * (0.83 + armSwingRight * 0.08), y:s * (0.04 + Math.abs(armSwingRight) * 0.06)},
        hand:{x:s * (0.96 + armSwingRight * 0.14), y:s * (-0.06 - armSwingRight * 0.24)}
    }

    const leftLeg = {
        hip:{x:-s * 0.30, y:s * 0.26},
        knee:{x:-s * (0.42 - legSwingLeft * 0.06), y:s * (0.52 - legSwingLeft * 0.08)},
        foot:{x:-s * (0.56 - legSwingLeft * 0.12), y:s * (0.80 - legSwingLeft * 0.16)}
    }

    const rightLeg = {
        hip:{x:s * 0.30, y:s * 0.26},
        knee:{x:s * (0.42 - legSwingRight * 0.06), y:s * (0.52 - legSwingRight * 0.08)},
        foot:{x:s * (0.56 - legSwingRight * 0.12), y:s * (0.80 - legSwingRight * 0.16)}
    }

    ctx.fillStyle = "rgba(0,0,0,0.32)"
    ctx.beginPath()
    ctx.ellipse(x, y + s * 0.96, s * (0.74 - move * 0.04), s * 0.34, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    if(frog.invuln > 0 && Math.floor(frog.invuln / 4) % 2 === 0){
        ctx.globalAlpha = 0.65
    }
    ctx.translate(x, y + bob)
    ctx.rotate(facingAngle + bodySway)

    drawFrogLimb(ctx, leftLeg.hip, leftLeg.knee, leftLeg.foot, s * 0.18, limbGreen, outline, {
        rx:s * 0.20,
        ry:s * 0.13,
        rotation:0.18 + legSwingLeft * 0.24,
        palmTilt:0.24,
        fill:"#72d93b",
        highlight:highlight,
        digitLength:s * 0.18,
        digitSpread:toeSplay,
        digitWidth:s * 0.08,
        tipRx:s * 0.072,
        tipRy:s * 0.056,
        splay:legSwingLeft * 2.8,
        knuckleRadius:s * 0.05
    })

    drawFrogLimb(ctx, rightLeg.hip, rightLeg.knee, rightLeg.foot, s * 0.18, limbGreen, outline, {
        rx:s * 0.20,
        ry:s * 0.13,
        rotation:-0.18 + legSwingRight * 0.24,
        palmTilt:-0.24,
        fill:"#72d93b",
        highlight:highlight,
        digitLength:s * 0.18,
        digitSpread:toeSplay,
        digitWidth:s * 0.08,
        tipRx:s * 0.072,
        tipRy:s * 0.056,
        splay:legSwingRight * 2.8,
        knuckleRadius:s * 0.05
    })

    ctx.fillStyle = outline
    ctx.beginPath()
    ctx.ellipse(0, s * 0.14, s * 0.80, s * 0.66, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = bodyGreen
    ctx.beginPath()
    ctx.ellipse(0, s * 0.12, s * 0.72, s * 0.58, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = shadowGreen
    ctx.beginPath()
    ctx.ellipse(0, s * 0.28, s * 0.58, s * 0.30, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = belly
    ctx.beginPath()
    ctx.ellipse(0, s * 0.20, s * 0.37, s * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = bellyShade
    ctx.beginPath()
    ctx.ellipse(0, s * 0.30, s * 0.23, s * 0.13, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "rgba(255,255,255,0.14)"
    ctx.beginPath()
    ctx.ellipse(-s * 0.14, -s * 0.04, s * 0.16, s * 0.09, -0.4, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "rgba(23,61,19,0.35)"
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.02, s * 0.26, s * 0.09, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = outline
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.30, s * 0.60, s * 0.50, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = headGreen
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.30, s * 0.54, s * 0.44, 0, 0, Math.PI * 2)
    ctx.fill()

    drawFrogLimb(ctx, leftArm.shoulder, leftArm.elbow, leftArm.hand, s * 0.145, limbGreen, outline, {
        rx:s * 0.19,
        ry:s * 0.155,
        rotation:-0.18 + armSwingLeft * 0.36,
        palmTilt:0.16,
        fill:"#8ef04b",
        highlight:"#ecffb7",
        digitLength:s * 0.19,
        digitSpread:handSplay,
        digitWidth:s * 0.082,
        tipRx:s * 0.072,
        tipRy:s * 0.06,
        splay:armSwingLeft * 2.8,
        knuckleRadius:s * 0.05
    })

    drawFrogLimb(ctx, rightArm.shoulder, rightArm.elbow, rightArm.hand, s * 0.145, limbGreen, outline, {
        rx:s * 0.19,
        ry:s * 0.155,
        rotation:0.18 + armSwingRight * 0.36,
        palmTilt:-0.16,
        fill:"#8ef04b",
        highlight:"#ecffb7",
        digitLength:s * 0.19,
        digitSpread:handSplay,
        digitWidth:s * 0.082,
        tipRx:s * 0.072,
        tipRy:s * 0.06,
        splay:armSwingRight * 2.8,
        knuckleRadius:s * 0.05
    })

    ctx.fillStyle = "rgba(255,255,255,0.16)"
    ctx.beginPath()
    ctx.ellipse(-s * 0.14, -s * 0.42, s * 0.14, s * 0.08, -0.25, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "rgba(53,111,30,0.62)"
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.18, s * 0.24, s * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()

    const eyeY = -s * 0.45
    const eyeSpread = s * 0.23
    const pupilLookX = Math.sin(step) * move * 0.4

    for(const side of [-1, 1]){
        ctx.fillStyle = outline
        ctx.beginPath()
        ctx.ellipse(side * eyeSpread, eyeY, s * 0.18, s * 0.16, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = eyeWhite
        ctx.beginPath()
        ctx.ellipse(side * eyeSpread, eyeY, s * 0.15, s * 0.13, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = pupil
        ctx.beginPath()
        ctx.arc(side * (eyeSpread + pupilLookX), eyeY - s * 0.01, s * 0.055, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "rgba(255,255,255,0.9)"
        ctx.beginPath()
        ctx.arc(side * (eyeSpread - s * 0.03), eyeY - s * 0.04, s * 0.022, 0, Math.PI * 2)
        ctx.fill()
    }

    ctx.strokeStyle = outline
    ctx.lineWidth = 3
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(-s * 0.26, -s * 0.55)
    ctx.quadraticCurveTo(-s * 0.18, -s * 0.61, -s * 0.07, -s * 0.57)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(s * 0.26, -s * 0.55)
    ctx.quadraticCurveTo(s * 0.18, -s * 0.61, s * 0.07, -s * 0.57)
    ctx.stroke()

    ctx.strokeStyle = "rgba(19,45,18,0.55)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, s * 0.12, s * 0.72, s * 0.58, 0, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.ellipse(0, -s * 0.30, s * 0.54, s * 0.44, 0, 0, Math.PI * 2)
    ctx.stroke()

    ctx.restore()
}

export function drawFrog(){
    const selection = getSpriteVisualSelection()
    if(!selection){
        frog.renderState = "sprite_loading"
        frog.currentSprite = spriteNames.idle
        return
    }

    updateSpriteMotion(selection.state)

    const x = frog.x - camera.x
    const y = frog.y - camera.y
    const image = selection.image
    const config = selection.config
    const drawHeight = config.height
    const drawWidth = drawHeight * (image.naturalWidth / image.naturalHeight)
    const useFacingFlip = selection.state !== "move"
    const facingSign = useFacingFlip && frog.facingX < -0.18 ? -1 : 1
    const baseX = x + config.xOffset * facingSign
    const baseY = y + config.yOffset + frog.walkBob * 0.2

    frog.renderState = selection.state
    frog.currentSprite = selection.name

    ctx.save()
    ctx.translate(baseX + spriteMotion.offsetX * facingSign, baseY + spriteMotion.offsetY)
    ctx.rotate(spriteMotion.rotation)
    ctx.scale(facingSign * spriteMotion.scaleX, spriteMotion.scaleY)

    ctx.fillStyle = `rgba(11,18,10,${spriteMotion.shadowAlpha})`
    ctx.beginPath()
    ctx.ellipse(0, 21, 34 * spriteMotion.shadowScaleX, 10.5, 0, 0, Math.PI * 2)
    ctx.fill()

    const drawX = -drawWidth * config.anchorX
    const drawY = -drawHeight * config.anchorY
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
    ctx.restore()
}
