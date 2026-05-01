/**
 * This module resolves damage, poison, and death outcomes.
 * It is responsible for combat state changes and does not render UI directly.
 */


import {
    frog,
    ants,
    plants,
    bossState,
    combatStats,
    projectiles,
    hazards,
    skillTree,
    gameState,
    replaceCollection,
    setGameState,
} from "../core/state.js"
import { spawnHitParticles, spawnDamageNumber } from "../entities/particles.js"
import { grantXP } from "../entities/frog.js"
import { maybeDropRelic, spawnEnemyDrops } from "../entities/treasures.js"
import { spawnHazard } from "../entities/projectiles.js"
import { setBanner } from "../ui/banners.js"
import { playerConfig } from "../config/player_config.js"
import { enemyStats } from "../config/game_config.js"

const STRONG_ENEMY_TYPES = new Set(["tank", "guard", "summoner", "sniper", "herald", "spore"])

export function applyPoisonStatus(entity, duration = playerConfig.poisonDuration){
    if(!entity) return
    entity.poisonTimer = Math.max(entity.poisonTimer || 0, duration + skillTree.poison.duration * 45)
    entity.poisonTick = Math.max(entity.poisonTick || 0, 18)
}

export function damageFrog(amount){
    if(gameState !== "playing" || frog.invuln > 0){
        return false
    }

    const baseDamage = Math.max(0, Math.round(Number(amount) || 0))
    const mitigatedDamage = Math.max(1, Math.round(baseDamage * (100 / (100 + Math.max(0, frog.defense || 0)))))
    frog.hp -= mitigatedDamage
    frog.invuln = 60
    spawnHitParticles(frog.x, frog.y, "#ff8a9e", 10)
    if(frog.hp <= 0){
        frog.hp = 0
        setGameState("gameover")
    }
    return true
}

export function applyDamageToEnemy(enemy, amount){
    if(!enemy || enemy.defeated) return false
    if(!Number.isFinite(amount) || amount <= 0) return false
    const armor = Math.max(0, enemy.armor || 0)
    const effectiveDamage = Math.max(1, Math.round(amount * (100 / (100 + armor))))
    spawnDamageNumber(enemy.x, enemy.y - enemy.size, effectiveDamage, enemy.elite ? "#ffd979" : "#fff4d8")
    enemy.hp = (enemy.hp || 1) - effectiveDamage
    spawnHitParticles(enemy.x, enemy.y, enemy.hp <= 0 ? "#c46a31" : "#d9894e", enemy.hp <= 0 ? 8 : 4)
    if(enemy.hp <= 0){
        enemy.hp = 0
        enemy.defeated = true
        const wasPoisoned = (enemy.poisonTimer || 0) > 0
        replaceCollection(ants, ants.filter(ant => ant !== enemy))
        const baseXp = enemyStats[enemy.type]?.xpReward || (enemy.type === "ant" ? 2 : enemy.type === "beetle" ? 4 : 5)
        const xpFloor = STRONG_ENEMY_TYPES.has(enemy.type) ? 10 : 5
        const totalXp = Math.max(xpFloor, baseXp + (enemy.elite ? 6 : 0))
        spawnEnemyDrops(enemy.x, enemy.y, totalXp, {
            orbCount: totalXp >= 14 || enemy.elite ? 2 : 1,
            healChance: enemy.elite ? 0.24 : enemy.type === "tank" ? 0.16 : 0.08,
            healAmount: enemy.elite ? 48 : 28
        })
        frog.score += 1
        if(skillTree.poison.explosion > 0 && wasPoisoned){
            spawnHitParticles(enemy.x, enemy.y, "#9ce57b", 10)
            for(const other of ants.slice()){
                if(other !== enemy && !other.defeated && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 78){
                    applyPoisonStatus(other, 150)
                    applyDamageToEnemy(other, skillTree.poison.explosion)
                }
            }
        }
        if(skillTree.poison.pool > 0 && wasPoisoned){
            spawnHazard(enemy.x, enemy.y, {
                radius:34 + skillTree.poison.pool * 5,
                life:180 + skillTree.poison.pool * 24,
                color:"rgba(134,199,88,0.2)",
                ring:"rgba(209,242,148,0.3)"
            })
        }
        if(enemy.elite){
            spawnHitParticles(enemy.x, enemy.y, "#ffd979", 12)
            maybeDropRelic("elite")
        }
        return true
    }
    return false
}

export function applyDamageToPlant(plant, amount){
    if(!plant || plant.destroyed) return false
    if(!Number.isFinite(amount) || amount <= 0) return false
    spawnDamageNumber(plant.x, plant.y - plant.size, amount, "#d9ffd4")
    plant.hp -= amount
    spawnHitParticles(plant.x, plant.y - 8, plant.hp <= 0 ? "#9ce16d" : "#c5ef8f", plant.hp <= 0 ? 10 : 5)
    if(plant.hp <= 0){
        plant.hp = 0
        plant.destroyed = true
        replaceCollection(plants, plants.filter(entry => entry !== plant))
        spawnEnemyDrops(plant.x, plant.y, plant.role === "nestCore" ? 12 : 6, {
            orbCount: plant.role === "nestCore" ? 2 : 1,
            healChance: plant.role === "nestCore" ? 0.2 : 0.06,
            healAmount: plant.role === "nestCore" ? 40 : 24
        })
        frog.score += 1
        if(plant.role === "nestCore"){
            replaceCollection(hazards, hazards.filter(hazard => Math.hypot(hazard.x - plant.x, hazard.y - plant.y) > 180))
            maybeDropRelic("cleanse")
            setBanner("污染花巢已清除", 120)
            spawnHitParticles(plant.x, plant.y - 12, "#d9ff96", 16)
        }
        return true
    }
    return false
}

export function applyDamageToBoss(amount){
    const boss = bossState.entity
    if(!bossState.active || !boss){
        return
    }

    spawnDamageNumber(boss.x, boss.y - boss.size, amount, "#ffd1a0")
    boss.hp -= amount
    spawnHitParticles(boss.x, boss.y, boss.hp <= 0 ? "#ffcb78" : "#ef9d4e", boss.hp <= 0 ? 14 : 7)
    if(boss.hp <= 0){
        bossState.active = false
        bossState.defeated = true
        bossState.entity = null
        replaceCollection(projectiles, [])
        grantXP(20)
        frog.score += 1
        maybeDropRelic("boss")
        setBanner("蚁后已被击败", 170)
        setGameState("victory")
    }
}
