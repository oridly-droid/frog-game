/**
 * This module wires runtime setup, world rebuilds, input callbacks, and loop startup.
 * It is responsible for bootstrapping only and does not own per-system logic.
 */

import {
    initializeRuntime,
    canvas,
    world,
    terrain,
    frog,
    mobile,
    keys,
    ants,
    encounterZones,
    frogAbilities,
    abilities,
    skillTree,
    progression,
    upgradeState,
    bladeWaves,
    syncPlayerConfigToRuntime,
    setViewSize,
    setMobileCalibration,
    setRuntimeBoot,
} from "./core/state.js"
import { clamp } from "./core/utils.js"
import { loadConfigOverrides } from "./config/config_loader.js"
import { detectMobileMode, getMobileCalibration } from "./config/mobile_config.js"
import { registerInputHandlers } from "./core/input.js"
import { startGameLoop } from "./core/loop.js"
import { buildTerrain, buildTerrainStructures, getTerrainTypeAt } from "./world/terrain.js"
import {
    resizeLayers,
    renderBackgroundLayer,
    renderBushLayer,
    renderRockLayer,
    renderTerrainOverlayLayer,
} from "./world/terrain_render.js"
import { grantXP } from "./entities/frog.js"
import { buildTreasures, setTreasureEventHandler } from "./entities/treasures.js"
import { buildPlants } from "./entities/plants.js"
import { buildEncounterZones, handleTreasureEvent, resetRound } from "./systems/encounters.js"
import { buildBossLair } from "./systems/boss_system.js"
import { updateControlLayout } from "./ui/mobile_ui.js"
import { triggerAttack, triggerJump, triggerDash, triggerAoe, triggerSlam } from "./systems/abilities.js"
import { chooseUpgrade, queueLevelUpUpgrade } from "./systems/progression.js"
import { getUpgradeCardIndexAtPoint } from "./ui/upgrade_ui.js"

function getViewportSize(){
    const viewport = window.visualViewport
    const fallbackWidth = window.innerWidth || document.documentElement?.clientWidth || 320
    const fallbackHeight = window.innerHeight || document.documentElement?.clientHeight || 320
    return {
        width: Math.max(320, Math.round(viewport?.width || fallbackWidth)),
        height: Math.max(320, Math.round(viewport?.height || fallbackHeight))
    }
}

let terrainBuilt = false
let resizeQueued = false
let worldBootstrapRunning = false
let worldBootstrapPending = false
let worldBootstrapToken = 0
let validationQueued = false
const PREFAB_LAYER_IDLE_DELAY_MS = 2200
let prefabLayerRenderTimeout = 0
let prefabLayerRenderedForToken = -1

function waitBootFrame(){
    return new Promise(resolve => {
        requestAnimationFrame(() => resolve())
    })
}

function isBootstrapCurrent(token){
    return token === worldBootstrapToken
}

function clearDeferredPrefabRender(){
    if(prefabLayerRenderTimeout){
        clearTimeout(prefabLayerRenderTimeout)
        prefabLayerRenderTimeout = 0
    }
}

function scheduleDeferredPrefabRender(token){
    if(prefabLayerRenderedForToken === token){
        return
    }
    clearDeferredPrefabRender()
    prefabLayerRenderTimeout = window.setTimeout(() => {
        prefabLayerRenderTimeout = 0
        if(!isBootstrapCurrent(token) || prefabLayerRenderedForToken === token){
            return
        }
        renderRockLayer()
        prefabLayerRenderedForToken = token
    }, PREFAB_LAYER_IDLE_DELAY_MS)
}

function deferPrefabRenderForCurrentWorld(){
    const token = worldBootstrapToken
    if(token <= 0 || prefabLayerRenderedForToken === token){
        return
    }
    scheduleDeferredPrefabRender(token)
}

async function runWorldBootstrapSequence(token){
    if(!isBootstrapCurrent(token)){
        return
    }

    setRuntimeBoot({active:true, phase:"terrain"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    buildTerrain({includeStructures:false})

    setRuntimeBoot({active:true, phase:"structures"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    buildTerrainStructures()
    terrainBuilt = true

    setRuntimeBoot({active:true, phase:"background"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    renderBackgroundLayer()

    setRuntimeBoot({active:true, phase:"bushes"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    renderBushLayer()

    setRuntimeBoot({active:true, phase:"prefabs"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }

    setRuntimeBoot({active:true, phase:"overlay"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    renderTerrainOverlayLayer()

    setRuntimeBoot({active:true, phase:"encounters"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    buildTreasures()
    buildEncounterZones()

    setRuntimeBoot({active:true, phase:"plants"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    buildPlants()
    buildBossLair()

    setRuntimeBoot({active:true, phase:"round"})
    await waitBootFrame()
    if(!isBootstrapCurrent(token)){
        return
    }
    resetRound({rebuildWorld:false})
    setRuntimeBoot({active:false, phase:"ready"})
    startGameLoop()
    scheduleDeferredPrefabRender(token)

    if(!validationQueued){
        validationQueued = true
        Promise.resolve().then(runCodexValidationFromQuery)
    }
}

function scheduleWorldBootstrap(){
    worldBootstrapToken += 1
    worldBootstrapPending = true
    terrainBuilt = false
    prefabLayerRenderedForToken = -1
    clearDeferredPrefabRender()
    setRuntimeBoot({active:true, phase:"queued"})

    if(worldBootstrapRunning){
        return
    }

    worldBootstrapRunning = true
    requestAnimationFrame(async () => {
        while(worldBootstrapPending){
            worldBootstrapPending = false
            const token = worldBootstrapToken
            await runWorldBootstrapSequence(token)
        }
        worldBootstrapRunning = false
    })
}

function resizeGame(){
    const viewport = getViewportSize()
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    canvas.width = viewport.width
    canvas.height = viewport.height
    mobile.active = detectMobileMode()
    const calibration = getMobileCalibration(viewport.width, viewport.height, mobile.active)
    setMobileCalibration(calibration)
    setViewSize(
        viewport.width * calibration.visibleWorldWidthFactor,
        viewport.height * calibration.visibleWorldHeightFactor
    )
    updateControlLayout()

    const nextWorldWidth = Math.max(8520, viewport.width + 2520)
    const nextWorldHeight = Math.max(6320, viewport.height + 1960)
    const worldChanged = !terrainBuilt || world.width !== nextWorldWidth || world.height !== nextWorldHeight

    if(worldChanged){
        world.width = nextWorldWidth
        world.height = nextWorldHeight
        resizeLayers()
    }

    frog.x = clamp(frog.x, frog.size, world.width - frog.size)
    frog.y = clamp(frog.y, frog.size, world.height - frog.size)

    if(worldChanged){
        scheduleWorldBootstrap()
    }
}

function scheduleResizeGame(){
    if(resizeQueued){
        return
    }
    resizeQueued = true
    requestAnimationFrame(() => {
        resizeQueued = false
        resizeGame()
    })
}

function waitFrames(frameCount = 1){
    const total = Math.max(1, frameCount | 0)
    return new Promise(resolve => {
        let remaining = total
        const step = () => {
            remaining -= 1
            if(remaining <= 0){
                resolve()
                return
            }
            requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    })
}

function buildRenderGameState(){
    const prefabCounts = {}
    const groupCounts = {}

    for(const placement of terrain?.prefabs || []){
        prefabCounts[placement.assetKey] = (prefabCounts[placement.assetKey] || 0) + 1
    }
    for(const group of terrain?.structureGroups || []){
        groupCounts[group.groupType] = (groupCounts[group.groupType] || 0) + 1
    }

    return {
        build: document.title,
        frog:{
            x:Number(frog.x.toFixed(2)),
            y:Number(frog.y.toFixed(2)),
            hp:frog.hp,
            maxHp:frog.maxHp,
            attackTimer:frog.attackTimer,
            dashTimer:frog.dashTimer,
            aoeTimer:frog.aoeTimer,
            motionMode:frog.motionMode,
        },
        mobile:{
            active:mobile.active,
            attackX:Number(mobile.attackX.toFixed(2)),
            attackY:Number(mobile.attackY.toFixed(2)),
            aoeX:Number(mobile.aoeX.toFixed(2)),
            aoeY:Number(mobile.aoeY.toFixed(2)),
            skillX:Number(mobile.skillX.toFixed(2)),
            skillY:Number(mobile.skillY.toFixed(2)),
            dashX:Number(mobile.dashX.toFixed(2)),
            dashY:Number(mobile.dashY.toFixed(2)),
        },
        terrain:{
            current:getTerrainTypeAt(frog.x, frog.y),
            totalPrefabs:(terrain?.prefabs || []).length,
            prefabCounts,
            groupCounts,
        },
        upgrade:{
            active:upgradeState.active,
            queue:upgradeState.queue,
            choices:upgradeState.choices.map(choice => ({
                id:choice.id,
                title:choice.title,
                desc:choice.desc,
            })),
        },
        stats:{
            attackDamageBonus:progression.tonguePower,
            attackCooldownBonus:progression.tongueCooldownBonus,
            attackRange:frog.tongueRange,
            defense:frog.defense,
            maxHp:frog.maxHp,
            aoeRangeBonus:progression.aoeRangeBonus,
            aoeDamageBonus:progression.aoeDamageBonus,
            dashBoost:skillTree.dash.range + progression.dashMomentumBonus,
        },
        combat:{
            bladeWaves:bladeWaves.length,
            dashReady:frogAbilities.dash.timer <= 0,
            aoeReady:frogAbilities.aoe.timer <= 0,
        }
    }
}

async function pulseMovementKey(key, frames = 18){
    keys[key] = true
    await waitFrames(frames)
    keys[key] = false
    await waitFrames(6)
    return {
        x:Number(frog.x.toFixed(2)),
        y:Number(frog.y.toFixed(2))
    }
}

function publishCodexValidationReport(report){
    const id = "codex-validation-report"
    let pre = document.getElementById(id)
    if(!pre){
        pre = document.createElement("pre")
        pre.id = id
        pre.style.position = "fixed"
        pre.style.left = "10px"
        pre.style.bottom = "10px"
        pre.style.zIndex = "999999"
        pre.style.maxWidth = "min(44vw, 520px)"
        pre.style.maxHeight = "40vh"
        pre.style.overflow = "auto"
        pre.style.margin = "0"
        pre.style.padding = "10px 12px"
        pre.style.borderRadius = "10px"
        pre.style.background = "rgba(9, 15, 12, 0.76)"
        pre.style.color = "#ecf7d9"
        pre.style.font = "12px/1.45 monospace"
        pre.style.whiteSpace = "pre-wrap"
        document.body.appendChild(pre)
    }
    const payload = JSON.stringify(report, null, 2)
    pre.textContent = payload
    pre.dataset.report = payload
    document.body.dataset.codexValidation = encodeURIComponent(payload)
    window.__codexValidationReport = report
}

async function runCodexValidationFromQuery(){
    const params = new URLSearchParams(window.location.search)
    const mode = params.get("codex_validate")
    if(!mode){
        return
    }

    if(mode === "mobile" && !mobile.active){
        mobile.active = true
        updateControlLayout()
    }

    await waitFrames(24)

    const start = {
        x:Number(frog.x.toFixed(2)),
        y:Number(frog.y.toFixed(2))
    }
    const right = await pulseMovementKey("ArrowRight")
    const left = await pulseMovementKey("ArrowLeft")
    const up = await pulseMovementKey("ArrowUp")
    const down = await pulseMovementKey("ArrowDown")

    triggerAttack()
    await waitFrames(10)
    const attack = {
        attackTimer:frog.attackTimer,
        bladeWaves:bladeWaves.length,
    }

    triggerDash()
    await waitFrames(10)
    const dash = {
        dashTimer:frog.dashTimer,
        motionMode:frog.motionMode,
    }

    triggerAoe()
    await waitFrames(10)
    const aoe = {
        aoeTimer:frog.aoeTimer,
    }

    publishCodexValidationReport({
        mode,
        movement:{
            right_dx:Number((right.x - start.x).toFixed(2)),
            left_dx:Number((left.x - right.x).toFixed(2)),
            up_dy:Number((up.y - left.y).toFixed(2)),
            down_dy:Number((down.y - up.y).toFixed(2)),
        },
        attack,
        dash,
        aoe,
        snapshot:buildRenderGameState(),
    })
}

const canvasElement = document.getElementById("game")
await loadConfigOverrides()
syncPlayerConfigToRuntime(true)
initializeRuntime(canvasElement)
setTreasureEventHandler(handleTreasureEvent)
registerInputHandlers({
    chooseUpgrade,
    getUpgradeCardIndexAtPoint,
    resetRound,
    triggerAttack,
    triggerJump,
    triggerDash,
    triggerAoe,
    triggerSlam,
})
window.__frogGameDebug = {
    frog,
    mobile,
    world,
    ants,
    encounterZones,
    frogAbilities,
    abilities,
    skillTree,
    progression,
    upgradeState,
    bladeWaves,
    triggerAttack,
    triggerDash,
    triggerAoe,
    triggerJump,
    grantXP,
    chooseUpgrade,
    queueLevelUpUpgrade,
    getUpgradeCardIndexAtPoint,
    get terrain(){
        return terrain
    },
    getTerrainTypeAt,
    resetRound
}
window.render_game_to_text = () => JSON.stringify(buildRenderGameState())
window.advanceTime = async ms => {
    const frames = Math.max(1, Math.round((Number(ms) || 16) / (1000 / 60)))
    await waitFrames(frames)
}
window.addEventListener("keydown", deferPrefabRenderForCurrentWorld, {capture:true})
window.addEventListener("mousedown", deferPrefabRenderForCurrentWorld, {capture:true})
window.addEventListener("touchstart", deferPrefabRenderForCurrentWorld, {capture:true, passive:true})
window.addEventListener("resize", scheduleResizeGame)
window.addEventListener("orientationchange", scheduleResizeGame)
window.visualViewport?.addEventListener("resize", scheduleResizeGame)

resizeGame()
