/**
 * This module owns boss spawning, warnings, updates, and rendering.
 * It is responsible for boss flow and does not manage generic encounter zones.
 */


import { enemyStats } from "../config/game_config.js"
import {
    ctx,
    camera,
    world,
    terrain,
    frog,
    ants,
    projectiles,
    bossState,
    waveState,
    upgradeState,
    combatStats,
    gameState,
    replaceCollection,
} from "../core/state.js"
import { clamp, lerp, mulberry32, getClosestPointOnSegment } from "../core/utils.js"
import {
    isBossSpawnPoint,
    findNearestWalkablePoint,
    findNearestBossSpawnPoint,
    findBossSpawnNearPlayer,
    resolveRockCollisions,
} from "../world/collisions.js"
import { createEnemy } from "../entities/enemies.js"
import { fireProjectile } from "../entities/projectiles.js"
import { spawnHitParticles } from "../entities/particles.js"
import { damageFrog, applyDamageToBoss } from "./combat.js"
import { setBanner } from "../ui/banners.js"

export function buildBossLair(){
    bossState.spawnX = frog.x
    bossState.spawnY = frog.y
}

export function triggerBossEvent(){
    if(bossState.pending || bossState.active || bossState.defeated){
        return
    }

    waveState.active = false
    bossState.spawnX = frog.x
    bossState.spawnY = frog.y
    bossState.pending = true
    bossState.spawnTimer = 150
    bossState.warningTimer = 220
    setBanner("遗迹深处传来异动", 140)
}

export function spawnBoss(){
    const triggerX = bossState.spawnX || frog.x
    const triggerY = bossState.spawnY || frog.y
    const spawnPoint =
        findBossSpawnNearPlayer(triggerX, triggerY, enemyStats.boss.size * 0.82) ||
        findBossSpawnNearPlayer(frog.x, frog.y, enemyStats.boss.size * 0.82)
    const emergencyDistance = Math.max(190, enemyStats.boss.size * 3.8)
    const emergencyPoint = findNearestWalkablePoint(triggerX + emergencyDistance, triggerY, enemyStats.boss.size * 0.82, 760)

    if(spawnPoint){
        bossState.spawnX = spawnPoint.x
        bossState.spawnY = spawnPoint.y
    }else if(emergencyPoint && Math.hypot(emergencyPoint.x - triggerX, emergencyPoint.y - triggerY) >= emergencyDistance * 0.82){
        bossState.spawnX = emergencyPoint.x
        bossState.spawnY = emergencyPoint.y
    }else{
        bossState.spawnX = clamp(triggerX + emergencyDistance, enemyStats.boss.size + 96, world.width - enemyStats.boss.size - 96)
        bossState.spawnY = clamp(triggerY, enemyStats.boss.size + 96, world.height - enemyStats.boss.size - 96)
    }

    const rng = mulberry32((((bossState.spawnX * 173) ^ (bossState.spawnY * 211) ^ 0xB055F1) >>> 0))
    replaceCollection(ants, [])
    replaceCollection(projectiles, [])
    bossState.entity = createEnemy("boss", bossState.spawnX, bossState.spawnY, rng, {
        hp:26,
        maxHp:26,
        size:48,
        speed:1.05,
        fireCooldown:58,
        chargeCooldown:120,
        name:bossState.name
    })
    bossState.active = true
    bossState.pending = false
    bossState.warningTimer = 180
    waveState.active = false
    waveState.current = Math.max(waveState.current, 5)
    spawnHitParticles(bossState.spawnX, bossState.spawnY, "#7b4b92", 24)
    setBanner("蚁后现身", 150)
}

export function updateBoss(){
    if(gameState !== "playing" || upgradeState.active){
        return
    }

    if(bossState.pending){
        bossState.warningTimer = Math.max(0, bossState.warningTimer - 1)
        bossState.spawnTimer -= 1
        if(bossState.spawnTimer <= 0){
            spawnBoss()
        }
        return
    }

    if(!bossState.active || !bossState.entity){
        bossState.warningTimer = Math.max(0, bossState.warningTimer - 1)
        return
    }

    const boss = bossState.entity
    boss.phase += 0.14
    boss.fireCooldown = Math.max(0, boss.fireCooldown - 1)
    boss.chargeCooldown = Math.max(0, boss.chargeCooldown - 1)
    bossState.warningTimer = Math.max(0, bossState.warningTimer - 1)

    if(boss.poisonTimer > 0){
        boss.poisonTimer -= 1
        boss.poisonTick -= 1
        if(boss.poisonTimer % 18 === 0){
            spawnHitParticles(boss.x + (Math.random() - 0.5) * 18, boss.y + (Math.random() - 0.5) * 18, "#84df69", 2)
        }
        if(boss.poisonTick <= 0){
            boss.poisonTick = combatStats.poisonInterval
            applyDamageToBoss(combatStats.poisonDamage)
            if(!bossState.active || !bossState.entity){
                return
            }
        }
    }

    let steerX = frog.x - boss.x
    let steerY = frog.y - boss.y
    const frogDist = Math.hypot(steerX, steerY) || 1
    steerX /= frogDist
    steerY /= frogDist

    for(const rock of terrain.rocks || []){
        const dx = boss.x - rock.x
        const dy = boss.y - rock.y
        const dist = Math.hypot(dx, dy) || 1
        const avoidRange = rock.r + boss.size + 26
        if(dist < avoidRange){
            const force = (avoidRange - dist) / avoidRange
            steerX += dx / dist * force * 1.9
            steerY += dy / dist * force * 1.9
        }
    }

    for(const barrier of terrain.barriers || []){
        const point = getClosestPointOnSegment(boss.x, boss.y, barrier.x1, barrier.y1, barrier.x2, barrier.y2)
        const dx = boss.x - point.x
        const dy = boss.y - point.y
        const dist = Math.hypot(dx, dy) || 1
        const avoidRange = barrier.radius + boss.size + 18
        if(dist < avoidRange){
            const force = (avoidRange - dist) / avoidRange
            steerX += dx / dist * force * 1.8
            steerY += dy / dist * force * 1.8
        }
    }

    const steerLen = Math.hypot(steerX, steerY) || 1
    steerX /= steerLen
    steerY /= steerLen

    if(boss.dashTimer > 0){
        boss.dashTimer -= 1
        boss.vx = lerp(boss.vx, boss.dashVX, 0.24)
        boss.vy = lerp(boss.vy, boss.dashVY, 0.24)
    }else{
        boss.vx = lerp(boss.vx, steerX * boss.speed, 0.08)
        boss.vy = lerp(boss.vy, steerY * boss.speed, 0.08)
    }

    if(boss.fireCooldown <= 0 && frogDist < 520){
        const baseAngle = Math.atan2(frog.y - boss.y, frog.x - boss.x)
        for(const spread of [-0.22, 0, 0.22]){
            fireProjectile(
                {type:"boss", x:boss.x, y:boss.y, size:boss.size},
                Math.cos(baseAngle + spread),
                Math.sin(baseAngle + spread),
                {
                    speed:1.95,
                    radius:10,
                    life:240,
                    color:"#ecc16e",
                    outer:"#6a3f1f"
                }
            )
        }
        boss.fireCooldown = 120
    }

    if(boss.dashTimer <= 0 && boss.chargeCooldown <= 0 && frogDist > 120 && frogDist < 320){
        boss.dashTimer = enemyStats.boss.dashFrames
        boss.dashVX = steerX * enemyStats.boss.dashSpeed
        boss.dashVY = steerY * enemyStats.boss.dashSpeed
        boss.chargeCooldown = 180
        spawnHitParticles(boss.x, boss.y, "#f0b26d", 10)
    }

    boss.x += boss.vx
    boss.y += boss.vy
    resolveRockCollisions(boss, boss.size * 0.8)
    boss.x = clamp(boss.x, boss.size, world.width - boss.size)
    boss.y = clamp(boss.y, boss.size, world.height - boss.size)

    const inOpenPocket = isBossSpawnPoint(boss.x, boss.y, boss.size * 0.72)
    if(inOpenPocket){
        boss.safeX = boss.x
        boss.safeY = boss.y
    }

    boss.stuckProbeTimer += 1
    if(boss.stuckProbeTimer >= 30){
        const movedSinceCheck = Math.hypot(boss.x - boss.lastCheckX, boss.y - boss.lastCheckY)
        const stuckThreshold = Math.max(12, boss.size * 0.24)
        if(movedSinceCheck < stuckThreshold || !inOpenPocket){
            boss.stuckTimer += boss.stuckProbeTimer
        }else{
            boss.stuckTimer = Math.max(0, boss.stuckTimer - 18)
        }
        boss.lastCheckX = boss.x
        boss.lastCheckY = boss.y
        boss.stuckProbeTimer = 0
    }

    if(boss.stuckTimer >= 72 || !inOpenPocket){
        let rescue = null
        const anchors = [
            {x:boss.x, y:boss.y},
            {x:boss.safeX || bossState.spawnX, y:boss.safeY || bossState.spawnY},
            {x:bossState.spawnX, y:bossState.spawnY}
        ]

        for(const anchor of anchors){
            rescue = findNearestBossSpawnPoint(anchor.x, anchor.y, boss.size * 0.76, 620)
            if(rescue){
                break
            }
        }

        if(rescue){
            const rescueDist = Math.hypot(rescue.x - boss.x, rescue.y - boss.y)
            if(rescueDist < 96){
                boss.x = lerp(boss.x, rescue.x, 0.68)
                boss.y = lerp(boss.y, rescue.y, 0.68)
            }else{
                boss.x = rescue.x
                boss.y = rescue.y
            }
            boss.safeX = rescue.x
            boss.safeY = rescue.y
            boss.vx = 0
            boss.vy = 0
            boss.dashTimer = 0
            boss.dashVX = 0
            boss.dashVY = 0
            boss.chargeCooldown = Math.max(boss.chargeCooldown, 60)
            spawnHitParticles(boss.x, boss.y, "#f0b26d", 10)
        }
        boss.stuckTimer = 0
        boss.stuckProbeTimer = 0
        boss.lastCheckX = boss.x
        boss.lastCheckY = boss.y
    }

    if(frogDist < frog.radius + boss.size * enemyStats.boss.contactRadius){
        damageFrog(5)
    }
}

export function drawBoss(){
    if(!bossState.active || !bossState.entity){
        return
    }

    const boss = bossState.entity
    const x = boss.x - camera.x
    const y = boss.y - camera.y
    const s = boss.size
    const angle = Math.atan2(boss.vy || 0.001, boss.vx || 1)
    const wingLift = Math.sin(boss.phase) * 0.14

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)

    ctx.fillStyle = "rgba(0,0,0,0.28)"
    ctx.beginPath()
    ctx.ellipse(0, s * 1.05, s * 1.15, s * 0.36, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = "#2b190f"
    ctx.lineWidth = 4
    ctx.lineCap = "round"
    for(const side of [-1, 1]){
        for(const offset of [-0.48, -0.08, 0.34]){
            ctx.beginPath()
            ctx.moveTo(side * s * 0.24, offset * s)
            ctx.quadraticCurveTo(side * s * 0.8, offset * s * 1.05 + side * 3, side * s * 1.18, offset * s * 0.78 + side * 5)
            ctx.stroke()
        }
    }

    ctx.fillStyle = "#4d2a17"
    ctx.beginPath()
    ctx.ellipse(0, s * 0.18, s * 0.58, s * 0.48, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#7d5030"
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.28, s * 0.62, s * 0.52, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#b0763f"
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.08, s * 0.38, s * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.rotate(-0.2 - wingLift)
    ctx.fillStyle = "rgba(166,107,49,0.92)"
    ctx.beginPath()
    ctx.ellipse(-s * 0.32, -s * 0.12, s * 0.34, s * 0.58, -0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.rotate(0.2 + wingLift)
    ctx.fillStyle = "rgba(166,107,49,0.92)"
    ctx.beginPath()
    ctx.ellipse(s * 0.32, -s * 0.12, s * 0.34, s * 0.58, 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = "#f3d287"
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.42, s * 0.22, s * 0.14, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#fbfff2"
    ctx.beginPath()
    ctx.arc(-s * 0.2, -s * 0.42, s * 0.12, 0, Math.PI * 2)
    ctx.arc(s * 0.2, -s * 0.42, s * 0.12, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#1b160d"
    ctx.beginPath()
    ctx.arc(-s * 0.17, -s * 0.42, s * 0.05, 0, Math.PI * 2)
    ctx.arc(s * 0.23, -s * 0.42, s * 0.05, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = "#2b190f"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-s * 0.16, -s * 0.58)
    ctx.lineTo(-s * 0.34, -s * 0.92)
    ctx.moveTo(s * 0.16, -s * 0.58)
    ctx.lineTo(s * 0.34, -s * 0.92)
    ctx.stroke()

    ctx.restore()
}
