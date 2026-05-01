/**
 * This module owns hostile projectile spawning, updates, and rendering.
 * It is responsible for projectile behavior and does not decide broader encounter flow.
 */


import {
    ctx,
    camera,
    world,
    frog,
    projectiles,
    hazards,
    upgradeState,
    gameState,
    replaceCollection,
} from "../core/state.js"
import { circleCollidesRocks } from "../world/collisions.js"
import { damageFrog } from "../systems/combat.js"
import { spawnHitParticles } from "./particles.js"

function getDefaultProjectileDamage(owner){
    switch(owner){
        case "ranged":
        case "sniper":
        case "beetle":
        case "plant":
            return 4
        case "boss":
            return 5
        case "spore":
            return 3
        default:
            return 1
    }
}

export function fireProjectile(enemy, dirX, dirY, overrides = {}){
    const speed = overrides.speed !== undefined ? overrides.speed : (enemy.type === "beetle" ? 2.1 : enemy.type === "plant" ? 1.65 : enemy.type === "boss" ? 2.2 : 2.6)
    projectiles.push({
        x:(overrides.x !== undefined ? overrides.x : enemy.x) + dirX * (overrides.offset !== undefined ? overrides.offset : enemy.size * 0.7),
        y:(overrides.y !== undefined ? overrides.y : enemy.y) + dirY * (overrides.offset !== undefined ? overrides.offset : enemy.size * 0.7),
        vx:dirX * speed,
        vy:dirY * speed,
        radius:overrides.radius !== undefined ? overrides.radius : (enemy.type === "beetle" ? 7 : enemy.type === "plant" ? 7 : enemy.type === "boss" ? 10 : 8),
        life:overrides.life !== undefined ? overrides.life : 220,
        color:overrides.color !== undefined ? overrides.color : (enemy.type === "beetle" ? "#d7b85b" : enemy.type === "plant" ? "#9acb65" : enemy.type === "boss" ? "#e6bf6b" : "#e0a66b"),
        outer:overrides.outer !== undefined ? overrides.outer : (enemy.type === "beetle" ? "#5e4420" : enemy.type === "plant" ? "#35501f" : enemy.type === "boss" ? "#5a3316" : "#5c3419"),
        owner:overrides.owner !== undefined ? overrides.owner : enemy.type,
        damage:overrides.damage !== undefined ? overrides.damage : getDefaultProjectileDamage(overrides.owner !== undefined ? overrides.owner : enemy.type),
    })
}

export function spawnHazard(x, y, overrides = {}){
    hazards.push({
        x,
        y,
        radius:overrides.radius !== undefined ? overrides.radius : 42,
        life:overrides.life !== undefined ? overrides.life : 240,
        pulse:overrides.pulse !== undefined ? overrides.pulse : 0,
        color:overrides.color !== undefined ? overrides.color : "rgba(146,201,86,0.22)",
        ring:overrides.ring !== undefined ? overrides.ring : "rgba(206,242,140,0.34)",
        damageInterval:overrides.damageInterval !== undefined ? overrides.damageInterval : 36,
        damageTimer:0,
        damage:overrides.damage !== undefined ? overrides.damage : 1,
    })
}

export function updateProjectiles(){
    if((gameState !== "playing" && projectiles.length === 0 && hazards.length === 0) || upgradeState.active){
        return
    }

    replaceCollection(hazards, hazards.filter(hazard => {
        hazard.life -= 1
        hazard.pulse += 0.06
        hazard.damageTimer = Math.max(0, hazard.damageTimer - 1)
        if(gameState === "playing" && Math.hypot(hazard.x - frog.x, hazard.y - frog.y) < hazard.radius + frog.radius * 0.45){
            if(hazard.damageTimer <= 0){
                damageFrog(hazard.damage)
                hazard.damageTimer = hazard.damageInterval
                spawnHitParticles(frog.x, frog.y, "#d7f297", 3)
            }
        }
        return hazard.life > 0
    }))

    replaceCollection(projectiles, projectiles.filter(projectile => {
        projectile.x += projectile.vx
        projectile.y += projectile.vy
        projectile.life -= 1

        if(projectile.life <= 0){
            if(projectile.owner === "spore"){
                spawnHazard(projectile.x, projectile.y, {
                    radius:40,
                    life:220,
                    damage:3,
                    color:"rgba(142,204,93,0.24)",
                    ring:"rgba(220,244,156,0.36)"
                })
            }
            return false
        }
        if(projectile.x < -20 || projectile.y < -20 || projectile.x > world.width + 20 || projectile.y > world.height + 20) return false
        if(circleCollidesRocks(projectile.x, projectile.y, projectile.radius)){
            if(projectile.owner === "spore"){
                spawnHazard(projectile.x, projectile.y, {
                    radius:38,
                    life:210,
                    damage:3,
                    color:"rgba(142,204,93,0.24)",
                    ring:"rgba(220,244,156,0.34)"
                })
            }
            return false
        }

        if(gameState === "playing" && Math.hypot(projectile.x - frog.x, projectile.y - frog.y) < projectile.radius + frog.radius * 0.7){
            if(damageFrog(projectile.damage)){
                spawnHitParticles(projectile.x, projectile.y, "#fff0b4", 4)
            }
            if(projectile.owner === "spore"){
                spawnHazard(projectile.x, projectile.y, {
                    radius:36,
                    life:190,
                    damage:3,
                    color:"rgba(142,204,93,0.24)",
                    ring:"rgba(220,244,156,0.34)"
                })
            }
            return false
        }

        return true
    }))
}

export function drawProjectiles(){
    for(const hazard of hazards){
        const x = hazard.x - camera.x
        const y = hazard.y - camera.y
        const pulse = 1 + Math.sin(hazard.pulse) * 0.08
        ctx.fillStyle = hazard.color
        ctx.beginPath()
        ctx.arc(x, y, hazard.radius * pulse, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = hazard.ring
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, hazard.radius * (0.72 + Math.sin(hazard.pulse * 1.4) * 0.04), 0, Math.PI * 2)
        ctx.stroke()
    }

    for(const projectile of projectiles){
        const x = projectile.x - camera.x
        const y = projectile.y - camera.y
        ctx.fillStyle = projectile.outer
        ctx.beginPath()
        ctx.arc(x, y, projectile.radius + 1.6, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = projectile.color
        ctx.beginPath()
        ctx.arc(x, y, projectile.radius, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "rgba(255,255,255,0.28)"
        ctx.beginPath()
        ctx.arc(x - projectile.radius * 0.25, y - projectile.radius * 0.3, projectile.radius * 0.28, 0, Math.PI * 2)
        ctx.fill()
    }
}
