/**
 * This module renders cached terrain layers and world backdrops.
 * It is responsible for terrain-layer drawing and does not own gameplay state transitions.
 */


import {
    canvas,
    ctx,
    backgroundLayer,
    bushLayer,
    rockLayer,
    terrainOverlayLayer,
    backgroundCtx,
    bushCtx,
    rockCtx,
    terrainOverlayCtx,
    world,
    terrain,
    camera,
    mobile,
    view,
} from "../core/state.js"
import { BUILD_ID } from "../config/game_config.js"
import { traceSmoothPath, roundedRectPath } from "../core/utils.js"

export const terrainRenderProfile = {
    layerScale:1,
    mobileOptimized:false,
    layerPixels:0,
    layerMemoryMB:0
}

const DESKTOP_LAYER_PIXEL_BUDGET = 12000000
const MOBILE_LAYER_PIXEL_BUDGET = 7000000
const MIN_LAYER_SCALE = 0.32

const TERRAIN_PREFAB_SOURCES = {
    rock_cluster:"../../prototypes/assets/frog_warrior_v2/rock_cluster.png",
    pillar_set:"../../prototypes/assets/frog_warrior_v2/pillar_set.png",
    ruin_arch:"../../prototypes/assets/frog_warrior_v2/ruin_arch.png",
    ruin_wall_soft:"../../prototypes/assets/frog_warrior_v2/ruin_wall_soft.png",
    ruin_wall_corner:"../../prototypes/assets/frog_warrior_v2/ruin_wall_corner.png",
    ruin_stairs:"../../prototypes/assets/frog_warrior_v2/ruin_stairs.png",
    ruin_tower:"../../prototypes/assets/frog_warrior_v2/ruin_tower.png",
    lily_cluster_1:"../../prototypes/assets/frog_warrior_v2/lily_cluster_1.png",
    lily_cluster_2:"../../prototypes/assets/frog_warrior_v2/lily_cluster_2.png"
}

const terrainPrefabStyledCache = new Map()
const terrainPrefabImages = Object.create(null)
const PREFAB_STYLE_BUILD_BUDGET_PER_PASS = 2
let prefabLayerRefreshTimeout = 0
let prefabStyleBuildCount = 0
let prefabStyleFollowupQueued = false

function schedulePrefabLayerRefresh(){
    if(prefabLayerRefreshTimeout){
        clearTimeout(prefabLayerRefreshTimeout)
    }
    prefabLayerRefreshTimeout = window.setTimeout(() => {
        prefabLayerRefreshTimeout = 0
        if(terrain && rockLayer.width > 0 && rockLayer.height > 0){
            renderRockLayer()
        }
    }, 48)
}

function ensureTerrainPrefabImage(assetKey){
    const existing = terrainPrefabImages[assetKey]
    if(existing){
        return existing
    }

    const relativePath = TERRAIN_PREFAB_SOURCES[assetKey]
    if(!relativePath){
        return null
    }

    const image = new Image()
    const url = new URL(relativePath, import.meta.url)
    url.searchParams.set("v", BUILD_ID)
    image.decoding = "async"
    image.addEventListener("load", () => {
        terrainPrefabStyledCache.clear()
        schedulePrefabLayerRefresh()
    }, {once:true})
    image.src = url.href
    terrainPrefabImages[assetKey] = image
    return image
}

function getTerrainContactPalette(terrainType){
    if(terrainType === "mud"){
        return {
            base:"rgba(132,112,72,0.2)",
            fringe:"rgba(109,134,83,0.16)",
            glow:"rgba(173,151,105,0.12)",
            shadow:"rgba(20,18,12,0.1)"
        }
    }
    if(terrainType === "danger"){
        return {
            base:"rgba(106,115,73,0.18)",
            fringe:"rgba(124,144,88,0.14)",
            glow:"rgba(141,119,86,0.1)",
            shadow:"rgba(18,18,15,0.1)"
        }
    }
    return {
        base:"rgba(94,126,76,0.18)",
        fringe:"rgba(127,167,98,0.15)",
        glow:"rgba(162,158,110,0.08)",
        shadow:"rgba(15,20,14,0.085)"
    }
}

function getPrefabTintPalette(terrainType, kind){
    if(kind === "lily"){
        return terrainType === "mud"
            ? {
                top:"rgba(170,175,126,0.08)",
                mid:"rgba(120,140,92,0.12)",
                bottom:"rgba(92,116,72,0.16)"
            }
            : {
                top:"rgba(170,183,132,0.06)",
                mid:"rgba(118,146,94,0.1)",
                bottom:"rgba(84,118,74,0.14)"
            }
    }

    if(terrainType === "mud"){
        return {
            top:"rgba(193,180,141,0.12)",
            mid:"rgba(136,143,104,0.14)",
            bottom:"rgba(109,121,84,0.2)"
        }
    }
    if(terrainType === "danger"){
        return {
            top:"rgba(183,173,136,0.1)",
            mid:"rgba(126,137,96,0.14)",
            bottom:"rgba(98,114,79,0.18)"
        }
    }
    return {
        top:"rgba(191,185,146,0.1)",
        mid:"rgba(132,149,106,0.13)",
        bottom:"rgba(103,126,87,0.18)"
    }
}

function getStyledTerrainPrefab(assetKey, placement){
    const image = ensureTerrainPrefabImage(assetKey)
    if(!image?.complete || !image.naturalWidth){
        return null
    }

    const cacheKey = `${assetKey}:${placement.terrainType || "grass"}:${placement.kind || "stone"}`
    const cached = terrainPrefabStyledCache.get(cacheKey)
    if(cached){
        return cached
    }

    if(prefabStyleBuildCount >= PREFAB_STYLE_BUILD_BUDGET_PER_PASS){
        if(!prefabStyleFollowupQueued){
            prefabStyleFollowupQueued = true
            schedulePrefabLayerRefresh()
        }
        return null
    }
    prefabStyleBuildCount += 1

    const width = image.naturalWidth
    const height = image.naturalHeight
    const canvasEl = document.createElement("canvas")
    canvasEl.width = width
    canvasEl.height = height
    const styledCtx = canvasEl.getContext("2d")
    const softCanvas = document.createElement("canvas")
    const downsample = placement.kind === "lily" ? 0.82 : 0.74
    softCanvas.width = Math.max(8, Math.round(width * downsample))
    softCanvas.height = Math.max(8, Math.round(height * downsample))
    const softCtx = softCanvas.getContext("2d")
    softCtx.imageSmoothingEnabled = true
    softCtx.filter = placement.kind === "lily"
        ? "contrast(0.88) saturate(0.86) brightness(0.98)"
        : "contrast(0.84) saturate(0.78) brightness(0.98)"
    softCtx.drawImage(image, 0, 0, softCanvas.width, softCanvas.height)

    styledCtx.imageSmoothingEnabled = true
    styledCtx.filter = placement.kind === "lily" ? "blur(0.45px)" : "blur(0.7px)"
    styledCtx.drawImage(softCanvas, 0, 0, softCanvas.width, softCanvas.height, 0, 0, width, height)
    styledCtx.filter = "none"

    const tint = getPrefabTintPalette(placement.terrainType, placement.kind)
    const tintGradient = styledCtx.createLinearGradient(0, 0, 0, height)
    tintGradient.addColorStop(0, tint.top)
    tintGradient.addColorStop(0.56, tint.mid)
    tintGradient.addColorStop(1, tint.bottom)
    styledCtx.globalCompositeOperation = "source-atop"
    styledCtx.fillStyle = tintGradient
    styledCtx.fillRect(0, 0, width, height)
    styledCtx.fillStyle = "rgba(208,206,184,0.06)"
    styledCtx.fillRect(0, 0, width, height)

    const groundGradient = styledCtx.createLinearGradient(0, height * 0.48, 0, height)
    groundGradient.addColorStop(0, "rgba(0,0,0,0)")
    groundGradient.addColorStop(0.72, "rgba(98,116,84,0.06)")
    groundGradient.addColorStop(1, "rgba(116,139,93,0.12)")
    styledCtx.fillStyle = groundGradient
    styledCtx.fillRect(0, height * 0.48, width, height * 0.52)
    styledCtx.globalCompositeOperation = "source-over"

    terrainPrefabStyledCache.set(cacheKey, canvasEl)
    return canvasEl
}

function drawTerrainPrefabGroundContact(context, placement){
    const palette = getTerrainContactPalette(placement.terrainType)
    const contactWidth =
        placement.kind === "pillar" ? placement.width * 0.52 :
        placement.kind === "arch" ? placement.width * 0.66 :
        placement.kind === "tower" ? placement.width * 0.58 :
        placement.kind === "stairs" ? placement.width * 0.6 :
        placement.kind === "lily" ? placement.width * 0.84 :
        placement.blocking === "barrier" ? placement.width * 0.64 :
        placement.width * 0.58
    const contactHeight =
        placement.kind === "pillar" ? placement.height * 0.16 :
        placement.kind === "arch" ? placement.height * 0.16 :
        placement.kind === "tower" ? placement.height * 0.17 :
        placement.kind === "stairs" ? placement.height * 0.16 :
        placement.kind === "lily" ? placement.height * 0.24 :
        placement.blocking === "barrier" ? placement.height * 0.21 :
        placement.height * 0.18

    context.save()
    context.translate(placement.x, placement.y + contactHeight * 0.08)
    context.rotate(placement.rotation || 0)
    context.filter = "blur(8px)"
    context.fillStyle = palette.shadow
    context.beginPath()
    context.ellipse(0, contactHeight * 0.06, contactWidth * 0.72, contactHeight * 0.44, 0, 0, Math.PI * 2)
    context.fill()

    context.filter = "blur(6px)"
    context.fillStyle = palette.base
    context.beginPath()
    context.ellipse(0, 0, contactWidth * 0.62, contactHeight * 0.36, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = palette.glow
    context.beginPath()
    context.ellipse(-contactWidth * 0.08, -contactHeight * 0.14, contactWidth * 0.44, contactHeight * 0.22, 0, 0, Math.PI * 2)
    context.fill()

    context.filter = "blur(4px)"
    context.fillStyle = palette.fringe
    for(const [dx, dy, sx, sy] of [
        [-0.36, 0.02, 0.22, 0.15],
        [-0.08, -0.08, 0.28, 0.18],
        [0.22, 0.04, 0.24, 0.16]
    ]){
        context.beginPath()
        context.ellipse(contactWidth * dx, contactHeight * dy, contactWidth * sx, contactHeight * sy, 0, 0, Math.PI * 2)
        context.fill()
    }
    context.restore()
}

function drawTerrainPrefabShadow(context, placement){
    const shadowWidth =
        placement.kind === "pillar" ? placement.width * 0.42 :
        placement.kind === "arch" ? placement.width * 0.56 :
        placement.kind === "tower" ? placement.width * 0.48 :
        placement.kind === "stairs" ? placement.width * 0.54 :
        placement.kind === "lily" ? placement.width * 0.6 :
        placement.blocking === "barrier" ? placement.width * 0.5 :
        placement.width * 0.46
    const shadowHeight =
        placement.kind === "pillar" ? placement.height * 0.09 :
        placement.kind === "arch" ? placement.height * 0.1 :
        placement.kind === "tower" ? placement.height * 0.11 :
        placement.kind === "stairs" ? placement.height * 0.1 :
        placement.kind === "lily" ? placement.height * 0.12 :
        placement.blocking === "barrier" ? placement.height * 0.14 :
        placement.height * 0.11

    context.save()
    context.translate(placement.x, placement.y + shadowHeight * 0.24)
    context.rotate(placement.rotation || 0)
    context.filter = "blur(4px)"
    context.fillStyle = placement.kind === "lily" ? "rgba(15,28,24,0.065)" : "rgba(10,14,11,0.095)"
    context.beginPath()
    context.ellipse(0, 0, shadowWidth, shadowHeight, 0, 0, Math.PI * 2)
    context.fill()
    context.restore()
}

function drawTerrainPrefabFallback(context, placement){
    context.save()
    context.translate(placement.x, placement.y)
    context.rotate(placement.rotation || 0)
    context.fillStyle =
        placement.kind === "lily" ? "rgba(84,142,97,0.34)" :
        placement.kind === "pillar" ? "rgba(133,128,112,0.46)" :
        placement.blocking === "barrier" ? "rgba(116,108,90,0.44)" :
        "rgba(118,112,95,0.42)"
    roundedRectPath(
        context,
        -placement.width * 0.34,
        -placement.height * 0.36,
        placement.width * 0.68,
        placement.height * 0.44,
        Math.max(10, placement.height * 0.12)
    )
    context.fill()
    context.restore()
}

function drawTerrainPrefab(context, placement){
    drawTerrainPrefabGroundContact(context, placement)
    drawTerrainPrefabShadow(context, placement)
    const image = getStyledTerrainPrefab(placement.assetKey, placement)
    const drawableWidth = image?.naturalWidth || image?.width || 0
    if(!image || drawableWidth <= 0){
        drawTerrainPrefabFallback(context, placement)
        return
    }

    const pivotX = placement.pivotX ?? 0.5
    const pivotY = placement.pivotY ?? 0.8
    context.save()
    context.translate(placement.x, placement.y)
    context.rotate(placement.rotation || 0)
    context.globalAlpha = placement.kind === "lily" ? 0.96 : 0.94
    context.drawImage(
        image,
        -placement.width * pivotX,
        -placement.height * pivotY,
        placement.width,
        placement.height
    )
    context.restore()
}

function getTerrainLayerScale(){
    const worldPixels = Math.max(1, world.width * world.height)
    const pixelBudget = mobile.active ? MOBILE_LAYER_PIXEL_BUDGET : DESKTOP_LAYER_PIXEL_BUDGET
    const budgetScale = Math.sqrt(pixelBudget / worldPixels)
    const scale = Math.min(1, budgetScale)
    return Math.max(MIN_LAYER_SCALE, scale)
}

function prepareLayerContext(layer, layerCtx){
    layerCtx.setTransform(1, 0, 0, 1, 0, 0)
    layerCtx.clearRect(0, 0, layer.width, layer.height)
    layerCtx.setTransform(terrainRenderProfile.layerScale, 0, 0, terrainRenderProfile.layerScale, 0, 0)
    layerCtx.imageSmoothingEnabled = true
}

function drawAltarGround(context){
    const altar = terrain.altarLandmark
    if(!altar){
        return
    }

    for(const path of terrain.altarPaths || []){
        context.fillStyle = path.color
        traceSmoothPath(context, path.points)
        context.fill()
    }

    context.save()
    const dampAura = context.createRadialGradient(
        altar.centerX,
        altar.centerY + altar.baseRadius * 0.08,
        altar.baseRadius * 0.2,
        altar.centerX,
        altar.centerY + altar.baseRadius * 0.08,
        altar.courtRadius * 1.08
    )
    dampAura.addColorStop(0, "rgba(91,86,61,0.04)")
    dampAura.addColorStop(0.5, "rgba(74,85,61,0.06)")
    dampAura.addColorStop(1, "rgba(255,255,255,0)")
    context.fillStyle = dampAura
    context.fillRect(
        altar.centerX - altar.courtRadius * 1.6,
        altar.centerY - altar.courtRadius * 1.3,
        altar.courtRadius * 3.2,
        altar.courtRadius * 2.6
    )

    context.fillStyle = "rgba(88,84,66,0.16)"
    traceSmoothPath(context, altar.terraceShape)
    context.fill()

    context.fillStyle = "rgba(63,73,54,0.1)"
    traceSmoothPath(context, altar.daisShape)
    context.fill()

    for(const patch of altar.mossPatches || []){
        context.fillStyle = patch.color
        traceSmoothPath(context, patch.points)
        context.fill()
    }

    for(const segment of altar.ringSegments || []){
        context.strokeStyle = "rgba(114,108,84,0.32)"
        context.lineWidth = segment.width
        context.beginPath()
        context.ellipse(altar.centerX, altar.centerY, segment.rx, segment.ry, 0, segment.start, segment.end)
        context.stroke()

        context.strokeStyle = "rgba(157,148,118,0.14)"
        context.lineWidth = Math.max(2, segment.width * 0.18)
        context.beginPath()
        context.ellipse(altar.centerX, altar.centerY - segment.width * 0.06, segment.rx * 0.97, segment.ry * 0.94, 0, segment.start, segment.end)
        context.stroke()
    }

    for(const step of altar.steps || []){
        context.save()
        context.translate(step.x, step.y)
        context.rotate(step.rotation)
        context.fillStyle = "rgba(117,109,84,0.2)"
        context.fillRect(-step.width * 0.52, -step.height * 0.5, step.width, step.height)
        context.strokeStyle = "rgba(168,156,118,0.18)"
        context.lineWidth = 2
        context.strokeRect(-step.width * 0.52, -step.height * 0.5, step.width, step.height)
        context.restore()
    }

    context.strokeStyle = "rgba(74,70,52,0.3)"
    context.lineWidth = 2
    context.lineCap = "round"
    for(const crack of altar.crackLines || []){
        context.beginPath()
        context.moveTo(crack[0].x, crack[0].y)
        context.quadraticCurveTo(crack[1].x, crack[1].y, crack[2].x, crack[2].y)
        context.stroke()
    }
    context.restore()
}

function drawAltarStructures(context){
    const altar = terrain.altarLandmark
    if(!altar){
        return
    }

    context.save()
    context.fillStyle = "rgba(9,12,10,0.18)"
    context.beginPath()
    context.ellipse(altar.centerX, altar.centerY + altar.baseRadius * 0.7, altar.baseRadius * 0.96, altar.baseRadius * 0.28, 0, 0, Math.PI * 2)
    context.fill()

    const baseGradient = context.createLinearGradient(
        altar.centerX - altar.baseRadius * 0.7,
        altar.centerY - altar.baseRadius * 0.5,
        altar.centerX + altar.baseRadius * 0.7,
        altar.centerY + altar.baseRadius * 0.75
    )
    baseGradient.addColorStop(0, "#958d7d")
    baseGradient.addColorStop(0.25, "#7a7364")
    baseGradient.addColorStop(0.72, "#585247")
    baseGradient.addColorStop(1, "#433d35")
    context.fillStyle = baseGradient
    traceSmoothPath(context, altar.terraceShape)
    context.fill()

    context.strokeStyle = "rgba(73,71,61,0.5)"
    context.lineWidth = 3
    traceSmoothPath(context, altar.terraceShape)
    context.stroke()

    const daisGradient = context.createLinearGradient(
        altar.centerX - altar.baseRadius * 0.5,
        altar.centerY - altar.baseRadius * 0.36,
        altar.centerX + altar.baseRadius * 0.5,
        altar.centerY + altar.baseRadius * 0.42
    )
    daisGradient.addColorStop(0, "#8f8778")
    daisGradient.addColorStop(0.4, "#6f685a")
    daisGradient.addColorStop(1, "#514b42")
    context.fillStyle = daisGradient
    traceSmoothPath(context, altar.daisShape)
    context.fill()

    context.strokeStyle = "rgba(64,61,52,0.7)"
    context.lineWidth = 3
    traceSmoothPath(context, altar.daisShape)
    context.stroke()

    const pedestalGradient = context.createLinearGradient(
        altar.centerX,
        altar.centerY - altar.baseRadius * 0.34,
        altar.centerX,
        altar.centerY + altar.baseRadius * 0.18
    )
    pedestalGradient.addColorStop(0, "#c4baa2")
    pedestalGradient.addColorStop(0.5, "#968c74")
    pedestalGradient.addColorStop(1, "#625b4c")
    context.fillStyle = pedestalGradient
    traceSmoothPath(context, altar.corePedestal)
    context.fill()

    for(let i = 0; i < 6; i++){
        const angle = i / 6 * Math.PI * 2
        context.fillStyle = i % 2 === 0 ? "rgba(111,120,97,0.3)" : "rgba(94,102,82,0.24)"
        context.beginPath()
        context.ellipse(
            altar.centerX + Math.cos(angle) * altar.baseRadius * 0.12,
            altar.centerY - altar.baseRadius * 0.1 + Math.sin(angle) * altar.baseRadius * 0.08,
            altar.baseRadius * 0.085,
            altar.baseRadius * 0.042,
            angle,
            0,
            Math.PI * 2
        )
        context.fill()
    }

    context.fillStyle = "#6d7a64"
    context.beginPath()
    context.ellipse(altar.centerX, altar.centerY - altar.baseRadius * 0.12, altar.baseRadius * 0.16, altar.baseRadius * 0.06, 0, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.translate(altar.centerX, altar.centerY - altar.baseRadius * 0.2)
    context.rotate(-0.08)
    context.fillStyle = "#746d60"
    context.beginPath()
    context.moveTo(-altar.baseRadius * 0.08, altar.baseRadius * 0.18)
    context.lineTo(-altar.baseRadius * 0.06, -altar.baseRadius * 0.16)
    context.lineTo(0, -altar.baseRadius * 0.22)
    context.lineTo(altar.baseRadius * 0.07, -altar.baseRadius * 0.14)
    context.lineTo(altar.baseRadius * 0.08, altar.baseRadius * 0.18)
    context.closePath()
    context.fill()
    context.fillStyle = "rgba(230,237,191,0.58)"
    context.beginPath()
    context.ellipse(0, -altar.baseRadius * 0.07, altar.baseRadius * 0.055, altar.baseRadius * 0.15, 0, 0, Math.PI * 2)
    context.fill()
    context.restore()

    const coreGlow = context.createRadialGradient(
        altar.centerX,
        altar.centerY - altar.baseRadius * 0.28,
        altar.baseRadius * 0.03,
        altar.centerX,
        altar.centerY - altar.baseRadius * 0.18,
        altar.baseRadius * 0.42
    )
    coreGlow.addColorStop(0, "rgba(243,243,199,0.46)")
    coreGlow.addColorStop(0.45, "rgba(201,219,161,0.22)")
    coreGlow.addColorStop(1, "rgba(255,255,255,0)")
    context.fillStyle = coreGlow
    context.fillRect(
        altar.centerX - altar.baseRadius * 0.64,
        altar.centerY - altar.baseRadius * 0.7,
        altar.baseRadius * 1.28,
        altar.baseRadius * 0.98
    )

    for(const column of altar.columns){
        context.save()
        context.translate(column.x, column.y)
        context.rotate(column.rotation + column.tilt)

        context.fillStyle = "rgba(0,0,0,0.16)"
        context.beginPath()
        context.ellipse(0, column.width * 1.2, column.width * 0.94, column.width * 0.32, 0, 0, Math.PI * 2)
        context.fill()

        const visibleHeight = column.height * (column.broken ? 0.88 : 1.12) * (column.buried ? 0.7 : 1)
        const shaftGradient = context.createLinearGradient(0, -visibleHeight, 0, column.width * 0.65)
        shaftGradient.addColorStop(0, "#b8b09d")
        shaftGradient.addColorStop(0.35, "#938a78")
        shaftGradient.addColorStop(1, "#625b4e")
        context.fillStyle = shaftGradient
        context.beginPath()
        context.moveTo(-column.width * 0.58, column.width * 0.54)
        context.lineTo(-column.width * 0.42, -visibleHeight)
        context.lineTo(column.width * 0.34, -visibleHeight + column.capOffset)
        context.lineTo(column.width * 0.62, column.width * 0.54)
        context.closePath()
        context.fill()

        context.fillStyle = "#a79e8b"
        context.fillRect(-column.width * 0.76, -visibleHeight - column.width * 0.08, column.width * 1.42, column.width * 0.18)
        context.fillRect(-column.width * 0.84, column.width * 0.08, column.width * 1.6, column.width * 0.22)

        if(column.broken){
            context.fillStyle = "#8a816f"
            context.beginPath()
            context.moveTo(-column.width * 0.42, -visibleHeight + column.width * 0.04)
            context.lineTo(0, -visibleHeight - column.width * 0.28)
            context.lineTo(column.width * 0.36, -visibleHeight + column.width * 0.08)
            context.closePath()
            context.fill()
        }

        context.restore()
    }

    for(const rubble of altar.rubble){
        context.save()
        context.translate(rubble.x, rubble.y)
        context.rotate(rubble.rotation)
        context.fillStyle = "#918b79"
        context.beginPath()
        context.ellipse(0, 0, rubble.rx, rubble.ry, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
    }
    context.restore()
}

function getPointsBounds(points){
    const xs = points.map(point => point.x)
    const ys = points.map(point => point.y)
    return {
        minX:Math.min(...xs),
        maxX:Math.max(...xs),
        minY:Math.min(...ys),
        maxY:Math.max(...ys)
    }
}

function drawStoneTerrace(context, terrace){
    const outerBounds = getPointsBounds(terrace.outer)
    const innerBounds = getPointsBounds(terrace.inner)
    const outerWidth = outerBounds.maxX - outerBounds.minX
    const outerHeight = outerBounds.maxY - outerBounds.minY
    const shadowDx = Math.max(3, Math.min(8, outerWidth * 0.05))
    const shadowDy = Math.max(6, Math.min(16, outerHeight * 0.12))
    const edgeLine = Math.max(1.2, Math.min(2, outerWidth * 0.015))
    const crackLine = Math.max(1.1, Math.min(2, outerWidth * 0.014))
    const shadowPoints = terrace.outer.map(point => ({x:point.x + shadowDx, y:point.y + shadowDy}))

    context.save()
    context.fillStyle = terrace.shadow
    traceSmoothPath(context, shadowPoints)
    context.fill()

    const outerGradient = context.createLinearGradient(
        outerBounds.minX,
        outerBounds.minY,
        outerBounds.maxX,
        outerBounds.maxY
    )
    outerGradient.addColorStop(0, terrace.highlight)
    outerGradient.addColorStop(0.44, terrace.mid)
    outerGradient.addColorStop(1, terrace.dark)
    context.fillStyle = outerGradient
    traceSmoothPath(context, terrace.outer)
    context.fill()

    context.strokeStyle = "rgba(205,220,216,0.18)"
    context.lineWidth = edgeLine
    traceSmoothPath(context, terrace.outer)
    context.stroke()

    const innerGradient = context.createLinearGradient(
        innerBounds.minX,
        innerBounds.minY,
        innerBounds.maxX,
        innerBounds.maxY
    )
    innerGradient.addColorStop(0, "rgba(174,188,182,0.24)")
    innerGradient.addColorStop(0.5, terrace.mid)
    innerGradient.addColorStop(1, terrace.dark)
    context.fillStyle = innerGradient
    traceSmoothPath(context, terrace.inner)
    context.fill()

    context.strokeStyle = "rgba(48,58,58,0.34)"
    context.lineWidth = edgeLine
    traceSmoothPath(context, terrace.inner)
    context.stroke()

    context.strokeStyle = "rgba(56,66,63,0.46)"
    context.lineWidth = crackLine
    context.lineCap = "round"
    for(const crack of terrace.cracks || []){
        context.beginPath()
        context.moveTo(crack[0].x, crack[0].y)
        context.quadraticCurveTo(crack[1].x, crack[1].y, crack[2].x, crack[2].y)
        context.stroke()
    }

    context.restore()
}

function drawStoneSpine(context, spine){
    const shadowPoints = spine.points.map(point => ({x:point.x + 5, y:point.y + 10}))
    context.save()
    context.fillStyle = "rgba(8,12,11,0.14)"
    traceSmoothPath(context, shadowPoints)
    context.fill()
    context.fillStyle = spine.color
    traceSmoothPath(context, spine.points)
    context.fill()
    context.strokeStyle = spine.rim
    context.lineWidth = 2
    traceSmoothPath(context, spine.points)
    context.stroke()
    context.restore()
}

function drawTidalRun(context, run){
    context.save()
    context.fillStyle = run.color
    traceSmoothPath(context, run.points)
    context.fill()
    context.strokeStyle = run.rim
    context.lineWidth = 2
    traceSmoothPath(context, run.points)
    context.stroke()
    context.restore()
}

function drawLowPlinth(context, plinth){
    context.save()
    context.translate(plinth.x, plinth.y)
    context.rotate(plinth.lean || 0)

    context.fillStyle = "rgba(8,12,11,0.14)"
    context.beginPath()
    context.ellipse(0, plinth.size * 0.76, plinth.size * 0.88, plinth.size * 0.24, 0, 0, Math.PI * 2)
    context.fill()

    const bodyGradient = context.createLinearGradient(0, -plinth.size, 0, plinth.size)
    bodyGradient.addColorStop(0, "#8f9b93")
    bodyGradient.addColorStop(0.5, "#6f7b75")
    bodyGradient.addColorStop(1, "#55605b")
    context.fillStyle = bodyGradient
    context.beginPath()
    context.moveTo(-plinth.size * 0.46, plinth.size * 0.24)
    context.lineTo(-plinth.size * 0.34, -plinth.size * 0.56)
    context.lineTo(plinth.size * 0.24, -plinth.size * 0.64)
    context.lineTo(plinth.size * 0.42, plinth.size * 0.18)
    context.closePath()
    context.fill()

    context.strokeStyle = "rgba(209,221,216,0.16)"
    context.lineWidth = 1.5
    context.beginPath()
    context.moveTo(-plinth.size * 0.24, -plinth.size * 0.18)
    context.lineTo(plinth.size * 0.18, -plinth.size * 0.3)
    context.stroke()
    context.restore()
}

function drawExpansionGround(context){
    const bridge = terrain.bridgeLandmark
    const harbor = terrain.harborLandmarks
    if(!bridge || !harbor){
        return
    }

    const region = harbor.region
    context.save()

    const regionGradient = context.createLinearGradient(region.x1, 0, region.x2, 0)
    regionGradient.addColorStop(0, "rgba(86,112,118,0.16)")
    regionGradient.addColorStop(0.42, "rgba(66,89,98,0.23)")
    regionGradient.addColorStop(1, "rgba(49,69,77,0.3)")
    context.fillStyle = regionGradient
    context.fillRect(region.x1 - 96, 0, region.x2 - region.x1 + 140, world.height)

    const coolBloom = context.createRadialGradient(
        region.x1 + (region.x2 - region.x1) * 0.36,
        world.height * 0.44,
        12,
        region.x1 + (region.x2 - region.x1) * 0.36,
        world.height * 0.44,
        Math.max(region.x2 - region.x1, world.height) * 0.62
    )
    coolBloom.addColorStop(0, "rgba(184,214,218,0.14)")
    coolBloom.addColorStop(0.55, "rgba(134,167,174,0.08)")
    coolBloom.addColorStop(1, "rgba(255,255,255,0)")
    context.fillStyle = coolBloom
    context.fillRect(region.x1 - 120, 0, region.x2 - region.x1 + 180, world.height)

    for(const mass of harbor.basinMasses || []){
        context.fillStyle = mass.color
        traceSmoothPath(context, mass.points)
        context.fill()
        context.strokeStyle = mass.edge
        context.lineWidth = 2
        traceSmoothPath(context, mass.points)
        context.stroke()
    }

    for(const run of harbor.tidalRuns || []){
        drawTidalRun(context, run)
    }

    const channelGradient = context.createLinearGradient(bridge.channelLeft, 0, bridge.channelRight, 0)
    channelGradient.addColorStop(0, "rgba(48,76,88,0.76)")
    channelGradient.addColorStop(0.48, "rgba(39,62,72,0.84)")
    channelGradient.addColorStop(1, "rgba(60,92,104,0.72)")
    context.fillStyle = channelGradient
    context.fillRect(bridge.channelLeft - 34, 0, bridge.channelRight - bridge.channelLeft + 68, world.height)

    for(const wake of bridge.wakeBands || []){
        context.fillStyle = wake.color
        traceSmoothPath(context, wake.points)
        context.fill()
    }

    for(const pad of bridge.approachPads || []){
        context.fillStyle = pad.color
        traceSmoothPath(context, pad.points)
        context.fill()
    }

    for(const band of harbor.siltBands || []){
        context.fillStyle = band.color
        traceSmoothPath(context, band.points)
        context.fill()
    }

    for(const patch of harbor.coldPatches || []){
        context.fillStyle = patch.color
        traceSmoothPath(context, patch.points)
        context.fill()
    }

    for(const fog of harbor.fogBanks || []){
        context.fillStyle = fog.color
        traceSmoothPath(context, fog.points)
        context.fill()
    }

    for(const pool of harbor.pools || []){
        context.fillStyle = pool.color
        traceSmoothPath(context, pool.points)
        context.fill()
        context.strokeStyle = pool.rim
        context.lineWidth = 2
        traceSmoothPath(context, pool.points)
        context.stroke()
    }

    for(const spine of harbor.stoneSpines || []){
        context.fillStyle = "rgba(95,117,118,0.07)"
        traceSmoothPath(context, spine.points)
        context.fill()
    }

    context.fillStyle = "rgba(115,140,149,0.08)"
    roundedRectPath(
        context,
        bridge.x1,
        bridge.bridgeY - bridge.bridgeDeckHeight,
        bridge.x2 - bridge.x1,
        bridge.bridgeDeckHeight * 2,
        bridge.bridgeDeckHeight * 0.34
    )
    context.fill()

    for(const reed of harbor.reeds || []){
        drawTuft(context, reed)
    }

    context.restore()
}

function drawExpansionStructures(context){
    const bridge = terrain.bridgeLandmark
    const harbor = terrain.harborLandmarks
    if(!bridge || !harbor){
        return
    }

    context.save()
    context.fillStyle = "rgba(9,12,10,0.16)"
    roundedRectPath(
        context,
        bridge.x1,
        bridge.bridgeY - bridge.bridgeDeckHeight * 0.28,
        bridge.x2 - bridge.x1,
        bridge.bridgeDeckHeight * 1.58,
        bridge.bridgeDeckHeight * 0.36
    )
    context.fill()

    const deckGradient = context.createLinearGradient(bridge.x1, bridge.bridgeY, bridge.x2, bridge.bridgeY)
    deckGradient.addColorStop(0, "#97896e")
    deckGradient.addColorStop(0.34, "#7d735d")
    deckGradient.addColorStop(0.7, "#665d4d")
    deckGradient.addColorStop(1, "#4d473c")
    context.fillStyle = deckGradient
    roundedRectPath(
        context,
        bridge.x1,
        bridge.bridgeY - bridge.bridgeDeckHeight,
        bridge.x2 - bridge.x1,
        bridge.bridgeDeckHeight * 2,
        bridge.bridgeDeckHeight * 0.36
    )
    context.fill()

    context.strokeStyle = "rgba(214,206,170,0.22)"
    context.lineWidth = 2
    roundedRectPath(
        context,
        bridge.x1,
        bridge.bridgeY - bridge.bridgeDeckHeight,
        bridge.x2 - bridge.x1,
        bridge.bridgeDeckHeight * 2,
        bridge.bridgeDeckHeight * 0.36
    )
    context.stroke()

    for(let i = 0; i < 7; i++){
        const t = i / 6
        const plankX = bridge.x1 + (bridge.x2 - bridge.x1) * t
        context.strokeStyle = "rgba(64,56,43,0.22)"
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(plankX, bridge.bridgeY - bridge.bridgeDeckHeight * 0.94)
        context.lineTo(plankX, bridge.bridgeY + bridge.bridgeDeckHeight * 0.94)
        context.stroke()
    }

    for(const footing of bridge.bridgeFootings || []){
        context.save()
        context.translate(footing.x, footing.y)
        context.fillStyle = "rgba(8,12,11,0.16)"
        context.beginPath()
        context.ellipse(0, footing.height * 0.6, footing.width * 1.1, footing.height * 0.32, 0, 0, Math.PI * 2)
        context.fill()

        const footingGradient = context.createLinearGradient(0, -footing.height, 0, footing.height)
        footingGradient.addColorStop(0, "#8a948e")
        footingGradient.addColorStop(0.5, "#6b7670")
        footingGradient.addColorStop(1, "#525d58")
        context.fillStyle = footingGradient
        context.beginPath()
        context.moveTo(-footing.width * 0.48, footing.height * 0.36)
        context.lineTo(-footing.width * 0.34, -footing.height * 0.52)
        context.lineTo(footing.width * 0.3, -footing.height * 0.62)
        context.lineTo(footing.width * 0.44, footing.height * 0.26)
        context.closePath()
        context.fill()
        context.restore()
    }

    for(const post of bridge.bridgePosts || []){
        for(const side of [-1, 1]){
            const py = bridge.bridgeY + side * bridge.bridgeDeckHeight * 0.78
            context.save()
            context.translate(post.x, py)
            context.fillStyle = side < 0 ? "#7f8a84" : "#78827d"
            roundedRectPath(
                context,
                -post.width * 0.95,
                -bridge.bridgeDeckHeight * 0.14,
                post.width * 1.9,
                bridge.bridgeDeckHeight * 0.28,
                post.width * 0.5
            )
            context.fill()
            context.restore()
        }
    }

    context.strokeStyle = "rgba(129,141,145,0.34)"
    context.lineWidth = 6
    context.beginPath()
    context.moveTo(bridge.x1 + 8, bridge.bridgeY - bridge.bridgeDeckHeight * 0.82)
    context.lineTo(bridge.x2 - 8, bridge.bridgeY - bridge.bridgeDeckHeight * 0.82)
    context.moveTo(bridge.x1 + 8, bridge.bridgeY + bridge.bridgeDeckHeight * 0.82)
    context.lineTo(bridge.x2 - 8, bridge.bridgeY + bridge.bridgeDeckHeight * 0.82)
    context.stroke()

    context.strokeStyle = "rgba(203,215,212,0.14)"
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(bridge.x1 + 14, bridge.bridgeY - bridge.bridgeDeckHeight * 0.72)
    context.lineTo(bridge.x2 - 14, bridge.bridgeY - bridge.bridgeDeckHeight * 0.72)
    context.moveTo(bridge.x1 + 14, bridge.bridgeY + bridge.bridgeDeckHeight * 0.72)
    context.lineTo(bridge.x2 - 14, bridge.bridgeY + bridge.bridgeDeckHeight * 0.72)
    context.stroke()

    for(const arch of harbor.arches || []){
        context.save()
        context.translate(arch.x, arch.y)
        context.rotate(arch.rotation || 0)
        context.fillStyle = "rgba(9,12,10,0.18)"
        context.beginPath()
        context.ellipse(0, arch.height * (0.9 + (arch.sink || 0)), arch.width * 0.54, arch.height * 0.14, 0, 0, Math.PI * 2)
        context.fill()

        const pierGradient = context.createLinearGradient(0, -arch.height, 0, arch.height)
        pierGradient.addColorStop(0, "#8b948c")
        pierGradient.addColorStop(0.45, "#6d7871")
        pierGradient.addColorStop(1, "#505c57")
        context.fillStyle = pierGradient
        context.beginPath()
        context.moveTo(-arch.width * 0.52, arch.height * 0.18)
        context.lineTo(-arch.width * 0.42, -arch.height * 0.56)
        context.lineTo(-arch.width * 0.24, -arch.height * 0.48)
        context.lineTo(-arch.width * 0.28, arch.height * 0.2)
        context.closePath()
        context.fill()

        context.beginPath()
        context.moveTo(arch.width * 0.52, arch.height * 0.22)
        context.lineTo(arch.width * 0.4, -arch.height * (arch.broken ? 0.24 : 0.56))
        context.lineTo(arch.width * 0.2, -arch.height * (arch.broken ? 0.18 : 0.48))
        context.lineTo(arch.width * 0.26, arch.height * 0.2)
        context.closePath()
        context.fill()

        context.beginPath()
        context.moveTo(-arch.width * 0.4, -arch.height * 0.26)
        context.quadraticCurveTo(0, -arch.height * 0.82, arch.width * 0.42, -arch.height * 0.18)
        context.lineTo(arch.width * (arch.broken ? 0.12 : 0.24), -arch.height * 0.04)
        context.quadraticCurveTo(0, -arch.height * (arch.broken ? 0.48 : 0.56), -arch.width * 0.22, -arch.height * 0.04)
        context.closePath()
        context.fill()

        context.strokeStyle = "rgba(206,218,214,0.16)"
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(-arch.width * 0.36, -arch.height * 0.2)
        context.quadraticCurveTo(0, -arch.height * 0.68, arch.width * 0.28, -arch.height * 0.14)
        context.stroke()

        context.strokeStyle = "rgba(52,61,59,0.42)"
        context.beginPath()
        context.moveTo(-arch.width * 0.08, -arch.height * 0.24)
        context.lineTo(arch.width * 0.06, -arch.height * 0.04)
        context.stroke()

        if(arch.broken){
            context.fillStyle = "#616c66"
            context.beginPath()
            context.ellipse(arch.width * 0.18, arch.height * 0.32, arch.width * 0.12, arch.height * 0.06, -0.22, 0, Math.PI * 2)
            context.fill()
        }
        context.restore()
    }

    for(const stone of harbor.stoneFields || []){
        drawStoneTerrace(context, stone)
    }

    for(const terrace of harbor.terraces || []){
        drawStoneTerrace(context, terrace)
    }

    for(const spine of harbor.stoneSpines || []){
        drawStoneSpine(context, spine)
    }

    for(const shrine of harbor.shrines || []){
        context.save()
        context.translate(shrine.x, shrine.y)
        context.rotate(shrine.lean || 0)
        context.fillStyle = "rgba(9,12,10,0.16)"
        context.beginPath()
        context.ellipse(0, shrine.base * 0.66, shrine.base * 0.92, shrine.base * 0.24, 0, 0, Math.PI * 2)
        context.fill()

        const baseGradient = context.createLinearGradient(0, -shrine.base, 0, shrine.base)
        baseGradient.addColorStop(0, "#88928a")
        baseGradient.addColorStop(0.45, "#6d7770")
        baseGradient.addColorStop(1, "#515b56")
        context.fillStyle = baseGradient
        context.beginPath()
        context.moveTo(-shrine.base * 0.88, shrine.base * 0.14)
        context.lineTo(-shrine.base * 0.58, -shrine.base * 0.08)
        context.lineTo(shrine.base * 0.66, -shrine.base * 0.02)
        context.lineTo(shrine.base * 0.9, shrine.base * 0.2)
        context.lineTo(shrine.base * 0.3, shrine.base * 0.38)
        context.lineTo(-shrine.base * 0.7, shrine.base * 0.3)
        context.closePath()
        context.fill()

        context.fillStyle = "#7a867f"
        context.beginPath()
        context.moveTo(-shrine.base * 0.18, shrine.base * 0.14)
        context.lineTo(-shrine.base * 0.12, -shrine.base * 0.62)
        context.lineTo(shrine.base * 0.02, -shrine.base * 0.74)
        context.lineTo(shrine.base * 0.18, -shrine.base * 0.06)
        context.lineTo(shrine.base * 0.08, shrine.base * 0.16)
        context.closePath()
        context.fill()

        context.fillStyle = "#b9c8bf"
        context.beginPath()
        context.arc(-shrine.base * 0.02, -shrine.base * 0.3, shrine.base * 0.1, 0, Math.PI * 2)
        context.fill()

        if(shrine.glow){
            const glow = context.createRadialGradient(-shrine.base * 0.02, -shrine.base * 0.3, shrine.base * 0.05, -shrine.base * 0.02, -shrine.base * 0.3, shrine.base * 0.74)
            glow.addColorStop(0, "rgba(212,239,235,0.34)")
            glow.addColorStop(1, "rgba(255,255,255,0)")
            context.fillStyle = glow
            context.fillRect(-shrine.base, -shrine.base * 1.18, shrine.base * 1.8, shrine.base * 1.6)
        }
        context.restore()
    }

    for(const plinth of harbor.plinths || []){
        drawLowPlinth(context, plinth)
    }

    for(const rubble of harbor.rubble || []){
        context.save()
        context.translate(rubble.x, rubble.y)
        context.rotate(rubble.rotation)
        context.fillStyle = "#78827a"
        context.beginPath()
        context.ellipse(0, 0, rubble.rx, rubble.ry, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
    }

    context.restore()
}

export function drawTuft(context, tuft){
    context.save()
    context.translate(tuft.x, tuft.y)
    context.rotate(tuft.rotation)
    context.lineCap = "round"

    for(let i = 0; i < tuft.blades; i++){
        const t = tuft.blades === 1 ? 0.5 : i / (tuft.blades - 1)
        const offset = (t - 0.5) * tuft.spread
        const bend = offset * 0.7 + (tuft.curve || 0)
        const length = tuft.size * (0.72 + t * 0.28)

        context.strokeStyle = tuft.color
        context.lineWidth = tuft.width * (1 - Math.abs(t - 0.5) * 0.22)
        context.beginPath()
        context.moveTo(offset * 0.2, 0)
        context.quadraticCurveTo(bend, -length * 0.42, offset, -length)
        context.stroke()
    }

    context.strokeStyle = tuft.highlight
    context.lineWidth = Math.max(1, tuft.width * 0.45)
    context.beginPath()
    context.moveTo(0, 0)
    context.quadraticCurveTo(tuft.curve * 0.35, -tuft.size * 0.38, 0, -tuft.size * 0.82)
    context.stroke()

    context.restore()
}

export function drawFlower(context, flower){
    context.save()
    context.translate(flower.x, flower.y)
    context.rotate(flower.rotation)

    for(let i = 0; i < flower.petals; i++){
        const angle = i / flower.petals * Math.PI * 2
        const px = Math.cos(angle) * flower.size * 0.95
        const py = Math.sin(angle) * flower.size * 0.95
        context.fillStyle = flower.petalColor
        context.beginPath()
        context.ellipse(px, py, flower.size * 0.75, flower.size * 0.48, angle, 0, Math.PI * 2)
        context.fill()
    }

    context.fillStyle = flower.centerColor
    context.beginPath()
    context.arc(0, 0, flower.size * 0.5, 0, Math.PI * 2)
    context.fill()

    context.restore()
}

export function drawClover(context, plant){
    context.save()
    context.translate(plant.x, plant.y)
    context.rotate(plant.rotation)

    const leafOffsets = [
        {x:0, y:-plant.size * 0.42},
        {x:plant.size * 0.38, y:plant.size * 0.1},
        {x:-plant.size * 0.38, y:plant.size * 0.1}
    ]

    if(plant.fourLeaf){
        leafOffsets.push({x:0, y:plant.size * 0.48})
    }

    for(const leaf of leafOffsets){
        context.fillStyle = plant.shadowColor
        context.beginPath()
        context.arc(leaf.x + 0.8, leaf.y + 1.2, plant.size * 0.34, 0, Math.PI * 2)
        context.fill()

        context.fillStyle = plant.color
        context.beginPath()
        context.arc(leaf.x, leaf.y, plant.size * 0.34, 0, Math.PI * 2)
        context.fill()
    }

    context.strokeStyle = plant.stemColor
    context.lineWidth = Math.max(1, plant.size * 0.12)
    context.beginPath()
    context.moveTo(0, plant.size * 0.15)
    context.quadraticCurveTo(plant.size * 0.1, plant.size * 0.5, -plant.size * 0.08, plant.size * 0.88)
    context.stroke()

    context.restore()
}

export function drawPebble(context, pebble){
    context.save()
    context.translate(pebble.x, pebble.y)
    context.rotate(pebble.rotation)

    context.fillStyle = pebble.shadowColor
    context.beginPath()
    context.ellipse(0, pebble.ry * 0.62, pebble.rx * 0.95, pebble.ry * 0.78, 0, 0, Math.PI * 2)
    context.fill()

    const gradient = context.createLinearGradient(-pebble.rx, -pebble.ry, pebble.rx, pebble.ry)
    gradient.addColorStop(0, pebble.lightColor)
    gradient.addColorStop(1, pebble.darkColor)
    context.fillStyle = gradient
    context.beginPath()
    context.ellipse(0, 0, pebble.rx, pebble.ry, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = pebble.highlightColor
    context.beginPath()
    context.ellipse(-pebble.rx * 0.25, -pebble.ry * 0.28, pebble.rx * 0.28, pebble.ry * 0.2, -0.2, 0, Math.PI * 2)
    context.fill()

    context.restore()
}

function drawTerrainLogicLayer(context){
    const logic = terrain.terrainLogic
    if(!logic){
        return
    }

    context.save()
    context.fillStyle = logic.grassFill
    context.fillRect(0, 0, world.width, world.height)

    for(const patch of logic.mudPatches){
        context.fillStyle = logic.mudFill
        traceSmoothPath(context, patch.points)
        context.fill()
        context.strokeStyle = logic.mudStroke
        context.lineWidth = 2
        traceSmoothPath(context, patch.points)
        context.stroke()
    }

    for(const patch of logic.dangerPatches){
        context.fillStyle = logic.dangerFill
        traceSmoothPath(context, patch.points)
        context.fill()
        context.strokeStyle = logic.dangerStroke
        context.lineWidth = 2.2
        traceSmoothPath(context, patch.points)
        context.stroke()
    }
    context.restore()
}

export function resizeLayers(){
    terrainRenderProfile.layerScale = getTerrainLayerScale()
    terrainRenderProfile.mobileOptimized = mobile.active

    const scaledWidth = Math.max(1, Math.ceil(world.width * terrainRenderProfile.layerScale))
    const scaledHeight = Math.max(1, Math.ceil(world.height * terrainRenderProfile.layerScale))
    terrainRenderProfile.layerPixels = scaledWidth * scaledHeight
    terrainRenderProfile.layerMemoryMB = Number((terrainRenderProfile.layerPixels * 4 / 1024 / 1024).toFixed(2))

    backgroundLayer.width = scaledWidth
    backgroundLayer.height = scaledHeight
    bushLayer.width = scaledWidth
    bushLayer.height = scaledHeight
    rockLayer.width = scaledWidth
    rockLayer.height = scaledHeight
    terrainOverlayLayer.width = scaledWidth
    terrainOverlayLayer.height = scaledHeight
}

export function renderBackgroundLayer(){
    prepareLayerContext(backgroundLayer, backgroundCtx)

    const meadowGradient = backgroundCtx.createLinearGradient(0, 0, 0, world.height)
    meadowGradient.addColorStop(0, "#63b651")
    meadowGradient.addColorStop(0.42, "#4d9940")
    meadowGradient.addColorStop(1, "#2c6f2d")
    backgroundCtx.fillStyle = meadowGradient
    backgroundCtx.fillRect(0, 0, world.width, world.height)

    const sunlight = backgroundCtx.createRadialGradient(
        world.width * 0.34,
        world.height * 0.18,
        10,
        world.width * 0.34,
        world.height * 0.18,
        Math.max(world.width, world.height) * 0.72
    )
    sunlight.addColorStop(0, "rgba(255,245,195,0.18)")
    sunlight.addColorStop(0.45, "rgba(223,245,171,0.1)")
    sunlight.addColorStop(1, "rgba(255,255,255,0)")
    backgroundCtx.fillStyle = sunlight
    backgroundCtx.fillRect(0, 0, world.width, world.height)

    for(const patch of terrain.grassPatches){
        backgroundCtx.save()
        backgroundCtx.translate(patch.x, patch.y)
        backgroundCtx.rotate(patch.rotation)
        backgroundCtx.globalAlpha = patch.alpha
        backgroundCtx.fillStyle = patch.color
        backgroundCtx.beginPath()
        backgroundCtx.ellipse(0, 0, patch.rx, patch.ry, 0, 0, Math.PI * 2)
        backgroundCtx.fill()
        backgroundCtx.restore()
    }

    backgroundCtx.save()
    backgroundCtx.fillStyle = "rgba(141,141,80,0.28)"
    backgroundCtx.shadowColor = "rgba(86,96,44,0.24)"
    backgroundCtx.shadowBlur = terrainRenderProfile.mobileOptimized ? 0 : 22
    traceSmoothPath(backgroundCtx, terrain.clearingOuter)
    backgroundCtx.fill()
    backgroundCtx.restore()

    const edgeBlend = backgroundCtx.createRadialGradient(
        terrain.centerX - terrain.clearingRadiusX * 0.28,
        terrain.centerY - terrain.clearingRadiusY * 0.35,
        terrain.clearingRadiusY * 0.12,
        terrain.centerX,
        terrain.centerY,
        terrain.clearingRadiusX * 1.22
    )
    edgeBlend.addColorStop(0, "rgba(170,164,103,0.42)")
    edgeBlend.addColorStop(0.58, "rgba(132,123,76,0.4)")
    edgeBlend.addColorStop(1, "rgba(109,102,60,0.2)")
    backgroundCtx.fillStyle = edgeBlend
    traceSmoothPath(backgroundCtx, terrain.clearingOuter)
    backgroundCtx.fill()

    for(const patch of terrain.transitionPatches){
        backgroundCtx.fillStyle = patch.color
        traceSmoothPath(backgroundCtx, patch.points)
        backgroundCtx.fill()
    }

    const dirtGradient = backgroundCtx.createRadialGradient(
        terrain.centerX - terrain.clearingRadiusX * 0.32,
        terrain.centerY - terrain.clearingRadiusY * 0.4,
        terrain.clearingRadiusY * 0.08,
        terrain.centerX,
        terrain.centerY,
        terrain.clearingRadiusX * 1.08
    )
    dirtGradient.addColorStop(0, "#9d8a5b")
    dirtGradient.addColorStop(0.45, "#846e42")
    dirtGradient.addColorStop(1, "#6b542e")
    backgroundCtx.fillStyle = dirtGradient
    traceSmoothPath(backgroundCtx, terrain.clearingInner)
    backgroundCtx.fill()

    const centerDirt = backgroundCtx.createRadialGradient(
        terrain.centerX - terrain.clearingRadiusX * 0.14,
        terrain.centerY - terrain.clearingRadiusY * 0.18,
        terrain.clearingRadiusY * 0.06,
        terrain.centerX,
        terrain.centerY,
        terrain.clearingRadiusX * 0.92
    )
    centerDirt.addColorStop(0, "rgba(199,177,120,0.22)")
    centerDirt.addColorStop(0.6, "rgba(122,98,55,0.1)")
    centerDirt.addColorStop(1, "rgba(92,69,37,0)")
    backgroundCtx.fillStyle = centerDirt
    traceSmoothPath(backgroundCtx, terrain.clearingCore)
    backgroundCtx.fill()

    for(const patch of terrain.dirtPatches){
        backgroundCtx.fillStyle = patch.color
        traceSmoothPath(backgroundCtx, patch.points)
        backgroundCtx.fill()
    }

    for(const patch of terrain.causewayPatches || []){
        backgroundCtx.fillStyle = patch.color
        traceSmoothPath(backgroundCtx, patch.points)
        backgroundCtx.fill()
    }

    for(const pool of terrain.shallowPools || []){
        backgroundCtx.fillStyle = pool.color
        traceSmoothPath(backgroundCtx, pool.points)
        backgroundCtx.fill()
        backgroundCtx.strokeStyle = pool.rim
        backgroundCtx.lineWidth = 2
        traceSmoothPath(backgroundCtx, pool.points)
        backgroundCtx.stroke()
    }

    drawTerrainLogicLayer(backgroundCtx)
    drawExpansionGround(backgroundCtx)
    drawAltarGround(backgroundCtx)

    backgroundCtx.strokeStyle = "rgba(255,241,207,0.08)"
    backgroundCtx.lineWidth = 4
    traceSmoothPath(backgroundCtx, terrain.clearingInner)
    backgroundCtx.stroke()

    for(const speckle of terrain.speckles){
        backgroundCtx.globalAlpha = speckle.alpha
        backgroundCtx.fillStyle = speckle.color
        backgroundCtx.beginPath()
        backgroundCtx.arc(speckle.x, speckle.y, speckle.size, 0, Math.PI * 2)
        backgroundCtx.fill()
    }
    backgroundCtx.globalAlpha = 1

    for(const pebble of terrain.pebbles){
        drawPebble(backgroundCtx, pebble)
    }

    for(const clover of terrain.clovers){
        drawClover(backgroundCtx, clover)
    }

    for(const tuft of terrain.grassTufts){
        drawTuft(backgroundCtx, tuft)
    }

    for(const tuft of terrain.edgeTufts){
        drawTuft(backgroundCtx, tuft)
    }

    for(const flower of terrain.flowers){
        drawFlower(backgroundCtx, flower)
    }

    const vignette = backgroundCtx.createRadialGradient(
        world.width * 0.5,
        world.height * 0.45,
        Math.min(world.width, world.height) * 0.25,
        world.width * 0.5,
        world.height * 0.45,
        Math.max(world.width, world.height) * 0.9
    )
    vignette.addColorStop(0, "rgba(0,0,0,0)")
    vignette.addColorStop(1, "rgba(12,34,15,0.18)")
    backgroundCtx.fillStyle = vignette
    backgroundCtx.fillRect(0, 0, world.width, world.height)
}

export function renderBushLayer(){
    prepareLayerContext(bushLayer, bushCtx)

    for(const bush of terrain.bushes){
        bushCtx.fillStyle = "rgba(13,24,10,0.18)"
        bushCtx.beginPath()
        bushCtx.ellipse(bush.x, bush.y + bush.base * 0.8, bush.base * 1.78, bush.base * 0.56, 0, 0, Math.PI * 2)
        bushCtx.fill()

        bushCtx.save()
        bushCtx.fillStyle = bush.palette[0]
        bushCtx.shadowColor = "rgba(14,32,12,0.18)"
        bushCtx.shadowBlur = terrainRenderProfile.mobileOptimized ? 0 : 12
        traceSmoothPath(bushCtx, bush.baseShape)
        bushCtx.fill()
        bushCtx.restore()

        const sortedLobes = bush.lobes.slice().sort((a, b) => a.y - b.y)
        for(const lobe of sortedLobes){
            const gradient = bushCtx.createRadialGradient(
                lobe.x - lobe.r * 0.36,
                lobe.y - lobe.r * 0.38,
                lobe.r * 0.1,
                lobe.x,
                lobe.y,
                lobe.r
            )
            gradient.addColorStop(0, "rgba(169,224,123,0.42)")
            gradient.addColorStop(0.18, bush.palette[3])
            gradient.addColorStop(0.62, lobe.color)
            gradient.addColorStop(1, bush.palette[1])
            bushCtx.fillStyle = gradient
            bushCtx.beginPath()
            bushCtx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2)
            bushCtx.fill()
        }

        bushCtx.fillStyle = "rgba(18,48,16,0.26)"
        bushCtx.beginPath()
        bushCtx.ellipse(bush.x, bush.y + bush.base * 0.15, bush.base * 0.92, bush.base * 0.38, 0, 0, Math.PI * 2)
        bushCtx.fill()

        for(const dot of bush.leafDots){
            bushCtx.fillStyle = dot.color
            bushCtx.beginPath()
            bushCtx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
            bushCtx.fill()
        }

        for(const tuft of bush.baseTufts){
            drawTuft(bushCtx, tuft)
        }
    }
}

export function renderRockLayer(){
    prepareLayerContext(rockLayer, rockCtx)
    if(!terrain?.prefabs?.length){
        return
    }

    prefabStyleBuildCount = 0
    prefabStyleFollowupQueued = false

    const prefabs = terrain.prefabs
    if(
        terrain.prefabRenderOrderSource !== prefabs ||
        terrain.prefabRenderOrderCount !== prefabs.length
    ){
        terrain.prefabRenderOrderSource = prefabs
        terrain.prefabRenderOrderCount = prefabs.length
        terrain.prefabRenderOrder = [...prefabs].sort((a, b) => (a.y + a.height * 0.06) - (b.y + b.height * 0.06))
    }

    const sortedPrefabs = terrain.prefabRenderOrder || []
    for(const placement of sortedPrefabs){
        drawTerrainPrefab(rockCtx, placement)
    }
}

export function renderTerrainOverlayLayer(){
    prepareLayerContext(terrainOverlayLayer, terrainOverlayCtx)
    const logic = terrain?.terrainLogic
    if(!logic){
        return
    }

    const drawOverlayPatch = (patches, fillStyle, strokeStyle, lineWidth) => {
        for(const patch of patches){
            terrainOverlayCtx.fillStyle = fillStyle
            traceSmoothPath(terrainOverlayCtx, patch.points)
            terrainOverlayCtx.fill()
            terrainOverlayCtx.strokeStyle = strokeStyle
            terrainOverlayCtx.lineWidth = lineWidth
            traceSmoothPath(terrainOverlayCtx, patch.points)
            terrainOverlayCtx.stroke()
        }
    }

    drawOverlayPatch(logic.mudPatches, "rgba(156,110,62,0.14)", "rgba(112,76,38,0.18)", 2)
    drawOverlayPatch(logic.dangerPatches, "rgba(184,76,48,0.2)", "rgba(124,40,24,0.24)", 2.4)
}

export function renderTerrainLayers(){
    renderBackgroundLayer()
    renderBushLayer()
    renderRockLayer()
    renderTerrainOverlayLayer()
}

export function drawBackground(){
    const scale = terrainRenderProfile.layerScale
    const viewWidth = view.width || canvas.width
    const viewHeight = view.height || canvas.height
    const sx = Math.max(0, Math.floor(camera.x * scale))
    const sy = Math.max(0, Math.floor(camera.y * scale))
    const sw = Math.max(1, Math.min(backgroundLayer.width - sx, Math.ceil(viewWidth * scale) + 2))
    const sh = Math.max(1, Math.min(backgroundLayer.height - sy, Math.ceil(viewHeight * scale) + 2))
    ctx.drawImage(
        backgroundLayer,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        viewWidth,
        viewHeight
    )
}

export function drawBushes(){
    const scale = terrainRenderProfile.layerScale
    const viewWidth = view.width || canvas.width
    const viewHeight = view.height || canvas.height
    const sx = Math.max(0, Math.floor(camera.x * scale))
    const sy = Math.max(0, Math.floor(camera.y * scale))
    const sw = Math.max(1, Math.min(bushLayer.width - sx, Math.ceil(viewWidth * scale) + 2))
    const sh = Math.max(1, Math.min(bushLayer.height - sy, Math.ceil(viewHeight * scale) + 2))
    ctx.drawImage(
        bushLayer,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        viewWidth,
        viewHeight
    )
}

export function drawRocks(){
    const scale = terrainRenderProfile.layerScale
    const viewWidth = view.width || canvas.width
    const viewHeight = view.height || canvas.height
    const sx = Math.max(0, Math.floor(camera.x * scale))
    const sy = Math.max(0, Math.floor(camera.y * scale))
    const sw = Math.max(1, Math.min(rockLayer.width - sx, Math.ceil(viewWidth * scale) + 2))
    const sh = Math.max(1, Math.min(rockLayer.height - sy, Math.ceil(viewHeight * scale) + 2))
    ctx.drawImage(
        rockLayer,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        viewWidth,
        viewHeight
    )
}

export function drawTerrainLogicOverlay(){
    if(!terrain?.terrainLogic || terrainOverlayLayer.width <= 0 || terrainOverlayLayer.height <= 0){
        return
    }

    const scale = terrainRenderProfile.layerScale
    const viewWidth = view.width || canvas.width
    const viewHeight = view.height || canvas.height
    const sx = Math.max(0, Math.floor(camera.x * scale))
    const sy = Math.max(0, Math.floor(camera.y * scale))
    const sw = Math.max(1, Math.min(terrainOverlayLayer.width - sx, Math.ceil(viewWidth * scale) + 2))
    const sh = Math.max(1, Math.min(terrainOverlayLayer.height - sy, Math.ceil(viewHeight * scale) + 2))
    ctx.drawImage(
        terrainOverlayLayer,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        viewWidth,
        viewHeight
    )
}
