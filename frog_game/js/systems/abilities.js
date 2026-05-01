/**
 * This module handles active frog abilities such as basic attacks, jump, dash, and slam.
 * It is responsible for ability execution and visuals, and it does not own HUD/input wiring.
 */


import {
    ctx,
    camera,
    frog,
    world,
    ants,
    plants,
    bladeWaves,
    tongue,
    bossState,
    progression,
    frogAbilities,
    combatStats,
    skillTree,
    gameState,
    abilities,
    upgradeState,
} from "../core/state.js"
import { smoothstep, clamp } from "../core/utils.js"
import { playerConfig } from "../config/player_config.js"
import { getMoveInput } from "../core/input.js"
import { updateCamera } from "../core/camera.js"
import { applyDamageToEnemy, applyDamageToPlant, applyDamageToBoss, applyPoisonStatus } from "./combat.js"
import { resetRound } from "./encounters.js"
import { getFacingMoveDirection, isAbilityUnlocked } from "../entities/frog.js"
import { spawnHitParticles, spawnRingParticle } from "../entities/particles.js"
import { circleCollidesRocks } from "../world/collisions.js"

const ATTACK_PREP_FRAMES = 5
const ATTACK_STRIKE_FRAMES = 4
const ATTACK_RECOVER_FRAMES = 7
const ATTACK_ONE_TOTAL = ATTACK_PREP_FRAMES + ATTACK_STRIKE_FRAMES + ATTACK_RECOVER_FRAMES
const ATTACK_TWO_TOTAL = ATTACK_PREP_FRAMES + ATTACK_STRIKE_FRAMES + ATTACK_RECOVER_FRAMES
const AOE_TOTAL = 30
const BLADE_WAVE_SPEED = 13.5
const BLADE_WAVE_LIFE = 14

function getAttackBaseDamage(){
    return playerConfig.baseAttackDamage + progression.tonguePower + skillTree.tongue.doubleHit
}

function getAttackStrikeRange(step){
    if(step === 2){
        return Math.max(136, frog.tongueRange * 0.72)
    }
    return Math.max(104, frog.tongueRange * 0.58)
}

function getAttackStrikeWidth(step){
    return step === 2 ? 54 : 42
}

function getAoeStrikeRange(){
    return 136 + progression.aoeRangeBonus
}

function getAoeVisualRadius(phase){
    const scale = getAoeStrikeRange() / 136
    return (phase === "strike" ? 92 : 58) * scale
}

function getBladeWaveLevel(){
    return skillTree.tongue.bladeWave || 0
}

function getBladeWaveStats(step){
    const level = getBladeWaveLevel()
    if(level < 2){
        return null
    }
    const meleeDamage = getAttackBaseDamage()
    const damageScale = 0.5 + Math.max(0, level - 2) * 0.08
    return {
        damage: Math.max(1, Math.round(meleeDamage * damageScale)),
        radius: 18 + Math.max(0, level - 2) * 2,
        range: 138 + skillTree.tongue.range * 20 + Math.max(0, level - 2) * 26 + (step === 2 ? 16 : 0),
        speed: BLADE_WAVE_SPEED + Math.max(0, level - 2) * 0.7,
        life: BLADE_WAVE_LIFE + Math.max(0, level - 2),
    }
}

function findMeleeTarget(range, width = 42){
    const originX = frog.x + frog.facingX * 14
    const originY = frog.y + frog.facingY * 10
    const candidates = getTongueTargets()
    let target = null
    let bestScore = -Infinity
    const facingLength = Math.hypot(frog.facingX, frog.facingY) || 1
    const facingX = frog.facingX / facingLength
    const facingY = frog.facingY / facingLength

    for(const candidate of candidates){
        const dx = candidate.x - originX
        const dy = candidate.y - originY
        const dist = Math.hypot(dx, dy)
        const forward = dx * facingX + dy * facingY
        const side = Math.abs(-facingY * dx + facingX * dy)
        const candidateRadius = candidate.kind === "boss"
            ? candidate.ref.size * 0.38
            : Math.max(14, (candidate.ref?.size || 22) * 0.52)

        if(forward < -candidateRadius * 0.25 || forward > range) continue
        if(side > width + candidateRadius) continue
        if(dist > range + candidateRadius) continue

        const score = forward * 0.9 - side * 1.4 - dist * 0.18
        if(score > bestScore){
            bestScore = score
            target = candidate
        }
    }

    return target
}

function tryMeleeHit(range, width){
    if(frog.attackHit){
        return
    }
    const target = findMeleeTarget(range, width)
    if(!target){
        return
    }
    frog.attackHit = true
    applyTongueHit(target)
}

function tryAoeHit(range){
    if(frog.aoeHit){
        return
    }
    frog.aoeHit = true

    for(const ant of ants.slice()){
        if(Math.hypot(ant.x - frog.x, ant.y - frog.y) <= range){
            applyAoeHit({kind:"enemy", ref:ant, x:ant.x, y:ant.y})
        }
    }

    for(const plant of plants.slice()){
        if(Math.hypot(plant.x - frog.x, plant.y - frog.y) <= range * 0.9){
            applyAoeHit({kind:"plant", ref:plant, x:plant.x, y:plant.y})
        }
    }

    if(bossState.active && bossState.entity && Math.hypot(bossState.entity.x - frog.x, bossState.entity.y - frog.y) <= range + bossState.entity.size * 0.35){
        applyAoeHit({kind:"boss", ref:bossState.entity, x:bossState.entity.x, y:bossState.entity.y})
    }

    spawnRingParticle(frog.x, frog.y, "#d7ffe8", 42, 6.2, 18, 5)
    spawnHitParticles(frog.x, frog.y, "#d7ffe8", 12)
}

function spawnBladeWave(step){
    if(frog.attackWaveEmitted){
        return
    }
    const stats = getBladeWaveStats(step)
    if(!stats){
        return
    }

    const dirLength = Math.hypot(frog.facingX, frog.facingY) || 1
    const dirX = frog.facingX / dirLength
    const dirY = frog.facingY / dirLength
    bladeWaves.push({
        x: frog.x + dirX * 34,
        y: frog.y + dirY * 20,
        vx: dirX * stats.speed,
        vy: dirY * stats.speed,
        radius: stats.radius,
        damage: stats.damage,
        life: stats.life,
        maxLife: stats.life,
        range: stats.range,
        traveled: 0,
        step,
    })
    frog.attackWaveEmitted = true
}

function hitBladeWaveTarget(target, damage){
    if(target.kind === "enemy"){
        applyDamageToEnemy(target.ref, damage)
    }else if(target.kind === "plant"){
        applyDamageToPlant(target.ref, damage)
    }else if(target.kind === "boss"){
        applyDamageToBoss(Math.max(1, damage - 1))
    }
    spawnHitParticles(target.x, target.y - 4, "#dff7ff", 6)
}

function updateBladeWaves(){
    if(bladeWaves.length === 0){
        return
    }

    for(let index = bladeWaves.length - 1; index >= 0; index--){
        const wave = bladeWaves[index]
        wave.x += wave.vx
        wave.y += wave.vy
        wave.traveled += Math.hypot(wave.vx, wave.vy)
        wave.life -= 1

        if(
            wave.life <= 0 ||
            wave.traveled >= wave.range ||
            wave.x < -40 ||
            wave.y < -40 ||
            wave.x > world.width + 40 ||
            wave.y > world.height + 40 ||
            circleCollidesRocks(wave.x, wave.y, wave.radius * 0.38)
        ){
            bladeWaves.splice(index, 1)
            continue
        }

        let hitTarget = null
        let hitScore = Infinity
        for(const target of getTongueTargets()){
            const radius = target.kind === "boss"
                ? target.ref.size * 0.38
                : Math.max(12, (target.ref?.size || 22) * 0.45)
            const dist = Math.hypot(target.x - wave.x, target.y - wave.y)
            if(dist > wave.radius + radius){
                continue
            }
            if(dist < hitScore){
                hitScore = dist
                hitTarget = target
            }
        }

        if(hitTarget){
            hitBladeWaveTarget(hitTarget, wave.damage)
            bladeWaves.splice(index, 1)
        }
    }
}

export function getAttackPhase(){
    if(frog.attackStep <= 0){
        return null
    }
    const total = frog.attackStep === 2 ? ATTACK_TWO_TOTAL : ATTACK_ONE_TOTAL
    const elapsed = total - Math.max(0, frog.attackTimer)
    if(elapsed < ATTACK_PREP_FRAMES){
        return "prep"
    }
    if(elapsed < ATTACK_PREP_FRAMES + ATTACK_STRIKE_FRAMES){
        return "strike"
    }
    return "recover"
}

export function getAoePhase(){
    if(frog.aoeTimer <= 0){
        return null
    }
    const t = 1 - Math.max(0, frog.aoeTimer) / AOE_TOTAL
    if(t < 0.26){
        return "prep"
    }
    if(t < 0.68){
        return "strike"
    }
    return "recover"
}

export function getTongueTargets(){
    const targets = ants.map(enemy => ({
        kind:"enemy",
        x:enemy.x,
        y:enemy.y,
        ref:enemy
    }))

    for(const plant of plants){
        targets.push({
            kind:"plant",
            x:plant.x,
            y:plant.y,
            ref:plant
        })
    }

    if(bossState.active && bossState.entity){
        targets.push({
            kind:"boss",
            x:bossState.entity.x,
            y:bossState.entity.y,
            ref:bossState.entity
        })
    }

    return targets
}

export function applyTongueHit(target){
    if(!target) return
    const critChance = Math.min(0.55, playerConfig.baseCritChance + skillTree.tongue.crit * 0.16 + progression.tongueCritBonus * 0.04)
    const critBonus = Math.random() < critChance ? 1 + Math.floor(skillTree.tongue.crit * 0.5) : 0
    const damage = getAttackBaseDamage() + critBonus
    if(target.kind === "enemy"){
        applyDamageToEnemy(target.ref, damage)
        if(isAbilityUnlocked("poison") && target.ref.hp > 0){
            applyPoisonStatus(target.ref)
            spawnHitParticles(target.ref.x, target.ref.y - 4, "#8ee36d", 5)
        }
        if(skillTree.tongue.frenzy > 0){
            frog.attackCooldown = Math.max(8, frog.attackCooldown - skillTree.tongue.frenzy * 3)
            frogAbilities.tongue.timer = frog.attackCooldown
        }
        if(skillTree.tongue.pierce > 0){
            let pierceTarget = null
            let pierceDist = Infinity
            for(const other of ants){
                if(other === target.ref) continue
                const dist = Math.hypot(other.x - target.ref.x, other.y - target.ref.y)
                if(dist < 110 && dist < pierceDist){
                    pierceDist = dist
                    pierceTarget = other
                }
            }
            if(pierceTarget){
                applyDamageToEnemy(pierceTarget, skillTree.tongue.pierce)
                spawnHitParticles(pierceTarget.x, pierceTarget.y - 4, "#ffd4a3", 4)
            }
        }
        if(skillTree.tongue.chain > 0){
            let chainTarget = null
            let chainDist = Infinity
            for(const other of ants){
                if(other === target.ref) continue
                const dist = Math.hypot(other.x - target.ref.x, other.y - target.ref.y)
                if(dist < 90 && dist < chainDist){
                    chainDist = dist
                    chainTarget = other
                }
            }
            if(chainTarget){
                applyDamageToEnemy(chainTarget, skillTree.tongue.chain)
                spawnHitParticles(chainTarget.x, chainTarget.y - 4, "#ffd4a3", 4)
            }
        }
    }else if(target.kind === "plant"){
        applyDamageToPlant(target.ref, damage)
    }else if(target.kind === "boss"){
        applyDamageToBoss(Math.max(1, damage - 1))
        if(isAbilityUnlocked("poison") && bossState.entity){
            applyPoisonStatus(bossState.entity, 180)
            spawnHitParticles(bossState.entity.x, bossState.entity.y - 8, "#8ee36d", 6)
        }
    }
}

function applyAoeHit(target){
    if(!target) return

    const damage = getAttackBaseDamage() + Math.max(0, progression.aoeDamageBonus)
    if(target.kind === "enemy"){
        applyDamageToEnemy(target.ref, damage)
        if(isAbilityUnlocked("poison") && target.ref.hp > 0){
            applyPoisonStatus(target.ref)
            spawnHitParticles(target.ref.x, target.ref.y - 4, "#8ee36d", 5)
        }
    }else if(target.kind === "plant"){
        applyDamageToPlant(target.ref, Math.max(1, damage))
    }else if(target.kind === "boss"){
        applyDamageToBoss(Math.max(1, damage - 1))
        if(isAbilityUnlocked("poison") && bossState.entity){
            applyPoisonStatus(bossState.entity, 180)
            spawnHitParticles(bossState.entity.x, bossState.entity.y - 8, "#8ee36d", 6)
        }
    }
}

export function triggerJump(){
    if(gameState !== "playing" || !isAbilityUnlocked("jump") || frogAbilities.jump.timer > 0 || frog.jumpTimer > 0){
        return
    }

    const input = getMoveInput()
    let dirX = input.moveX
    let dirY = input.moveY

    if(Math.hypot(dirX, dirY) < 0.001){
        dirX = frog.lastMoveX || frog.facingX || 0
        dirY = frog.lastMoveY || frog.facingY || -1
    }

    const length = Math.hypot(dirX, dirY) || 1
    dirX /= length
    dirY /= length

    frog.jumpDirX = dirX
    frog.jumpDirY = dirY
    frog.motionMode = "jump"
    frog.jumpTimer = frog.jumpDuration
    frog.jumpCooldown = Math.max(24, frogAbilities.jump.cooldown - progression.jumpCooldownBonus)
    frog.dashVX = dirX * frog.jumpSpeed
    frog.dashVY = dirY * frog.jumpSpeed
    frog.dashTimer = frog.jumpTimer
    frog.dashCooldown = frog.jumpCooldown
    frogAbilities.jump.timer = frog.jumpCooldown
    frog.invuln = Math.max(frog.invuln, 12)
    spawnHitParticles(frog.x, frog.y, "#d8ff98", 9)
}

export function triggerDash(){
    if(
        gameState !== "playing" ||
        !isAbilityUnlocked("dash") ||
        frogAbilities.dash.timer > 0 ||
        frog.jumpTimer > 0 ||
        frog.attackStep > 0 ||
        frog.aoeTimer > 0
    ){
        return
    }

    const direction = getFacingMoveDirection()
    const dashRangeBonus = skillTree.dash.range * 2.8 + progression.dashMomentumBonus * 0.9
    const dashFrames = Math.max(8, Math.round(9 + skillTree.dash.range * 1.2))
    const dashSpeed = Math.max(18, 20 + dashRangeBonus)
    frog.motionMode = "dash"
    frog.jumpTimer = dashFrames
    frog.dashTimer = dashFrames
    frog.dashVX = direction.x * dashSpeed
    frog.dashVY = direction.y * dashSpeed
    frog.facingX = direction.x
    frog.facingY = direction.y
    frog.lastMoveX = direction.x
    frog.lastMoveY = direction.y
    frog.invuln = Math.max(frog.invuln, 18)
    if(skillTree.dash.momentum > 0){
        progression.dashMomentumTimer = 72 + skillTree.dash.momentum * 20
    }
    frogAbilities.dash.timer = frogAbilities.dash.cooldown
    spawnHitParticles(frog.x - direction.x * 18, frog.y - direction.y * 18, "#8be5ff", 14)
    spawnRingParticle(frog.x, frog.y, "#8be5ff", 14, 3.6, 12, 3)
    if(skillTree.dash.damage > 0){
        for(const ant of ants.slice()){
            if(Math.hypot(ant.x - frog.x, ant.y - frog.y) <= 68){
                applyDamageToEnemy(ant, skillTree.dash.damage)
            }
        }
    }
    if(skillTree.dash.shockwave > 0){
        spawnRingParticle(frog.x, frog.y, "#bceaff", 24, 5.2, 16, 4)
        for(const ant of ants.slice()){
            if(Math.hypot(ant.x - frog.x, ant.y - frog.y) <= 84){
                applyDamageToEnemy(ant, skillTree.dash.shockwave)
            }
        }
    }
    updateCamera()
}

export function triggerSlam(){
    if(gameState !== "playing" || !isAbilityUnlocked("slam") || frogAbilities.slam.timer > 0){
        return
    }

    const radius = combatStats.slamRadius
    frogAbilities.slam.timer = frogAbilities.slam.cooldown
    spawnRingParticle(frog.x, frog.y, "#ffd97a", 22, 7.5, 18, 5)
    spawnHitParticles(frog.x, frog.y, "#ffd97a", 20)

    for(const ant of ants.slice()){
        if(Math.hypot(ant.x - frog.x, ant.y - frog.y) <= radius){
            applyDamageToEnemy(ant, combatStats.slamDamage)
        }
    }

    for(const plant of plants.slice()){
        if(Math.hypot(plant.x - frog.x, plant.y - frog.y) <= radius * 0.9){
            applyDamageToPlant(plant, 1)
        }
    }

    if(bossState.active && bossState.entity && Math.hypot(bossState.entity.x - frog.x, bossState.entity.y - frog.y) <= radius + bossState.entity.size * 0.4){
        applyDamageToBoss(1)
    }
}

export function triggerAttack(){
    if(gameState !== "playing"){
        resetRound()
        return
    }

    if(frog.attackStep === 1 && frog.comboWindow > 0){
        frog.attackQueued = true
        return
    }

    if(
        !isAbilityUnlocked("tongue") ||
        frog.attackCooldown > 0 ||
        frog.jumpTimer > 0 ||
        frog.aoeTimer > 0
    ){
        return
    }

    if(frog.attackStep === 0){
        frog.attackStep = 1
        frog.attackTimer = ATTACK_ONE_TOTAL
        frog.attackQueued = false
        frog.attackHit = false
        frog.attackWaveEmitted = false
        frog.comboWindow = 11
        frog.attackCooldown = Math.max(12, playerConfig.tongueCooldown - progression.tongueCooldownBonus)
        frogAbilities.tongue.timer = frog.attackCooldown
        tongue.active = false
        return
    }
}

export function triggerAoe(){
    if(
        gameState !== "playing" ||
        !abilities.aoe ||
        frogAbilities.aoe.timer > 0 ||
        frog.jumpTimer > 0 ||
        frog.attackStep > 0 ||
        frog.aoeTimer > 0
    ){
        return
    }

    frog.aoeTimer = AOE_TOTAL
    frog.aoeHit = false
    frog.attackQueued = false
    frog.attackStep = 0
    frog.attackTimer = 0
    frogAbilities.aoe.timer = frogAbilities.aoe.cooldown
    tongue.active = false
}

export function updateTongue(){
    tongue.active = false
    tongue.timer = 0

    if(upgradeState.active){
        return
    }

    if(frog.comboWindow > 0){
        frog.comboWindow = Math.max(0, frog.comboWindow - 1)
    }

    if(frog.attackStep === 1){
        frog.attackTimer = Math.max(0, frog.attackTimer - 1)
        if(getAttackPhase() === "strike"){
            tryMeleeHit(getAttackStrikeRange(1), getAttackStrikeWidth(1))
            spawnBladeWave(1)
        }
        if(frog.attackTimer <= 0){
            if(frog.attackQueued && frog.comboWindow > 0){
                frog.attackStep = 2
                frog.attackTimer = ATTACK_TWO_TOTAL
                frog.attackQueued = false
                frog.attackHit = false
                frog.attackWaveEmitted = false
            }else{
                frog.attackStep = 0
                frog.attackHit = false
                frog.attackWaveEmitted = false
            }
        }
    }else if(frog.attackStep === 2){
        frog.attackTimer = Math.max(0, frog.attackTimer - 1)
        if(getAttackPhase() === "strike"){
            tryMeleeHit(getAttackStrikeRange(2), getAttackStrikeWidth(2))
            spawnBladeWave(2)
        }
        if(frog.attackTimer <= 0){
            frog.attackStep = 0
            frog.attackQueued = false
            frog.attackHit = false
            frog.attackWaveEmitted = false
        }
    }

    if(frog.aoeTimer > 0){
        frog.aoeTimer = Math.max(0, frog.aoeTimer - 1)
        if(getAoePhase() === "strike"){
            tryAoeHit(getAoeStrikeRange())
        }
        if(frog.aoeTimer <= 0){
            frog.aoeTimer = 0
            frog.aoeHit = false
        }
    }

    updateBladeWaves()
}

export function drawTongue(){
    return
}

export function drawAbilityEffects(){
    for(const wave of bladeWaves){
        const x = wave.x - camera.x
        const y = wave.y - camera.y
        const angle = Math.atan2(wave.vy, wave.vx)
        const lifeRatio = clamp(wave.life / Math.max(1, wave.maxLife), 0, 1)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)
        ctx.globalAlpha = 0.22 + lifeRatio * 0.42
        ctx.fillStyle = "#d8f7ff"
        ctx.beginPath()
        ctx.ellipse(0, 0, wave.radius * 1.25, wave.radius * 0.44, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalAlpha = 0.42 + lifeRatio * 0.34
        ctx.fillStyle = "#f8feff"
        ctx.beginPath()
        ctx.ellipse(wave.radius * 0.18, 0, wave.radius * 0.72, wave.radius * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    if(frog.jumpTimer > 0){
        ctx.save()
        const dashTint = frog.motionMode === "dash" ? "#bfe9ff" : "#d8ff98"
        ctx.globalAlpha = 0.16 + frog.jumpTimer * 0.03
        ctx.fillStyle = dashTint
        ctx.beginPath()
        ctx.ellipse(
            frog.x - camera.x - frog.facingX * 18,
            frog.y - camera.y - frog.facingY * 18,
            frog.size * 0.6,
            frog.size * 0.34,
            Math.atan2(frog.facingY, frog.facingX),
            0,
            Math.PI * 2
        )
        ctx.fill()
        ctx.restore()
    }

    if(frog.aoeTimer > 0){
        const phase = getAoePhase()
        const radius = getAoeVisualRadius(phase)
        const alpha = phase === "strike" ? 0.26 : 0.14
        ctx.save()
        ctx.strokeStyle = `rgba(214,255,232,${alpha})`
        ctx.lineWidth = phase === "strike" ? 8 : 5
        ctx.beginPath()
        ctx.arc(frog.x - camera.x, frog.y - camera.y + 4, radius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
    }
}
