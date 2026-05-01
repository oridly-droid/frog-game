/**
 * This module builds the world terrain data.
 * It is responsible for terrain generation and clearing geometry, and it does not draw to the main canvas directly.
 */


import { bushAnchors, zoneNames } from "../config/game_config.js"
import { canvas, world, terrain, setTerrainData } from "../core/state.js"
import { mulberry32, createOrganicPoints, getRandomRange, getClosestPointOnSegment } from "../core/utils.js"

export function getClearingMod(angle){
    if(!terrain){
        return 1
    }

    return (
        1 +
        Math.sin(angle * 2 + terrain.edgePhaseA) * 0.08 +
        Math.sin(angle * 3 + terrain.edgePhaseB) * 0.06 +
        Math.cos(angle * 5 + terrain.edgePhaseC) * 0.04
    )
}

export function getBoundaryPoint(angle, offset = 0, scale = 1){
    const mod = getClearingMod(angle)
    const rx = terrain.clearingRadiusX * scale * mod + offset
    const ry = terrain.clearingRadiusY * scale * (1 + Math.sin(angle * 2 + terrain.edgePhaseB) * 0.04) + offset * 0.82

    return {
        x: terrain.centerX + Math.cos(angle) * rx,
        y: terrain.centerY + Math.sin(angle) * ry
    }
}

export function getClearingDistance(x, y, padding = 0){
    if(!terrain){
        return 999
    }

    const rx = terrain.clearingRadiusX + padding
    const ry = terrain.clearingRadiusY + padding * 0.82
    const dx = (x - terrain.centerX) / rx
    const dy = (y - terrain.centerY) / ry
    const angle = Math.atan2(dy, dx)
    return Math.sqrt(dx * dx + dy * dy) / getClearingMod(angle)
}

export function isInsideClearing(x, y, padding = 0){
    return getClearingDistance(x, y, padding) < 1
}

function pointInPolygon(x, y, points){
    let inside = false
    for(let i = 0, j = points.length - 1; i < points.length; j = i++){
        const xi = points[i].x
        const yi = points[i].y
        const xj = points[j].x
        const yj = points[j].y
        const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.00001) + xi)
        if(intersects){
            inside = !inside
        }
    }
    return inside
}

function createTerrainRegionPatch(cx, cy, rx, ry, rng, options = {}){
    const rotation = options.rotation ?? rng() * Math.PI * 2
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const localPoints = createOrganicPoints(
        0,
        0,
        rx,
        ry,
        options.pointCount || 18,
        options.jitter ?? 0.22,
        rng
    )

    return {
        x: cx,
        y: cy,
        rx,
        ry,
        rotation,
        points: localPoints.map(point => ({
            x:cx + point.x * cos - point.y * sin,
            y:cy + point.x * sin + point.y * cos
        }))
    }
}

function addTerrainPatchPack(patches, region, count, rng, options = {}){
    const width = Math.max(48, region.x2 - region.x1)
    const height = Math.max(48, region.y2 - region.y1)
    const marginX = Math.min(width * 0.24, options.marginX ?? Math.max(28, width * 0.12))
    const marginY = Math.min(height * 0.24, options.marginY ?? Math.max(28, height * 0.12))
    const x1 = region.x1 + marginX
    const x2 = region.x2 - marginX
    const y1 = region.y1 + marginY
    const y2 = region.y2 - marginY

    for(let i = 0; i < count; i++){
        const cx = x2 > x1 ? getRandomRange(rng, x1, x2) : (region.x1 + region.x2) * 0.5
        const cy = y2 > y1 ? getRandomRange(rng, y1, y2) : (region.y1 + region.y2) * 0.5
        const rx = width * getRandomRange(rng, options.minRxRatio ?? 0.16, options.maxRxRatio ?? 0.28)
        const ry = height * getRandomRange(rng, options.minRyRatio ?? 0.16, options.maxRyRatio ?? 0.28)
        patches.push(createTerrainRegionPatch(cx, cy, rx, ry, rng, options))
    }
}

function buildTerrainLogicLayer(sourceTerrain, rng){
    const logic = {
        grassFill:"rgba(74,140,86,0.12)",
        mudFill:"rgba(156,110,62,0.28)",
        mudStroke:"rgba(106,72,36,0.24)",
        dangerFill:"rgba(184,76,48,0.32)",
        dangerStroke:"rgba(124,40,24,0.3)",
        mudPatches:[],
        dangerPatches:[]
    }

    const plans = [
        {type:"mud", region:sourceTerrain.zones.shallows, count:4, minRxRatio:0.18, maxRxRatio:0.34, minRyRatio:0.16, maxRyRatio:0.28, jitter:0.28},
        {type:"mud", region:sourceTerrain.zones.bridgehead, count:2, minRxRatio:0.18, maxRxRatio:0.28, minRyRatio:0.2, maxRyRatio:0.36, jitter:0.24},
        {type:"mud", region:sourceTerrain.zones.harbor, count:4, minRxRatio:0.18, maxRxRatio:0.32, minRyRatio:0.14, maxRyRatio:0.24, jitter:0.26},
        {type:"mud", region:sourceTerrain.zones.tideflats, count:4, minRxRatio:0.18, maxRxRatio:0.34, minRyRatio:0.16, maxRyRatio:0.28, jitter:0.3},
        {type:"danger", region:sourceTerrain.zones.thicket, count:3, minRxRatio:0.18, maxRxRatio:0.28, minRyRatio:0.18, maxRyRatio:0.28, jitter:0.26},
        {type:"danger", region:sourceTerrain.zones.pollutedNest, count:4, minRxRatio:0.18, maxRxRatio:0.32, minRyRatio:0.16, maxRyRatio:0.3, jitter:0.3},
        {type:"danger", region:sourceTerrain.zones.shrineWard, count:4, minRxRatio:0.18, maxRxRatio:0.3, minRyRatio:0.16, maxRyRatio:0.28, jitter:0.28}
    ]

    for(const plan of plans){
        const patchList = plan.type === "danger" ? logic.dangerPatches : logic.mudPatches
        addTerrainPatchPack(patchList, plan.region, plan.count, rng, plan)
    }

    return logic
}

function getTerrainTypeFromData(sourceTerrain, x, y){
    const logic = sourceTerrain?.terrainLogic
    if(!logic){
        return "grass"
    }

    for(const patch of logic.dangerPatches){
        if(pointInPolygon(x, y, patch.points)){
            return "danger"
        }
    }

    for(const patch of logic.mudPatches){
        if(pointInPolygon(x, y, patch.points)){
            return "mud"
        }
    }

    return "grass"
}

function getDominantTerrainTypeForRegionFromData(sourceTerrain, region, sampleCols = 5, sampleRows = 5){
    if(!region){
        return "grass"
    }

    const insetX = Math.min((region.x2 - region.x1) * 0.12, 36)
    const insetY = Math.min((region.y2 - region.y1) * 0.12, 36)
    const spanX = Math.max(1, (region.x2 - region.x1) - insetX * 2)
    const spanY = Math.max(1, (region.y2 - region.y1) - insetY * 2)
    const counts = {grass:0, mud:0, danger:0}

    for(let row = 0; row < sampleRows; row++){
        for(let col = 0; col < sampleCols; col++){
            const tx = sampleCols <= 1 ? 0.5 : col / (sampleCols - 1)
            const ty = sampleRows <= 1 ? 0.5 : row / (sampleRows - 1)
            const x = region.x1 + insetX + spanX * tx
            const y = region.y1 + insetY + spanY * ty
            counts[getTerrainTypeFromData(sourceTerrain, x, y)] += 1
        }
    }

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "grass"
}

export function getTerrainTypeAt(x, y){
    return getTerrainTypeFromData(terrain, x, y)
}

export function getTerrainSpeedMultiplier(x, y){
    return getTerrainTypeAt(x, y) === "mud" ? 0.76 : 1
}

export function getTerrainLabel(type){
    if(type === "mud") return "泥地"
    if(type === "danger") return "危险区"
    return "草地"
}

export function getDominantTerrainTypeForRegion(region, sampleCols = 5, sampleRows = 5){
    return getDominantTerrainTypeForRegionFromData(terrain, region, sampleCols, sampleRows)
}

const FIXED_ZONE_TERRAIN_TYPES = {
    shallows:"mud",
    bridgehead:"mud",
    harbor:"mud",
    tideflats:"mud",
    thicket:"danger",
    pollutedNest:"danger",
    shrineWard:"danger"
}

const STRUCTURE_ZONE_DENSITY = {
    meadow:1,
    ruinA:1.04,
    ruinB:1.08,
    causeway:0.9,
    altar:0.92,
    thicket:0.92,
    pollutedNest:0.98,
    shallows:0.86,
    bridgehead:0.82,
    harbor:0.92,
    tideflats:0.82,
    shrineWard:0.9
}

const STRUCTURE_WATER_EDGE_ZONES = new Set(["shallows", "bridgehead", "harbor", "tideflats"])
const STRUCTURE_RUIN_ZONES = new Set(["ruinA", "ruinB", "causeway", "altar", "harbor", "shrineWard", "bridgehead"])

function getRegionCenter(region){
    return {
        x:(region.x1 + region.x2) * 0.5,
        y:(region.y1 + region.y2) * 0.5
    }
}

function shuffleArray(values, rng){
    const output = [...values]
    for(let i = output.length - 1; i > 0; i--){
        const j = Math.floor(rng() * (i + 1))
        ;[output[i], output[j]] = [output[j], output[i]]
    }
    return output
}

function chooseCount(rng, min, max, density = 1){
    let count = min + Math.floor(rng() * (max - min + 1))
    if(density < 0.96 && count > min && rng() > density){
        count -= 1
    }
    if(density > 1.04 && count < max && rng() < density - 1.02){
        count += 1
    }
    return count
}

function buildZoneStructurePlan(zoneKey, terrainType, rng){
    const density = STRUCTURE_ZONE_DENSITY[zoneKey] || 1
    const isWaterEdgeZone = STRUCTURE_WATER_EDGE_ZONES.has(zoneKey)
    const isRuinZone = STRUCTURE_RUIN_ZONES.has(zoneKey)
    const plan = []
    const pushGroup = (type, count) => {
        for(let i = 0; i < count; i++){
            plan.push(type)
        }
    }

    if(terrainType === "mud"){
        pushGroup("lily", chooseCount(rng, 1, isWaterEdgeZone ? 2 : 1, density))
        if(rng() < 0.46 * density){
            pushGroup("stone", 1)
        }
        if(rng() < (isRuinZone ? 0.58 : 0.32) * density){
            pushGroup("brokenWall", 1)
        }
        if(isRuinZone && rng() < 0.28 * density){
            pushGroup("ruin", 1)
        }
    }else if(terrainType === "danger"){
        pushGroup("brokenWall", chooseCount(rng, 1, 2, density))
        if(isRuinZone || rng() < 0.76){
            pushGroup("ruin", 1)
        }
        if(rng() < 0.58 * density){
            pushGroup("stone", 1)
        }
    }else{
        pushGroup("stone", chooseCount(rng, zoneKey === "meadow" ? 2 : 1, zoneKey === "meadow" ? 3 : 2, density))
        if(isRuinZone && rng() < 0.82 * density){
            pushGroup("ruin", 1)
        }
        if(isRuinZone && rng() < 0.52 * density){
            pushGroup("brokenWall", 1)
        }
        if(isWaterEdgeZone && rng() < 0.18 * density){
            pushGroup("lily", 1)
        }
    }

    if(zoneKey === "harbor"){
        if(!plan.includes("lily")){
            pushGroup("lily", 1)
        }
        if(!plan.includes("stone")){
            pushGroup("stone", 1)
        }
    }
    if(zoneKey === "bridgehead" && !plan.includes("brokenWall")){
        pushGroup("brokenWall", 1)
    }
    if(zoneKey === "pollutedNest" && !plan.includes("brokenWall")){
        pushGroup("brokenWall", 1)
    }
    if(zoneKey === "shrineWard" && !plan.includes("ruin")){
        pushGroup("ruin", 1)
    }

    const cap =
        zoneKey === "meadow" ? 3 :
        (terrainType === "danger" || isRuinZone || isWaterEdgeZone) ? 3 :
        2

    return shuffleArray(plan, rng).slice(0, cap)
}

function buildOpenLayoutProtectedAreas(sourceTerrain, minDim){
    const circle = (zoneKey, radius) => {
        const center = getRegionCenter(sourceTerrain.zones[zoneKey])
        return {...center, r:radius}
    }
    const spawnCenter = {x:sourceTerrain.centerX, y:sourceTerrain.centerY}
    const spawnCircle = {
        x:spawnCenter.x,
        y:spawnCenter.y,
        r:Math.max(300, minDim * 0.05)
    }
    const circles = [
        spawnCircle,
        circle("meadow", Math.max(268, minDim * 0.043)),
        circle("ruinA", Math.max(212, minDim * 0.034)),
        circle("ruinB", Math.max(220, minDim * 0.035)),
        circle("causeway", Math.max(182, minDim * 0.029)),
        circle("altar", Math.max(214, minDim * 0.034)),
        circle("thicket", Math.max(198, minDim * 0.031)),
        circle("pollutedNest", Math.max(204, minDim * 0.032)),
        circle("shallows", Math.max(176, minDim * 0.028)),
        circle("bridgehead", Math.max(168, minDim * 0.027)),
        circle("harbor", Math.max(224, minDim * 0.035)),
        circle("tideflats", Math.max(172, minDim * 0.027)),
        circle("shrineWard", Math.max(206, minDim * 0.032))
    ]
    const lane = (from, to, radius) => ({x1:from.x, y1:from.y, x2:to.x, y2:to.y, r:radius})
    const causewayCenter = getRegionCenter(sourceTerrain.zones.causeway)
    const bridgeheadCenter = getRegionCenter(sourceTerrain.zones.bridgehead)
    const lanes = [
        lane(spawnCenter, getRegionCenter(sourceTerrain.zones.ruinA), Math.max(118, minDim * 0.0185)),
        lane(spawnCenter, getRegionCenter(sourceTerrain.zones.pollutedNest), Math.max(124, minDim * 0.0195)),
        lane(spawnCenter, causewayCenter, Math.max(126, minDim * 0.02)),
        lane(spawnCenter, getRegionCenter(sourceTerrain.zones.ruinB), Math.max(132, minDim * 0.021)),
        lane(causewayCenter, bridgeheadCenter, Math.max(120, minDim * 0.019)),
        lane(bridgeheadCenter, getRegionCenter(sourceTerrain.zones.harbor), Math.max(106, minDim * 0.017)),
        lane(bridgeheadCenter, getRegionCenter(sourceTerrain.zones.tideflats), Math.max(104, minDim * 0.0165)),
        lane(bridgeheadCenter, getRegionCenter(sourceTerrain.zones.shrineWard), Math.max(106, minDim * 0.017))
    ]

    return {circles, lanes}
}

function getGroupFootprintRadius(groupType, minDim){
    if(groupType === "ruin") return Math.max(232, minDim * 0.037)
    if(groupType === "stone") return Math.max(224, minDim * 0.035)
    if(groupType === "brokenWall") return Math.max(214, minDim * 0.034)
    return Math.max(192, minDim * 0.031)
}

function isInsideWorldMargin(x, y, margin = 0){
    return x >= margin && y >= margin && x <= world.width - margin && y <= world.height - margin
}

function isNearProtectedOpenLayout(x, y, protectedAreas, padding = 0){
    for(const circle of protectedAreas.circles){
        if(Math.hypot(x - circle.x, y - circle.y) < circle.r + padding){
            return true
        }
    }

    for(const lane of protectedAreas.lanes){
        const point = getClosestPointOnSegment(x, y, lane.x1, lane.y1, lane.x2, lane.y2)
        if(Math.hypot(x - point.x, y - point.y) < lane.r + padding){
            return true
        }
    }

    return false
}

function circleCollidesGeometry(sourceTerrain, x, y, radius, extraRocks = [], extraBarriers = []){
    for(const rock of sourceTerrain.rocks || []){
        if(Math.hypot(x - rock.x, y - rock.y) < rock.r * 0.82 + radius){
            return true
        }
    }

    for(const rock of extraRocks){
        if(Math.hypot(x - rock.x, y - rock.y) < rock.r * 0.82 + radius){
            return true
        }
    }

    for(const barrier of sourceTerrain.barriers || []){
        const point = getClosestPointOnSegment(x, y, barrier.x1, barrier.y1, barrier.x2, barrier.y2)
        if(Math.hypot(x - point.x, y - point.y) < barrier.radius + radius){
            return true
        }
    }

    for(const barrier of extraBarriers){
        const point = getClosestPointOnSegment(x, y, barrier.x1, barrier.y1, barrier.x2, barrier.y2)
        if(Math.hypot(x - point.x, y - point.y) < barrier.radius + radius){
            return true
        }
    }

    return false
}

function countOpenDirections(sourceTerrain, x, y, sampleRadius, probeRadius, extraRocks = [], extraBarriers = []){
    let open = 0

    for(let i = 0; i < 12; i++){
        const angle = i / 12 * Math.PI * 2
        const px = x + Math.cos(angle) * sampleRadius
        const py = y + Math.sin(angle) * sampleRadius

        if(!isInsideWorldMargin(px, py, probeRadius + 10)){
            continue
        }

        if(!circleCollidesGeometry(sourceTerrain, px, py, probeRadius, extraRocks, extraBarriers)){
            open++
        }
    }

    return open
}

function hasWidePocket(sourceTerrain, x, y, radius, extraRocks = [], extraBarriers = []){
    if(!isInsideWorldMargin(x, y, radius + 14)){
        return false
    }

    if(circleCollidesGeometry(sourceTerrain, x, y, radius, extraRocks, extraBarriers)){
        return false
    }

    const nearOpen = countOpenDirections(sourceTerrain, x, y, radius + 50, Math.max(16, radius * 0.42), extraRocks, extraBarriers)
    const farOpen = countOpenDirections(sourceTerrain, x, y, radius + 96, Math.max(16, radius * 0.42), extraRocks, extraBarriers)
    return nearOpen >= 7 && farOpen >= 7
}

function createBarrierAt(x, y, length, angle, radius, type = "wall"){
    const halfLength = length * 0.5
    const dx = Math.cos(angle) * halfLength
    const dy = Math.sin(angle) * halfLength

    return {
        x1:x - dx,
        y1:y - dy,
        x2:x + dx,
        y2:y + dy,
        radius,
        type
    }
}

function hasWideBarrierPocket(sourceTerrain, barrier, extraBarriers = []){
    const midX = (barrier.x1 + barrier.x2) * 0.5
    const midY = (barrier.y1 + barrier.y2) * 0.5
    const length = Math.hypot(barrier.x2 - barrier.x1, barrier.y2 - barrier.y1)
    const sampleRadius = Math.max(104, length * 0.62 + barrier.radius + 18)
    const surroundingOpen = countOpenDirections(
        sourceTerrain,
        midX,
        midY,
        sampleRadius,
        Math.max(18, barrier.radius * 0.7),
        [],
        extraBarriers
    )

    return surroundingOpen >= 8
}

function registerPrefabPlacement(sourceTerrain, placement){
    sourceTerrain.prefabs.push(placement)
    const zoneStats = sourceTerrain.prefabStats[placement.zoneKey] || {
        stone:0,
        pillar:0,
        arch:0,
        wallSoft:0,
        wallCorner:0,
        stairs:0,
        tower:0,
        lily:0,
        hard:0,
        soft:0,
        total:0
    }
    zoneStats[placement.kind] = (zoneStats[placement.kind] || 0) + 1
    zoneStats.total += 1
    if(placement.blocking === "none"){
        zoneStats.soft += 1
    }else{
        zoneStats.hard += 1
    }
    sourceTerrain.prefabStats[placement.zoneKey] = zoneStats
}

function commitRockPrefab(sourceTerrain, placement){
    sourceTerrain.rocks.push({
        x:placement.x,
        y:placement.y,
        r:placement.collisionRadius
    })
    registerPrefabPlacement(sourceTerrain, placement)
}

function commitBarrierPrefab(sourceTerrain, placement, barrier){
    sourceTerrain.barriers.push({
        ...barrier,
        pebbles:[]
    })
    registerPrefabPlacement(sourceTerrain, placement)
}

function createGroupDraft(){
    return {entries:[]}
}

function getDraftPlacements(draft){
    return draft.entries.map(entry => entry.placement)
}

function getDraftRocks(draft){
    return draft.entries.filter(entry => entry.rock).map(entry => entry.rock)
}

function getDraftBarriers(draft){
    return draft.entries.filter(entry => entry.barrier).map(entry => entry.barrier)
}

function addDraftRock(draft, placement){
    draft.entries.push({
        placement,
        rock:{
            x:placement.x,
            y:placement.y,
            r:placement.collisionRadius
        }
    })
}

function addDraftBarrier(draft, placement, barrier){
    draft.entries.push({placement, barrier})
}

function addDraftSoft(draft, placement){
    draft.entries.push({placement})
}

const PREFAB_ASPECTS = {
    rock_cluster:296 / 462,
    pillar_set:296 / 478,
    ruin_arch:358 / 452,
    ruin_wall_soft:300 / 488,
    ruin_wall_corner:287 / 452,
    ruin_stairs:366 / 458,
    ruin_tower:323 / 434,
    lily_cluster_1:137 / 324,
    lily_cluster_2:197 / 544
}

function buildStonePlacement(zoneKey, terrainType, x, y, rng){
    const scale = getRandomRange(rng, 1.72, 1.94)
    const width = getRandomRange(rng, 178, 206) * scale
    return {
        kind:"stone",
        assetKey:"rock_cluster",
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height:width * PREFAB_ASPECTS.rock_cluster,
        rotation:(rng() - 0.5) * 0.16,
        collisionRadius:width * getRandomRange(rng, 0.27, 0.31),
        blocking:"rock",
        anchorGap:Math.max(172, width * 0.82),
        pivotX:0.5,
        pivotY:0.82
    }
}

function buildPillarPlacement(zoneKey, terrainType, x, y, rng, rotation = (rng() - 0.5) * 0.08){
    const scale = getRandomRange(rng, 1.6, 1.8)
    const width = getRandomRange(rng, 164, 192) * scale
    return {
        kind:"pillar",
        assetKey:"pillar_set",
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height:width * PREFAB_ASPECTS.pillar_set,
        rotation,
        collisionRadius:Math.max(34, width * 0.18),
        blocking:"rock",
        anchorGap:Math.max(168, width * 0.84),
        pivotX:0.5,
        pivotY:0.82
    }
}

function buildArchPlacement(zoneKey, terrainType, x, y, rng, rotation = (rng() - 0.5) * 0.1){
    const scale = getRandomRange(rng, 1.68, 1.94)
    const width = getRandomRange(rng, 188, 216) * scale
    return {
        kind:"arch",
        assetKey:"ruin_arch",
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height:width * PREFAB_ASPECTS.ruin_arch,
        rotation,
        collisionRadius:0,
        blocking:"none",
        anchorGap:Math.max(178, width * 0.84),
        pivotX:0.5,
        pivotY:0.84
    }
}

function buildTowerPlacement(zoneKey, terrainType, x, y, rng, rotation = (rng() - 0.5) * 0.08){
    const scale = getRandomRange(rng, 1.6, 1.86)
    const width = getRandomRange(rng, 174, 200) * scale
    return {
        kind:"tower",
        assetKey:"ruin_tower",
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height:width * PREFAB_ASPECTS.ruin_tower,
        rotation,
        collisionRadius:Math.max(34, width * 0.22),
        blocking:"rock",
        anchorGap:Math.max(170, width * 0.82),
        pivotX:0.5,
        pivotY:0.84
    }
}

function buildStairsPlacement(zoneKey, terrainType, x, y, rng, rotation = (rng() - 0.5) * 0.08){
    const scale = getRandomRange(rng, 1.22, 1.42)
    const width = getRandomRange(rng, 168, 194) * scale
    return {
        kind:"stairs",
        assetKey:"ruin_stairs",
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height:width * PREFAB_ASPECTS.ruin_stairs,
        rotation,
        collisionRadius:0,
        blocking:"none",
        anchorGap:Math.max(156, width * 0.78),
        pivotX:0.5,
        pivotY:0.82
    }
}

function buildLilyPlacement(zoneKey, terrainType, x, y, rng){
    const useLargeCluster = rng() < 0.56
    const assetKey = useLargeCluster ? "lily_cluster_2" : "lily_cluster_1"
    const scale = useLargeCluster
        ? getRandomRange(rng, 0.92, 1.08)
        : getRandomRange(rng, 0.84, 1.02)
    const width = (
        useLargeCluster
            ? getRandomRange(rng, 176, 214)
            : getRandomRange(rng, 122, 154)
    ) * scale
    return {
        kind:"lily",
        assetKey,
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height:width * PREFAB_ASPECTS[assetKey],
        rotation:(rng() - 0.5) * 0.18,
        collisionRadius:0,
        blocking:"none",
        anchorGap:Math.max(116, width * (useLargeCluster ? 0.78 : 0.72)),
        pivotX:0.5,
        pivotY:0.64
    }
}

function buildWallPlacement(kind, zoneKey, terrainType, x, y, rotation, rng){
    const corner = kind === "wallCorner"
    const scale = corner ? getRandomRange(rng, 1.2, 1.36) : getRandomRange(rng, 1.26, 1.44)
    const width = (corner ? getRandomRange(rng, 164, 190) : getRandomRange(rng, 178, 208)) * scale
    const height = width * (corner ? PREFAB_ASPECTS.ruin_wall_corner : PREFAB_ASPECTS.ruin_wall_soft)
    const barrierRadius = (corner ? getRandomRange(rng, 17, 21) : getRandomRange(rng, 18, 22)) * Math.max(1, scale * 0.84)
    const barrierLength = (corner ? getRandomRange(rng, 84, 104) : getRandomRange(rng, 92, 116)) * Math.max(1, scale * 0.8)
    const placement = {
        kind,
        assetKey:corner ? "ruin_wall_corner" : "ruin_wall_soft",
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height,
        rotation,
        collisionRadius:barrierRadius,
        blocking:"barrier",
        anchorGap:Math.max(150, width * 0.72),
        pivotX:0.5,
        pivotY:0.82
    }

    return {
        placement,
        barrier:createBarrierAt(x, y, barrierLength, rotation, barrierRadius, "wall")
    }
}

function buildRuinWallPlacement(kind, zoneKey, terrainType, x, y, rotation, rng){
    const corner = kind === "wallCorner"
    const scale = corner ? getRandomRange(rng, 1.16, 1.3) : getRandomRange(rng, 1.18, 1.34)
    const width = (corner ? getRandomRange(rng, 156, 182) : getRandomRange(rng, 170, 198)) * scale
    const height = width * (corner ? PREFAB_ASPECTS.ruin_wall_corner : PREFAB_ASPECTS.ruin_wall_soft)
    const barrierRadius = (corner ? getRandomRange(rng, 14, 17) : getRandomRange(rng, 15, 18)) * scale
    const barrierLength = (corner ? getRandomRange(rng, 70, 88) : getRandomRange(rng, 78, 96)) * scale
    const placement = {
        kind,
        assetKey:corner ? "ruin_wall_corner" : "ruin_wall_soft",
        zoneKey,
        terrainType,
        x,
        y,
        scale,
        width,
        height,
        rotation,
        collisionRadius:barrierRadius,
        blocking:"barrier",
        anchorGap:Math.max(138, width * 0.66),
        pivotX:0.5,
        pivotY:0.82
    }

    return {
        placement,
        barrier:createBarrierAt(x, y, barrierLength, rotation, barrierRadius, "wall")
    }
}

function getPlacementGap(placement, other, factor = 1){
    const baseGap = Math.min(placement.anchorGap || 120, other.anchorGap || 120)
    const densityFactor =
        placement.blocking === "none" && other.blocking === "none" ? 0.76 :
        placement.blocking === "none" || other.blocking === "none" ? 0.68 :
        0.84
    return baseGap * densityFactor * factor
}

function hasPlacementSpacing(placement, placements, factor = 1){
    for(const other of placements){
        if(!other || other === placement) continue
        if(Math.hypot(placement.x - other.x, placement.y - other.y) < getPlacementGap(placement, other, factor)){
            return false
        }
    }
    return true
}

function canPlaceRockDraft(sourceTerrain, placement, protectedAreas, draft){
    const extraRocks = getDraftRocks(draft)
    const extraBarriers = getDraftBarriers(draft)
    if(!isInsideWorldMargin(placement.x, placement.y, Math.max(52, placement.collisionRadius + 18))){
        return false
    }
    if(isNearProtectedOpenLayout(placement.x, placement.y, protectedAreas, placement.collisionRadius + 32)){
        return false
    }
    if(circleCollidesGeometry(sourceTerrain, placement.x, placement.y, placement.collisionRadius, extraRocks, extraBarriers)){
        return false
    }
    if(!hasWidePocket(sourceTerrain, placement.x, placement.y, Math.max(18, placement.collisionRadius * 0.86), extraRocks, extraBarriers)){
        return false
    }
    if(!hasPlacementSpacing(placement, sourceTerrain.prefabs, 1)){
        return false
    }
    if(!hasPlacementSpacing(placement, getDraftPlacements(draft), 0.62)){
        return false
    }
    return true
}

function canPlaceSoftDraft(sourceTerrain, placement, protectedAreas, draft){
    const extraRocks = getDraftRocks(draft)
    const extraBarriers = getDraftBarriers(draft)
    const softRadius = Math.max(24, placement.width * 0.12)
    if(!isInsideWorldMargin(placement.x, placement.y, Math.max(46, softRadius + 14))){
        return false
    }
    if(isNearProtectedOpenLayout(placement.x, placement.y, protectedAreas, 32)){
        return false
    }
    if(circleCollidesGeometry(sourceTerrain, placement.x, placement.y, softRadius, extraRocks, extraBarriers)){
        return false
    }
    if(!hasPlacementSpacing(placement, sourceTerrain.prefabs, 1)){
        return false
    }
    if(!hasPlacementSpacing(placement, getDraftPlacements(draft), 0.72)){
        return false
    }
    return true
}

function canPlaceBarrierDraft(sourceTerrain, placement, barrier, protectedAreas, draft){
    const extraRocks = getDraftRocks(draft)
    const extraBarriers = getDraftBarriers(draft)
    if(
        !isInsideWorldMargin(placement.x, placement.y, Math.max(56, barrier.radius + 18)) ||
        !isInsideWorldMargin(barrier.x1, barrier.y1, barrier.radius + 12) ||
        !isInsideWorldMargin(barrier.x2, barrier.y2, barrier.radius + 12)
    ){
        return false
    }
    if(
        isNearProtectedOpenLayout(placement.x, placement.y, protectedAreas, barrier.radius + 40) ||
        isNearProtectedOpenLayout(barrier.x1, barrier.y1, protectedAreas, 24) ||
        isNearProtectedOpenLayout(barrier.x2, barrier.y2, protectedAreas, 24)
    ){
        return false
    }
    if(
        circleCollidesGeometry(sourceTerrain, placement.x, placement.y, barrier.radius + 12, extraRocks, extraBarriers) ||
        circleCollidesGeometry(sourceTerrain, barrier.x1, barrier.y1, barrier.radius + 8, extraRocks, extraBarriers) ||
        circleCollidesGeometry(sourceTerrain, barrier.x2, barrier.y2, barrier.radius + 8, extraRocks, extraBarriers)
    ){
        return false
    }
    if(!hasWideBarrierPocket(sourceTerrain, barrier, extraBarriers)){
        return false
    }
    if(!hasPlacementSpacing(placement, sourceTerrain.prefabs, 1)){
        return false
    }
    if(!hasPlacementSpacing(placement, getDraftPlacements(draft), 0.52)){
        return false
    }
    return true
}

function canPlaceLooseBarrierDraft(sourceTerrain, placement, barrier, protectedAreas, draft){
    const extraRocks = getDraftRocks(draft)
    const extraBarriers = getDraftBarriers(draft)
    if(
        !isInsideWorldMargin(placement.x, placement.y, Math.max(54, barrier.radius + 16)) ||
        !isInsideWorldMargin(barrier.x1, barrier.y1, barrier.radius + 10) ||
        !isInsideWorldMargin(barrier.x2, barrier.y2, barrier.radius + 10)
    ){
        return false
    }
    if(
        isNearProtectedOpenLayout(placement.x, placement.y, protectedAreas, barrier.radius + 30) ||
        isNearProtectedOpenLayout(barrier.x1, barrier.y1, protectedAreas, 18) ||
        isNearProtectedOpenLayout(barrier.x2, barrier.y2, protectedAreas, 18)
    ){
        return false
    }
    if(
        circleCollidesGeometry(sourceTerrain, placement.x, placement.y, barrier.radius + 10, extraRocks, extraBarriers) ||
        circleCollidesGeometry(sourceTerrain, barrier.x1, barrier.y1, barrier.radius + 7, extraRocks, extraBarriers) ||
        circleCollidesGeometry(sourceTerrain, barrier.x2, barrier.y2, barrier.radius + 7, extraRocks, extraBarriers)
    ){
        return false
    }
    if(countOpenDirections(sourceTerrain, placement.x, placement.y, 126, 18, extraRocks, extraBarriers) < 6){
        return false
    }
    if(!hasPlacementSpacing(placement, sourceTerrain.prefabs, 0.92)){
        return false
    }
    if(!hasPlacementSpacing(placement, getDraftPlacements(draft), 0.44)){
        return false
    }
    return true
}

function countGroupOpenSides(sourceTerrain, center, radius, draft){
    const extraRocks = getDraftRocks(draft)
    const extraBarriers = getDraftBarriers(draft)
    let open = 0

    for(let i = 0; i < 8; i++){
        const angle = i / 8 * Math.PI * 2
        const pointX = center.x + Math.cos(angle) * radius
        const pointY = center.y + Math.sin(angle) * radius * 0.92
        if(
            isInsideWorldMargin(pointX, pointY, 24) &&
            !circleCollidesGeometry(sourceTerrain, pointX, pointY, 24, extraRocks, extraBarriers)
        ){
            open++
        }
    }

    return open
}

function findStructureGroupAnchor(sourceTerrain, zoneKey, groupType, protectedAreas, existingAnchors, rng, minDim){
    const zone = sourceTerrain.zones[zoneKey]
    const width = zone.x2 - zone.x1
    const height = zone.y2 - zone.y1
    const footprintRadius = getGroupFootprintRadius(groupType, minDim)
    const marginX = Math.min(width * 0.22, footprintRadius * 0.76)
    const marginY = Math.min(height * 0.22, footprintRadius * 0.76)
    const x1 = zone.x1 + marginX
    const x2 = zone.x2 - marginX
    const y1 = zone.y1 + marginY
    const y2 = zone.y2 - marginY

    for(let attempt = 0; attempt < 160; attempt++){
        let x = x2 > x1 ? getRandomRange(rng, x1, x2) : (zone.x1 + zone.x2) * 0.5
        let y = y2 > y1 ? getRandomRange(rng, y1, y2) : (zone.y1 + zone.y2) * 0.5

        if(groupType === "lily" && STRUCTURE_WATER_EDGE_ZONES.has(zoneKey) && rng() < 0.62){
            if(width > height){
                y = rng() < 0.5
                    ? getRandomRange(rng, zone.y1 + marginY, zone.y1 + marginY + Math.max(42, (y2 - y1) * 0.28))
                    : getRandomRange(rng, zone.y2 - marginY - Math.max(42, (y2 - y1) * 0.28), zone.y2 - marginY)
            }else{
                x = rng() < 0.5
                    ? getRandomRange(rng, zone.x1 + marginX, zone.x1 + marginX + Math.max(42, (x2 - x1) * 0.28))
                    : getRandomRange(rng, zone.x2 - marginX - Math.max(42, (x2 - x1) * 0.28), zone.x2 - marginX)
            }
        }

        if(isNearProtectedOpenLayout(x, y, protectedAreas, footprintRadius + 48)){
            continue
        }
        if(!isInsideWorldMargin(x, y, Math.max(58, footprintRadius * 0.28))){
            continue
        }
        if(circleCollidesGeometry(sourceTerrain, x, y, Math.max(26, footprintRadius * 0.2))){
            continue
        }
        let tooClose = false
        for(const anchor of existingAnchors){
            if(Math.hypot(x - anchor.x, y - anchor.y) < (anchor.footprintRadius + footprintRadius) * 0.9){
                tooClose = true
                break
            }
        }
        if(tooClose){
            continue
        }
        if(groupType !== "lily" && !hasWidePocket(sourceTerrain, x, y, Math.max(24, footprintRadius * 0.2))){
            continue
        }
        return {x, y, footprintRadius}
    }

    return null
}

function commitStructureGroup(sourceTerrain, groupType, zoneKey, terrainType, anchor, draft){
    const groupId = `structure_${sourceTerrain.structureGroups.length + 1}`
    const members = []

    for(const entry of draft.entries){
        entry.placement.groupId = groupId
        entry.placement.groupType = groupType
        members.push({
            kind:entry.placement.kind,
            x:entry.placement.x,
            y:entry.placement.y,
            blocking:entry.placement.blocking
        })

        if(entry.rock){
            commitRockPrefab(sourceTerrain, entry.placement)
        }else if(entry.barrier){
            commitBarrierPrefab(sourceTerrain, entry.placement, entry.barrier)
        }else{
            registerPrefabPlacement(sourceTerrain, entry.placement)
        }
    }

    sourceTerrain.structureGroups.push({
        id:groupId,
        groupType,
        zoneKey,
        terrainType,
        x:anchor.x,
        y:anchor.y,
        footprintRadius:anchor.footprintRadius,
        memberCount:members.length,
        members
    })
}

function tryPlaceStoneGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas){
    const draft = createGroupDraft()
    const stoneCount = rng() < 0.58 ? 2 : 3
    const baseAngle = rng() * Math.PI * 2

    for(let i = 0; i < stoneCount; i++){
        const angle = baseAngle + i / stoneCount * Math.PI * 2 + (rng() - 0.5) * 0.7
        const radius = stoneCount === 2 ? 96 + rng() * 68 : 88 + rng() * 74
        const placement = buildStonePlacement(
            zoneKey,
            terrainType,
            anchor.x + Math.cos(angle) * radius,
            anchor.y + Math.sin(angle) * radius * 0.84,
            rng
        )
        if(!canPlaceRockDraft(sourceTerrain, placement, protectedAreas, draft)){
            return false
        }
        addDraftRock(draft, placement)
    }

    if(countGroupOpenSides(sourceTerrain, anchor, anchor.footprintRadius * 0.78, draft) < 5){
        return false
    }

    commitStructureGroup(sourceTerrain, "stone", zoneKey, terrainType, anchor, draft)
    return true
}

function tryPlaceLilyGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas){
    const draft = createGroupDraft()
    const lilyCount = 2 + Math.floor(rng() * 3)
    const baseAngle = rng() * Math.PI * 2

    for(let i = 0; i < lilyCount; i++){
        const angle = baseAngle + (i - (lilyCount - 1) * 0.5) * 0.72 + (rng() - 0.5) * 0.34
        const radius = 26 + rng() * 74
        const placement = buildLilyPlacement(
            zoneKey,
            terrainType,
            anchor.x + Math.cos(angle) * radius,
            anchor.y + Math.sin(angle) * radius * 0.9,
            rng
        )
        if(!canPlaceSoftDraft(sourceTerrain, placement, protectedAreas, draft)){
            return false
        }
        addDraftSoft(draft, placement)
    }

    if(countGroupOpenSides(sourceTerrain, anchor, anchor.footprintRadius * 0.72, draft) < 5){
        return false
    }

    commitStructureGroup(sourceTerrain, "lily", zoneKey, terrainType, anchor, draft)
    return true
}

function tryPlaceBrokenWallGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas){
    const draft = createGroupDraft()
    const pieceCount = rng() < 0.62 ? 2 : 3
    const axisAngle = rng() * Math.PI * 2
    const normalAngle = axisAngle + Math.PI * 0.5
    const patterns = pieceCount === 2
        ? [
            {along:-56, across:-30, rotation:-0.16},
            {along:62, across:34, rotation:0.2}
        ]
        : [
            {along:-86, across:-26, rotation:-0.2},
            {along:-6, across:48, rotation:0.52},
            {along:82, across:-18, rotation:0.12}
        ]

    for(let i = 0; i < pieceCount; i++){
        const pattern = patterns[i]
        const kind = rng() < 0.34 ? "wallCorner" : "wallSoft"
        const x = anchor.x + Math.cos(axisAngle) * pattern.along + Math.cos(normalAngle) * pattern.across
        const y = anchor.y + Math.sin(axisAngle) * pattern.along + Math.sin(normalAngle) * pattern.across
        const { placement, barrier } = buildWallPlacement(kind, zoneKey, terrainType, x, y, axisAngle + pattern.rotation + (rng() - 0.5) * 0.18, rng)
        if(!canPlaceBarrierDraft(sourceTerrain, placement, barrier, protectedAreas, draft)){
            return false
        }
        addDraftBarrier(draft, placement, barrier)
    }

    if(countGroupOpenSides(sourceTerrain, anchor, anchor.footprintRadius * 0.82, draft) < 5){
        return false
    }

    commitStructureGroup(sourceTerrain, "brokenWall", zoneKey, terrainType, anchor, draft)
    return true
}

function tryPlaceRuinGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas){
    const draft = createGroupDraft()
    const openAngle = rng() * Math.PI * 2
    const backAngle = openAngle + Math.PI
    const tangentAngle = openAngle + Math.PI * 0.5
    const wallSide = rng() < 0.5 ? -1 : 1
    const wallKind = rng() < 0.34 ? "wallCorner" : "wallSoft"
    const { placement:wallPlacement, barrier:wallBarrier } = buildRuinWallPlacement(
        wallKind,
        zoneKey,
        terrainType,
        anchor.x + Math.cos(backAngle) * (114 + rng() * 22) + Math.cos(tangentAngle) * wallSide * (62 + rng() * 18),
        anchor.y + Math.sin(backAngle) * (104 + rng() * 20) + Math.sin(tangentAngle) * wallSide * (54 + rng() * 16),
        tangentAngle + wallSide * 0.14 + (rng() - 0.5) * 0.16,
        rng
    )
    if(!canPlaceLooseBarrierDraft(sourceTerrain, wallPlacement, wallBarrier, protectedAreas, draft)){
        return false
    }
    addDraftBarrier(draft, wallPlacement, wallBarrier)

    const pillarPlacement = buildPillarPlacement(
        zoneKey,
        terrainType,
        anchor.x + Math.cos(backAngle) * (88 + rng() * 18) + Math.cos(tangentAngle) * -wallSide * (52 + rng() * 18),
        anchor.y + Math.sin(backAngle) * (86 + rng() * 16) + Math.sin(tangentAngle) * -wallSide * (46 + rng() * 14),
        rng,
        (rng() - 0.5) * 0.06
    )
    if(!canPlaceRockDraft(sourceTerrain, pillarPlacement, protectedAreas, draft)){
        return false
    }
    addDraftRock(draft, pillarPlacement)

    const archPlacement = buildArchPlacement(
        zoneKey,
        terrainType,
        anchor.x + Math.cos(openAngle) * (14 + rng() * 24) + Math.cos(tangentAngle) * -wallSide * (18 + rng() * 18),
        anchor.y + Math.sin(openAngle) * (16 + rng() * 18) + Math.sin(tangentAngle) * -wallSide * (12 + rng() * 16),
        rng,
        tangentAngle + wallSide * 0.08 + (rng() - 0.5) * 0.12
    )
    if(!canPlaceSoftDraft(sourceTerrain, archPlacement, protectedAreas, draft)){
        return false
    }
    addDraftSoft(draft, archPlacement)

    if(rng() < 0.54){
        const stairsPlacement = buildStairsPlacement(
            zoneKey,
            terrainType,
            anchor.x + Math.cos(backAngle) * (34 + rng() * 28) + Math.cos(tangentAngle) * wallSide * (10 + rng() * 16),
            anchor.y + Math.sin(backAngle) * (28 + rng() * 24) + Math.sin(tangentAngle) * wallSide * (8 + rng() * 14),
            rng,
            tangentAngle + wallSide * 0.04 + (rng() - 0.5) * 0.14
        )
        if(canPlaceSoftDraft(sourceTerrain, stairsPlacement, protectedAreas, draft)){
            addDraftSoft(draft, stairsPlacement)
        }
    }

    if(rng() < 0.36){
        const towerPlacement = buildTowerPlacement(
            zoneKey,
            terrainType,
            anchor.x + Math.cos(backAngle) * (122 + rng() * 18) + Math.cos(tangentAngle) * -wallSide * (82 + rng() * 18),
            anchor.y + Math.sin(backAngle) * (110 + rng() * 18) + Math.sin(tangentAngle) * -wallSide * (68 + rng() * 16),
            rng,
            (rng() - 0.5) * 0.08
        )
        if(canPlaceRockDraft(sourceTerrain, towerPlacement, protectedAreas, draft)){
            addDraftRock(draft, towerPlacement)
        }
    }

    if(countGroupOpenSides(sourceTerrain, anchor, anchor.footprintRadius * 0.82, draft) < 5){
        return false
    }

    commitStructureGroup(sourceTerrain, "ruin", zoneKey, terrainType, anchor, draft)
    return true
}

function tryPlaceStructureGroup(sourceTerrain, zoneKey, terrainType, groupType, anchor, rng, protectedAreas){
    if(groupType === "ruin"){
        return tryPlaceRuinGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas)
    }
    if(groupType === "stone"){
        return tryPlaceStoneGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas)
    }
    if(groupType === "brokenWall"){
        return tryPlaceBrokenWallGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas)
    }
    return tryPlaceLilyGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas)
}

function isCheckpointReachable(sourceTerrain, reachable, step, cols, rows, point){
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(point.x / step)))
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(point.y / step)))

    for(let oy = -1; oy <= 1; oy++){
        for(let ox = -1; ox <= 1; ox++){
            const nx = cx + ox
            const ny = cy + oy
            if(nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            if(reachable[ny * cols + nx]){
                return true
            }
        }
    }

    return false
}

function auditStructureConnectivity(sourceTerrain, protectedAreas){
    const checkpoints = [
        {x:sourceTerrain.centerX, y:sourceTerrain.centerY, radius:24}
    ]

    for(const key of ["meadow", "ruinA", "causeway", "ruinB", "altar", "thicket", "pollutedNest", "shallows", "bridgehead", "harbor", "tideflats", "shrineWard"]){
        const zone = sourceTerrain.zones[key]
        checkpoints.push({
            x:(zone.x1 + zone.x2) * 0.5,
            y:(zone.y1 + zone.y2) * 0.5,
            radius:key === "bridgehead" ? 22 : 24
        })
    }

    for(const lane of protectedAreas.lanes){
        checkpoints.push({
            x:(lane.x1 + lane.x2) * 0.5,
            y:(lane.y1 + lane.y2) * 0.5,
            radius:22
        })
    }

    for(const point of checkpoints){
        if(circleCollidesGeometry(sourceTerrain, point.x, point.y, point.radius)){
            return false
        }
        if(countOpenDirections(sourceTerrain, point.x, point.y, 132, point.radius) < 4){
            return false
        }
    }

    const step = 88
    const radius = 22
    const cols = Math.floor(world.width / step) + 1
    const rows = Math.floor(world.height / step) + 1
    const walkable = new Uint8Array(cols * rows)
    const reachable = new Uint8Array(cols * rows)
    const indexOf = (cx, cy) => cy * cols + cx

    const cellToWorld = (cx, cy) => ({
        x:Math.min(world.width - radius, cx * step + step * 0.5),
        y:Math.min(world.height - radius, cy * step + step * 0.5)
    })

    for(let cy = 0; cy < rows; cy++){
        for(let cx = 0; cx < cols; cx++){
            const point = cellToWorld(cx, cy)
            walkable[indexOf(cx, cy)] = circleCollidesGeometry(sourceTerrain, point.x, point.y, radius) ? 0 : 1
        }
    }

    let startCx = Math.max(0, Math.min(cols - 1, Math.floor(sourceTerrain.centerX / step)))
    let startCy = Math.max(0, Math.min(rows - 1, Math.floor(sourceTerrain.centerY / step)))
    if(!walkable[indexOf(startCx, startCy)]){
        let found = false
        for(let ring = 1; ring < 4 && !found; ring++){
            for(let oy = -ring; oy <= ring && !found; oy++){
                for(let ox = -ring; ox <= ring; ox++){
                    const nx = startCx + ox
                    const ny = startCy + oy
                    if(nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
                    if(walkable[indexOf(nx, ny)]){
                        startCx = nx
                        startCy = ny
                        found = true
                        break
                    }
                }
            }
        }
    }

    const queue = [[startCx, startCy]]
    reachable[indexOf(startCx, startCy)] = 1

    for(let qi = 0; qi < queue.length; qi++){
        const [cx, cy] = queue[qi]
        for(const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
            const nx = cx + dx
            const ny = cy + dy
            if(nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const id = indexOf(nx, ny)
            if(reachable[id] || !walkable[id]) continue
            reachable[id] = 1
            queue.push([nx, ny])
        }
    }

    return checkpoints.every(point => isCheckpointReachable(sourceTerrain, reachable, step, cols, rows, point))
}

function resetStructureLayout(sourceTerrain){
    sourceTerrain.prefabs = []
    sourceTerrain.prefabStats = {}
    sourceTerrain.structureGroups = []
    sourceTerrain.rocks = []
    sourceTerrain.barriers = []
}

function countHardStructureGroups(sourceTerrain){
    return (sourceTerrain.structureGroups || []).filter(group => group.groupType !== "lily").length
}

function ensureRuinGroupPresence(sourceTerrain, protectedAreas, rng){
    if(sourceTerrain.structureGroups.some(group => group.groupType === "ruin")){
        return true
    }

    const minDim = Math.min(world.width, world.height)
    const existingAnchors = (sourceTerrain.structureGroups || []).map(group => ({
        x:group.x,
        y:group.y,
        footprintRadius:group.footprintRadius
    }))
    const candidateZones = ["ruinA", "causeway", "ruinB", "shrineWard", "bridgehead", "harbor"]

    for(const zoneKey of candidateZones){
        const terrainType = FIXED_ZONE_TERRAIN_TYPES[zoneKey] || getDominantTerrainTypeForRegionFromData(sourceTerrain, sourceTerrain.zones[zoneKey])
        for(let attempt = 0; attempt < 24; attempt++){
            const anchor = findStructureGroupAnchor(sourceTerrain, zoneKey, "ruin", protectedAreas, existingAnchors, rng, minDim)
            if(!anchor){
                break
            }
            if(tryPlaceRuinGroup(sourceTerrain, zoneKey, terrainType, anchor, rng, protectedAreas)){
                existingAnchors.push(anchor)
                return true
            }
        }
    }

    return false
}

function buildFallbackStructureLayout(sourceTerrain, rng, minDim, protectedAreas){
    resetStructureLayout(sourceTerrain)
    const fallbackSpecs = [
        {zoneKey:"meadow", groupType:"stone"},
        {zoneKey:"ruinA", groupType:"ruin"},
        {zoneKey:"causeway", groupType:"brokenWall"},
        {zoneKey:"ruinB", groupType:"ruin"},
        {zoneKey:"thicket", groupType:"brokenWall"},
        {zoneKey:"pollutedNest", groupType:"stone"},
        {zoneKey:"harbor", groupType:"stone"},
        {zoneKey:"shallows", groupType:"lily"},
        {zoneKey:"bridgehead", groupType:"brokenWall"},
        {zoneKey:"tideflats", groupType:"lily"},
        {zoneKey:"shrineWard", groupType:"ruin"}
    ]
    const groupAnchors = []

    for(const spec of fallbackSpecs){
        const terrainType = FIXED_ZONE_TERRAIN_TYPES[spec.zoneKey] || getDominantTerrainTypeForRegionFromData(sourceTerrain, sourceTerrain.zones[spec.zoneKey])
        for(let attempt = 0; attempt < 28; attempt++){
            const anchor = findStructureGroupAnchor(sourceTerrain, spec.zoneKey, spec.groupType, protectedAreas, groupAnchors, rng, minDim)
            if(!anchor){
                break
            }
            if(tryPlaceStructureGroup(sourceTerrain, spec.zoneKey, terrainType, spec.groupType, anchor, rng, protectedAreas)){
                groupAnchors.push(anchor)
                break
            }
        }
    }

    if(!sourceTerrain.structureGroups.some(group => group.groupType === "ruin")){
        const ruinCandidates = [
            {zoneKey:"ruinA", nx:0.26, ny:0.24},
            {zoneKey:"ruinA", nx:0.74, ny:0.22},
            {zoneKey:"ruinB", nx:0.72, ny:0.72},
            {zoneKey:"shrineWard", nx:0.72, ny:0.34}
        ]
        for(const candidate of ruinCandidates){
            const zone = sourceTerrain.zones[candidate.zoneKey]
            const anchor = {
                x:zone.x1 + (zone.x2 - zone.x1) * candidate.nx,
                y:zone.y1 + (zone.y2 - zone.y1) * candidate.ny,
                footprintRadius:getGroupFootprintRadius("ruin", minDim)
            }
            const terrainType = FIXED_ZONE_TERRAIN_TYPES[candidate.zoneKey] || getDominantTerrainTypeForRegionFromData(sourceTerrain, zone)
            if(tryPlaceRuinGroup(sourceTerrain, candidate.zoneKey, terrainType, anchor, rng, protectedAreas)){
                break
            }
        }
    }

    ensureRuinGroupPresence(sourceTerrain, protectedAreas, rng)

    return auditStructureConnectivity(sourceTerrain, protectedAreas)
}

function buildStructureGroupLayout(sourceTerrain, rng, minDim){
    const protectedAreas = buildOpenLayoutProtectedAreas(sourceTerrain, minDim)
    const zoneOrder = [
        "ruinA",
        "causeway",
        "thicket",
        "pollutedNest",
        "shallows",
        "meadow",
        "ruinB",
        "altar",
        "bridgehead",
        "harbor",
        "tideflats",
        "shrineWard"
    ]
    for(let layoutAttempt = 0; layoutAttempt < 6; layoutAttempt++){
        resetStructureLayout(sourceTerrain)
        const groupAnchors = []

        for(const zoneKey of zoneOrder){
            const zone = sourceTerrain.zones[zoneKey]
            const terrainType = FIXED_ZONE_TERRAIN_TYPES[zoneKey] || getDominantTerrainTypeForRegionFromData(sourceTerrain, zone)
            const plan = buildZoneStructurePlan(zoneKey, terrainType, rng)

            for(const groupType of plan){
                let placed = false
                for(let attempt = 0; attempt < 22 && !placed; attempt++){
                    const anchor = findStructureGroupAnchor(sourceTerrain, zoneKey, groupType, protectedAreas, groupAnchors, rng, minDim)
                    if(!anchor){
                        break
                    }
                    placed = tryPlaceStructureGroup(sourceTerrain, zoneKey, terrainType, groupType, anchor, rng, protectedAreas)
                    if(placed){
                        groupAnchors.push(anchor)
                    }
                }
            }
        }

        ensureRuinGroupPresence(sourceTerrain, protectedAreas, rng)

        if(
            auditStructureConnectivity(sourceTerrain, protectedAreas) &&
            countHardStructureGroups(sourceTerrain) >= 4 &&
            sourceTerrain.structureGroups.some(group => group.groupType === "ruin")
        ){
            return
        }
    }

    buildFallbackStructureLayout(sourceTerrain, rng, minDim, protectedAreas)
}

function applyZoneTerrainTypes(sourceTerrain){
    for(const [zoneKey, zone] of Object.entries(sourceTerrain.zones)){
        zone.terrainType = FIXED_ZONE_TERRAIN_TYPES[zoneKey] || getDominantTerrainTypeForRegionFromData(sourceTerrain, zone)
    }
}

export function buildTerrainStructures(sourceTerrain = terrain){
    if(!sourceTerrain || sourceTerrain.structureLayoutBuilt){
        return sourceTerrain
    }

    const rng = sourceTerrain.deferredStructureLayoutRng
    const minDim = sourceTerrain.structureLayoutMinDim || Math.min(world.width, world.height)
    if(typeof rng !== "function"){
        return sourceTerrain
    }

    buildStructureGroupLayout(sourceTerrain, rng, minDim)
    sourceTerrain.structureLayoutBuilt = true
    sourceTerrain.deferredStructureLayoutRng = null
    sourceTerrain.prefabRenderOrder = null
    sourceTerrain.prefabRenderOrderSource = null
    sourceTerrain.prefabRenderOrderCount = 0
    return sourceTerrain
}

export function buildTerrain(options = {}){
    const includeStructures = options.includeStructures !== false
    const seed = ((world.width * 1664525) ^ (world.height * 1013904223) ^ 0xBADC0DE) >>> 0
    const rng = mulberry32(seed)
    const baseWorldWidth = Math.min(world.width, 6840)
    const baseWorldHeight = Math.min(world.height, 6320)
    const expansionStartX = baseWorldWidth + 360
    const expansionEndX = world.width - 120
    const expansionWidth = Math.max(0, expansionEndX - expansionStartX)
    const minDim = Math.min(baseWorldWidth, baseWorldHeight)
    const referenceTerrainArea = 6840 * 6320
    const areaScale = Math.min(1.15, Math.max(1, (baseWorldWidth * baseWorldHeight) / referenceTerrainArea))
    const expansionScale = Math.max(0.72, expansionWidth / 1320)
    const centerX = baseWorldWidth * 0.5
    const centerY = baseWorldHeight * 0.54
    const clearingRadiusX = Math.min(baseWorldWidth * 0.33, Math.max(230, baseWorldWidth * 0.22))
    const clearingRadiusY = Math.min(baseWorldHeight * 0.27, Math.max(190, baseWorldHeight * 0.18))
    const lx = ratio => baseWorldWidth * ratio
    const ly = ratio => baseWorldHeight * ratio
    const rx = ratio => expansionStartX + expansionWidth * ratio
    const channelLeft = baseWorldWidth + 44
    const channelRight = baseWorldWidth + 308
    const bridgeY = ly(0.53)
    const bridgeHalfHeight = minDim * 0.038
    const bridgeDeckX1 = baseWorldWidth - 72
    const bridgeDeckX2 = expansionStartX + 138
    const bridgeLandingWidth = Math.max(210, minDim * 0.1)
    const baseRandomX = () => rng() * baseWorldWidth
    const baseRandomY = () => rng() * baseWorldHeight

    const terrainData = {
        centerX,
        centerY,
        clearingRadiusX,
        clearingRadiusY,
        edgePhaseA: rng() * Math.PI * 2,
        edgePhaseB: rng() * Math.PI * 2,
        edgePhaseC: rng() * Math.PI * 2,
        grassPatches: [],
        speckles: [],
        grassTufts: [],
        edgeTufts: [],
        flowers: [],
        clovers: [],
        pebbles: [],
        dirtPatches: [],
        transitionPatches: [],
        altarPaths: [],
        causewayPatches: [],
        shallowPools: [],
        tidePatches: [],
        fogBands: [],
        bushes: [],
        rocks: [],
        barriers: [],
        prefabs: [],
        prefabStats: {},
        prefabRenderOrder: null,
        prefabRenderOrderSource: null,
        prefabRenderOrderCount: 0,
        deferredStructureLayoutRng: null,
        structureLayoutMinDim: minDim,
        structureLayoutBuilt: false,
        structureGroups: [],
        altarLandmark: null,
        bridgeLandmark: null,
        harborLandmarks: null,
        terrainLogic: null,
        layout: {
            baseWorldWidth,
            baseWorldHeight,
            expansionStartX,
            expansionEndX,
            expansionWidth,
            channelLeft,
            channelRight,
            bridgeY,
            bridgeHalfHeight,
            name: "雾潮断港"
        },
        zones: {}
    }

    setTerrainData(terrainData)

    terrainData.zones = {
        spawn:{
            name:zoneNames.spawn,
            x1:centerX - baseWorldWidth * 0.12,
            y1:centerY - baseWorldHeight * 0.11,
            x2:centerX + baseWorldWidth * 0.12,
            y2:centerY + baseWorldHeight * 0.11
        },
        causeway:{
            name:zoneNames.causeway,
            x1:lx(0.54),
            y1:ly(0.16),
            x2:lx(0.76),
            y2:ly(0.34)
        },
        shallows:{
            name:zoneNames.shallows,
            x1:lx(0.34),
            y1:ly(0.8),
            x2:lx(0.58),
            y2:ly(0.97)
        },
        nestHeart:{
            name:zoneNames.nestHeart,
            x1:lx(0.11),
            y1:ly(0.77),
            x2:lx(0.28),
            y2:ly(0.95)
        },
        meadow:{
            name:zoneNames.meadow,
            x1:lx(0.34),
            y1:ly(0.34),
            x2:lx(0.66),
            y2:ly(0.72)
        },
        ruinA:{
            name:zoneNames.ruinA,
            x1:lx(0.08),
            y1:ly(0.1),
            x2:lx(0.36),
            y2:ly(0.36)
        },
        ruinB:{
            name:zoneNames.ruinB,
            x1:lx(0.66),
            y1:ly(0.58),
            x2:lx(0.93),
            y2:ly(0.9)
        },
        thicket:{
            name:zoneNames.thicket,
            x1:lx(0.67),
            y1:ly(0.09),
            x2:lx(0.92),
            y2:ly(0.34)
        },
        pollutedNest:{
            name:zoneNames.pollutedNest,
            x1:lx(0.04),
            y1:ly(0.66),
            x2:lx(0.35),
            y2:ly(0.97)
        },
        altar:{
            name:zoneNames.altar,
            x1:lx(0.64),
            y1:ly(0.29),
            x2:lx(0.95),
            y2:ly(0.62)
        },
        bridgehead:{
            name:zoneNames.bridgehead,
            x1:baseWorldWidth - 84,
            y1:bridgeY - bridgeHalfHeight * 2.2,
            x2:expansionStartX + bridgeLandingWidth,
            y2:bridgeY + bridgeHalfHeight * 2.2
        },
        harbor:{
            name:zoneNames.harbor,
            x1:rx(0.06),
            y1:ly(0.24),
            x2:rx(0.58),
            y2:ly(0.56)
        },
        tideflats:{
            name:zoneNames.tideflats,
            x1:rx(0.02),
            y1:ly(0.58),
            x2:rx(0.66),
            y2:ly(0.92)
        },
        shrineWard:{
            name:zoneNames.shrineWard,
            x1:rx(0.68),
            y1:ly(0.42),
            x2:expansionEndX,
            y2:ly(0.84)
        }
    }

    terrainData.terrainLogic = buildTerrainLogicLayer(terrainData, rng)

    const altarCenterX = lx(0.815)
    const altarCenterY = ly(0.468)
    const altarBaseRadius = minDim * 0.054
    const altarCourtRadius = minDim * 0.11
    terrainData.altarLandmark = {
        centerX: altarCenterX,
        centerY: altarCenterY,
        baseRadius: altarBaseRadius,
        courtRadius: altarCourtRadius,
        eventRegion:{
            x1:altarCenterX - altarBaseRadius * 0.24,
            y1:altarCenterY - altarBaseRadius * 0.2,
            x2:altarCenterX + altarBaseRadius * 0.24,
            y2:altarCenterY + altarBaseRadius * 0.2
        },
        terraceShape:createOrganicPoints(
            altarCenterX,
            altarCenterY + altarBaseRadius * 0.08,
            altarBaseRadius * 0.86,
            altarBaseRadius * 0.6,
            18,
            0.16,
            rng
        ),
        daisShape:createOrganicPoints(
            altarCenterX,
            altarCenterY + altarBaseRadius * 0.05,
            altarBaseRadius * 0.54,
            altarBaseRadius * 0.4,
            18,
            0.15,
            rng
        ),
        corePedestal:createOrganicPoints(
            altarCenterX,
            altarCenterY - altarBaseRadius * 0.1,
            altarBaseRadius * 0.24,
            altarBaseRadius * 0.18,
            14,
            0.12,
            rng
        ),
        ringSegments:[],
        mossPatches:[],
        crackLines:[],
        steps:[],
        columns:[],
        rubble:[]
    }

    const bridgeCenterY = bridgeY
    const bridgeDeckHeight = bridgeHalfHeight * 1.7
    const expansionMidX = expansionStartX + expansionWidth * 0.44
    const expansionMidY = ly(0.5)
    terrainData.bridgeLandmark = {
        channelLeft,
        channelRight,
        bridgeY: bridgeCenterY,
        bridgeDeckHeight,
        x1: bridgeDeckX1,
        x2: bridgeDeckX2,
        bridgeFootings: [],
        bridgePosts: [],
        wakeBands: [],
        approachPads: [
            {
                points:createOrganicPoints(
                    baseWorldWidth - minDim * 0.045,
                    bridgeCenterY,
                    minDim * 0.08,
                    minDim * 0.04,
                    16,
                    0.12,
                    rng
                ),
                color:"rgba(162,147,107,0.18)"
            },
            {
                points:createOrganicPoints(
                    expansionStartX + minDim * 0.05,
                    bridgeCenterY,
                    minDim * 0.09,
                    minDim * 0.05,
                    18,
                    0.14,
                    rng
                ),
                color:"rgba(135,156,162,0.18)"
            }
        ]
    }

    for(let i = 0; i < 4; i++){
        const t = 0.12 + i / 3 * 0.76
        terrainData.bridgeLandmark.bridgeFootings.push({
            x: bridgeDeckX1 + (bridgeDeckX2 - bridgeDeckX1) * t,
            y: bridgeCenterY + (i % 2 === 0 ? 1 : -1) * bridgeDeckHeight * 0.94,
            width: minDim * 0.018,
            height: minDim * 0.03
        })
    }

    for(let i = 0; i < 5; i++){
        const t = 0.08 + i / 4 * 0.84
        terrainData.bridgeLandmark.bridgePosts.push({
            x: bridgeDeckX1 + (bridgeDeckX2 - bridgeDeckX1) * t,
            topY: bridgeCenterY - bridgeDeckHeight * 0.88,
            bottomY: bridgeCenterY + bridgeDeckHeight * 0.88,
            width: minDim * 0.009
        })
    }

    for(let i = 0; i < 7; i++){
        terrainData.bridgeLandmark.wakeBands.push({
            points:createOrganicPoints(
                getRandomRange(rng, channelLeft + 14, channelRight - 14),
                getRandomRange(rng, ly(0.08), ly(0.94)),
                minDim * (0.026 + rng() * 0.024),
                minDim * (0.008 + rng() * 0.007),
                14,
                0.18,
                rng
            ),
            color:rng() < 0.5 ? "rgba(88,122,134,0.16)" : "rgba(112,145,154,0.12)"
        })
    }

    terrainData.harborLandmarks = {
        name:"雾潮断港",
        region:{
            x1:expansionStartX,
            y1:ly(0.03),
            x2:expansionEndX,
            y2:ly(0.97)
        },
        quayCenterX: expansionMidX,
        quayCenterY: expansionMidY,
        basinMasses: [],
        terraces: [],
        stoneFields: [],
        stoneSpines: [],
        tidalRuns: [],
        siltBands: [],
        coldPatches: [],
        fogBanks: [],
        pools: [],
        arches: [],
        shrines: [],
        plinths: [],
        rubble: [],
        reeds: []
    }

    const harborWidthUnit = Math.max(840, expansionWidth)

    const basinDefs = [
        {
            x:rx(0.2),
            y:ly(0.08),
            rx:harborWidthUnit * 0.24,
            ry:harborWidthUnit * 0.07,
            color:"rgba(72,96,105,0.2)",
            edge:"rgba(148,178,185,0.08)"
        },
        {
            x:rx(0.48),
            y:ly(0.07),
            rx:harborWidthUnit * 0.3,
            ry:harborWidthUnit * 0.08,
            color:"rgba(74,99,108,0.22)",
            edge:"rgba(152,182,188,0.08)"
        },
        {
            x:rx(0.22),
            y:ly(0.14),
            rx:harborWidthUnit * 0.22,
            ry:harborWidthUnit * 0.1,
            color:"rgba(76,101,109,0.2)",
            edge:"rgba(156,184,190,0.08)"
        },
        {
            x:rx(0.12),
            y:ly(0.53),
            rx:harborWidthUnit * 0.16,
            ry:harborWidthUnit * 0.11,
            color:"rgba(76,101,109,0.22)",
            edge:"rgba(156,184,190,0.09)"
        },
        {
            x:rx(0.38),
            y:ly(0.4),
            rx:harborWidthUnit * 0.24,
            ry:harborWidthUnit * 0.13,
            color:"rgba(69,92,101,0.24)",
            edge:"rgba(148,175,181,0.08)"
        },
        {
            x:rx(0.31),
            y:ly(0.76),
            rx:harborWidthUnit * 0.22,
            ry:harborWidthUnit * 0.11,
            color:"rgba(72,96,104,0.22)",
            edge:"rgba(146,173,179,0.07)"
        },
        {
            x:rx(0.8),
            y:ly(0.57),
            rx:harborWidthUnit * 0.16,
            ry:harborWidthUnit * 0.12,
            color:"rgba(63,86,95,0.22)",
            edge:"rgba(142,168,176,0.08)"
        },
        {
            x:rx(0.58),
            y:ly(0.88),
            rx:harborWidthUnit * 0.24,
            ry:harborWidthUnit * 0.11,
            color:"rgba(68,92,100,0.22)",
            edge:"rgba(146,173,179,0.08)"
        },
        {
            x:rx(0.22),
            y:ly(0.93),
            rx:harborWidthUnit * 0.24,
            ry:harborWidthUnit * 0.07,
            color:"rgba(66,90,98,0.2)",
            edge:"rgba(144,172,178,0.08)"
        },
        {
            x:rx(0.52),
            y:ly(0.95),
            rx:harborWidthUnit * 0.3,
            ry:harborWidthUnit * 0.08,
            color:"rgba(66,90,98,0.22)",
            edge:"rgba(144,172,178,0.08)"
        }
    ]

    for(const def of basinDefs){
        terrainData.harborLandmarks.basinMasses.push({
            points:createOrganicPoints(def.x, def.y, def.rx, def.ry, 20, 0.16, rng),
            color:def.color,
            edge:def.edge
        })
    }

    const terraceDefs = [
        {
            x:rx(0.18),
            y:ly(0.1),
            rx:harborWidthUnit * 0.18,
            ry:harborWidthUnit * 0.05,
            inset:0.73,
            hue:["#7f8d86", "#68756f", "#535f5a"],
            shadow:"rgba(7,10,11,0.16)"
        },
        {
            x:rx(0.46),
            y:ly(0.08),
            rx:harborWidthUnit * 0.22,
            ry:harborWidthUnit * 0.055,
            inset:0.74,
            hue:["#819088", "#68756f", "#535f5a"],
            shadow:"rgba(7,10,11,0.16)"
        },
        {
            x:rx(0.28),
            y:ly(0.16),
            rx:harborWidthUnit * 0.18,
            ry:harborWidthUnit * 0.076,
            inset:0.72,
            hue:["#829088", "#69766f", "#535f5a"],
            shadow:"rgba(7,10,11,0.16)"
        },
        {
            x:rx(0.13),
            y:ly(0.52),
            rx:harborWidthUnit * 0.13,
            ry:harborWidthUnit * 0.072,
            inset:0.78,
            hue:["#86928a", "#6a746f", "#545f5a"],
            shadow:"rgba(7,10,11,0.16)"
        },
        {
            x:rx(0.33),
            y:ly(0.45),
            rx:harborWidthUnit * 0.16,
            ry:harborWidthUnit * 0.08,
            inset:0.74,
            hue:["#839089", "#69766f", "#56625c"],
            shadow:"rgba(7,10,11,0.18)"
        },
        {
            x:rx(0.56),
            y:ly(0.36),
            rx:harborWidthUnit * 0.17,
            ry:harborWidthUnit * 0.082,
            inset:0.72,
            hue:["#7d8b84", "#66726d", "#535d59"],
            shadow:"rgba(7,10,11,0.18)"
        },
        {
            x:rx(0.44),
            y:ly(0.72),
            rx:harborWidthUnit * 0.16,
            ry:harborWidthUnit * 0.074,
            inset:0.7,
            hue:["#77857f", "#626f6a", "#505b57"],
            shadow:"rgba(7,10,11,0.17)"
        },
        {
            x:rx(0.81),
            y:ly(0.59),
            rx:harborWidthUnit * 0.13,
            ry:harborWidthUnit * 0.076,
            inset:0.7,
            hue:["#7b8882", "#65716d", "#515c58"],
            shadow:"rgba(7,10,11,0.18)"
        },
        {
            x:rx(0.61),
            y:ly(0.86),
            rx:harborWidthUnit * 0.18,
            ry:harborWidthUnit * 0.076,
            inset:0.71,
            hue:["#788680", "#636f6b", "#4f5a56"],
            shadow:"rgba(7,10,11,0.18)"
        },
        {
            x:rx(0.2),
            y:ly(0.91),
            rx:harborWidthUnit * 0.18,
            ry:harborWidthUnit * 0.05,
            inset:0.72,
            hue:["#76847e", "#626f6a", "#4f5a56"],
            shadow:"rgba(7,10,11,0.18)"
        },
        {
            x:rx(0.5),
            y:ly(0.93),
            rx:harborWidthUnit * 0.22,
            ry:harborWidthUnit * 0.056,
            inset:0.73,
            hue:["#788681", "#626f6a", "#4f5a56"],
            shadow:"rgba(7,10,11,0.18)"
        }
    ]

    for(const [index, def] of terraceDefs.entries()){
        const outer = createOrganicPoints(def.x, def.y, def.rx, def.ry, 18, 0.16, rng)
        const inner = createOrganicPoints(
            def.x + def.rx * (index % 2 === 0 ? 0.04 : -0.03),
            def.y - def.ry * 0.06,
            def.rx * def.inset,
            def.ry * (def.inset - 0.05),
            16,
            0.14,
            rng
        )
        const cracks = []
        for(let i = 0; i < 2 + (index % 2); i++){
            const angle = -1.8 + i * 1.15 + (rng() - 0.5) * 0.26
            const startX = def.x + Math.cos(angle) * def.rx * 0.14
            const startY = def.y + Math.sin(angle) * def.ry * 0.08
            cracks.push([
                {x:startX, y:startY},
                {
                    x:startX + Math.cos(angle + (rng() - 0.5) * 0.4) * def.rx * (0.18 + rng() * 0.1),
                    y:startY + Math.sin(angle + (rng() - 0.5) * 0.4) * def.ry * (0.18 + rng() * 0.1)
                },
                {
                    x:startX + Math.cos(angle) * def.rx * (0.34 + rng() * 0.14),
                    y:startY + Math.sin(angle) * def.ry * (0.26 + rng() * 0.1)
                }
            ])
        }
        terrainData.harborLandmarks.terraces.push({
            outer,
            inner,
            highlight:def.hue[0],
            mid:def.hue[1],
            dark:def.hue[2],
            shadow:def.shadow,
            cracks
        })
    }

    const stoneFieldDefs = [
        {x:rx(0.18), y:ly(0.1), angle:0.04, span:harborWidthUnit * 0.22, spread:harborWidthUnit * 0.05, count:6, scale:0.031},
        {x:rx(0.46), y:ly(0.08), angle:0.02, span:harborWidthUnit * 0.32, spread:harborWidthUnit * 0.06, count:8, scale:0.032},
        {x:rx(0.28), y:ly(0.16), angle:0.08, span:harborWidthUnit * 0.24, spread:harborWidthUnit * 0.068, count:7, scale:0.034},
        {x:rx(0.14), y:ly(0.52), angle:-0.08, span:harborWidthUnit * 0.18, spread:harborWidthUnit * 0.055, count:6, scale:0.034},
        {x:rx(0.33), y:ly(0.45), angle:-0.12, span:harborWidthUnit * 0.24, spread:harborWidthUnit * 0.07, count:8, scale:0.037},
        {x:rx(0.55), y:ly(0.36), angle:0.1, span:harborWidthUnit * 0.18, spread:harborWidthUnit * 0.065, count:6, scale:0.033},
        {x:rx(0.42), y:ly(0.73), angle:-0.22, span:harborWidthUnit * 0.2, spread:harborWidthUnit * 0.072, count:7, scale:0.034},
        {x:rx(0.79), y:ly(0.58), angle:-0.28, span:harborWidthUnit * 0.17, spread:harborWidthUnit * 0.068, count:5, scale:0.032},
        {x:rx(0.61), y:ly(0.86), angle:-0.12, span:harborWidthUnit * 0.24, spread:harborWidthUnit * 0.074, count:7, scale:0.034},
        {x:rx(0.2), y:ly(0.91), angle:-0.04, span:harborWidthUnit * 0.22, spread:harborWidthUnit * 0.05, count:6, scale:0.031},
        {x:rx(0.5), y:ly(0.93), angle:-0.04, span:harborWidthUnit * 0.32, spread:harborWidthUnit * 0.06, count:8, scale:0.032}
    ]
    for(const field of stoneFieldDefs){
        for(let i = 0; i < field.count; i++){
            const t = field.count === 1 ? 0.5 : i / (field.count - 1)
            const along = (t - 0.5) * field.span
            const cross = (rng() - 0.5) * field.spread
            const x = field.x + Math.cos(field.angle) * along + Math.sin(field.angle) * cross
            const y = field.y + Math.sin(field.angle) * along * 0.62 - Math.cos(field.angle) * cross
            const rxScale = harborWidthUnit * field.scale * (0.88 + rng() * 0.36)
            const ryScale = rxScale * (0.48 + rng() * 0.14)
            const outer = createOrganicPoints(x, y, rxScale, ryScale, 14, 0.14, rng)
            const inner = createOrganicPoints(
                x + (rng() - 0.5) * rxScale * 0.08,
                y - ryScale * 0.06,
                rxScale * 0.76,
                ryScale * 0.72,
                12,
                0.12,
                rng
            )
            const cracks = []
            if(rng() < 0.72){
                const angle = field.angle + (rng() - 0.5) * 0.4
                const startX = x - Math.cos(angle) * rxScale * 0.24
                const startY = y - Math.sin(angle) * ryScale * 0.14
                cracks.push([
                    {x:startX, y:startY},
                    {x:x + (rng() - 0.5) * rxScale * 0.18, y:y + (rng() - 0.5) * ryScale * 0.16},
                    {x:x + Math.cos(angle) * rxScale * 0.32, y:y + Math.sin(angle) * ryScale * 0.22}
                ])
            }
            terrainData.harborLandmarks.stoneFields.push({
                outer,
                inner,
                highlight:rng() < 0.45 ? "#8e9a92" : "#859189",
                mid:rng() < 0.45 ? "#707a74" : "#67716c",
                dark:rng() < 0.5 ? "#56605c" : "#4e5854",
                shadow:"rgba(7,10,11,0.14)",
                cracks
            })
        }
    }

    const spineDefs = [
        {x:rx(0.22), y:ly(0.18), rx:harborWidthUnit * 0.084, ry:harborWidthUnit * 0.022, rotation:0.08},
        {x:rx(0.24), y:ly(0.28), rx:harborWidthUnit * 0.072, ry:harborWidthUnit * 0.018, rotation:-0.18},
        {x:rx(0.68), y:ly(0.3), rx:harborWidthUnit * 0.074, ry:harborWidthUnit * 0.02, rotation:0.1},
        {x:rx(0.7), y:ly(0.63), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.022, rotation:-0.26},
        {x:rx(0.24), y:ly(0.76), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.024, rotation:0.06},
        {x:rx(0.67), y:ly(0.9), rx:harborWidthUnit * 0.086, ry:harborWidthUnit * 0.024, rotation:-0.08}
    ]
    for(const def of spineDefs){
        terrainData.harborLandmarks.stoneSpines.push({
            points:createOrganicPoints(def.x, def.y, def.rx, def.ry, 16, 0.16, rng),
            rotation:def.rotation,
            color:"rgba(105,122,122,0.18)",
            rim:"rgba(173,190,191,0.08)"
        })
    }

    const tidalRunDefs = [
        {x:rx(0.18), y:ly(0.09), rx:harborWidthUnit * 0.14, ry:harborWidthUnit * 0.024, color:"rgba(70,103,116,0.2)", rim:"rgba(176,208,214,0.08)"},
        {x:rx(0.44), y:ly(0.06), rx:harborWidthUnit * 0.24, ry:harborWidthUnit * 0.026, color:"rgba(70,103,116,0.2)", rim:"rgba(176,208,214,0.08)"},
        {x:rx(0.28), y:ly(0.14), rx:harborWidthUnit * 0.16, ry:harborWidthUnit * 0.034, color:"rgba(70,103,116,0.22)", rim:"rgba(178,209,214,0.1)"},
        {x:rx(0.18), y:ly(0.54), rx:harborWidthUnit * 0.09, ry:harborWidthUnit * 0.024, color:"rgba(70,103,116,0.24)", rim:"rgba(178,209,214,0.12)"},
        {x:rx(0.41), y:ly(0.51), rx:harborWidthUnit * 0.17, ry:harborWidthUnit * 0.04, color:"rgba(73,105,116,0.22)", rim:"rgba(174,205,210,0.1)"},
        {x:rx(0.34), y:ly(0.77), rx:harborWidthUnit * 0.16, ry:harborWidthUnit * 0.035, color:"rgba(73,104,114,0.22)", rim:"rgba(171,201,207,0.1)"},
        {x:rx(0.79), y:ly(0.64), rx:harborWidthUnit * 0.1, ry:harborWidthUnit * 0.028, color:"rgba(68,99,110,0.2)", rim:"rgba(170,198,205,0.1)"},
        {x:rx(0.58), y:ly(0.88), rx:harborWidthUnit * 0.2, ry:harborWidthUnit * 0.036, color:"rgba(69,102,112,0.22)", rim:"rgba(171,201,207,0.1)"},
        {x:rx(0.18), y:ly(0.92), rx:harborWidthUnit * 0.14, ry:harborWidthUnit * 0.024, color:"rgba(68,99,110,0.2)", rim:"rgba(170,198,205,0.08)"},
        {x:rx(0.54), y:ly(0.95), rx:harborWidthUnit * 0.24, ry:harborWidthUnit * 0.028, color:"rgba(68,99,110,0.2)", rim:"rgba(170,198,205,0.08)"}
    ]
    for(const def of tidalRunDefs){
        terrainData.harborLandmarks.tidalRuns.push({
            points:createOrganicPoints(def.x, def.y, def.rx, def.ry, 18, 0.16, rng),
            color:def.color,
            rim:def.rim
        })
    }

    const siltDefs = [
        {x:rx(0.46), y:ly(0.05), rx:harborWidthUnit * 0.26, ry:harborWidthUnit * 0.038, color:"rgba(118,142,145,0.07)"},
        {x:rx(0.23), y:ly(0.12), rx:harborWidthUnit * 0.18, ry:harborWidthUnit * 0.04, color:"rgba(118,142,145,0.07)"},
        {x:rx(0.16), y:ly(0.47), rx:harborWidthUnit * 0.13, ry:harborWidthUnit * 0.032, color:"rgba(118,142,145,0.07)"},
        {x:rx(0.48), y:ly(0.59), rx:harborWidthUnit * 0.17, ry:harborWidthUnit * 0.04, color:"rgba(120,144,147,0.07)"},
        {x:rx(0.77), y:ly(0.55), rx:harborWidthUnit * 0.11, ry:harborWidthUnit * 0.032, color:"rgba(112,138,142,0.07)"},
        {x:rx(0.6), y:ly(0.9), rx:harborWidthUnit * 0.18, ry:harborWidthUnit * 0.038, color:"rgba(112,138,142,0.07)"},
        {x:rx(0.52), y:ly(0.96), rx:harborWidthUnit * 0.26, ry:harborWidthUnit * 0.038, color:"rgba(112,138,142,0.07)"}
    ]
    for(const def of siltDefs){
        terrainData.harborLandmarks.siltBands.push({
            points:createOrganicPoints(def.x, def.y, def.rx, def.ry, 18, 0.14, rng),
            color:def.color
        })
    }

    const coldPatchDefs = [
        {x:rx(0.36), y:ly(0.04), rx:harborWidthUnit * 0.1, ry:harborWidthUnit * 0.024, color:"rgba(90,114,122,0.12)"},
        {x:rx(0.12), y:ly(0.1), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.03, color:"rgba(92,116,124,0.13)"},
        {x:rx(0.09), y:ly(0.36), rx:harborWidthUnit * 0.055, ry:harborWidthUnit * 0.024, color:"rgba(98,123,131,0.14)"},
        {x:rx(0.26), y:ly(0.3), rx:harborWidthUnit * 0.07, ry:harborWidthUnit * 0.028, color:"rgba(87,111,120,0.14)"},
        {x:rx(0.53), y:ly(0.34), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.032, color:"rgba(94,118,127,0.14)"},
        {x:rx(0.64), y:ly(0.73), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.034, color:"rgba(84,108,116,0.13)"},
        {x:rx(0.84), y:ly(0.48), rx:harborWidthUnit * 0.06, ry:harborWidthUnit * 0.026, color:"rgba(93,115,124,0.14)"},
        {x:rx(0.72), y:ly(0.94), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.03, color:"rgba(87,111,120,0.13)"},
        {x:rx(0.58), y:ly(0.98), rx:harborWidthUnit * 0.1, ry:harborWidthUnit * 0.024, color:"rgba(85,109,118,0.12)"}
    ]
    for(const def of coldPatchDefs){
        terrainData.harborLandmarks.coldPatches.push({
            points:createOrganicPoints(def.x, def.y, def.rx, def.ry, 16, 0.18, rng),
            color:def.color
        })
    }

    const fogDefs = [
        {x:rx(0.5), y:ly(0.05), rx:harborWidthUnit * 0.13, ry:harborWidthUnit * 0.028, color:"rgba(170,188,196,0.07)"},
        {x:rx(0.28), y:ly(0.08), rx:harborWidthUnit * 0.11, ry:harborWidthUnit * 0.034, color:"rgba(172,190,198,0.07)"},
        {x:rx(0.22), y:ly(0.24), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.03, color:"rgba(178,194,201,0.08)"},
        {x:rx(0.56), y:ly(0.18), rx:harborWidthUnit * 0.09, ry:harborWidthUnit * 0.034, color:"rgba(168,186,194,0.08)"},
        {x:rx(0.74), y:ly(0.5), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.03, color:"rgba(156,177,186,0.07)"},
        {x:rx(0.34), y:ly(0.82), rx:harborWidthUnit * 0.08, ry:harborWidthUnit * 0.03, color:"rgba(160,181,189,0.07)"},
        {x:rx(0.62), y:ly(0.94), rx:harborWidthUnit * 0.11, ry:harborWidthUnit * 0.034, color:"rgba(160,181,189,0.07)"},
        {x:rx(0.52), y:ly(0.98), rx:harborWidthUnit * 0.13, ry:harborWidthUnit * 0.028, color:"rgba(158,180,188,0.07)"}
    ]
    for(const def of fogDefs){
        terrainData.harborLandmarks.fogBanks.push({
            points:createOrganicPoints(def.x, def.y, def.rx, def.ry, 18, 0.22, rng),
            color:def.color
        })
    }

    const poolDefs = [
        {x:rx(0.5), y:ly(0.09), rx:harborWidthUnit * 0.042, ry:harborWidthUnit * 0.016},
        {x:rx(0.36), y:ly(0.18), rx:harborWidthUnit * 0.04, ry:harborWidthUnit * 0.018},
        {x:rx(0.24), y:ly(0.69), rx:harborWidthUnit * 0.038, ry:harborWidthUnit * 0.016},
        {x:rx(0.45), y:ly(0.8), rx:harborWidthUnit * 0.04, ry:harborWidthUnit * 0.02},
        {x:rx(0.61), y:ly(0.61), rx:harborWidthUnit * 0.038, ry:harborWidthUnit * 0.016},
        {x:rx(0.83), y:ly(0.68), rx:harborWidthUnit * 0.034, ry:harborWidthUnit * 0.014},
        {x:rx(0.7), y:ly(0.9), rx:harborWidthUnit * 0.038, ry:harborWidthUnit * 0.016},
        {x:rx(0.52), y:ly(0.97), rx:harborWidthUnit * 0.042, ry:harborWidthUnit * 0.016}
    ]
    for(const def of poolDefs){
        terrainData.harborLandmarks.pools.push({
            points:createOrganicPoints(def.x, def.y, def.rx, def.ry, 16, 0.18, rng),
            color:rng() < 0.5 ? "rgba(79,110,123,0.24)" : "rgba(97,126,136,0.2)",
            rim:rng() < 0.5 ? "rgba(166,201,209,0.14)" : "rgba(152,186,194,0.12)"
        })
    }

    const archDefs = [
        {x:rx(0.24), y:ly(0.32), width:harborWidthUnit * 0.086, height:harborWidthUnit * 0.1, rotation:-0.1, broken:true, sink:0.1},
        {x:rx(0.51), y:ly(0.28), width:harborWidthUnit * 0.104, height:harborWidthUnit * 0.118, rotation:0.05, broken:false, sink:0.04},
        {x:rx(0.71), y:ly(0.39), width:harborWidthUnit * 0.084, height:harborWidthUnit * 0.098, rotation:0.12, broken:true, sink:0.08},
        {x:rx(0.63), y:ly(0.76), width:harborWidthUnit * 0.078, height:harborWidthUnit * 0.084, rotation:-0.18, broken:true, sink:0.12}
    ]
    for(const def of archDefs){
        terrainData.harborLandmarks.arches.push(def)
    }

    const shrineDefs = [
        {x:rx(0.7), y:ly(0.32), base:harborWidthUnit * 0.042, glow:true, lean:-0.1},
        {x:rx(0.82), y:ly(0.5), base:harborWidthUnit * 0.048, glow:false, lean:0.08},
        {x:rx(0.87), y:ly(0.68), base:harborWidthUnit * 0.04, glow:true, lean:-0.05}
    ]
    for(const def of shrineDefs){
        terrainData.harborLandmarks.shrines.push(def)
    }

    const plinthDefs = [
        {x:rx(0.18), y:ly(0.41), size:harborWidthUnit * 0.026, lean:-0.08},
        {x:rx(0.42), y:ly(0.31), size:harborWidthUnit * 0.024, lean:0.05},
        {x:rx(0.52), y:ly(0.63), size:harborWidthUnit * 0.028, lean:-0.06},
        {x:rx(0.74), y:ly(0.56), size:harborWidthUnit * 0.025, lean:0.08},
        {x:rx(0.86), y:ly(0.44), size:harborWidthUnit * 0.024, lean:-0.04}
    ]
    for(const def of plinthDefs){
        terrainData.harborLandmarks.plinths.push(def)
    }

    for(let i = 0; i < 14; i++){
        terrainData.harborLandmarks.rubble.push({
            x: rx(0.08 + rng() * 0.84),
            y: ly(0.18 + rng() * 0.7),
            rx: minDim * (0.006 + rng() * 0.01),
            ry: minDim * (0.004 + rng() * 0.007),
            rotation:rng() * Math.PI
        })
    }

    for(let i = 0; i < 24; i++){
        terrainData.harborLandmarks.reeds.push({
            x: rx(0.06 + rng() * 0.82),
            y: ly(0.52 + rng() * 0.34),
            size: 8 + rng() * 10,
            rotation:rng() * Math.PI * 2,
            blades: 4 + Math.floor(rng() * 2),
            spread: 5 + rng() * 4,
            width: 1.05 + rng() * 0.8,
            curve:(rng() - 0.5) * 5,
            color:rng() < 0.5 ? "#4b6b66" : "#567770",
            highlight:rng() < 0.5 ? "#93bbb1" : "#a5c9c1"
        })
    }

    for(const [index, angle] of [-2.58, -1.74, -0.96, 0.12, 1.18, 2.12].entries()){
        const distance = altarCourtRadius * (0.76 + (index % 2) * 0.1)
        terrainData.altarLandmark.columns.push({
            x:altarCenterX + Math.cos(angle) * distance,
            y:altarCenterY + Math.sin(angle) * distance * 0.86,
            height:altarBaseRadius * (0.28 + (index % 3) * 0.07),
            width:altarBaseRadius * (0.085 + (index % 2) * 0.018),
            broken:index % 2 === 1,
            buried:index % 3 === 2,
            tilt:(rng() - 0.5) * 0.22,
            capOffset:(rng() - 0.5) * altarBaseRadius * 0.04,
            rotation:(rng() - 0.5) * 0.2
        })
    }

    const ringDefs = [
        {start:-2.78, end:-1.2, width:altarBaseRadius * 0.16},
        {start:-0.48, end:0.72, width:altarBaseRadius * 0.14},
        {start:1.22, end:2.54, width:altarBaseRadius * 0.15}
    ]
    for(const ring of ringDefs){
        terrainData.altarLandmark.ringSegments.push({
            rx:altarCourtRadius * (0.94 + rng() * 0.08),
            ry:altarCourtRadius * (0.64 + rng() * 0.05),
            start:ring.start,
            end:ring.end,
            width:ring.width
        })
    }

    for(let i = 0; i < 5; i++){
        const angle = -2.6 + i * 1.24 + (rng() - 0.5) * 0.16
        const distance = altarBaseRadius * (0.42 + rng() * 0.42)
        terrainData.altarLandmark.mossPatches.push({
            points:createOrganicPoints(
                altarCenterX + Math.cos(angle) * distance,
                altarCenterY + Math.sin(angle) * distance * 0.78,
                altarBaseRadius * (0.11 + rng() * 0.09),
                altarBaseRadius * (0.06 + rng() * 0.05),
                12,
                0.18,
                rng
            ),
            color:rng() < 0.5 ? "rgba(74,106,63,0.22)" : "rgba(98,128,82,0.18)"
        })
    }

    for(const angle of [-2.16, -0.02, 2.04]){
        const distance = altarCourtRadius * 0.88
        terrainData.altarLandmark.steps.push({
            x:altarCenterX + Math.cos(angle) * distance,
            y:altarCenterY + Math.sin(angle) * distance * 0.82,
            width:altarBaseRadius * 0.3,
            height:altarBaseRadius * 0.1,
            rotation:angle + Math.PI * 0.5
        })
    }

    for(let i = 0; i < 5; i++){
        const angle = -2.3 + i * 0.95 + (rng() - 0.5) * 0.22
        const start = altarCenterX + Math.cos(angle) * altarBaseRadius * 0.16
        const startY = altarCenterY + Math.sin(angle) * altarBaseRadius * 0.12
        const bend = angle + (rng() - 0.5) * 0.5
        terrainData.altarLandmark.crackLines.push([
            {x:start, y:startY},
            {
                x:start + Math.cos(bend) * altarBaseRadius * (0.16 + rng() * 0.08),
                y:startY + Math.sin(bend) * altarBaseRadius * (0.12 + rng() * 0.06)
            },
            {
                x:start + Math.cos(angle) * altarBaseRadius * (0.32 + rng() * 0.1),
                y:startY + Math.sin(angle) * altarBaseRadius * (0.22 + rng() * 0.08)
            }
        ])
    }

    for(let i = 0; i < 11; i++){
        const angle = rng() * Math.PI * 2
        const distance = altarCourtRadius * (0.55 + rng() * 0.68)
        terrainData.altarLandmark.rubble.push({
            x:altarCenterX + Math.cos(angle) * distance,
            y:altarCenterY + Math.sin(angle) * distance * 0.82,
            rx:altarBaseRadius * (0.07 + rng() * 0.08),
            ry:altarBaseRadius * (0.04 + rng() * 0.05),
            rotation:rng() * Math.PI
        })
    }

    terrainData.altarPaths.push(
        {
            points:createOrganicPoints(
                altarCenterX - altarCourtRadius * 1.2,
                altarCenterY + altarCourtRadius * 0.62,
                altarCourtRadius * 0.82,
                altarCourtRadius * 0.22,
                18,
                0.12,
                rng
            ),
            color:"rgba(195,182,134,0.18)"
        },
        {
            points:createOrganicPoints(
                altarCenterX - altarCourtRadius * 0.12,
                altarCenterY - altarCourtRadius * 1.05,
                altarCourtRadius * 0.46,
                altarCourtRadius * 0.16,
                16,
                0.12,
                rng
            ),
            color:"rgba(207,194,142,0.16)"
        },
        {
            points:createOrganicPoints(
                altarCenterX + altarCourtRadius * 0.98,
                altarCenterY + altarCourtRadius * 0.16,
                altarCourtRadius * 0.42,
                altarCourtRadius * 0.18,
                16,
                0.12,
                rng
            ),
            color:"rgba(195,182,134,0.14)"
        },
        {
            points:createOrganicPoints(
                altarCenterX - altarCourtRadius * 1.08,
                altarCenterY - altarCourtRadius * 0.78,
                altarCourtRadius * 0.66,
                altarCourtRadius * 0.18,
                18,
                0.12,
                rng
            ),
            color:"rgba(205,191,142,0.15)"
        },
        {
            points:createOrganicPoints(
                lx(0.62),
                ly(0.26),
                altarCourtRadius * 0.74,
                altarCourtRadius * 0.14,
                18,
                0.14,
                rng
            ),
            color:"rgba(188,177,131,0.12)"
        }
    )

    for(let i = 0; i < 4; i++){
        const t = i / 3
        terrainData.causewayPatches.push({
            points:createOrganicPoints(
                lx(0.58 + t * 0.13),
                ly(0.22 + t * 0.04),
                minDim * (0.035 + rng() * 0.014),
                minDim * (0.014 + rng() * 0.008),
                14,
                0.16,
                rng
            ),
            color:i % 2 === 0 ? "rgba(181,171,127,0.18)" : "rgba(151,142,106,0.16)"
        })
    }

    for(let i = 0; i < 4; i++){
        terrainData.shallowPools.push({
            points:createOrganicPoints(
                getRandomRange(rng, terrainData.zones.shallows.x1 + minDim * 0.02, terrainData.zones.shallows.x2 - minDim * 0.02),
                getRandomRange(rng, terrainData.zones.shallows.y1 + minDim * 0.02, terrainData.zones.shallows.y2 - minDim * 0.02),
                minDim * (0.034 + rng() * 0.02),
                minDim * (0.016 + rng() * 0.012),
                16,
                0.2,
                rng
            ),
            color:i % 2 === 0 ? "rgba(119,152,122,0.18)" : "rgba(142,177,147,0.16)",
            rim:i % 2 === 0 ? "rgba(210,224,173,0.12)" : "rgba(201,216,165,0.1)"
        })
    }

    terrainData.clearingOuter = createOrganicPoints(
        centerX,
        centerY,
        clearingRadiusX * 1.12,
        clearingRadiusY * 1.15,
        28,
        0.18,
        rng
    )

    terrainData.clearingInner = createOrganicPoints(
        centerX + minDim * 0.01,
        centerY + minDim * 0.02,
        clearingRadiusX * 0.97,
        clearingRadiusY * 0.93,
        26,
        0.14,
        rng
    )

    terrainData.clearingCore = createOrganicPoints(
        centerX + minDim * 0.015,
        centerY + minDim * 0.03,
        clearingRadiusX * 0.77,
        clearingRadiusY * 0.72,
        22,
        0.12,
        rng
    )

    const grassPatchColors = [
        "#5fae4d",
        "#4f9b43",
        "#42893a",
        "#377b35",
        "#67b55a"
    ]

    for(let i = 0; i < Math.floor(28 * areaScale); i++){
        const x = baseRandomX()
        const y = baseRandomY()
        const dist = getClearingDistance(x, y, 20)
        if(dist < 0.88 && rng() < 0.68){
            continue
        }

        terrainData.grassPatches.push({
            x,
            y,
            rx: minDim * (0.055 + rng() * 0.12),
            ry: minDim * (0.03 + rng() * 0.08),
            rotation: rng() * Math.PI,
            alpha: 0.08 + rng() * 0.12,
            color: grassPatchColors[Math.floor(rng() * grassPatchColors.length)]
        })
    }

    const grassTuftColors = [
        {color:"#3f7e32", highlight:"#7dc65f"},
        {color:"#457f31", highlight:"#83c960"},
        {color:"#2f692a", highlight:"#6db650"},
        {color:"#588e38", highlight:"#94d56c"}
    ]

    let tuftAttempts = 0
    while(terrainData.grassTufts.length < Math.floor(250 * areaScale) && tuftAttempts < Math.floor(2200 * areaScale)){
        tuftAttempts++
        const x = baseRandomX()
        const y = baseRandomY()
        const dist = getClearingDistance(x, y, 12)

        if(dist < 0.94 && rng() < 0.92){
            continue
        }

        const palette = grassTuftColors[Math.floor(rng() * grassTuftColors.length)]
        terrainData.grassTufts.push({
            x,
            y,
            size: 8 + rng() * 15,
            rotation: rng() * Math.PI * 2,
            blades: 4 + Math.floor(rng() * 3),
            spread: 6 + rng() * 7,
            width: 1.2 + rng() * 1.25,
            curve: (rng() - 0.5) * 6,
            color: palette.color,
            highlight: palette.highlight
        })
    }

    for(let i = 0; i < Math.floor(110 * areaScale); i++){
        const angle = rng() * Math.PI * 2
        const edge = getBoundaryPoint(angle, 10 + rng() * 28, 1.02 + rng() * 0.09)
        const palette = grassTuftColors[Math.floor(rng() * grassTuftColors.length)]

        terrainData.edgeTufts.push({
            x: edge.x + (rng() - 0.5) * 18,
            y: edge.y + (rng() - 0.5) * 14,
            size: 14 + rng() * 18,
            rotation: angle + (rng() - 0.5) * 1.1,
            blades: 5 + Math.floor(rng() * 3),
            spread: 9 + rng() * 8,
            width: 1.45 + rng() * 1.4,
            curve: (rng() - 0.5) * 8,
            color: palette.color,
            highlight: palette.highlight
        })
    }

    const flowerPetals = ["#fff6de", "#ffd1dc", "#d7e9ff", "#ffe7a6"]

    let flowerAttempts = 0
    while(terrainData.flowers.length < Math.floor(44 * areaScale) && flowerAttempts < Math.floor(1400 * areaScale)){
        flowerAttempts++
        const x = baseRandomX()
        const y = baseRandomY()
        const dist = getClearingDistance(x, y, 0)

        if(dist < 1.02 || dist > 1.62){
            continue
        }

        terrainData.flowers.push({
            x,
            y,
            size: 3.2 + rng() * 2.5,
            petals: 4 + Math.floor(rng() * 2),
            rotation: rng() * Math.PI,
            petalColor: flowerPetals[Math.floor(rng() * flowerPetals.length)],
            centerColor: rng() < 0.6 ? "#f4bf34" : "#ffe48a"
        })
    }

    let cloverAttempts = 0
    while(terrainData.clovers.length < Math.floor(34 * areaScale) && cloverAttempts < Math.floor(1000 * areaScale)){
        cloverAttempts++
        const x = baseRandomX()
        const y = baseRandomY()
        const dist = getClearingDistance(x, y, 8)

        if(dist < 0.96){
            continue
        }

        terrainData.clovers.push({
            x,
            y,
            size: 7 + rng() * 6,
            rotation: rng() * Math.PI * 2,
            fourLeaf: rng() < 0.2,
            color: rng() < 0.5 ? "#5fa548" : "#4b913b",
            shadowColor: "rgba(26,61,19,0.25)",
            stemColor: "#327335"
        })
    }

    for(let i = 0; i < Math.floor(90 * areaScale); i++){
        const inside = rng() < 0.55
        const x = inside
            ? centerX + (rng() - 0.5) * clearingRadiusX * 1.55
            : baseRandomX()
        const y = inside
            ? centerY + (rng() - 0.5) * clearingRadiusY * 1.45
            : baseRandomY()
        const dist = getClearingDistance(x, y, 0)

        if(!inside && dist < 0.95 && rng() < 0.8){
            continue
        }

        terrainData.pebbles.push({
            x,
            y,
            rx: 2.2 + rng() * 4.5,
            ry: 1.6 + rng() * 3.2,
            rotation: rng() * Math.PI,
            shadowColor: "rgba(22,25,20,0.12)",
            lightColor: dist < 1 ? "#c1b497" : "#adb39a",
            darkColor: dist < 1 ? "#85795e" : "#68745d",
            highlightColor: dist < 1 ? "rgba(255,240,220,0.38)" : "rgba(255,255,255,0.24)"
        })
    }

    for(let i = 0; i < Math.floor(24 * areaScale); i++){
        const angle = rng() * Math.PI * 2
        const edge = getBoundaryPoint(angle, -18 + rng() * 44, 0.95 + rng() * 0.16)
        terrainData.transitionPatches.push({
            points: createOrganicPoints(
                edge.x,
                edge.y,
                28 + rng() * 52,
                16 + rng() * 28,
                14,
                0.22,
                rng
            ),
            color: rng() < 0.5 ? "rgba(112,126,62,0.24)" : "rgba(93,114,54,0.2)"
        })
    }

    for(let i = 0; i < Math.floor(22 * areaScale); i++){
        const angle = rng() * Math.PI * 2
        const radius = Math.sqrt(rng()) * 0.86
        const x = centerX + Math.cos(angle) * clearingRadiusX * radius * 0.86
        const y = centerY + Math.sin(angle) * clearingRadiusY * radius * 0.8

        terrainData.dirtPatches.push({
            points: createOrganicPoints(
                x,
                y,
                24 + rng() * 54,
                12 + rng() * 26,
                12,
                0.18,
                rng
            ),
            color: rng() < 0.5 ? "rgba(173,151,99,0.18)" : "rgba(110,87,48,0.16)"
        })
    }

    const speckleColorsGrass = [
        "#6eb85d",
        "#7bc76c",
        "#97d17b",
        "#e6d99d"
    ]

    const speckleColorsDirt = [
        "#c7b480",
        "#a98d59",
        "#80653a",
        "#d8c897"
    ]

    for(let i = 0; i < Math.floor(680 * areaScale); i++){
        const x = baseRandomX()
        const y = baseRandomY()
        const dist = getClearingDistance(x, y, 0)
        const dirt = dist < 1.04
        const palette = dirt ? speckleColorsDirt : speckleColorsGrass

        terrainData.speckles.push({
            x,
            y,
            size: dirt ? 0.8 + rng() * 2.1 : 0.7 + rng() * 1.9,
            alpha: dirt ? 0.08 + rng() * 0.12 : 0.06 + rng() * 0.12,
            color: palette[Math.floor(rng() * palette.length)]
        })
    }

    const bushPalettes = [
        ["#1b431a", "#295b23", "#3a7a30", "#67a74b"],
        ["#183f18", "#255623", "#3c7330", "#78b75a"],
        ["#21471d", "#2d6128", "#447d34", "#84c664"]
    ]

    for(const anchor of bushAnchors){
        const x = baseWorldWidth * anchor.nx
        const y = baseWorldHeight * anchor.ny
        const base = minDim * 0.045 * anchor.scale + 8
        const palette = bushPalettes[Math.floor(rng() * bushPalettes.length)]
        const lobeCount = 7 + Math.floor(rng() * 4)
        const lobes = []
        const leafDots = []
        const baseTufts = []

        for(let i = 0; i < lobeCount; i++){
            const angle = i / lobeCount * Math.PI * 2 + rng() * 0.5
            const distance = base * (0.1 + rng() * 0.72)
            lobes.push({
                x: x + Math.cos(angle) * distance,
                y: y + Math.sin(angle) * distance * 0.72,
                r: base * (0.48 + rng() * 0.36),
                color: palette[Math.floor(rng() * palette.length)]
            })
        }

        for(let i = 0; i < 12; i++){
            leafDots.push({
                x: x + (rng() - 0.5) * base * 1.8,
                y: y - base * 0.42 + (rng() - 0.5) * base * 1.1,
                r: 2 + rng() * 4,
                color: rng() < 0.5 ? "rgba(159,219,121,0.2)" : "rgba(121,185,86,0.18)"
            })
        }

        for(let i = 0; i < 5; i++){
            baseTufts.push({
                x: x + (rng() - 0.5) * base * 1.5,
                y: y + base * 0.72 + rng() * base * 0.2,
                size: 10 + rng() * 10,
                rotation: rng() * Math.PI * 2,
                blades: 4 + Math.floor(rng() * 2),
                spread: 6 + rng() * 4,
                width: 1.25 + rng() * 0.9,
                curve: (rng() - 0.5) * 5,
                color: "#366f2b",
                highlight: "#7fc95f"
            })
        }

        terrainData.bushes.push({
            x,
            y,
            base,
            palette,
            baseShape: createOrganicPoints(x, y + base * 0.06, base * 1.28, base * 0.92, 16, 0.15, rng),
            lobes,
            leafDots,
            baseTufts
        })
    }

    for(let i = 0; i < 18; i++){
        const x = getRandomRange(rng, baseWorldWidth * 0.08, baseWorldWidth * 0.92)
        const y = getRandomRange(rng, baseWorldHeight * 0.08, baseWorldHeight * 0.9)
        if(isInsideClearing(x, y, 70) && rng() < 0.5) continue
        const anchor = {
            x,
            y,
            base: minDim * getRandomRange(rng, 0.03, 0.042)
        }
        const palette = bushPalettes[Math.floor(rng() * bushPalettes.length)]
        const lobeCount = 6 + Math.floor(rng() * 3)
        const lobes = []
        const leafDots = []
        const baseTufts = []

        for(let i2 = 0; i2 < lobeCount; i2++){
            const angle = i2 / lobeCount * Math.PI * 2 + rng() * 0.5
            const distance = anchor.base * (0.16 + rng() * 0.7)
            lobes.push({
                x: x + Math.cos(angle) * distance,
                y: y + Math.sin(angle) * distance * 0.72,
                r: anchor.base * (0.42 + rng() * 0.34),
                color: palette[Math.floor(rng() * palette.length)]
            })
        }

        for(let i2 = 0; i2 < 9; i2++){
            leafDots.push({
                x: x + (rng() - 0.5) * anchor.base * 1.8,
                y: y - anchor.base * 0.4 + (rng() - 0.5) * anchor.base * 1.2,
                r: 2 + rng() * 3,
                color: rng() < 0.5 ? "rgba(159,219,121,0.2)" : "rgba(121,185,86,0.18)"
            })
        }

        for(let i2 = 0; i2 < 4; i2++){
            baseTufts.push({
                x: x + (rng() - 0.5) * anchor.base * 1.4,
                y: y + anchor.base * 0.72 + rng() * anchor.base * 0.2,
                size: 9 + rng() * 9,
                rotation: rng() * Math.PI * 2,
                blades: 4 + Math.floor(rng() * 2),
                spread: 5 + rng() * 4,
                width: 1.2 + rng() * 0.8,
                curve: (rng() - 0.5) * 5,
                color: "#366f2b",
                highlight: "#7fc95f"
            })
        }

        terrainData.bushes.push({
            x,
            y,
            base: anchor.base,
            palette,
            baseShape: createOrganicPoints(x, y + anchor.base * 0.06, anchor.base * 1.28, anchor.base * 0.92, 16, 0.15, rng),
            lobes,
            leafDots,
            baseTufts
        })
    }

    terrainData.deferredStructureLayoutRng = rng
    applyZoneTerrainTypes(terrainData)

    if(includeStructures){
        buildTerrainStructures(terrainData)
    }

    return terrainData
}
