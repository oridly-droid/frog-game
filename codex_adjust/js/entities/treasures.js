/**
 * This module owns relics, treasure chest placement, world drops, pickup, and rendering.
 * It is responsible for treasure/drop state and does not decide encounter event outcomes by itself.
 */


import { zoneNames, treasureGoal } from "../config/game_config.js"
import {
    ctx,
    camera,
    world,
    terrain,
    frog,
    treasures,
    eventPoints,
    waveState,
    gameState,
    relicLibrary,
    combatStats,
    skillTree,
    frogAbilities,
    hazards,
    replaceCollection,
} from "../core/state.js"
import { mulberry32, getRandomRange, roundedRectPath } from "../core/utils.js"
import { findPlacementInRegion, isReachablePoint } from "../world/zones.js"
import { isWalkablePoint } from "../world/collisions.js"
import { grantXP, getFrogPickupSensor } from "./frog.js"
import { spawnHitParticles } from "./particles.js"
import { applyRandomUpgradeWithPreference } from "../systems/progression.js"
import { setBanner } from "../ui/banners.js"

let treasureEventHandler = null

function setPickupDebug(contactType = "", contactId = ""){
    if(contactType){
        frog.pickupContactType = contactType
        frog.pickupContactId = contactId
        frog.pickupContactTimer = 18
        return
    }
    if(frog.pickupContactTimer <= 0){
        frog.pickupContactType = ""
        frog.pickupContactId = ""
    }
}

const RELIC_PATH_POOLS = {
    tongue:["stone", "fang", "coil", "shard"],
    dash:["sigil", "trail", "vault"],
    poison:["charm", "gland", "blight", "reed"]
}

export function setTreasureEventHandler(handler){
    treasureEventHandler = handler
}

export function hasRelic(id){
    return frog.relics.includes(id)
}

export function gainRelic(id){
    if(hasRelic(id) || !relicLibrary[id]){
        return false
    }

    frog.relics.push(id)

    if(id === "crown"){
        grantXP(frog.xpToNext)
    }else if(id === "charm"){
        combatStats.poisonDamage += 1
        skillTree.poison.damage += 1
    }else if(id === "stone"){
        frog.tongueRange += 20
        skillTree.tongue.range += 1
    }else if(id === "boots"){
        frog.speed += 0.4
    }else if(id === "idol"){
        frog.maxHp += 1
        frog.hp = Math.min(frog.maxHp, frog.hp + 1)
    }else if(id === "fang"){
        skillTree.tongue.crit += 1
        skillTree.tongue.pierce += 1
    }else if(id === "sigil"){
        skillTree.dash.momentum += 1
        skillTree.dash.shockwave += 1
    }else if(id === "gland"){
        skillTree.poison.damage += 1
        skillTree.poison.pool += 1
    }else if(id === "coil"){
        skillTree.tongue.chain += 1
        skillTree.tongue.frenzy += 1
    }else if(id === "trail"){
        skillTree.dash.damage += 1
        skillTree.dash.range += 1
    }else if(id === "blight"){
        skillTree.poison.duration += 1
        skillTree.poison.explosion += 1
    }else if(id === "shard"){
        skillTree.tongue.doubleHit += 1
        skillTree.tongue.crit += 1
    }else if(id === "vault"){
        skillTree.dash.range += 1
        skillTree.dash.momentum += 1
    }else if(id === "reed"){
        skillTree.poison.spread += 1
        skillTree.poison.duration += 1
    }

    spawnHitParticles(frog.x, frog.y - 18, "#ffe88b", 16)
    spawnHitParticles(frog.x, frog.y - 18, "#8ee7ff", 8)
    setBanner(`获得${relicLibrary[id].label}`, 120)
    return true
}

export function gainPathRelic(path){
    const preferredPool = (RELIC_PATH_POOLS[path] || []).filter(id => !hasRelic(id) && relicLibrary[id])
    const fallbackPool = Object.keys(relicLibrary).filter(id => !hasRelic(id))
    const pool = preferredPool.length > 0 ? preferredPool : fallbackPool

    if(pool.length === 0){
        return null
    }

    const relicId = pool[Math.floor(Math.random() * pool.length)]
    return gainRelic(relicId) ? relicId : null
}

export function maybeDropRelic(source){
    const available = Object.keys(relicLibrary).filter(id => !hasRelic(id))
    if(available.length === 0){
        return
    }

    const chance =
        source === "boss" ? 1 :
        source === "treasure" ? 0.4 :
        source === "elite" ? 0.3 :
        source === "cache" ? 0.45 :
        source === "cleanse" ? 0.4 :
        0

    if(Math.random() > chance){
        return
    }

    const relicId = available[Math.floor(Math.random() * available.length)]
    gainRelic(relicId)
}

export function getTreasureCount(){
    let count = 0
    for(const treasure of treasures){
        if(treasure.kind === "treasure" && treasure.opened) count++
    }
    return count
}

function spawnDropOrb(kind, x, y, payload = {}){
    const angle = Math.random() * Math.PI * 2
    const launchSpeed = 0.8 + Math.random() * 1.2
    const driftY = -1.2 - Math.random() * 1.2
    const orb = {
        kind,
        x,
        y,
        baseY:y,
        radius: kind === "healOrb" ? 12 : 11,
        pulse:Math.random() * Math.PI * 2,
        vx:Math.cos(angle) * launchSpeed,
        vy:Math.sin(angle) * launchSpeed + driftY,
        bob:Math.random() * Math.PI * 2,
        spawnGrace:8,
        attractRadius: kind === "healOrb" ? 132 : 146,
        picked:false,
        ...payload
    }
    treasures.push(orb)
    return orb
}

export function spawnExpOrb(x, y, value = 6){
    if(!Number.isFinite(value) || value <= 0){
        return null
    }

    return spawnDropOrb("expOrb", x, y, {
        value:Math.max(1, Math.round(value))
    })
}

export function spawnEnemyDrops(x, y, xpValue = 6, options = {}){
    const totalXp = Math.max(1, Math.round(Number(xpValue) || 0))
    const orbCount = options.orbCount || (totalXp >= 14 ? 2 : 1)
    const baseValue = Math.floor(totalXp / orbCount)
    let remainingXp = totalXp

    for(let index = 0; index < orbCount; index++){
        const value = index === orbCount - 1 ? remainingXp : baseValue
        remainingXp -= value
        spawnExpOrb(
            x + (Math.random() - 0.5) * 12,
            y + (Math.random() - 0.5) * 8,
            value
        )
    }

    const healChance = options.healChance ?? 0
    if(healChance > 0 && Math.random() < healChance){
        spawnDropOrb("healOrb", x + (Math.random() - 0.5) * 10, y, {
            heal:options.healAmount || 32
        })
    }
}

function updateDropOrb(orb, pickupSensor){
    orb.pulse += 0.08
    orb.bob += 0.12
    orb.spawnGrace = Math.max(0, (orb.spawnGrace || 0) - 1)
    orb.vy += 0.03
    orb.vx *= 0.92
    orb.vy *= 0.92
    orb.x += orb.vx
    orb.y += orb.vy
    orb.baseY = orb.baseY * 0.9 + orb.y * 0.1

    const dx = pickupSensor.x - orb.x
    const dy = pickupSensor.y - orb.y
    const distance = Math.hypot(dx, dy) || 1
    if(distance < orb.attractRadius){
        const pull = 0.4 + (1 - distance / orb.attractRadius) * 1.8
        orb.x += dx / distance * pull
        orb.y += dy / distance * pull
    }

    if(orb.spawnGrace > 0){
        return
    }

    if(distance >= pickupSensor.radius + orb.radius){
        return
    }

    orb.picked = true
    if(orb.kind === "expOrb"){
        setPickupDebug("经验", `+${orb.value}`)
        grantXP(orb.value)
        spawnHitParticles(orb.x, orb.y - 4, "#9fe870", 8)
    }else if(orb.kind === "healOrb"){
        setPickupDebug("奖励", `回复${orb.heal}`)
        frog.hp = Math.min(frog.maxHp, frog.hp + orb.heal)
        spawnHitParticles(orb.x, orb.y - 4, "#9cecff", 8)
    }
}

export function buildTreasures(){
    const rng = mulberry32((((world.width * 17431) ^ (world.height * 9137) ^ 0xC0FFEE) >>> 0))
    const eventOrder = ["blessing", "ambush", "boss"]
    const baseWidth = terrain.layout?.baseWorldWidth || world.width
    const baseHeight = terrain.layout?.baseWorldHeight || world.height
    const sectors = [
        {key:"ruinA", ...terrain.zones.ruinA},
        {key:"causeway", ...terrain.zones.causeway},
        {key:"thicket", ...terrain.zones.thicket},
        {key:"pollutedNest", ...terrain.zones.pollutedNest},
        {key:"shallows", ...terrain.zones.shallows},
        {key:"bridgehead", ...terrain.zones.bridgehead},
        {key:"harbor", ...terrain.zones.harbor},
        {key:"tideflats", ...terrain.zones.tideflats},
        {key:"shrineWard", ...terrain.zones.shrineWard},
        {
            key:"westWilds",
            name:zoneNames.meadow,
            x1:baseWidth * 0.08,
            y1:baseHeight * 0.58,
            x2:baseWidth * 0.34,
            y2:baseHeight * 0.88
        },
        {key:"ruinB", ...terrain.zones.ruinB},
        {
            key:"eastMeadow",
            name:zoneNames.meadow,
            x1:baseWidth * 0.44,
            y1:baseHeight * 0.42,
            x2:baseWidth * 0.63,
            y2:baseHeight * 0.78
        }
    ]

    const placements = []
    replaceCollection(treasures, [])
    replaceCollection(eventPoints, [])
    const frontierKeys = new Set(["bridgehead", "harbor", "tideflats", "shrineWard"])
    const frontierSectors = sectors.filter(sector => frontierKeys.has(sector.key))
    const classicSectors = sectors.filter(sector => !frontierKeys.has(sector.key))
    const chosen = []

    if(frontierSectors.length > 0){
        chosen.push(frontierSectors[Math.floor(rng() * frontierSectors.length)])
    }

    const remainingPool = classicSectors
        .concat(frontierSectors.filter(sector => !chosen.includes(sector)))
        .map(sector => ({...sector, sort:rng()}))
        .sort((a, b) => a.sort - b.sort)

    for(const sector of remainingPool){
        if(chosen.length >= treasureGoal) break
        if(!chosen.some(entry => entry.key === sector.key)){
            chosen.push(sector)
        }
    }

    for(let i = 0; i < chosen.length; i++){
        const sector = chosen[i]
        const point = findPlacementInRegion(
            sector,
            26,
            620,
            placements.concat([
                {x:terrain.centerX, y:terrain.centerY},
                {x:frog.x, y:frog.y}
            ]),
            rng,
            180,
            true
        )
        if(!point) continue
        placements.push(point)
        treasures.push({
            kind:"treasure",
            x:point.x,
            y:point.y,
            radius:22,
            opened:false,
            pulse:rng() * Math.PI * 2,
            zoneName:sector.name,
            eventType:eventOrder[treasures.length],
            eventResolved:false
        })
    }

    let fallbackAttempts = 0
    while(treasures.length < treasureGoal && fallbackAttempts < 220){
        fallbackAttempts++
        const x = getRandomRange(rng, baseWidth * 0.08, world.width * 0.92)
        const y = getRandomRange(rng, baseHeight * 0.08, baseHeight * 0.92)
        if(!isWalkablePoint(x, y, 26)) continue
        if(!isReachablePoint(x, y)) continue
        if(Math.hypot(x - terrain.centerX, y - terrain.centerY) < 560) continue

        let tooClose = false
        for(const point of placements){
            if(Math.hypot(x - point.x, y - point.y) < 620){
                tooClose = true
                break
            }
        }
        if(tooClose) continue

        placements.push({x, y})
        treasures.push({
            kind:"treasure",
            x,
            y,
            radius:22,
            opened:false,
            pulse:rng() * Math.PI * 2,
            zoneName:zoneNames.meadow,
            eventType:eventOrder[treasures.length],
            eventResolved:false
        })
    }

    const hardFallbacks = [
        {x:baseWidth * 0.22, y:baseHeight * 0.22, zoneName:zoneNames.ruinA},
        {x:baseWidth * 0.8, y:baseHeight * 0.22, zoneName:zoneNames.thicket},
        {x:baseWidth * 0.78, y:baseHeight * 0.76, zoneName:zoneNames.ruinB},
        {x:baseWidth * 0.22, y:baseHeight * 0.76, zoneName:zoneNames.meadow},
        {x:baseWidth * 0.54, y:baseHeight * 0.82, zoneName:zoneNames.meadow},
        {x:(terrain.zones.harbor.x1 + terrain.zones.harbor.x2) * 0.5, y:(terrain.zones.harbor.y1 + terrain.zones.harbor.y2) * 0.5, zoneName:zoneNames.harbor}
    ]

    for(const candidate of hardFallbacks){
        if(treasures.length >= treasureGoal) break
        if(!isWalkablePoint(candidate.x, candidate.y, 26)) continue
        if(!isReachablePoint(candidate.x, candidate.y)) continue

        let tooClose = false
        for(const point of placements){
            if(Math.hypot(candidate.x - point.x, candidate.y - point.y) < 560){
                tooClose = true
                break
            }
        }
        if(tooClose) continue

        placements.push({x:candidate.x, y:candidate.y})
        treasures.push({
            kind:"treasure",
            x:candidate.x,
            y:candidate.y,
            radius:22,
            opened:false,
            pulse:rng() * Math.PI * 2,
            zoneName:candidate.zoneName,
            eventType:eventOrder[treasures.length],
            eventResolved:false
        })
    }

    const altarRegion = terrain.altarLandmark ? terrain.altarLandmark.eventRegion : terrain.zones.altar
    const altarPoint = findPlacementInRegion(
        altarRegion,
        28,
        260,
        placements.concat(treasures.map(treasure => ({x:treasure.x, y:treasure.y}))),
        rng,
        120,
        true
    )
    let finalAltarPoint = altarPoint
    if(!finalAltarPoint){
        const fallbackX = (altarRegion.x1 + altarRegion.x2) * 0.5
        const fallbackY = (altarRegion.y1 + altarRegion.y2) * 0.5
        if(isWalkablePoint(fallbackX, fallbackY, 28) && isReachablePoint(fallbackX, fallbackY)){
            finalAltarPoint = {x:fallbackX, y:fallbackY}
        }else{
            finalAltarPoint = findPlacementInRegion(
                terrain.zones.altar,
                26,
                180,
                placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
                rng,
                220,
                true
            )
        }
    }
    if(finalAltarPoint){
        eventPoints.push({
            type:"altar",
            x:finalAltarPoint.x,
            y:finalAltarPoint.y,
            radius:26,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:zoneNames.altar
        })
    }

    const springRegion = rng() < 0.5 ? terrain.zones.shallows : terrain.zones.causeway
    const springPoint = findPlacementInRegion(
        springRegion,
        24,
        220,
        placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
        rng,
        120,
        true
    )
    if(springPoint){
        eventPoints.push({
            type:"spring",
            x:springPoint.x,
            y:springPoint.y,
            radius:24,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:springRegion.name,
            path:springRegion === terrain.zones.shallows ? "dash" : "tongue"
        })
    }

    const cacheRegion = rng() < 0.5 ? terrain.zones.ruinA : terrain.zones.ruinB
    const cachePoint = findPlacementInRegion(
        cacheRegion,
        24,
        240,
        placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
        rng,
        120,
        true
    )
    if(cachePoint){
        eventPoints.push({
            type:"cache",
            x:cachePoint.x,
            y:cachePoint.y,
            radius:24,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:cacheRegion.name
        })
    }

    const idolRegion = rng() < 0.5 ? terrain.zones.ruinA : terrain.zones.causeway
    const idolPoint = findPlacementInRegion(
        idolRegion,
        24,
        220,
        placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
        rng,
        120,
        true
    )
    if(idolPoint){
        eventPoints.push({
            type:"idol",
            x:idolPoint.x,
            y:idolPoint.y,
            radius:25,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:idolRegion.name,
            path:idolRegion === terrain.zones.causeway ? "dash" : "tongue"
        })
    }

    const nestPoint = findPlacementInRegion(
        terrain.zones.nestHeart || terrain.zones.pollutedNest,
        26,
        220,
        placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
        rng,
        120,
        true
    )
    if(nestPoint){
        eventPoints.push({
            type:"nest",
            x:nestPoint.x,
            y:nestPoint.y,
            radius:26,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:zoneNames.pollutedNest,
            path:"poison"
        })
    }

    const waygatePoint = findPlacementInRegion(
        terrain.zones.bridgehead,
        24,
        220,
        placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
        rng,
        120,
        true
    )
    if(waygatePoint){
        eventPoints.push({
            type:"waygate",
            x:waygatePoint.x,
            y:waygatePoint.y,
            radius:24,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:zoneNames.bridgehead,
            path:"dash"
        })
    }

    const shrinePoint = findPlacementInRegion(
        terrain.zones.shrineWard,
        24,
        220,
        placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
        rng,
        120,
        true
    )
    if(shrinePoint){
        eventPoints.push({
            type:"shrine",
            x:shrinePoint.x,
            y:shrinePoint.y,
            radius:25,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:zoneNames.shrineWard,
            path:"tongue"
        })
    }

    const tideCacheRegion = rng() < 0.5 ? terrain.zones.harbor : terrain.zones.tideflats
    const tideCachePoint = findPlacementInRegion(
        tideCacheRegion,
        24,
        220,
        placements.concat(eventPoints.map(point => ({x:point.x, y:point.y}))),
        rng,
        120,
        true
    )
    if(tideCachePoint){
        eventPoints.push({
            type:"tidecache",
            x:tideCachePoint.x,
            y:tideCachePoint.y,
            radius:24,
            pulse:rng() * Math.PI * 2,
            used:false,
            zoneName:tideCacheRegion.name,
            path:"poison"
        })
    }
}

export function updateTreasures(){
    if(gameState !== "playing") return

    const pickupSensor = getFrogPickupSensor()
    setPickupDebug("", "")

    let openedThisFrame = false
    for(const treasure of treasures){
        if(treasure.kind === "expOrb" || treasure.kind === "healOrb"){
            updateDropOrb(treasure, pickupSensor)
            continue
        }

        if(treasure.opened) continue
        treasure.pulse += 0.04
        const distance = Math.hypot(pickupSensor.x - treasure.x, pickupSensor.y - treasure.y)
        if(distance < pickupSensor.radius + treasure.radius){
            setPickupDebug("宝物", `${treasure.eventType}:${treasure.zoneName}`)
            treasure.opened = true
            openedThisFrame = true
            spawnHitParticles(treasure.x, treasure.y - 8, "#ffd864", 12)
            console.info("[pickup] treasure triggered", treasure.eventType, treasure.zoneName, {
                pickupX:pickupSensor.x,
                pickupY:pickupSensor.y,
                pickupRadius:pickupSensor.radius
            })
            if(treasureEventHandler){
                treasureEventHandler(treasure)
            }
        }
    }

    for(const point of eventPoints){
        if(point.used) continue
        point.pulse += 0.05
        const distance = Math.hypot(pickupSensor.x - point.x, pickupSensor.y - point.y)
        if(distance >= pickupSensor.radius + point.radius){
            continue
        }

        setPickupDebug("事件", point.type)
        point.used = true
        spawnHitParticles(
            point.x,
            point.y - 10,
            point.type === "altar" ? "#e5efaa" :
            point.type === "spring" ? "#a9f1de" :
            point.type === "idol" ? "#e7ddaa" :
            point.type === "waygate" ? "#d9ecff" :
            point.type === "shrine" ? "#dcecdf" :
            point.type === "tidecache" ? "#b8e7ef" :
            "#ffd864",
            12
        )
        console.info("[pickup] event triggered", point.type, {
            pickupX:pickupSensor.x,
            pickupY:pickupSensor.y,
            pickupRadius:pickupSensor.radius
        })

        if(point.type === "altar"){
            const blessing = applyRandomUpgradeWithPreference(point.path || "dash")
            frog.hp = Math.min(frog.maxHp, frog.hp + 1)
            setBanner(`祭坛赐福：${blessing}`, 120)
        }else if(point.type === "spring"){
            frog.hp = frog.maxHp
            for(const ability of Object.values(frogAbilities)){
                ability.timer = Math.max(0, ability.timer - 90)
            }
            replaceCollection(hazards, hazards.filter(hazard => Math.hypot(hazard.x - point.x, hazard.y - point.y) > 260))
            grantXP(6)
            setBanner("灵泉回甘：生命与冷却恢复", 120)
        }else if(point.type === "idol"){
            grantXP(8)
            const relicId = gainPathRelic(point.path || "tongue")
            if(relicId){
                setBanner(`沉碑赐物：${relicLibrary[relicId].label}`, 130)
            }else{
                const blessing = applyRandomUpgradeWithPreference(point.path || "tongue")
                setBanner(`沉碑赐福：${blessing}`, 130)
            }
        }else if(point.type === "shrine"){
            frog.hp = Math.min(frog.maxHp, frog.hp + 1)
            const relicId = Math.random() < 0.45 ? gainPathRelic(point.path || "tongue") : null
            if(relicId){
                setBanner(`神龛回响：${relicLibrary[relicId].label}`, 130)
            }else{
                const blessing = applyRandomUpgradeWithPreference(point.path || "tongue")
                setBanner(`神龛回响：${blessing}`, 130)
            }
        }else if(point.type === "waygate" && treasureEventHandler){
            treasureEventHandler({
                ...point,
                kind:"event",
                eventType:"waygate"
            })
        }else if(point.type === "tidecache" && treasureEventHandler){
            treasureEventHandler({
                ...point,
                kind:"event",
                eventType:"tidecache"
            })
        }else if(point.type === "nest" && treasureEventHandler){
            treasureEventHandler({
                ...point,
                kind:"event",
                eventType:"nest"
            })
        }else if(treasureEventHandler){
            treasureEventHandler({
                ...point,
                kind:"event",
                eventType:"cache"
            })
        }else{
            setBanner("埋伏宝箱", 100)
        }
    }

    replaceCollection(treasures, treasures.filter(treasure => !treasure.picked))

    if(openedThisFrame && !waveState.bannerText){
        setBanner("已获得宝物", 90)
    }
}

export function drawTreasures(){
    for(const treasure of treasures){
        const x = treasure.x - camera.x
        const y = treasure.y - camera.y
        const pulse = 1 + Math.sin(frog.idleCycle * 2 + treasure.pulse) * 0.05

        ctx.save()
        if(treasure.kind === "expOrb" || treasure.kind === "healOrb"){
            const bobOffset = Math.sin(treasure.bob || 0) * 4
            ctx.translate(x, y + bobOffset)
        }else{
            ctx.translate(x, y)
        }
        ctx.scale(pulse, pulse)

        if(treasure.kind === "expOrb"){
            ctx.fillStyle = "rgba(0,0,0,0.18)"
            ctx.beginPath()
            ctx.ellipse(0, 12, 10, 5, 0, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = "rgba(199,255,141,0.24)"
            ctx.beginPath()
            ctx.arc(0, 0, 13, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = "#9ee86d"
            ctx.beginPath()
            ctx.arc(0, 0, 9, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = "#f1ffd8"
            ctx.beginPath()
            ctx.arc(-2, -3, 3, 0, Math.PI * 2)
            ctx.fill()

            ctx.restore()
            continue
        }

        if(treasure.kind === "healOrb"){
            ctx.fillStyle = "rgba(0,0,0,0.18)"
            ctx.beginPath()
            ctx.ellipse(0, 12, 11, 5, 0, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = "rgba(147,228,255,0.24)"
            ctx.beginPath()
            ctx.arc(0, 0, 14, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = "#7fd7ff"
            ctx.beginPath()
            ctx.arc(0, 0, 9.5, 0, Math.PI * 2)
            ctx.fill()

            ctx.strokeStyle = "#effbff"
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(-4, 0)
            ctx.lineTo(4, 0)
            ctx.moveTo(0, -4)
            ctx.lineTo(0, 4)
            ctx.stroke()

            ctx.restore()
            continue
        }

        ctx.fillStyle = "rgba(0,0,0,0.22)"
        ctx.beginPath()
        ctx.ellipse(0, 20, 24, 10, 0, 0, Math.PI * 2)
        ctx.fill()

        if(treasure.opened){
            ctx.fillStyle = "#5f4023"
            ctx.strokeStyle = "#2e1d11"
            ctx.lineWidth = 3
            roundedRectPath(ctx, -22, -4, 44, 22, 9)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = "#7b542f"
            roundedRectPath(ctx, -22, -20, 44, 18, 10)
            ctx.fill()

            ctx.strokeStyle = "#2e1d11"
            ctx.beginPath()
            ctx.moveTo(-18, -8)
            ctx.quadraticCurveTo(0, -34, 18, -8)
            ctx.stroke()

            ctx.fillStyle = "rgba(255,232,130,0.6)"
            ctx.beginPath()
            ctx.arc(0, -8, 6, 0, Math.PI * 2)
            ctx.fill()
        }else{
            ctx.fillStyle = "#6d4728"
            ctx.strokeStyle = "#2e1d11"
            ctx.lineWidth = 3
            roundedRectPath(ctx, -22, -4, 44, 24, 9)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = "#9e6b3d"
            roundedRectPath(ctx, -22, -18, 44, 18, 10)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = "#e4c85d"
            ctx.beginPath()
            ctx.rect(-3, -18, 6, 38)
            ctx.fill()

            ctx.fillStyle = "#fff0a8"
            ctx.beginPath()
            ctx.arc(0, -2, 5, 0, Math.PI * 2)
            ctx.fill()

            ctx.strokeStyle = "rgba(255,243,170,0.45)"
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(0, 0, 28 + Math.sin(frog.idleCycle * 2.4 + treasure.pulse) * 3, 0, Math.PI * 2)
            ctx.stroke()
        }

        ctx.restore()
    }

    for(const point of eventPoints){
        const x = point.x - camera.x
        const y = point.y - camera.y
        const pulse = 1 + Math.sin(frog.idleCycle * 2 + point.pulse) * 0.05

        ctx.save()
        ctx.translate(x, y)
        ctx.scale(pulse, pulse)

        ctx.fillStyle = "rgba(0,0,0,0.18)"
        ctx.beginPath()
        ctx.ellipse(0, 18, 22, 9, 0, 0, Math.PI * 2)
        ctx.fill()

        if(point.type === "altar"){
            ctx.fillStyle = "#6a6a4f"
            roundedRectPath(ctx, -18, -4, 36, 22, 8)
            ctx.fill()
            ctx.fillStyle = "#b9c388"
            roundedRectPath(ctx, -12, -22, 24, 18, 7)
            ctx.fill()
            ctx.fillStyle = "rgba(244,243,187,0.72)"
            ctx.beginPath()
            ctx.arc(0, -14, 6, 0, Math.PI * 2)
            ctx.fill()
        }else if(point.type === "spring"){
            ctx.fillStyle = point.used ? "#3a8574" : "#49a997"
            ctx.beginPath()
            ctx.ellipse(0, 2, 17, 11, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = "rgba(216,255,247,0.78)"
            ctx.beginPath()
            ctx.arc(0, -10, 6, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = "rgba(205,250,240,0.6)"
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(0, 2, 20, 0, Math.PI * 2)
            ctx.stroke()
        }else if(point.type === "idol"){
            ctx.fillStyle = point.used ? "#74664a" : "#8c7a57"
            roundedRectPath(ctx, -14, -4, 28, 24, 8)
            ctx.fill()
            ctx.fillStyle = "#d8cfab"
            ctx.beginPath()
            ctx.arc(-4, 2, 2.5, 0, Math.PI * 2)
            ctx.arc(4, 2, 2.5, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = "rgba(234,224,188,0.72)"
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(0, -7, 9, Math.PI * 0.12, Math.PI * 0.88)
            ctx.stroke()
        }else if(point.type === "nest"){
            ctx.fillStyle = point.used ? "#486029" : "#527430"
            ctx.beginPath()
            ctx.ellipse(0, 0, 17, 22, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = "#bfe37f"
            ctx.beginPath()
            ctx.arc(0, -8, 7, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = "rgba(222,246,169,0.6)"
            for(const offset of [-8, 8]){
                ctx.beginPath()
                ctx.arc(offset, -2, 4, 0, Math.PI * 2)
                ctx.fill()
            }
        }else if(point.type === "waygate"){
            ctx.fillStyle = point.used ? "#627480" : "#768d9a"
            roundedRectPath(ctx, -15, -2, 30, 20, 8)
            ctx.fill()
            ctx.fillRect(-12, -16, 6, 16)
            ctx.fillRect(6, -16, 6, 16)
            ctx.strokeStyle = "rgba(226,239,248,0.68)"
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(-12, -6)
            ctx.quadraticCurveTo(0, -18, 12, -6)
            ctx.stroke()
        }else if(point.type === "shrine"){
            ctx.fillStyle = point.used ? "#71827c" : "#879a93"
            roundedRectPath(ctx, -12, -2, 24, 20, 8)
            ctx.fill()
            ctx.fillStyle = "#d7ece3"
            ctx.beginPath()
            ctx.arc(0, -8, 5, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = "rgba(223,245,237,0.5)"
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(0, -8, 11, 0, Math.PI * 2)
            ctx.stroke()
        }else if(point.type === "tidecache"){
            ctx.fillStyle = point.used ? "#4f6570" : "#62808e"
            roundedRectPath(ctx, -18, -2, 36, 20, 8)
            ctx.fill()
            ctx.fillStyle = "#cfeaf0"
            ctx.beginPath()
            ctx.rect(-2, -14, 4, 28)
            ctx.fill()
            ctx.beginPath()
            ctx.arc(0, -2, 4, 0, Math.PI * 2)
            ctx.fill()
        }else{
            ctx.fillStyle = point.used ? "#6b4c2d" : "#7e5731"
            roundedRectPath(ctx, -18, -2, 36, 20, 8)
            ctx.fill()
            ctx.fillStyle = "#dcbf62"
            ctx.beginPath()
            ctx.rect(-2, -16, 4, 32)
            ctx.fill()
            ctx.beginPath()
            ctx.arc(0, -1, 4, 0, Math.PI * 2)
            ctx.fill()
        }

        ctx.restore()
    }
}
