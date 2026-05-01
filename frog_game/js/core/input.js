/**
 * This module translates keyboard and touch input into shared input state and action callbacks.
 * It is responsible for interpreting input, and it does not implement gameplay rules itself.
 */


import { canvas, keys, mobile, upgradeState, gameState, abilities } from "./state.js"
import { clamp, isInsideCircle } from "./utils.js"

const noop = () => {}
let inputRegistered = false
let inputCallbacks = {
    chooseUpgrade: noop,
    getUpgradeCardIndexAtPoint: () => -1,
    resetRound: noop,
    triggerAttack: noop,
    triggerJump: noop,
    triggerDash: noop,
    triggerAoe: noop,
    triggerSlam: noop,
}

export function registerInputHandlers(callbacks = {}){
    inputCallbacks = {
        ...inputCallbacks,
        ...callbacks,
    }

    if(inputRegistered){
        return
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    canvas.addEventListener("touchstart", handleTouchStart, {passive:false})
    canvas.addEventListener("touchmove", handleTouchMove, {passive:false})
    canvas.addEventListener("touchend", handleTouchEnd, {passive:false})
    canvas.addEventListener("touchcancel", handleTouchEnd, {passive:false})
    inputRegistered = true
}

function handleKeyDown(e){
    if(upgradeState.active){
        if(e.key === "1" || e.key === "2" || e.key === "3"){
            e.preventDefault()
            inputCallbacks.chooseUpgrade(Number(e.key) - 1)
        }
        return
    }

    if((e.key === "r" || e.key === "R" || e.key === "Enter") && gameState !== "playing"){
        e.preventDefault()
        inputCallbacks.resetRound()
        return
    }

    keys[e.key] = true

    if(e.key === " "){
        e.preventDefault()
        inputCallbacks.triggerAttack()
    }

    if(e.key === "Shift"){
        e.preventDefault()
        inputCallbacks.triggerJump()
    }

    if(e.key === "e" || e.key === "E"){
        e.preventDefault()
        inputCallbacks.triggerDash()
    }

    if(e.key === "f" || e.key === "F"){
        e.preventDefault()
        inputCallbacks.triggerAoe()
    }

    if(e.key === "q" || e.key === "Q"){
        e.preventDefault()
        inputCallbacks.triggerSlam()
    }
}

function handleKeyUp(e){
    keys[e.key] = false
}

export function getMoveInput(){
    let moveX = 0
    let moveY = 0

    if(keys["ArrowUp"] || keys["w"] || keys["W"]) moveY -= 1
    if(keys["ArrowDown"] || keys["s"] || keys["S"]) moveY += 1
    if(keys["ArrowLeft"] || keys["a"] || keys["A"]) moveX -= 1
    if(keys["ArrowRight"] || keys["d"] || keys["D"]) moveX += 1

    if(mobile.active){
        moveX += mobile.moveX
        moveY += mobile.moveY
    }

    const length = Math.hypot(moveX, moveY)
    if(length > 1){
        moveX /= length
        moveY /= length
    }

    return {moveX, moveY}
}

export function getCanvasPoint(event){
    const rect = canvas.getBoundingClientRect()
    return {
        x:event.clientX - rect.left,
        y:event.clientY - rect.top
    }
}

export function getTouchCanvasPoint(touch){
    const rect = canvas.getBoundingClientRect()
    return {
        x:touch.clientX - rect.left,
        y:touch.clientY - rect.top
    }
}

export function updateJoystick(x, y){
    const dx = x - mobile.joystickBaseX
    const dy = y - mobile.joystickBaseY
    const dist = Math.hypot(dx, dy)
    const maxDist = mobile.maxStickDistance
    const scale = dist > maxDist ? maxDist / dist : 1

    mobile.stickX = dx * scale
    mobile.stickY = dy * scale
    mobile.moveX = clamp(mobile.stickX / maxDist, -1, 1)
    mobile.moveY = clamp(mobile.stickY / maxDist, -1, 1)
}

export function resetJoystick(){
    mobile.joystickPointerId = null
    mobile.moveX = 0
    mobile.moveY = 0
    mobile.stickX = 0
    mobile.stickY = 0
}

export function releaseAttackButton(){
    mobile.attackPointerId = null
    mobile.attackPressed = false
}

export function releaseAoeButton(){
    mobile.aoePointerId = null
    mobile.aoePressed = false
}

export function releaseDashButton(){
    mobile.dashPointerId = null
    mobile.dashPressed = false
}

export function releaseSkillButton(){
    mobile.skillPointerId = null
    mobile.skillPressed = false
}

export function releaseSlamButton(){
    mobile.slamPointerId = null
    mobile.slamPressed = false
}

export function handleTouchStart(event){
    if(!mobile.active) return

    if(upgradeState.active){
        let consumed = false
        for(const touch of event.changedTouches){
            const point = getTouchCanvasPoint(touch)
            const index = inputCallbacks.getUpgradeCardIndexAtPoint(point.x, point.y)
            if(index >= 0){
                inputCallbacks.chooseUpgrade(index)
                consumed = true
            }
        }

        if(consumed){
            event.preventDefault()
        }
        return
    }

    if(gameState !== "playing"){
        event.preventDefault()
        inputCallbacks.resetRound()
        return
    }

    for(const touch of event.changedTouches){
        const point = getTouchCanvasPoint(touch)

        if(
            mobile.joystickPointerId === null &&
            point.x <= canvas.width * 0.5 &&
            point.y >= canvas.height * 0.45 &&
            isInsideCircle(point.x, point.y, mobile.joystickBaseX, mobile.joystickBaseY, mobile.joystickRadius * 1.9)
        ){
            mobile.joystickPointerId = touch.identifier
            updateJoystick(point.x, point.y)
            continue
        }

        if(
            mobile.aoePointerId === null &&
            isInsideCircle(point.x, point.y, mobile.aoeX, mobile.aoeY, mobile.aoeRadius * 1.9)
        ){
            mobile.aoePointerId = touch.identifier
            mobile.aoePressed = true
            inputCallbacks.triggerAoe()
            continue
        }

        if(
            mobile.dashPointerId === null &&
            isInsideCircle(point.x, point.y, mobile.dashX, mobile.dashY, mobile.dashRadius * 1.9)
        ){
            mobile.dashPointerId = touch.identifier
            mobile.dashPressed = true
            inputCallbacks.triggerJump()
            continue
        }

        if(
            abilities.dash &&
            mobile.skillPointerId === null &&
            isInsideCircle(point.x, point.y, mobile.skillX, mobile.skillY, mobile.skillRadius * 1.9)
        ){
            mobile.skillPointerId = touch.identifier
            mobile.skillPressed = true
            inputCallbacks.triggerDash()
            continue
        }

        if(
            abilities.slam &&
            mobile.slamPointerId === null &&
            isInsideCircle(point.x, point.y, mobile.stompX, mobile.stompY, mobile.stompRadius * 1.9)
        ){
            mobile.slamPointerId = touch.identifier
            mobile.slamPressed = true
            inputCallbacks.triggerSlam()
            continue
        }

        if(
            mobile.attackPointerId === null &&
            point.x >= canvas.width * 0.5 &&
            point.y >= canvas.height * 0.38 &&
            isInsideCircle(point.x, point.y, mobile.attackX, mobile.attackY, mobile.attackRadius * 1.9)
        ){
            mobile.attackPointerId = touch.identifier
            mobile.attackPressed = true
            inputCallbacks.triggerAttack()
        }
    }

    if(event.changedTouches.length){
        event.preventDefault()
    }
}

export function handleTouchMove(event){
    if(!mobile.active) return

    let consumed = false
    for(const touch of event.changedTouches){
        if(touch.identifier === mobile.joystickPointerId){
            const point = getTouchCanvasPoint(touch)
            updateJoystick(point.x, point.y)
            consumed = true
        }
    }

    if(consumed){
        event.preventDefault()
    }
}

export function handleTouchEnd(event){
    if(!mobile.active) return

    let consumed = false
    for(const touch of event.changedTouches){
        if(touch.identifier === mobile.joystickPointerId){
            resetJoystick()
            consumed = true
        }

        if(touch.identifier === mobile.attackPointerId){
            releaseAttackButton()
            consumed = true
        }

        if(touch.identifier === mobile.aoePointerId){
            releaseAoeButton()
            consumed = true
        }

        if(touch.identifier === mobile.dashPointerId){
            releaseDashButton()
            consumed = true
        }

        if(touch.identifier === mobile.skillPointerId){
            releaseSkillButton()
            consumed = true
        }

        if(touch.identifier === mobile.slamPointerId){
            releaseSlamButton()
            consumed = true
        }
    }

    if(consumed){
        event.preventDefault()
    }
}
