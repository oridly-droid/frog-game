/**
 * This module owns standard enemy creation, AI updates, and rendering.
 * It is responsible for non-boss enemy behavior and does not drive global encounter progression.
 */


import { enemyStats, maxActiveEnemies } from "../config/game_config.js"
import {
    ctx,
    camera,
    world,
    terrain,
    frog,
    ants,
    waveState,
    bossState,
    combatStats,
    skillTree,
    upgradeState,
    gameState,
} from "../core/state.js"
import { clamp, lerp, rangeLerp, roundedRectPath, getClosestPointOnSegment, mulberry32 } from "../core/utils.js"
import { isWalkablePoint, resolveRockCollisions } from "../world/collisions.js"
import { damageFrog, applyDamageToEnemy, applyPoisonStatus } from "../systems/combat.js"
import { spawnHitParticles } from "./particles.js"
import { fireProjectile } from "./projectiles.js"

export function getEnemyScale(){
    return 1 + waveState.current * 0.15 + Math.max(0, frog.level - 1) * 0.05
}

export function getEnemyDisplayName(type){
    if(type === "ant") return "蚂蚁"
    if(type === "melee") return "近战虫"
    if(type === "beetle") return "甲虫"
    if(type === "charger") return "冲锋虫"
    if(type === "ranged") return "远程虫"
    if(type === "summoner") return "育巢虫"
    if(type === "sniper") return "针刺虫"
    if(type === "spore") return "孢团虫"
    if(type === "herald") return "鸣壳虫"
    if(type === "guard") return "护壳虫"
    if(type === "tank") return "重甲虫"
    if(type === "boss") return bossState.name
    return "敌虫"
}

export function createEnemy(type, x, y, rng, overrides = {}){
    const stats = enemyStats[type]
    const scale = type === "boss" ? 1 : getEnemyScale()
    const enemy = {
        type,
        x,
        y,
        vx:0,
        vy:0,
        size:stats.size + (rng ? rng() * 2 - 1 : 0),
        speed:stats.speed,
        phase:rng ? rng() * Math.PI * 2 : Math.random() * Math.PI * 2,
        attackTimer:0,
        fireCooldown:0,
        chargeCooldown:0,
        dashTimer:0,
        dashVX:0,
        dashVY:0,
        stuckTimer:0,
        stuckProbeTimer:0,
        lastCheckX:x,
        lastCheckY:y,
        safeX:x,
        safeY:y,
        poisonTimer:0,
        poisonTick:0,
        supportTimer:0,
        defeated:false,
        hp:stats.maxHp || 1,
        maxHp:stats.maxHp || 1,
        armor:stats.armor || 0,
        powerMultiplier:1,
        terrainType:"grass",
        elite:false,
        name:getEnemyDisplayName(type)
    }

    if(type !== "boss"){
        enemy.hp = Math.max(1, Math.round(enemy.hp * scale))
        enemy.maxHp = enemy.hp
        enemy.speed *= 1 + waveState.current * 0.03 + Math.max(0, frog.level - 1) * 0.01
    }

    if(type === "beetle" || type === "ranged"){
        const pair = stats.shootRate
        enemy.fireCooldown = Math.floor(rangeLerp(pair[0], pair[1], rng ? rng() : Math.random()))
    }

    if(type === "charger"){
        const pair = stats.dashRate
        enemy.chargeCooldown = Math.floor(rangeLerp(pair[0], pair[1], rng ? rng() : Math.random()))
    }

    if(type === "summoner"){
        const pair = stats.summonRate
        enemy.summonCooldown = Math.floor(rangeLerp(pair[0], pair[1], rng ? rng() : Math.random()))
    }

    if(type === "sniper" || type === "spore"){
        const pair = stats.shootRate
        enemy.fireCooldown = Math.floor(rangeLerp(pair[0], pair[1], rng ? rng() : Math.random()))
    }

    if(type === "boss"){
        const shootPair = stats.shootRate
        const dashPair = stats.dashRate
        enemy.fireCooldown = Math.floor(rangeLerp(shootPair[0], shootPair[1], rng ? rng() : Math.random()))
        enemy.chargeCooldown = Math.floor(rangeLerp(dashPair[0], dashPair[1], rng ? rng() : Math.random()))
    }

    Object.assign(enemy, overrides)

    if(type !== "boss" && overrides.elite === undefined){
        const eliteChance = 0.1 + Math.min(0.05, waveState.current * 0.01)
        if((rng ? rng() : Math.random()) < eliteChance){
            enemy.elite = true
            enemy.size += 4
            enemy.speed *= 1.08
            enemy.hp = Math.ceil(enemy.hp * 1.8)
            enemy.maxHp = enemy.hp
            enemy.armor = Math.round((enemy.armor || 0) * 1.12)
            enemy.name = `精英${getEnemyDisplayName(type)}`
        }
    }

    if(!enemy.maxHp){
        enemy.maxHp = enemy.hp
    }

    return enemy
}

function spawnSummonedAnt(enemy){
    if(ants.length >= maxActiveEnemies + 8){
        return
    }

    const seed = (((enemy.x * 173) ^ (enemy.y * 211) ^ ((enemy.phase * 1000) | 0) ^ 0x51AA) >>> 0)
    const rng = mulberry32(seed)

    for(let attempt = 0; attempt < 16; attempt++){
        const angle = rng() * Math.PI * 2
        const dist = 30 + rng() * 36
        const x = enemy.x + Math.cos(angle) * dist
        const y = enemy.y + Math.sin(angle) * dist
        if(!isWalkablePoint(x, y, enemyStats.ant.size + 10)) continue
        if(Math.hypot(x - frog.x, y - frog.y) < 90) continue
        ants.push(createEnemy("ant", x, y, rng, {
            hp:1,
            maxHp:1,
            size:enemyStats.ant.size - 1,
            speed:enemyStats.ant.speed + 0.06,
            name:"干扰小蚁"
        }))
        spawnHitParticles(x, y, "#d7df84", 5)
        return
    }
}

export function spawnEliteGuardian(x, y, seed){
    const rng = mulberry32(seed >>> 0)
    const type = rng() < 0.5 ? "charger" : "beetle"
    for(let attempt = 0; attempt < 40; attempt++){
        const angle = rng() * Math.PI * 2
        const dist = 40 + rng() * 60
        const px = x + Math.cos(angle) * dist
        const py = y + Math.sin(angle) * dist
        if(!isWalkablePoint(px, py, enemyStats[type].size + 12)) continue
        ants.push(createEnemy(type, px, py, rng, {
            hp:3,
            maxHp:3,
            elite:true,
            size:enemyStats[type].size + 4,
            speed:enemyStats[type].speed + 0.12,
            name:"精英守卫"
        }))
        return
    }

    ants.push(createEnemy(type, x, y, rng, {
        hp:3,
        maxHp:3,
        elite:true,
        size:enemyStats[type].size + 4,
        speed:enemyStats[type].speed + 0.12,
        name:"精英守卫"
    }))
}

const CODEX_ENEMY_ART = {
    ant:{accent:"#ffcc7a", shell:"#7d4e2b", glow:"rgba(255,205,128,0.18)", leg:"#341d14"},
    melee:{accent:"#d8f08c", shell:"#6f8d38", glow:"rgba(196,244,120,0.18)", leg:"#263118"},
    ranged:{accent:"#ffd49b", shell:"#a9784f", glow:"rgba(255,204,143,0.18)", leg:"#3a251b"},
    beetle:{accent:"#bba1ff", shell:"#725fb2", glow:"rgba(196,154,255,0.2)", leg:"#281c3b"},
    charger:{accent:"#ffc06f", shell:"#9b6338", glow:"rgba(255,174,96,0.2)", leg:"#352012"},
    summoner:{accent:"#e2f5a3", shell:"#759a3e", glow:"rgba(211,250,150,0.2)", leg:"#2b351a"},
    sniper:{accent:"#ffd8bd", shell:"#8d526a", glow:"rgba(255,184,204,0.18)", leg:"#3c202b"},
    spore:{accent:"#d9ff9c", shell:"#7caf4e", glow:"rgba(192,255,132,0.2)", leg:"#26391a"},
    herald:{accent:"#e7f0ff", shell:"#6b789f", glow:"rgba(197,219,255,0.22)", leg:"#222b41"},
    guard:{accent:"#f4d6a6", shell:"#9b7e52", glow:"rgba(237,202,145,0.18)", leg:"#332819"},
    tank:{accent:"#f2f6ee", shell:"#778580", glow:"rgba(213,230,220,0.18)", leg:"#27302f"},
    boss:{accent:"#ffd88a", shell:"#87563a", glow:"rgba(255,198,111,0.24)", leg:"#341b14"},
}

function getCodexEnemyArt(type){
    return CODEX_ENEMY_ART[type] || CODEX_ENEMY_ART.ant
}

function drawCodexEnemyDetails(ant, s){
    const art = getCodexEnemyArt(ant.type)

    ctx.save()
    ctx.globalAlpha = 0.92
    ctx.strokeStyle = art.accent
    ctx.lineWidth = Math.max(1.1, s * 0.08)
    ctx.lineCap = "round"
    for(const offset of [-0.24, 0.02, 0.28]){
        ctx.beginPath()
        ctx.moveTo(-s * 0.34, offset * s)
        ctx.quadraticCurveTo(0, offset * s - s * 0.12, s * 0.34, offset * s)
        ctx.stroke()
    }

    ctx.fillStyle = art.accent
    ctx.beginPath()
    ctx.arc(-s * 0.16, -s * 0.22, s * 0.075, 0, Math.PI * 2)
    ctx.arc(s * 0.16, -s * 0.22, s * 0.075, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "rgba(255,255,255,0.2)"
    ctx.beginPath()
    ctx.ellipse(-s * 0.18, -s * 0.38, s * 0.2, s * 0.08, -0.32, 0, Math.PI * 2)
    ctx.fill()

    if(ant.type === "beetle" || ant.type === "tank" || ant.type === "guard"){
        ctx.strokeStyle = "rgba(246,248,224,0.34)"
        ctx.lineWidth = Math.max(1, s * 0.055)
        ctx.beginPath()
        ctx.moveTo(-s * 0.42, -s * 0.08)
        ctx.lineTo(s * 0.42, -s * 0.08)
        ctx.moveTo(-s * 0.32, s * 0.16)
        ctx.lineTo(s * 0.32, s * 0.16)
        ctx.stroke()
    }

    if(ant.type === "spore" || ant.type === "summoner"){
        ctx.fillStyle = "rgba(224,255,170,0.28)"
        for(const offset of [-0.32, 0.32]){
            ctx.beginPath()
            ctx.arc(offset * s, s * 0.08, s * 0.16, 0, Math.PI * 2)
            ctx.fill()
        }
    }

    ctx.restore()
}

export function drawAnt(ant){
    const wiggle = Math.sin(ant.phase) * 0.18
    const angle = Math.atan2(ant.vy || 0.001, ant.vx || 1) + wiggle
    const s = ant.size
    const screenX = ant.x - camera.x
    const screenY = ant.y - camera.y
    const art = getCodexEnemyArt(ant.type)

    if(ant.elite){
        ctx.save()
        ctx.globalAlpha = 0.32 + Math.sin(ant.phase * 2) * 0.06
        ctx.fillStyle = art.glow
        ctx.beginPath()
        ctx.arc(screenX, screenY, s * 1.25, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    ctx.save()
    ctx.translate(screenX, screenY)
    ctx.rotate(angle)

    ctx.fillStyle = "rgba(0,0,0,0.2)"
    ctx.beginPath()
    ctx.ellipse(0, s * 0.9, s * 0.95, s * 0.35, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = art.leg
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    for(const side of [-1, 1]){
        for(const offset of [-0.45, 0, 0.42]){
            ctx.beginPath()
            ctx.moveTo(side * s * 0.2, offset * s * 0.9)
            ctx.quadraticCurveTo(side * s * 0.65, offset * s * 0.95 + side * 2, side * s * 1.05, offset * s * 0.7 + side * 4)
            ctx.stroke()
        }
    }

    if(ant.type === "melee"){
        ctx.fillStyle = "#2f341a"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.18, s * 0.42, s * 0.32, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#5d7a2f"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.18, s * 0.46, s * 0.36, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#d3e28d"
        ctx.beginPath()
        ctx.arc(-s * 0.12, -s * 0.16, s * 0.1, 0, Math.PI * 2)
        ctx.arc(s * 0.12, -s * 0.16, s * 0.1, 0, Math.PI * 2)
        ctx.fill()
    }else if(ant.type === "ranged"){
        ctx.fillStyle = "#3e2f24"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.2, s * 0.42, s * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#896447"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.16, s * 0.48, s * 0.34, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#f4d6a5"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(s * 0.08, -s * 0.22)
        ctx.lineTo(s * 0.74, -s * 0.38)
        ctx.stroke()

        ctx.fillStyle = "rgba(255,244,206,0.52)"
        ctx.beginPath()
        ctx.arc(-s * 0.1, -s * 0.22, s * 0.08, 0, Math.PI * 2)
        ctx.fill()
    }else if(ant.type === "tank"){
        ctx.fillStyle = "#2f3736"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.22, s * 0.56, s * 0.4, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#687776"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.1, s * 0.62, s * 0.44, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#dfe7e2"
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.moveTo(-s * 0.34, -s * 0.24)
        ctx.lineTo(s * 0.34, -s * 0.24)
        ctx.stroke()

        ctx.fillStyle = "rgba(255,255,255,0.14)"
        ctx.beginPath()
        ctx.ellipse(-s * 0.2, -s * 0.24, s * 0.15, s * 0.08, -0.25, 0, Math.PI * 2)
        ctx.fill()
    }else if(ant.type === "beetle"){
        ctx.fillStyle = "#3e2f55"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.22, s * 0.48, s * 0.42, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#6b57a1"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.16, s * 0.5, s * 0.4, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#8a78c3"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.18, s * 0.22, s * 0.12, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#251b34"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.62, s * 0.32, s * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
    }else if(ant.type === "summoner"){
        ctx.fillStyle = "#394521"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.16, s * 0.46, s * 0.34, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#5f7f34"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.18, s * 0.48, s * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#cfe38e"
        for(const offset of [-0.26, 0, 0.26]){
            ctx.beginPath()
            ctx.arc(offset * s, -s * 0.08, s * 0.11, 0, Math.PI * 2)
            ctx.fill()
        }
    }else if(ant.type === "sniper"){
        ctx.fillStyle = "#3f2530"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.2, s * 0.42, s * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#71435a"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.16, s * 0.46, s * 0.34, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#f1dcb2"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(s * 0.12, -s * 0.18)
        ctx.lineTo(s * 0.72, -s * 0.36)
        ctx.stroke()
    }else if(ant.type === "spore"){
        ctx.fillStyle = "#3a4d22"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.22, s * 0.46, s * 0.34, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#6f9a45"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.14, s * 0.5, s * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "rgba(214,246,169,0.82)"
        for(const offset of [-0.22, 0.02, 0.26]){
            ctx.beginPath()
            ctx.arc(offset * s, -s * 0.2, s * 0.1, 0, Math.PI * 2)
            ctx.fill()
        }
    }else if(ant.type === "herald"){
        ctx.fillStyle = "#2e3549"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.18, s * 0.44, s * 0.32, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#596585"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.14, s * 0.52, s * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#dbe4f7"
        for(const offset of [-0.22, 0, 0.22]){
            ctx.beginPath()
            ctx.arc(offset * s, -s * 0.1, s * 0.08, 0, Math.PI * 2)
            ctx.fill()
        }

        ctx.strokeStyle = "rgba(207,224,255,0.72)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, -s * 0.12, s * 0.68, -0.42, Math.PI + 0.42)
        ctx.stroke()
    }else if(ant.type === "guard"){
        ctx.fillStyle = "#3d3425"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.18, s * 0.54, s * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#8b7049"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.14, s * 0.58, s * 0.42, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#f0d3a1"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-s * 0.24, -s * 0.32)
        ctx.lineTo(s * 0.24, -s * 0.32)
        ctx.stroke()
    }else if(ant.type === "charger"){
        ctx.fillStyle = "#3a2a1b"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.18, s * 0.42, s * 0.32, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#78533a"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.18, s * 0.45, s * 0.35, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#a06c42"
        ctx.beginPath()
        ctx.arc(-s * 0.16, -s * 0.12, s * 0.16, 0, Math.PI * 2)
        ctx.arc(s * 0.16, -s * 0.12, s * 0.16, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#2f1b14"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-s * 0.2, -s * 0.46)
        ctx.lineTo(-s * 0.48, -s * 0.86)
        ctx.moveTo(s * 0.2, -s * 0.46)
        ctx.lineTo(s * 0.48, -s * 0.86)
        ctx.stroke()
    }else{
        ctx.fillStyle = "#4a2618"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.15, s * 0.34, s * 0.28, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#6e3620"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.22, s * 0.4, s * 0.32, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#7e4025"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.52, s * 0.48, s * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "rgba(255,255,255,0.16)"
        ctx.beginPath()
        ctx.ellipse(-s * 0.12, -s * 0.32, s * 0.12, s * 0.06, -0.3, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#2f1b14"
        ctx.lineWidth = 1.8
        for(const side of [-1, 1]){
            ctx.beginPath()
            ctx.moveTo(side * s * 0.12, -s * 0.44)
            ctx.quadraticCurveTo(side * s * 0.3, -s * 0.78, side * s * 0.1, -s * 1.02)
            ctx.stroke()
        }
    }

    drawCodexEnemyDetails(ant, s)

    if(ant.type === "herald" || ant.supportTimer > 0){
        ctx.strokeStyle = ant.type === "herald" ? "rgba(197,219,255,0.48)" : "rgba(187,229,255,0.28)"
        ctx.lineWidth = ant.type === "herald" ? 2.2 : 1.8
        ctx.beginPath()
        ctx.arc(0, s * 0.04, s * (ant.type === "herald" ? 1.02 : 0.9), 0, Math.PI * 2)
        ctx.stroke()
    }

    ctx.restore()
}

export function drawAnts(){
    for(const ant of ants){
        drawAnt(ant)

        if(ant.elite || (ant.maxHp || 1) > 1){
            const x = ant.x - camera.x
            const y = ant.y - camera.y - ant.size - 10
            const width = 28

            ctx.fillStyle = "rgba(10,18,9,0.6)"
            roundedRectPath(ctx, x - width * 0.5 - 2, y - 5, width + 4, 10, 5)
            ctx.fill()

            ctx.fillStyle = ant.elite ? "#ffdc7c" : "#bde57b"
            roundedRectPath(ctx, x - width * 0.5, y - 3, width * clamp((ant.hp || 1) / Math.max(1, ant.maxHp || 1), 0, 1), 6, 3)
            ctx.fill()
        }
    }
}

export function updateAnts(){
    if(gameState !== "playing" || upgradeState.active) return

    for(const ant of ants.slice()){
        ant.phase += 0.22
        ant.supportTimer = Math.max(0, (ant.supportTimer || 0) - 1)

        let supportBoost = 0
        if(ant.type !== "herald"){
            for(const other of ants){
                if(other === ant || other.type !== "herald") continue
                if(Math.hypot(other.x - ant.x, other.y - ant.y) < 170){
                    supportBoost = 1
                    ant.supportTimer = 12
                    break
                }
            }
        }

        const cooldownStep = supportBoost > 0 ? 1.3 : 1
        ant.attackTimer = Math.max(0, ant.attackTimer - cooldownStep)

        if(ant.poisonTimer > 0){
            ant.poisonTimer -= 1
            ant.poisonTick -= 1
            if(ant.poisonTimer % 20 === 0){
                spawnHitParticles(ant.x + (Math.random() - 0.5) * 6, ant.y + (Math.random() - 0.5) * 6, "#84df69", 2)
            }
            if(ant.poisonTick <= 0){
                ant.poisonTick = combatStats.poisonInterval
                applyDamageToEnemy(ant, combatStats.poisonDamage)
                if(!ants.includes(ant)){
                    if(skillTree.poison.spread > 0){
                        for(const other of ants){
                            if(other !== ant && Math.hypot(other.x - ant.x, other.y - ant.y) < 68){
                                applyPoisonStatus(other, 150)
                            }
                        }
                    }
                    continue
                }
            }
        }

        let steerX = frog.x - ant.x
        let steerY = frog.y - ant.y
        const frogDist = Math.hypot(steerX, steerY) || 1
        const powerMultiplier = ant.powerMultiplier || 1
        steerX /= frogDist
        steerY /= frogDist

        for(const rock of terrain.rocks || []){
            const dx = ant.x - rock.x
            const dy = ant.y - rock.y
            const dist = Math.hypot(dx, dy) || 1
            const avoidRange = rock.r + ant.size + 24
            if(dist < avoidRange){
                const force = (avoidRange - dist) / avoidRange
                steerX += dx / dist * force * 1.8
                steerY += dy / dist * force * 1.8
            }
        }

        for(const barrier of terrain.barriers || []){
            const point = getClosestPointOnSegment(ant.x, ant.y, barrier.x1, barrier.y1, barrier.x2, barrier.y2)
            const dx = ant.x - point.x
            const dy = ant.y - point.y
            const dist = Math.hypot(dx, dy) || 1
            const avoidRange = barrier.radius + ant.size + 18
            if(dist < avoidRange){
                const force = (avoidRange - dist) / avoidRange
                steerX += dx / dist * force * 1.85
                steerY += dy / dist * force * 1.85
            }
        }

        for(const other of ants){
            if(other === ant) continue
            const dx = ant.x - other.x
            const dy = ant.y - other.y
            const dist = Math.hypot(dx, dy) || 1
            if(dist < ant.size * 2.8){
                steerX += dx / dist * 0.4
                steerY += dy / dist * 0.4
            }
        }

        if(ant.type === "beetle"){
            if(frogDist < 180){
                steerX -= (frog.x - ant.x) / frogDist * 1.3
                steerY -= (frog.y - ant.y) / frogDist * 1.3
            }else if(frogDist > 300){
                steerX += (frog.x - ant.x) / frogDist * 0.4
                steerY += (frog.y - ant.y) / frogDist * 0.4
            }
        }else if(ant.type === "ranged"){
            if(frogDist < 220){
                steerX -= (frog.x - ant.x) / frogDist * 1.5
                steerY -= (frog.y - ant.y) / frogDist * 1.5
            }else if(frogDist > 360){
                steerX += (frog.x - ant.x) / frogDist * 0.55
                steerY += (frog.y - ant.y) / frogDist * 0.55
            }else{
                steerX += Math.cos(ant.phase * 0.9) * 0.28
                steerY += Math.sin(ant.phase * 0.9) * 0.28
            }
        }else if(ant.type === "sniper"){
            if(frogDist < 220){
                steerX -= (frog.x - ant.x) / frogDist * 1.8
                steerY -= (frog.y - ant.y) / frogDist * 1.8
            }else if(frogDist > 360){
                steerX += (frog.x - ant.x) / frogDist * 0.62
                steerY += (frog.y - ant.y) / frogDist * 0.62
            }else{
                steerX += Math.cos(ant.phase) * 0.35
                steerY += Math.sin(ant.phase) * 0.35
            }
        }else if(ant.type === "spore"){
            if(frogDist < 170){
                steerX -= (frog.x - ant.x) / frogDist * 1.15
                steerY -= (frog.y - ant.y) / frogDist * 1.15
            }else if(frogDist > 280){
                steerX += (frog.x - ant.x) / frogDist * 0.3
                steerY += (frog.y - ant.y) / frogDist * 0.3
            }
        }else if(ant.type === "herald"){
            if(frogDist < 180){
                steerX -= (frog.x - ant.x) / frogDist * 1.55
                steerY -= (frog.y - ant.y) / frogDist * 1.55
            }else if(frogDist > 280){
                steerX += (frog.x - ant.x) / frogDist * 0.48
                steerY += (frog.y - ant.y) / frogDist * 0.48
            }else{
                steerX += Math.cos(ant.phase * 0.85) * 0.55
                steerY += Math.sin(ant.phase * 0.85) * 0.55
            }
        }else if(ant.type === "guard"){
            if(frogDist > 120){
                steerX += (frog.x - ant.x) / frogDist * 0.3
                steerY += (frog.y - ant.y) / frogDist * 0.3
            }
        }else if(ant.type === "tank"){
            if(frogDist > 90){
                steerX += (frog.x - ant.x) / frogDist * 0.5
                steerY += (frog.y - ant.y) / frogDist * 0.5
            }
        }

        if(ant.type === "charger"){
            ant.chargeCooldown = Math.max(0, ant.chargeCooldown - 1)
            if(ant.dashTimer <= 0 && ant.chargeCooldown <= 0 && frogDist < 260){
                ant.dashTimer = enemyStats.charger.dashFrames
                ant.dashVX = steerX * enemyStats.charger.dashSpeed
                ant.dashVY = steerY * enemyStats.charger.dashSpeed
                ant.chargeCooldown = Math.floor(rangeLerp(enemyStats.charger.dashRate[0], enemyStats.charger.dashRate[1], (Math.sin(ant.phase) + 1) * 0.5))
                spawnHitParticles(ant.x, ant.y, "#d2a072", 6)
            }
        }

        const length = Math.hypot(steerX, steerY) || 1
        steerX /= length
        steerY /= length
        const speedScale = 1 + supportBoost * 0.18

        if(ant.dashTimer > 0){
            ant.dashTimer -= 1
            ant.vx = lerp(ant.vx, ant.dashVX, 0.28)
            ant.vy = lerp(ant.vy, ant.dashVY, 0.28)
        }else{
            ant.vx = lerp(ant.vx, steerX * ant.speed * speedScale, ant.type === "beetle" || ant.type === "ranged" ? 0.06 : ant.type === "tank" ? 0.05 : 0.08)
            ant.vy = lerp(ant.vy, steerY * ant.speed * speedScale, ant.type === "beetle" || ant.type === "ranged" ? 0.06 : ant.type === "tank" ? 0.05 : 0.08)
        }
        ant.x += ant.vx
        ant.y += ant.vy

        resolveRockCollisions(ant, ant.size * 0.75)
        ant.x = clamp(ant.x, ant.size, world.width - ant.size)
        ant.y = clamp(ant.y, ant.size, world.height - ant.size)

        if(ant.type === "beetle"){
            ant.fireCooldown = Math.max(0, ant.fireCooldown - cooldownStep)
            if(ant.fireCooldown <= 0 && frogDist < 440){
                fireProjectile(ant, (frog.x - ant.x) / frogDist, (frog.y - ant.y) / frogDist)
                ant.fireCooldown = Math.floor(rangeLerp(enemyStats.beetle.shootRate[0], enemyStats.beetle.shootRate[1], (Math.sin(ant.phase * 0.7) + 1) * 0.5))
            }
        }else if(ant.type === "ranged"){
            ant.fireCooldown = Math.max(0, ant.fireCooldown - cooldownStep)
            if(ant.fireCooldown <= 0 && frogDist < 520){
                fireProjectile(ant, (frog.x - ant.x) / frogDist, (frog.y - ant.y) / frogDist, {
                    speed:enemyStats.ranged.projectileSpeed,
                    radius:6,
                    life:220,
                    color:"#f1c589",
                    outer:"#71482a",
                    owner:"ranged",
                    damage:Math.max(1, Math.round(3 * powerMultiplier))
                })
                ant.fireCooldown = Math.floor(rangeLerp(enemyStats.ranged.shootRate[0], enemyStats.ranged.shootRate[1], (Math.sin(ant.phase * 0.6) + 1) * 0.5))
            }
        }else if(ant.type === "summoner"){
            ant.summonCooldown = Math.max(0, (ant.summonCooldown || 0) - cooldownStep)
            if(ant.summonCooldown <= 0){
                spawnSummonedAnt(ant)
                ant.summonCooldown = Math.floor(rangeLerp(enemyStats.summoner.summonRate[0], enemyStats.summoner.summonRate[1], (Math.sin(ant.phase * 0.5) + 1) * 0.5))
            }
        }else if(ant.type === "sniper"){
            ant.fireCooldown = Math.max(0, ant.fireCooldown - cooldownStep)
            if(ant.fireCooldown <= 0 && frogDist < 560){
                fireProjectile(ant, (frog.x - ant.x) / frogDist, (frog.y - ant.y) / frogDist, {
                    speed:2.7,
                    radius:6,
                    life:250,
                    color:"#f1d6ab",
                    outer:"#623444",
                    owner:"sniper",
                    damage:Math.max(1, Math.round(4 * powerMultiplier))
                })
                ant.fireCooldown = Math.floor(rangeLerp(enemyStats.sniper.shootRate[0], enemyStats.sniper.shootRate[1], (Math.sin(ant.phase * 0.4) + 1) * 0.5))
            }
        }else if(ant.type === "spore"){
            ant.fireCooldown = Math.max(0, ant.fireCooldown - cooldownStep)
            if(ant.fireCooldown <= 0 && frogDist < 460){
                fireProjectile(ant, (frog.x - ant.x) / frogDist, (frog.y - ant.y) / frogDist, {
                    speed:1.18,
                    radius:8,
                    life:180,
                    color:"#b8e17a",
                    outer:"#456529",
                    owner:"spore",
                    damage:Math.max(1, Math.round(3 * powerMultiplier))
                })
                ant.fireCooldown = Math.floor(rangeLerp(enemyStats.spore.shootRate[0], enemyStats.spore.shootRate[1], (Math.sin(ant.phase * 0.45) + 1) * 0.5))
            }
        }else if(ant.type === "herald" && Math.sin(ant.phase * 0.6) > 0.97){
            spawnHitParticles(ant.x, ant.y - ant.size * 0.4, "#d8e8ff", 1)
        }

        if(frogDist < frog.radius + ant.size * enemyStats[ant.type].contactRadius && ant.attackTimer <= 0){
            damageFrog(Math.max(1, Math.round((enemyStats[ant.type].contactDamage || 1) * powerMultiplier)))
            ant.attackTimer = 18
        }
    }
}
