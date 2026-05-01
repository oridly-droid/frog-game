/**
 * This module draws mobile controls and animates their visual state.
 * It is responsible for touch UI presentation and does not own touch event interpretation.
 */

import { MOBILE_CONTROL_SCALE } from "../config/mobile_config.js"
import { ctx, canvas, mobile, mobileCalibration, frogAbilities, abilities } from "../core/state.js"
import { clamp, lerp } from "../core/utils.js"

export function updateControlLayout(){
    const calibration = mobileCalibration
    const shortEdge = Math.min(canvas.width, canvas.height)
    const edgePadding = Math.max(calibration.safeInset, Math.round(shortEdge * 0.03))
    const buttonGap = Math.max(8, Math.min(16, shortEdge * 0.04)) * calibration.buttonClusterScale
    const overlapGap = buttonGap * 0.65
    const bottomPadding = edgePadding

    const overlaps = (x1, y1, r1, x2, y2, r2, extra = 0) => {
        return Math.hypot(x1 - x2, y1 - y2) < r1 + r2 + extra
    }

    const isOffscreen = (x, y, r) => {
        return (
            x - r < edgePadding ||
            x + r > canvas.width - edgePadding ||
            y - r < edgePadding ||
            y + r > canvas.height - edgePadding
        )
    }

    const raiseAttackAboveJoystick = () => {
        const minSeparation = mobile.joystickRadius + mobile.attackRadius + overlapGap
        const dx = Math.abs(mobile.attackX - mobile.joystickBaseX)
        if(dx < minSeparation){
            const requiredDy = Math.sqrt(Math.max(0, minSeparation * minSeparation - dx * dx))
            mobile.attackY = Math.min(mobile.attackY, mobile.joystickBaseY - requiredDy)
        }
    }

    const applyCompactLayout = () => {
        mobile.attackX = canvas.width - edgePadding - mobile.attackRadius
        mobile.attackY = canvas.height - bottomPadding - mobile.attackRadius
        mobile.aoeX = mobile.attackX - mobile.attackRadius - mobile.aoeRadius - buttonGap
        mobile.aoeY = mobile.attackY + mobile.attackRadius - mobile.aoeRadius - 4
        mobile.skillX = mobile.attackX
        mobile.skillY = mobile.attackY - mobile.attackRadius - mobile.skillRadius - buttonGap
        mobile.dashX = mobile.aoeX
        mobile.dashY = mobile.aoeY - mobile.aoeRadius - mobile.dashRadius - buttonGap
        mobile.stompX = mobile.dashX - mobile.dashRadius - mobile.stompRadius - buttonGap
        mobile.stompY = mobile.dashY - mobile.dashRadius - mobile.stompRadius - buttonGap
    }

    const applyTallLayout = () => {
        mobile.attackX = canvas.width - edgePadding - mobile.attackRadius
        mobile.attackY = canvas.height - bottomPadding - mobile.attackRadius
        raiseAttackAboveJoystick()
        mobile.dashX = mobile.attackX
        mobile.dashY = mobile.attackY - mobile.attackRadius - mobile.dashRadius - buttonGap
        mobile.aoeX = mobile.attackX - mobile.attackRadius - mobile.aoeRadius - buttonGap
        mobile.aoeY = mobile.attackY + mobile.attackRadius - mobile.aoeRadius - 6
        mobile.skillX = mobile.aoeX
        mobile.skillY = mobile.aoeY - mobile.aoeRadius - mobile.skillRadius - buttonGap
        mobile.stompX = mobile.skillX
        mobile.stompY = mobile.skillY - mobile.skillRadius - mobile.stompRadius - buttonGap

        const topMost = Math.min(
            mobile.dashY - mobile.dashRadius,
            mobile.aoeY - mobile.aoeRadius,
            mobile.skillY - mobile.skillRadius,
            mobile.stompY - mobile.stompRadius
        )
        if(topMost < edgePadding){
            const shiftDown = edgePadding - topMost
            mobile.attackY += shiftDown
            mobile.dashY += shiftDown
            mobile.aoeY += shiftDown
            mobile.skillY += shiftDown
            mobile.stompY += shiftDown
        }
    }

    mobile.joystickRadius = clamp(shortEdge * 0.14, 54, 72) * MOBILE_CONTROL_SCALE * calibration.controlScale
    mobile.knobRadius = mobile.joystickRadius * 0.44
    mobile.maxStickDistance = mobile.joystickRadius * 0.92
    mobile.attackRadius = clamp(shortEdge * 0.112, 42, 48) * MOBILE_CONTROL_SCALE * calibration.buttonClusterScale
    mobile.aoeRadius = clamp(shortEdge * 0.082, 32, 38) * MOBILE_CONTROL_SCALE * calibration.buttonClusterScale
    mobile.dashRadius = clamp(shortEdge * 0.082, 32, 38) * MOBILE_CONTROL_SCALE * calibration.buttonClusterScale
    mobile.skillRadius = clamp(shortEdge * 0.082, 32, 38) * MOBILE_CONTROL_SCALE * calibration.buttonClusterScale
    mobile.stompRadius = clamp(shortEdge * 0.082, 32, 38) * MOBILE_CONTROL_SCALE * calibration.buttonClusterScale
    mobile.joystickBaseX = edgePadding + mobile.joystickRadius
    mobile.joystickBaseY = canvas.height - bottomPadding - mobile.joystickRadius

    applyCompactLayout()

    if(
        isOffscreen(mobile.dashX, mobile.dashY, mobile.dashRadius) ||
        isOffscreen(mobile.aoeX, mobile.aoeY, mobile.aoeRadius) ||
        isOffscreen(mobile.skillX, mobile.skillY, mobile.skillRadius) ||
        isOffscreen(mobile.stompX, mobile.stompY, mobile.stompRadius) ||
        overlaps(mobile.attackX, mobile.attackY, mobile.attackRadius, mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius, overlapGap) ||
        overlaps(mobile.aoeX, mobile.aoeY, mobile.aoeRadius, mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius, overlapGap) ||
        overlaps(mobile.dashX, mobile.dashY, mobile.dashRadius, mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius, overlapGap) ||
        overlaps(mobile.stompX, mobile.stompY, mobile.stompRadius, mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius, overlapGap)
    ){
        applyTallLayout()
    }
}

export function getAbilityCooldownRatio(key){
    if(key === "tongue"){
        return clamp(frogAbilities.tongue.timer / Math.max(1, frogAbilities.tongue.cooldown), 0, 1)
    }

    if(!frogAbilities[key]){
        return 0
    }

    return clamp(frogAbilities[key].timer / Math.max(1, frogAbilities[key].cooldown), 0, 1)
}

export function drawTouchButton(x, y, radius, scale, label, colors, pressed, cooldownRatio = 0, cooldownFrames = 0){
    const outerRadius = radius + 12
    const ready = cooldownRatio <= 0.001
    ctx.fillStyle = `rgba(17,39,21,${pressed ? 0.32 : 0.24})`
    ctx.beginPath()
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2)
    ctx.fill()

    if(ready){
        const glow = ctx.createRadialGradient(x, y, radius * 0.35, x, y, outerRadius + 10)
        glow.addColorStop(0, "rgba(255,255,255,0.14)")
        glow.addColorStop(0.6, "rgba(214,255,184,0.12)")
        glow.addColorStop(1, "rgba(214,255,184,0)")
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, outerRadius + 10, 0, Math.PI * 2)
        ctx.fill()
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)

    const gradient = ctx.createRadialGradient(
        -radius * 0.22,
        -radius * 0.32,
        radius * 0.1,
        0,
        0,
        radius
    )
    gradient.addColorStop(0, colors[0])
    gradient.addColorStop(1, colors[1])
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = pressed ? "rgba(255,245,236,0.48)" : "rgba(255,235,222,0.24)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()

    if(cooldownRatio > 0.001){
        ctx.fillStyle = "rgba(5,10,7,0.52)"
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, radius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * cooldownRatio, false)
        ctx.closePath()
        ctx.fill()
    }

    ctx.fillStyle = "#fff6ee"
    ctx.font = `700 ${Math.max(13, radius * 0.34)}px sans-serif`
    ctx.textAlign = "center"
    ctx.fillText(label, 0, 4)
    if(cooldownRatio > 0.001){
        ctx.font = `700 ${Math.max(10, radius * 0.24)}px sans-serif`
        ctx.fillText(`${(cooldownFrames / 60).toFixed(1)}秒`, 0, radius * 0.46)
    }
    ctx.restore()
}

export function drawMobileControls(){
    if(!mobile.active) return

    ctx.save()
    const alpha = 0.74
    const baseRadius = mobile.joystickRadius + 14

    const baseGlow = ctx.createRadialGradient(
        mobile.joystickBaseX,
        mobile.joystickBaseY,
        mobile.joystickRadius * 0.25,
        mobile.joystickBaseX,
        mobile.joystickBaseY,
        baseRadius
    )
    baseGlow.addColorStop(0, `rgba(170,230,150,${0.12 * alpha})`)
    baseGlow.addColorStop(1, `rgba(15,31,18,${0.06 * alpha})`)
    ctx.fillStyle = baseGlow
    ctx.beginPath()
    ctx.arc(mobile.joystickBaseX, mobile.joystickBaseY, baseRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = `rgba(16,36,20,${0.28 * alpha})`
    ctx.beginPath()
    ctx.arc(mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(221,245,190,${0.4 * alpha})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = `rgba(221,245,190,${0.12 * alpha})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius * 0.54, 0, Math.PI * 2)
    ctx.stroke()

    const knobGradient = ctx.createRadialGradient(
        mobile.joystickBaseX + mobile.stickX - mobile.knobRadius * 0.2,
        mobile.joystickBaseY + mobile.stickY - mobile.knobRadius * 0.35,
        mobile.knobRadius * 0.2,
        mobile.joystickBaseX + mobile.stickX,
        mobile.joystickBaseY + mobile.stickY,
        mobile.knobRadius
    )
    knobGradient.addColorStop(0, `rgba(188,255,166,${0.72 * alpha})`)
    knobGradient.addColorStop(1, `rgba(104,182,82,${0.62 * alpha})`)
    ctx.fillStyle = knobGradient
    ctx.beginPath()
    ctx.arc(mobile.joystickBaseX + mobile.stickX, mobile.joystickBaseY + mobile.stickY, mobile.knobRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(234,255,224,${0.22 * alpha})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(mobile.joystickBaseX + mobile.stickX, mobile.joystickBaseY + mobile.stickY, mobile.knobRadius, 0, Math.PI * 2)
    ctx.stroke()

    const tongueCooldownRatio = getAbilityCooldownRatio("tongue")
    const aoeCooldownRatio = getAbilityCooldownRatio("aoe")
    const jumpCooldownRatio = getAbilityCooldownRatio("jump")
    const dashCooldownRatio = getAbilityCooldownRatio("dash")
    const slamCooldownRatio = getAbilityCooldownRatio("slam")

    if(abilities.aoe){
        drawTouchButton(
            mobile.aoeX,
            mobile.aoeY,
            mobile.aoeRadius,
            mobile.aoeScale,
            "群攻",
            [
                mobile.aoePressed ? "rgba(245,236,190,0.92)" : "rgba(239,229,172,0.82)",
                mobile.aoePressed ? "rgba(205,169,92,0.92)" : "rgba(168,128,63,0.74)"
            ],
            mobile.aoePressed,
            aoeCooldownRatio,
            frogAbilities.aoe.timer
        )
    }

    drawTouchButton(
        mobile.dashX,
        mobile.dashY,
        mobile.dashRadius,
        mobile.dashScale,
        "跳跃",
        [
            mobile.dashPressed ? "rgba(226,255,204,0.92)" : "rgba(210,255,194,0.82)",
            mobile.dashPressed ? "rgba(136,212,95,0.92)" : "rgba(93,173,70,0.74)"
        ],
        mobile.dashPressed,
        jumpCooldownRatio,
        frogAbilities.jump.timer
    )

    if(abilities.dash){
        drawTouchButton(
            mobile.skillX,
            mobile.skillY,
            mobile.skillRadius,
            mobile.skillScale,
            "冲刺",
            [
                mobile.skillPressed ? "rgba(201,234,255,0.92)" : "rgba(190,225,255,0.82)",
                mobile.skillPressed ? "rgba(92,158,224,0.92)" : "rgba(66,126,201,0.74)"
            ],
            mobile.skillPressed,
            dashCooldownRatio,
            frogAbilities.dash.timer
        )
    }

    if(abilities.slam){
        drawTouchButton(
            mobile.stompX,
            mobile.stompY,
            mobile.stompRadius,
            mobile.slamScale,
            "震地",
            [
                mobile.slamPressed ? "rgba(255,230,188,0.92)" : "rgba(255,221,170,0.82)",
                mobile.slamPressed ? "rgba(224,159,76,0.92)" : "rgba(201,129,48,0.74)"
            ],
            mobile.slamPressed,
            slamCooldownRatio,
            frogAbilities.slam.timer
        )
    }

    drawTouchButton(
        mobile.attackX,
        mobile.attackY,
        mobile.attackRadius,
        mobile.attackScale,
        "普攻",
        [
            mobile.attackPressed ? "rgba(255,214,188,0.92)" : "rgba(255,200,180,0.82)",
            mobile.attackPressed ? "rgba(255,122,99,0.92)" : "rgba(240,103,92,0.74)"
        ],
        mobile.attackPressed,
        tongueCooldownRatio,
        frogAbilities.tongue.timer
    )

    ctx.textAlign = "left"
    ctx.restore()
}

export function updateMobileControls(){
    const targetScale = mobile.attackPressed ? 0.92 : 1
    mobile.attackTargetScale = targetScale
    mobile.attackScale = lerp(mobile.attackScale, mobile.attackTargetScale, 0.22)
    mobile.aoeScale = lerp(mobile.aoeScale, mobile.aoePressed ? 0.92 : 1, 0.22)
    mobile.dashScale = lerp(mobile.dashScale, mobile.dashPressed ? 0.92 : 1, 0.22)
    mobile.skillScale = lerp(mobile.skillScale, mobile.skillPressed ? 0.92 : 1, 0.22)
    mobile.slamScale = lerp(mobile.slamScale, mobile.slamPressed ? 0.92 : 1, 0.22)
}
