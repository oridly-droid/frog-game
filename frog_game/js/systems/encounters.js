/**
 * This module drives encounter zones, waves, treasure-triggered events, and round resets.
 * It is responsible for encounter flow and does not draw entities directly.
 */


import { waveConfigs, encounterTemplates, zoneNames, treasureGoal, enemyStats, maxActiveEnemies } from "../config/game_config.js"
import { playerConfig } from "../config/player_config.js"
import {
    canvas,
    world,
    terrain,
    frog,
    ants,
    plants,
    projectiles,
    bladeWaves,
    particles,
    encounterZones,
    gameState,
    mobile,
    tongue,
    bossState,
    waveState,
    upgradeState,
    combatStats,
    skillTree,
    frogAbilities,
    camera,
    view,
    replaceCollection,
    setGameState,
} from "../core/state.js"
import { clamp, mulberry32, getRandomRange } from "../core/utils.js"
import { getBoundaryPoint, getDominantTerrainTypeForRegion, getTerrainTypeAt } from "../world/terrain.js"
import { findPlacementInRegion } from "../world/zones.js"
import { circleCollidesRocks, isWalkablePoint } from "../world/collisions.js"
import { resetJoystick } from "../core/input.js"
import { createEnemy } from "../entities/enemies.js"
import { buildPlants, createPlant, spawnPollutionNest } from "../entities/plants.js"
import { buildTreasures, getTreasureCount, maybeDropRelic } from "../entities/treasures.js"
import { spawnHitParticles } from "../entities/particles.js"
import { grantXP, resetProgression } from "../entities/frog.js"
import { applyRandomUpgrade, applyRandomUpgradeWithPreference } from "./progression.js"
import { buildBossLair, triggerBossEvent } from "./boss_system.js"
import { setBanner } from "../ui/banners.js"

function isBossBattleInProgress(){
    return bossState.pending || bossState.active || (!!bossState.entity && !bossState.defeated)
}

function getEncounterTemplateById(id){
    return encounterTemplates.find(entry => entry.id === id) || null
}

function pickEncounterTemplate(templateIds, rng){
    const pool = templateIds
        .map(getEncounterTemplateById)
        .filter(Boolean)
    if(pool.length === 0){
        return encounterTemplates[Math.floor(rng() * encounterTemplates.length)]
    }
    return pool[Math.floor(rng() * pool.length)]
}

const LEGACY_ENEMY_KEYS = ["ants", "beetles", "chargers", "summoners", "snipers", "spores", "heralds", "guards", "melee", "ranged", "tank"]
const TERRAIN_SPAWN_PROFILES = {
    grass:{weights:{melee:1}, densityMultiplier:1.15, powerMultiplier:1},
    mud:{weights:{melee:0.62, ranged:0.38}, densityMultiplier:1.32, powerMultiplier:1},
    danger:{weights:{ranged:0.58, tank:0.42}, densityMultiplier:1.72, powerMultiplier:1.22}
}
const TERRAIN_PRESSURE_PROFILES = {
    grass:{triggerZoneCap:3, triggerLocalCap:3, defendReinforceCap:4, huntReinforceCap:3, reinforceInterval:92, waveInterval:168, sustainFloor:3, sustainBudget:1},
    mud:{triggerZoneCap:4, triggerLocalCap:4, defendReinforceCap:5, huntReinforceCap:4, reinforceInterval:78, waveInterval:148, sustainFloor:4, sustainBudget:2},
    danger:{triggerZoneCap:5, triggerLocalCap:5, defendReinforceCap:6, huntReinforceCap:5, reinforceInterval:64, waveInterval:132, sustainFloor:5, sustainBudget:2}
}
const FIXED_ZONE_TERRAIN_TYPES = {
    [zoneNames.shallows]:"mud",
    [zoneNames.bridgehead]:"mud",
    [zoneNames.harbor]:"mud",
    [zoneNames.tideflats]:"mud",
    [zoneNames.thicket]:"danger",
    [zoneNames.pollutedNest]:"danger",
    [zoneNames.shrineWard]:"danger"
}

function getTerrainSpawnProfile(terrainType = "grass"){
    return TERRAIN_SPAWN_PROFILES[terrainType] || TERRAIN_SPAWN_PROFILES.grass
}

function getTerrainPressureProfile(terrainType = "grass"){
    return TERRAIN_PRESSURE_PROFILES[terrainType] || TERRAIN_PRESSURE_PROFILES.grass
}

function getEncounterEnemyBudget(config = {}){
    return LEGACY_ENEMY_KEYS.reduce((sum, key) => sum + Math.max(0, Math.round(config[key] || 0)), 0)
}

function distributeTerrainEnemyCounts(total, weights = {}){
    const entries = Object.entries(weights).filter(([, weight]) => weight > 0)
    const counts = {melee:0, ranged:0, tank:0}
    if(total <= 0 || entries.length === 0){
        return counts
    }

    let allocated = 0
    const ranked = entries.map(([type, weight]) => {
        const exact = total * weight
        const base = Math.floor(exact)
        counts[type] = base
        allocated += base
        return {type, fraction:exact - base}
    }).sort((a, b) => b.fraction - a.fraction)

    let remainderIndex = 0
    while(allocated < total){
        const target = ranked[remainderIndex % ranked.length] || ranked[0]
        counts[target.type] += 1
        allocated += 1
        remainderIndex += 1
    }

    return counts
}

function getTerrainBoundEnemyConfig(config = {}, terrainType = "grass"){
    const profile = getTerrainSpawnProfile(terrainType)
    const totalBudget = getEncounterEnemyBudget(config)
    const adjustedBudget = Math.max(0, Math.round(totalBudget * profile.densityMultiplier))
    return distributeTerrainEnemyCounts(adjustedBudget, profile.weights)
}

function getTerrainEnemyOverrides(type, terrainType = "grass"){
    const stats = enemyStats[type]
    const profile = getTerrainSpawnProfile(terrainType)
    const powerMultiplier = profile.powerMultiplier
    const overrides = {
        terrainType,
        powerMultiplier
    }

    if(!stats || powerMultiplier === 1){
        return overrides
    }

    const hp = Math.max(1, Math.round((stats.maxHp || 1) * powerMultiplier))
    overrides.hp = hp
    overrides.maxHp = hp
    overrides.speed = stats.speed * (1 + (powerMultiplier - 1) * 0.35)
    overrides.armor = Math.round((stats.armor || 0) + 12)
    overrides.size = stats.size + (type === "tank" ? 2 : 1)
    return overrides
}

function getEncounterRegionTerrainType(name, region){
    return FIXED_ZONE_TERRAIN_TYPES[name] || region?.terrainType || getDominantTerrainTypeForRegion(region)
}

export function getWaveScaledTemplate(template){
    const treasureCount = getTreasureCount()
    const tier = Math.max(0, waveState.current - 1)
    return {
        ants: template.ants + Math.floor((tier + treasureCount) / 2),
        beetles: template.beetles + (tier >= 1 ? 1 : 0) + (treasureCount >= 2 ? 1 : 0),
        chargers: template.chargers + (tier >= 2 ? 1 : 0),
        summoners:(template.summoners || 0) + (tier >= 3 ? 1 : 0),
        snipers:(template.snipers || 0) + (treasureCount >= 2 ? 1 : 0),
        spores:(template.spores || 0) + (tier >= 2 ? 1 : 0),
        heralds:(template.heralds || 0) + (tier >= 5 ? 1 : 0),
        guards:(template.guards || 0) + (tier >= 4 ? 1 : 0),
        plants:template.plants || 0,
        cores:template.cores || 0,
        holdTime:template.holdTime || 0,
        kind:template.kind,
        reward:template.reward,
        label:template.label
    }
}

export function buildEncounterZones(){
    const rng = mulberry32((((world.width * 25999) ^ (world.height * 51787) ^ 0xA11CE) >>> 0))
    const baseWidth = terrain.layout?.baseWorldWidth || world.width
    const baseHeight = terrain.layout?.baseWorldHeight || world.height
    const lx = ratio => baseWidth * ratio
    const ly = ratio => baseHeight * ratio
    const regions = [
        {name:zoneNames.ruinA, region:terrain.zones.ruinA, templateIds:["elite_watch", "brood_marshall", "ruin_crossfire"]},
        {name:zoneNames.thicket, region:terrain.zones.thicket, templateIds:["surrounding_swarm", "ruin_crossfire", "predator_arc"]},
        {name:zoneNames.pollutedNest, region:terrain.zones.pollutedNest, templateIds:["pollution_bloom", "nest_purge"]},
        {name:zoneNames.altar, region:terrain.zones.altar, templateIds:["altar_hold", "altar_resolve"]},
        {name:zoneNames.causeway, region:terrain.zones.causeway, templateIds:["causeway_gauntlet", "spring_surge", "idol_guard"]},
        {name:zoneNames.shallows, region:terrain.zones.shallows, templateIds:["shallows_pursuit", "surrounding_swarm", "cache_procession"]},
        {name:zoneNames.nestHeart, region:terrain.zones.nestHeart, templateIds:["nest_choir", "pollution_bloom", "nest_purge"]},
        {name:zoneNames.bridgehead, region:terrain.zones.bridgehead, templateIds:["bridge_watch", "harbor_crossfire"], radius:280},
        {name:zoneNames.harbor, region:terrain.zones.harbor, templateIds:["harbor_crossfire", "quay_purge", "tide_cache"], radius:360},
        {name:zoneNames.tideflats, region:terrain.zones.tideflats, templateIds:["tide_stalk", "quay_purge", "tide_cache"], radius:380},
        {name:zoneNames.shrineWard, region:terrain.zones.shrineWard, templateIds:["shrine_vigil", "bridge_watch", "harbor_crossfire"], radius:340},
        {name:zoneNames.meadow, region:{x1:lx(0.34), y1:ly(0.66), x2:lx(0.52), y2:ly(0.9)}, templateIds:["hunter_pack", "surrounding_swarm"]},
        {name:zoneNames.ruinB, region:terrain.zones.ruinB, templateIds:["cache_ambush", "cache_crush", "elite_watch", "cache_procession"]},
        {name:zoneNames.meadow, region:{x1:lx(0.48), y1:ly(0.76), x2:lx(0.68), y2:ly(0.94)}, templateIds:["surrounding_swarm", "predator_arc"]},
        {name:zoneNames.pollutedNest, region:{x1:lx(0.22), y1:ly(0.62), x2:lx(0.42), y2:ly(0.86)}, templateIds:["nest_purge", "pollution_bloom"]},
        {name:zoneNames.altar, region:{x1:lx(0.62), y1:ly(0.28), x2:lx(0.88), y2:ly(0.62)}, templateIds:["altar_resolve", "spring_surge", "brood_marshall"]},
        {name:zoneNames.meadow, region:{x1:lx(0.4), y1:ly(0.14), x2:lx(0.62), y2:ly(0.32)}, templateIds:["ruin_crossfire", "surrounding_swarm", "causeway_gauntlet"]},
        {name:zoneNames.meadow, region:{x1:lx(0.12), y1:ly(0.44), x2:lx(0.3), y2:ly(0.66)}, templateIds:["predator_arc", "cache_ambush"]}
    ]

    replaceCollection(encounterZones, [])

    for(let i = 0; i < regions.length; i++){
        const region = regions[i]
        const template = pickEncounterTemplate(region.templateIds || [region.templateId], rng)
        const center = {
            x:(region.region.x1 + region.region.x2) * 0.5,
            y:(region.region.y1 + region.region.y2) * 0.5
        }

        encounterZones.push({
            id:`encounter_${i}`,
            x:center.x,
            y:center.y,
            radius:region.radius || Math.min(world.width, world.height) * 0.14,
            triggered:false,
            defeated:false,
            active:false,
            template,
            kind:template.kind,
            remaining:template.holdTime || 0,
            reinforceTimer:90,
            rewardGranted:false,
            spawnSeed:rng(),
            zoneName:region.name,
            region:region.region,
            terrainType:getEncounterRegionTerrainType(region.name, region.region)
        })
    }
}

export function spawnConfiguredEnemies(centerX, centerY, radius, config, seed, overridesByType = {}, spawnOptions = {}){
    const rng = mulberry32(seed >>> 0)
    const spawned = []
    const terrainType = spawnOptions.terrainType || getTerrainTypeAt(centerX, centerY)
    const boundConfig = getTerrainBoundEnemyConfig(config, terrainType)
    const types = []

    for(let i = 0; i < (boundConfig.melee || 0); i++) types.push("melee")
    for(let i = 0; i < (boundConfig.ranged || 0); i++) types.push("ranged")
    for(let i = 0; i < (boundConfig.tank || 0); i++) types.push("tank")

    const openSlots = Math.max(0, maxActiveEnemies - ants.length)
    if(openSlots <= 0 || types.length === 0){
        return spawned
    }

    for(let index = types.length - 1; index > 0; index--){
        const swapIndex = Math.floor(rng() * (index + 1))
        ;[types[index], types[swapIndex]] = [types[swapIndex], types[index]]
    }

    for(const type of types.slice(0, openSlots)){
        const terrainOverrides = getTerrainEnemyOverrides(type, terrainType)
        const mergedOverrides = {
            ...terrainOverrides,
            ...(overridesByType[type] || {})
        }
        let placed = false
        for(let attempt = 0; attempt < 50; attempt++){
            const angle = rng() * Math.PI * 2
            const dist = 40 + rng() * Math.max(10, radius - 38)
            const x = centerX + Math.cos(angle) * dist
            const y = centerY + Math.sin(angle) * dist
            const enemy = createEnemy(type, x, y, rng, mergedOverrides)

            if(!isWalkablePoint(x, y, enemy.size + 8)) continue
            if(Math.hypot(x - frog.x, y - frog.y) < 110) continue

            let overlap = false
            for(const other of ants.concat(spawned)){
                if(Math.hypot(x - other.x, y - other.y) < enemy.size + other.size + 12){
                    overlap = true
                    break
                }
            }
            if(overlap) continue

            spawned.push(enemy)
            placed = true
            break
        }

        if(!placed){
            spawned.push(createEnemy(type, centerX, centerY, rng, mergedOverrides))
        }
    }

    ants.push(...spawned)
    return spawned
}

function pickGlobalSpawnCenter(seed){
    const rng = mulberry32(seed)
    let center = null

    for(let attempt = 0; attempt < 36; attempt++){
        const angle = rng() * Math.PI * 2
        const point = getBoundaryPoint(angle, 90 + rng() * 70, 1.16 + rng() * 0.18)
        const x = clamp(point.x, 120, world.width - 120)
        const y = clamp(point.y, 120, world.height - 120)

        if(Math.hypot(x - frog.x, y - frog.y) < 260) continue
        if(circleCollidesRocks(x, y, 42)) continue

        center = {x, y}
        break
    }

    if(center){
        return center
    }

    const angle = rng() * Math.PI * 2
    const point = getBoundaryPoint(angle, 110, 1.22)
    return {
        x: clamp(point.x, 120, world.width - 120),
        y: clamp(point.y, 120, world.height - 120)
    }
}

function getSustainSpawnBudget(terrainType = "grass"){
    const profile = getTerrainPressureProfile(terrainType)
    const waveBonus = waveState.current >= 4 ? 1 : 0
    return Math.min(3, profile.sustainBudget + waveBonus)
}

function spawnSustainReinforcement(){
    if(!terrain || isBossBattleInProgress()){
        return false
    }

    const terrainType = getTerrainTypeAt(frog.x, frog.y)
    const openSlots = Math.max(0, maxActiveEnemies - ants.length)
    if(openSlots <= 0){
        return false
    }

    const budget = Math.min(openSlots, getSustainSpawnBudget(terrainType))
    if(budget <= 0){
        return false
    }

    const seed = (((world.width * 71) ^ (world.height * 89) ^ ((waveState.current + 1) * 4099) ^ ((ants.length + 1) * 197) ^ (waveState.pendingTimer * 13)) >>> 0)
    const center = pickGlobalSpawnCenter(seed)
    const spawned = spawnConfiguredEnemies(center.x, center.y, 154, {melee:budget}, seed, {}, {terrainType})
    if(spawned.length === 0){
        return false
    }

    spawnHitParticles(center.x, center.y, "#e7f08b", 10)
    waveState.pendingTimer = getTerrainPressureProfile(terrainType).waveInterval
    waveState.active = true
    return true
}

function splitEncounterConfig(config, divisor){
    const next = {}
    for(const [key, value] of Object.entries(config)){
        if(typeof value !== "number"){
            continue
        }
        if(["holdTime"].includes(key)){
            next[key] = value
            continue
        }
        next[key] = Math.max(0, Math.ceil(value / divisor))
    }
    return next
}

function spawnEncounterByLayout(zone, scaledTemplate, seed){
    const layout = zone.template.layout || "default"

    if(layout === "pinch"){
        const leftConfig = splitEncounterConfig(scaledTemplate, 2)
        const rightConfig = splitEncounterConfig(scaledTemplate, 2)
        spawnConfiguredEnemies(zone.x - zone.radius * 0.7, zone.y - zone.radius * 0.15, 96, leftConfig, seed + 17, {}, {terrainType:zone.terrainType})
        spawnConfiguredEnemies(zone.x + zone.radius * 0.7, zone.y + zone.radius * 0.15, 96, rightConfig, seed + 43, {}, {terrainType:zone.terrainType})
        return
    }

    if(layout === "crossfire"){
        const crossConfig = splitEncounterConfig(scaledTemplate, 4)
        const offsets = [
            {x:0, y:-zone.radius * 0.78},
            {x:zone.radius * 0.78, y:0},
            {x:0, y:zone.radius * 0.78},
            {x:-zone.radius * 0.78, y:0}
        ]
        offsets.forEach((offset, index) => {
            spawnConfiguredEnemies(zone.x + offset.x, zone.y + offset.y, 84, crossConfig, seed + 29 * (index + 1), {}, {terrainType:zone.terrainType})
        })
        return
    }

    if(zone.kind === "surround"){
        for(const [index, angle] of [0.35, 2.25, 4.2].entries()){
            const px = zone.x + Math.cos(angle) * zone.radius * 0.74
            const py = zone.y + Math.sin(angle) * zone.radius * 0.74
            spawnConfiguredEnemies(px, py, 90, scaledTemplate, seed + index * 53, {}, {terrainType:zone.terrainType})
        }
        return
    }

    spawnConfiguredEnemies(zone.x, zone.y, zone.radius, scaledTemplate, seed, {}, {terrainType:zone.terrainType})
}

export function spawnEncounter(zone){
    const scaledTemplate = getWaveScaledTemplate(zone.template)
    const seed = ((zone.x * 131) ^ (zone.y * 211) ^ Math.floor(zone.spawnSeed * 100000)) >>> 0
    zone.remaining = scaledTemplate.holdTime || 0
    zone.reinforceTimer = zone.template.reinforceInterval || getTerrainPressureProfile(zone.terrainType).reinforceInterval

    if(zone.kind === "surround"){
        spawnEncounterByLayout(zone, scaledTemplate, seed)
    }else if(zone.kind === "elite"){
        spawnEncounterByLayout(zone, scaledTemplate, seed)
        spawnConfiguredEnemies(zone.x, zone.y, 92, {tank:2}, seed + 91, {
            melee:{
                elite:true,
                name:"精英守卫",
                hp:Math.ceil(enemyStats.melee.maxHp * 1.8),
                maxHp:Math.ceil(enemyStats.melee.maxHp * 1.8),
                size:enemyStats.melee.size + 4,
                speed:enemyStats.melee.speed + 0.12,
                armor:(enemyStats.melee.armor || 0) + 8
            },
            ranged:{
                elite:true,
                name:"精英守卫",
                hp:Math.ceil(enemyStats.ranged.maxHp * 1.8),
                maxHp:Math.ceil(enemyStats.ranged.maxHp * 1.8),
                size:enemyStats.ranged.size + 4,
                speed:enemyStats.ranged.speed + 0.12,
                armor:(enemyStats.ranged.armor || 0) + 8
            },
            tank:{
                elite:true,
                name:"精英守卫",
                hp:Math.ceil(enemyStats.tank.maxHp * 1.7),
                maxHp:Math.ceil(enemyStats.tank.maxHp * 1.7),
                size:enemyStats.tank.size + 4,
                speed:enemyStats.tank.speed + 0.1,
                armor:(enemyStats.tank.armor || 0) + 12
            }
        }, {terrainType:zone.terrainType})
    }else if(zone.kind === "cleanse"){
        spawnEncounterByLayout(zone, scaledTemplate, seed)
        const rng = mulberry32(seed + 303)
        const existingPoints = plants.map(plant => ({x:plant.x, y:plant.y}))
        for(let i = 0; i < (scaledTemplate.plants || 0); i++){
            const point = findPlacementInRegion(zone.region, 22, 110, existingPoints, rng, 80)
            if(!point) continue
            existingPoints.push(point)
            plants.push(createPlant(point.x, point.y, rng, {encounterTag:zone.id}))
        }
        for(let i = 0; i < (scaledTemplate.cores || 0); i++){
            const point = findPlacementInRegion(zone.region, 28, 160, existingPoints, rng, 120)
            if(!point) continue
            existingPoints.push(point)
            plants.push(spawnPollutionNest(point.x, point.y, rng))
            plants[plants.length - 1].encounterTag = zone.id
        }
    }else{
        spawnEncounterByLayout(zone, scaledTemplate, seed)
    }
    zone.triggered = true
    zone.active = true
    zone.wave = waveState.current
    setBanner(`${zone.template.label}：${zone.zoneName}`, 100)
}

function completeEncounter(zone){
    if(zone.defeated){
        return
    }

    zone.active = false
    zone.defeated = true
    zone.rewardGranted = true

    const rewardXp =
        zone.kind === "elite" ? 14 :
        zone.kind === "cleanse" ? 12 :
        zone.kind === "defend" ? 10 :
        zone.kind === "hunt" ? 10 :
        zone.kind === "ambush" ? 9 :
        8

    grantXP(rewardXp)
    if(zone.kind === "elite" || zone.kind === "cleanse"){
        maybeDropRelic("cleanse")
    }else if(zone.kind === "ambush"){
        maybeDropRelic("cache")
    }

    if(zone.kind === "defend"){
        const blessing = applyRandomUpgradeWithPreference(zone.template.rewardPath || null)
        setBanner(`守住祭坛：${blessing}`, 130)
    }else if(zone.kind === "cleanse" && zone.template.rewardPath){
        const blessing = applyRandomUpgradeWithPreference(zone.template.rewardPath)
        setBanner(`${zone.zoneName} 净除：${blessing}`, 125)
    }else if(zone.kind === "elite" && zone.template.rewardPath && Math.random() < 0.4){
        const blessing = applyRandomUpgradeWithPreference(zone.template.rewardPath)
        setBanner(`精英余赐：${blessing}`, 120)
    }else{
        setBanner(`${zone.zoneName} 已净空`, 110)
    }
    spawnHitParticles(zone.x, zone.y - 10, "#d8ff98", 12)
}

function updateEncounterZones(){
    for(const zone of encounterZones){
        if(zone.defeated){
            continue
        }

        const pressure = getTerrainPressureProfile(zone.terrainType)
        const playerDist = Math.hypot(frog.x - zone.x, frog.y - zone.y)
        const zoneEnemyCount = ants.filter(enemy => Math.hypot(enemy.x - zone.x, enemy.y - zone.y) < zone.radius + 200).length
        const zonePlantCount = plants.filter(plant => plant.encounterTag === zone.id).length
        const localEnemyCount = ants.filter(enemy => Math.hypot(enemy.x - frog.x, enemy.y - frog.y) < 420).length

        if(!zone.triggered && playerDist < zone.radius * 0.96 && zoneEnemyCount <= pressure.triggerZoneCap && localEnemyCount <= pressure.triggerLocalCap){
            spawnEncounter(zone)
        }

        if(!zone.active){
            continue
        }

        if(zone.kind === "defend"){
            if(playerDist < zone.radius * 0.86){
                zone.remaining = Math.max(0, zone.remaining - 1)
            }
            zone.reinforceTimer -= 1
            if(zone.reinforceTimer <= 0 && zoneEnemyCount < pressure.defendReinforceCap){
                spawnConfiguredEnemies(zone.x, zone.y, zone.radius, {ants:1, chargers:1}, ((zone.x * 43) ^ zone.remaining ^ 0xD311) >>> 0, {}, {terrainType:zone.terrainType})
                zone.reinforceTimer = pressure.reinforceInterval
            }
            if(zone.remaining <= 0){
                completeEncounter(zone)
            }
        }else if(zone.kind === "hunt"){
            zone.remaining = Math.max(0, zone.remaining - 1)
            zone.reinforceTimer -= 1
            if(zone.reinforceTimer <= 0 && zoneEnemyCount < pressure.huntReinforceCap){
                spawnConfiguredEnemies(frog.x, frog.y, 140, {chargers:1, snipers:1}, ((frog.x * 61) ^ zone.remaining ^ 0xAA51) >>> 0, {}, {terrainType:zone.terrainType})
                zone.reinforceTimer = Math.max(58, pressure.reinforceInterval + 8)
            }
            if(zone.remaining <= 0 && zoneEnemyCount === 0){
                completeEncounter(zone)
            }
        }else if(zone.kind === "cleanse"){
            if(zoneEnemyCount === 0 && zonePlantCount === 0){
                completeEncounter(zone)
            }
        }else if(zoneEnemyCount === 0){
            completeEncounter(zone)
        }
    }
}

export function getGlobalWaveConfig(wave){
    const total =
        wave <= 1 ? 4 :
        wave === 2 ? 6 :
        wave === 3 ? 8 :
        Math.min(16, 8 + (wave - 3) * 2)

    let beetles = 0
    let chargers = 0
    let summoners = 0
    let snipers = 0
    let spores = 0
    let heralds = 0
    let guards = 0

    if(wave >= 2){
        beetles = 1
    }
    if(wave >= 4){
        chargers = 1
    }
    if(wave >= 5){
        beetles += 1
    }
    if(wave >= 7){
        chargers += 1
    }
    if(wave >= 8){
        beetles += 1
    }
    if(wave >= 4){
        snipers = 1
    }
    if(wave >= 5){
        spores = 1
    }
    if(wave >= 6){
        summoners = 1
    }
    if(wave >= 7){
        guards = 1
    }
    if(wave >= 8){
        heralds = 1
    }
    if(wave >= 10){
        guards += 1
    }
    if(wave >= 11){
        heralds += 1
    }

    beetles = Math.min(beetles, Math.max(1, total - 2))
    chargers = Math.min(chargers, Math.max(0, total - beetles - 1))
    heralds = Math.min(heralds, Math.max(0, total - beetles - chargers - summoners - snipers - spores - 1))
    guards = Math.min(guards, Math.max(0, total - beetles - chargers - summoners - snipers - spores - heralds - 1))

    return {
        ants: Math.max(1, total - beetles - chargers - summoners - snipers - spores - heralds - guards),
        beetles,
        chargers,
        summoners,
        snipers,
        spores,
        heralds,
        guards
    }
}

export function spawnGlobalWave(){
    if(!terrain || isBossBattleInProgress()){
        return
    }

    const terrainType = getTerrainTypeAt(frog.x, frog.y)
    const pressure = getTerrainPressureProfile(terrainType)
    waveState.current += 1
    waveState.index = waveState.current
    waveState.active = true
    waveState.pendingTimer = pressure.waveInterval

    const config = getGlobalWaveConfig(waveState.current)
    const seed = (((world.width * 37) ^ (world.height * 53) ^ (waveState.current * 9973)) >>> 0)
    const center = pickGlobalSpawnCenter(seed)
    spawnConfiguredEnemies(center.x, center.y, 170, config, seed, {}, {terrainType})
    spawnHitParticles(center.x, center.y, "#ffe88b", 18)
    setBanner(`第 ${waveState.current} 波`, 120)
}

export function spawnAnts(count, type = "ant"){
    if(!terrain){
        return
    }

    const typeSeed =
        type === "ant" ? 11 :
        type === "beetle" ? 23 :
        type === "charger" ? 37 :
        type === "summoner" ? 41 :
        type === "sniper" ? 53 :
        type === "spore" ? 67 :
        type === "herald" ? 71 :
        79
    const rng = mulberry32((((world.width * 92821) ^ (world.height * 68917) ^ count * 131 ^ typeSeed) >>> 0))
    let attempts = 0

    while(ants.length < count && attempts < 1200){
        attempts++
        const angle = rng() * Math.PI * 2
        const dist = 1.18 + rng() * 0.52
        const point = getBoundaryPoint(angle, 0, dist)
        const x = clamp(point.x + (rng() - 0.5) * 74, 48, world.width - 48)
        const y = clamp(point.y + (rng() - 0.5) * 74, 48, world.height - 48)
        const size = enemyStats[type].size + rng() * 2

        if(Math.hypot(x - frog.x, y - frog.y) < 180) continue
        if(circleCollidesRocks(x, y, size + 10)) continue

        let overlaps = false
        for(const ant of ants){
            if(Math.hypot(x - ant.x, y - ant.y) < size + ant.size + 20){
                overlaps = true
                break
            }
        }
        if(overlaps) continue

        ants.push(createEnemy(type, x, y, rng))
    }
}

export function spawnWaveEnemies(config){
    const startCount = ants.length
    if(config.ants) spawnAnts(startCount + config.ants, "ant")
    if(config.beetles) spawnAnts(ants.length + config.beetles, "beetle")
    if(config.chargers) spawnAnts(ants.length + config.chargers, "charger")
    if(config.summoners) spawnAnts(ants.length + config.summoners, "summoner")
    if(config.snipers) spawnAnts(ants.length + config.snipers, "sniper")
    if(config.spores) spawnAnts(ants.length + config.spores, "spore")
    if(config.heralds) spawnAnts(ants.length + config.heralds, "herald")
    if(config.guards) spawnAnts(ants.length + config.guards, "guard")
}

export function startNextWave(){
    waveState.index += 1
    waveState.pendingTimer = 0
    if(waveState.index >= waveConfigs.length){
        if(!isBossBattleInProgress() && ants.length === 0 && projectiles.length === 0){
            setGameState("victory")
        }
        return
    }

    spawnWaveEnemies(waveConfigs[waveState.index])
    waveState.bannerTimer = 100
}

export function resetRound(options = {}){
    const rebuildWorld = options.rebuildWorld !== false
    resetProgression()
    frog.relics = []
    frog.x = terrain ? terrain.centerX : world.width * 0.5
    frog.y = terrain ? terrain.centerY + 18 : world.height * 0.54
    frog.hp = frog.maxHp
    frog.invuln = 0
    frog.attackCooldown = 0
    frog.dashCooldown = 0
    frog.dashTimer = 0
    frog.dashVX = 0
    frog.dashVY = 0
    frog.motionMode = ""
    frog.jumpCooldown = 0
    frog.jumpTimer = 0
    frog.jumpDirX = 0
    frog.jumpDirY = -1
    frog.lastMoveX = 0
    frog.lastMoveY = -1
    frog.moveDirection = "down"
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
    frog.facingX = 0
    frog.facingY = -1
    frog.walkCycle = 0
    frog.walkBob = 0
    frog.idleCycle = 0
    frog.moveBlend = 0
    frog.speed = playerConfig.moveSpeed
    frog.tongueRange = playerConfig.tongueRange
    frog.defense = playerConfig.defense
    frogAbilities.tongue.cooldown = playerConfig.tongueCooldown
    frogAbilities.jump.cooldown = playerConfig.jumpCooldown
    frogAbilities.dash.cooldown = playerConfig.dashCooldown
    frogAbilities.aoe.cooldown = 96
    frogAbilities.slam.cooldown = playerConfig.slamCooldown
    frogAbilities.poison.cooldown = playerConfig.poisonCooldown
    combatStats.slamRadius = playerConfig.slamRadius
    combatStats.slamDamage = playerConfig.slamDamage
    combatStats.poisonDamage = playerConfig.poisonDamageScale
    combatStats.poisonInterval = playerConfig.poisonTick
    combatStats.dashDistance = playerConfig.dashDistance
    skillTree.tongue.range = 0
    skillTree.tongue.doubleHit = 0
    skillTree.tongue.chain = 0
    skillTree.tongue.crit = 0
    skillTree.tongue.pierce = 0
    skillTree.tongue.frenzy = 0
    skillTree.tongue.bladeWave = 0
    skillTree.dash.range = 0
    skillTree.dash.damage = 0
    skillTree.dash.doubleDash = 0
    skillTree.dash.momentum = 0
    skillTree.dash.shockwave = 0
    skillTree.slam.damage = 0
    skillTree.poison.damage = 0
    skillTree.poison.spread = 0
    skillTree.poison.explosion = 0
    skillTree.poison.duration = 0
    skillTree.poison.pool = 0
    for(const ability of Object.values(frogAbilities)){
        ability.timer = 0
    }
    upgradeState.active = false
    upgradeState.queue = 0
    upgradeState.choices = []
    upgradeState.glowTimer = 0

    tongue.active = false
    tongue.timer = 0
    replaceCollection(particles, [])
    replaceCollection(ants, [])
    replaceCollection(projectiles, [])
    replaceCollection(bladeWaves, [])
    if(rebuildWorld){
        buildTreasures()
        buildEncounterZones()
        buildPlants()
        buildBossLair()
    }
    setGameState("playing")
    mobile.attackPressed = false
    mobile.aoePressed = false
    mobile.dashPressed = false
    mobile.skillPressed = false
    mobile.slamPressed = false
    mobile.attackScale = 1
    mobile.aoeScale = 1
    mobile.dashScale = 1
    mobile.skillScale = 1
    mobile.slamScale = 1
    mobile.attackPointerId = null
    mobile.aoePointerId = null
    mobile.dashPointerId = null
    mobile.skillPointerId = null
    mobile.slamPointerId = null
    bossState.pending = false
    bossState.spawnTimer = 0
    bossState.warningTimer = 0
    bossState.active = false
    bossState.defeated = false
    bossState.entity = null
    waveState.index = 0
    waveState.current = 0
    waveState.cleared = 0
    waveState.pendingTimer = 24
    waveState.bannerTimer = 0
    waveState.bannerText = ""
    waveState.active = false
    resetJoystick()
    const viewWidth = view.width || canvas.width
    const viewHeight = view.height || canvas.height
    camera.x = clamp(frog.x - viewWidth * 0.5, 0, Math.max(0, world.width - viewWidth))
    camera.y = clamp(frog.y - viewHeight * 0.5, 0, Math.max(0, world.height - viewHeight))
}

export function handleTreasureEvent(treasure){
    if(treasure.eventResolved){
        return
    }

    treasure.eventResolved = true
    const seed = (((treasure.x * 97) ^ (treasure.y * 131) ^ 0x7EAD) >>> 0)

    if(treasure.eventType === "ambush"){
        setBanner("宝物伏击", 100)
        grantXP(6)
        spawnConfiguredEnemies(treasure.x, treasure.y, 110, {ants:2, beetles:1, chargers:0, heralds:1}, seed)
    }else if(treasure.eventType === "cache"){
        setBanner("宝箱埋伏", 110)
        grantXP(8)
        maybeDropRelic("cache")
        spawnConfiguredEnemies(treasure.x, treasure.y, 120, {ants:2, beetles:1, chargers:1, snipers:1, heralds:1}, seed + 19)
    }else if(treasure.eventType === "nest"){
        setBanner("污染花巢苏醒", 120)
        grantXP(8)
        spawnConfiguredEnemies(treasure.x, treasure.y, 140, {ants:1, summoners:1, spores:2, guards:1, heralds:1}, seed + 37)
        const localRng = mulberry32(seed + 81)
        const nestTag = `nest_event_${Math.round(treasure.x)}_${Math.round(treasure.y)}`
        const existingPoints = plants.map(plant => ({x:plant.x, y:plant.y}))
        existingPoints.push({x:treasure.x, y:treasure.y})
        plants.push(spawnPollutionNest(treasure.x, treasure.y, localRng))
        plants[plants.length - 1].encounterTag = nestTag
        const localRegion = {
            x1:Math.max(36, treasure.x - 92),
            y1:Math.max(36, treasure.y - 92),
            x2:Math.min(world.width - 36, treasure.x + 92),
            y2:Math.min(world.height - 36, treasure.y + 92)
        }
        for(let i = 0; i < 2; i++){
            const point = findPlacementInRegion(localRegion, 22, 54, existingPoints, localRng, 60)
            if(!point) continue
            existingPoints.push(point)
            plants.push(createPlant(point.x, point.y, localRng, {encounterTag:nestTag}))
        }
    }else if(treasure.eventType === "waygate"){
        setBanner("桥头守卫苏醒", 120)
        grantXP(9)
        spawnConfiguredEnemies(treasure.x, treasure.y, 132, {ants:1, chargers:1, snipers:1, guards:2, heralds:1}, seed + 55)
    }else if(treasure.eventType === "tidecache"){
        setBanner("潮痕秘匣埋伏", 120)
        grantXP(10)
        maybeDropRelic("cache")
        spawnConfiguredEnemies(treasure.x, treasure.y, 138, {ants:1, beetles:1, chargers:1, snipers:1, spores:1, guards:1, heralds:1}, seed + 73)
    }else if(treasure.eventType === "boss"){
        setBanner("首领出现！", 120)
        grantXP(8)
        spawnHitParticles(treasure.x, treasure.y - 8, "#ffcf6b", 18)
    }else{
        setBanner("远古宝藏", 100)
        grantXP(12)
        frog.hp = Math.min(frog.maxHp, frog.hp + 1)
        spawnHitParticles(treasure.x, treasure.y - 8, "#ffe88b", 10)
    }
    maybeDropRelic("treasure")
    waveState.pendingTimer = Math.min(waveState.pendingTimer, 30)

    if(getTreasureCount() >= treasureGoal){
        triggerBossEvent()
    }
}

export function updateWaves(){
    if(gameState !== "playing" || upgradeState.active){
        return
    }

    waveState.bannerTimer = Math.max(0, waveState.bannerTimer - 1)
    updateEncounterZones()
    if(isBossBattleInProgress()){
        return
    }

    if(encounterZones.some(zone => zone.active)){
        return
    }

    waveState.pendingTimer = Math.max(0, waveState.pendingTimer - 1)
    const terrainType = getTerrainTypeAt(frog.x, frog.y)
    const pressure = getTerrainPressureProfile(terrainType)

    if(ants.length === 0){
        if(waveState.active){
            waveState.active = false
            waveState.cleared += 1
            spawnHitParticles(frog.x, frog.y - 14, "#bde57b", 8)
        }

        if(getTreasureCount() >= treasureGoal){
            if(!isBossBattleInProgress() && !bossState.defeated){
                triggerBossEvent()
            }
            return
        }

        if(waveState.pendingTimer <= 0){
            spawnGlobalWave()
        }
        return
    }

    if(waveState.current > 0 && waveState.pendingTimer <= 0 && ants.length <= Math.min(maxActiveEnemies - 1, pressure.sustainFloor)){
        spawnSustainReinforcement()
    }
}
