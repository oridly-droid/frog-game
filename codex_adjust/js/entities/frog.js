/**
 * This module owns frog progression and movement state updates.
 * It is responsible for frog-centric gameplay state and does not draw the frog sprite.
 */


import { playerConfig } from "../config/player_config.js"
import {
    frog,
    abilities,
    frogAbilities,
    progression,
    upgradeState,
    world,
    combatStats,
    skillTree,
    tongue,
    mobile,
    camera,
    canvas,
    gameState,
} from "../core/state.js"
import { clamp, lerp } from "../core/utils.js"
import { getMoveInput } from "../core/input.js"
import { resolveRockCollisions } from "../world/collisions.js"
import { getTerrainSpeedMultiplier } from "../world/terrain.js"
import { queueLevelUpUpgrade } from "../systems/progression.js"
import { setBanner } from "../ui/banners.js"
import { updateMobileControls } from "../ui/mobile_ui.js"
import { spawnHitParticles } from "./particles.js"

export function getXpRequirement(level){
    if(level <= 1){
        return 10
    }
    return Math.floor(getXpRequirement(level - 1) * 1.4)
}

export function resetProgression(){
    frog.xp = 0
    frog.level = 1
    frog.xpToNext = 10
    frog.score = 0
    frog.tongueRange = playerConfig.tongueRange
    frog.speed = playerConfig.moveSpeed
    progression.tongueRangeBonus = 0
    progression.tongueCooldownBonus = 0
    progression.jumpCooldownBonus = 0
    progression.tonguePower = 0
    progression.aoeRangeBonus = 0
    progression.aoeDamageBonus = 0
    progression.dashMomentumTimer = 0
    progression.dashMomentumBonus = 0
    progression.tongueCritBonus = 0
    progression.poisonCloudBonus = 0
    progression.upgrades = []
    frog.maxHp = playerConfig.maxHp
    frog.defense = playerConfig.defense
    frog.hp = Math.min(frog.hp, frog.maxHp)
    frog.motionMode = ""
    frog.attackStep = 0
    frog.attackTimer = 0
    frog.attackQueued = false
    frog.comboWindow = 0
    frog.attackHit = false
    frog.attackWaveEmitted = false
    frog.aoeTimer = 0
    frog.aoeHit = false
    frog.renderState = "idle"
    frog.currentSprite = ""
    syncAbilityUnlocks()
}

export function grantXP(amount){
    if(!Number.isFinite(amount) || amount <= 0){
        return
    }

    const scaled = amount * playerConfig.xpGainScale
    if(!Number.isFinite(scaled) || scaled <= 0){
        return
    }

    frog.xp += scaled
    if(!Number.isFinite(frog.xp) || frog.xp < 0){
        frog.xp = 0
    }
    checkLevelUp()
}

export function checkLevelUp(){
    if(!Number.isFinite(frog.xpToNext) || frog.xpToNext <= 0){
        frog.xpToNext = 10
    }

    let safety = 0
    while(frog.xp >= frog.xpToNext && safety < 96){
        frog.xp -= frog.xpToNext
        frog.level += 1
        const nextRequirement = Math.floor(frog.xpToNext * 1.4)
        frog.xpToNext = Number.isFinite(nextRequirement) && nextRequirement > frog.xpToNext
            ? nextRequirement
            : frog.xpToNext + 1
        syncAbilityUnlocks()
        spawnHitParticles(frog.x, frog.y - 10, "#d8ff98", 18)
        spawnHitParticles(frog.x, frog.y - 14, "#ffe88b", 10)
        queueLevelUpUpgrade()
        setBanner(`等级 ${frog.level}`, 150)
        safety += 1
    }

    if(safety >= 96){
        frog.xp = Math.min(frog.xp, frog.xpToNext - 1)
    }
}

export function syncAbilityUnlocks(){
    abilities.tongue = frog.level >= frogAbilities.tongue.unlockLevel
    abilities.jump = frog.level >= frogAbilities.jump.unlockLevel
    abilities.dash = frog.level >= frogAbilities.dash.unlockLevel
    abilities.aoe = frog.level >= frogAbilities.aoe.unlockLevel
    abilities.slam = frog.level >= frogAbilities.slam.unlockLevel
    abilities.poison = frog.level >= frogAbilities.poison.unlockLevel
}

export function isAbilityUnlocked(name){
    syncAbilityUnlocks()
    return !!abilities[name]
}

export function updateAbilityTimers(){
    for(const ability of Object.values(frogAbilities)){
        ability.timer = Math.max(0, ability.timer - 1)
    }
}

export function getFacingMoveDirection(){
    let dirX = frog.lastMoveX || frog.facingX || 0
    let dirY = frog.lastMoveY || frog.facingY || -1
    const length = Math.hypot(dirX, dirY) || 1
    return {
        x:dirX / length,
        y:dirY / length
    }
}

export function getFrogPickupSensor(){
    const pickupX = frog.x
    const pickupY = frog.y + frog.radius * 0.42
    const pickupRadius = frog.radius * 0.92 + playerConfig.pickupRadius + 4

    frog.pickupX = pickupX
    frog.pickupY = pickupY
    frog.pickupRadius = pickupRadius

    return {
        x: pickupX,
        y: pickupY,
        radius: pickupRadius
    }
}

export function updateFrog(){
    if(!upgradeState.active){
        frog.attackCooldown = Math.max(0, frog.attackCooldown - 1)
        frog.jumpCooldown = Math.max(0, frog.jumpCooldown - 1)
        frog.dashCooldown = frog.jumpCooldown
        frog.dashTimer = frog.jumpTimer
        frog.invuln = Math.max(0, frog.invuln - 1)
        updateAbilityTimers()
    }
    frog.pickupContactTimer = Math.max(0, frog.pickupContactTimer - 1)
    if(frog.pickupContactTimer <= 0){
        frog.pickupContactType = ""
        frog.pickupContactId = ""
    }
    upgradeState.glowTimer = Math.max(0, upgradeState.glowTimer - 1)
    updateMobileControls()

    const {moveX, moveY} = getMoveInput()
    const jumping = frog.jumpTimer > 0
    progression.dashMomentumTimer = Math.max(0, progression.dashMomentumTimer - 1)
    const momentumBoost = progression.dashMomentumTimer > 0 ? 0.18 * Math.max(0, skillTree.dash.momentum) : 0
    const terrainSpeedMultiplier = getTerrainSpeedMultiplier(frog.x, frog.y)

    if(gameState === "playing" && !upgradeState.active){
        if(jumping){
            frog.x += frog.dashVX
            frog.y += frog.dashVY
            frog.dashVX *= 0.9
            frog.dashVY *= 0.9
            frog.jumpTimer -= 1
            frog.dashTimer = frog.jumpTimer
            if(Math.abs(frog.dashVX) > 0.01 || Math.abs(frog.dashVY) > 0.01){
                const jumpLen = Math.hypot(frog.dashVX, frog.dashVY) || 1
                frog.facingX = frog.dashVX / jumpLen
                frog.facingY = frog.dashVY / jumpLen
                if(Math.abs(frog.facingX) > Math.abs(frog.facingY)){
                    frog.moveDirection = frog.facingX >= 0 ? "right" : "left"
                }else{
                    frog.moveDirection = frog.facingY >= 0 ? "down" : "up"
                }
            }
            if(frog.jumpTimer % 2 === 0){
                spawnHitParticles(frog.x - frog.facingX * 10, frog.y - frog.facingY * 10, "#d8ff98", 2)
            }
            if(frog.jumpTimer <= 0){
                frog.motionMode = ""
            }
        }else{
            frog.x += moveX * (frog.speed + momentumBoost) * terrainSpeedMultiplier
            frog.y += moveY * (frog.speed + momentumBoost) * terrainSpeedMultiplier
            if(Math.abs(moveX) > 0.001 || Math.abs(moveY) > 0.001){
                const moveLen = Math.hypot(moveX, moveY) || 1
                frog.lastMoveX = moveX / moveLen
                frog.lastMoveY = moveY / moveLen
                if(Math.abs(moveX) > Math.abs(moveY)){
                    frog.moveDirection = moveX >= 0 ? "right" : "left"
                }else{
                    frog.moveDirection = moveY >= 0 ? "down" : "up"
                }
            }
        }
        resolveRockCollisions(frog, frog.radius)
    }

    if(frog.x < frog.size) frog.x = frog.size
    if(frog.x > world.width - frog.size) frog.x = world.width - frog.size
    if(frog.y < frog.size) frog.y = frog.size
    if(frog.y > world.height - frog.size) frog.y = world.height - frog.size

    const moving = !upgradeState.active && (jumping || Math.abs(moveX) > 0.001 || Math.abs(moveY) > 0.001)
    frog.idleCycle += moving ? 0.08 : 0.045

    if(jumping){
        frog.moveBlend = clamp(frog.moveBlend + 0.14, 0, 1)
        frog.walkCycle += 0.34
    }else if(moving){
        const length = Math.hypot(moveX, moveY) || 1
        const targetX = moveX / length
        const targetY = moveY / length

        frog.facingX = lerp(frog.facingX, targetX, 0.28)
        frog.facingY = lerp(frog.facingY, targetY, 0.28)

        const facingLength = Math.hypot(frog.facingX, frog.facingY) || 1
        frog.facingX /= facingLength
        frog.facingY /= facingLength

        frog.moveBlend = clamp(frog.moveBlend + 0.12, 0, 1)
        frog.walkCycle += 0.22 + length * 0.05
    }else{
        frog.moveBlend = clamp(frog.moveBlend - 0.08, 0, 1)
        frog.walkCycle += 0.045
    }

    frog.walkBob =
        Math.sin(frog.walkCycle * 2) * 2.4 * frog.moveBlend +
        Math.sin(frog.idleCycle) * 0.9 * (1 - frog.moveBlend)
}
