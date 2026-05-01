/**
 * This module owns shared runtime state.
 * It is responsible for mutable game state and canvas/layer references, and it does not implement gameplay rules.
 */

import { BOSS_NAME } from "../config/game_config.js"
import { MOBILE_CONTROL_SCALE } from "../config/mobile_config.js"
import { playerConfig } from "../config/player_config.js"

export let canvas = null
export let ctx = null

export const backgroundLayer = document.createElement("canvas")
export const bushLayer = document.createElement("canvas")
export const rockLayer = document.createElement("canvas")
export const terrainOverlayLayer = document.createElement("canvas")

export const backgroundCtx = backgroundLayer.getContext("2d", {alpha:false}) || backgroundLayer.getContext("2d")
export const bushCtx = bushLayer.getContext("2d")
export const rockCtx = rockLayer.getContext("2d")
export const terrainOverlayCtx = terrainOverlayLayer.getContext("2d")

export const frog = {
    x: 0,
    y: 0,
    size: 40,
    speed: playerConfig.moveSpeed,
    facingX: 0,
    facingY: -1,
    walkCycle: 0,
    walkBob: 0,
    idleCycle: 0,
    moveBlend: 0,
    radius: 26,
    maxHp: playerConfig.maxHp,
    hp: playerConfig.maxHp,
    defense: playerConfig.defense,
    xp: 0,
    level: 1,
    xpToNext: 10,
    score: 0,
    relics: [],
    invuln: 0,
    attackCooldown: 0,
    tongueRange: playerConfig.tongueRange,
    dashCooldown: 0,
    dashTimer: 0,
    dashVX: 0,
    dashVY: 0,
    motionMode: "",
    jumpCooldown: 0,
    jumpTimer: 0,
    jumpDuration: 10,
    jumpSpeed: 14,
    jumpDirX: 0,
    jumpDirY: -1,
    lastMoveX: 0,
    lastMoveY: -1,
    moveDirection: "down",
    attackStep: 0,
    attackTimer: 0,
    attackQueued: false,
    comboWindow: 0,
    attackHit: false,
    attackWaveEmitted: false,
    aoeTimer: 0,
    aoeHit: false,
    renderState: "idle",
    currentSprite: "",
    pickupX: 0,
    pickupY: 0,
    pickupRadius: playerConfig.pickupRadius,
    pickupContactType: "",
    pickupContactId: "",
    pickupContactTimer: 0,
    stompCooldown: 0,
    stompTimer: 0
}

export const abilities = {
    tongue:true,
    jump:true,
    dash:true,
    aoe:true,
    slam:false,
    poison:false
}

export const frogAbilities = {
    tongue:{cooldown:playerConfig.tongueCooldown, timer:0, icon:"斩", unlockLevel:1},
    jump:{cooldown:playerConfig.jumpCooldown, timer:0, icon:"J", unlockLevel:1},
    dash:{cooldown:playerConfig.dashCooldown, timer:0, icon:"D", unlockLevel:1},
    aoe:{cooldown:96, timer:0, icon:"A", unlockLevel:1},
    slam:{cooldown:playerConfig.slamCooldown, timer:0, icon:"S", unlockLevel:5},
    poison:{cooldown:playerConfig.poisonCooldown, timer:0, icon:"P", unlockLevel:7}
}

export const skillTree = {
    tongue:{range:0, doubleHit:0, chain:0, crit:0, pierce:0, frenzy:0, bladeWave:0},
    dash:{range:0, damage:0, doubleDash:0, momentum:0, shockwave:0},
    slam:{damage:0},
    poison:{damage:0, spread:0, explosion:0, duration:0, pool:0}
}

export const combatStats = {
    slamRadius:playerConfig.slamRadius,
    slamDamage:playerConfig.slamDamage,
    poisonDamage:playerConfig.poisonDamageScale,
    poisonInterval:playerConfig.poisonTick,
    dashDistance:playerConfig.dashDistance
}

export const relicLibrary = {
    crown:{icon:"冠", label:"蛙王冠"},
    charm:{icon:"护", label:"沼泽护符"},
    stone:{icon:"锋", label:"斩击石"},
    boots:{icon:"靴", label:"林地战靴"},
    idol:{icon:"祭", label:"祭坛石像"},
    fang:{icon:"裂", label:"裂刃尖牙"},
    sigil:{icon:"冲", label:"冲锋印记"},
    gland:{icon:"孢", label:"毒囊腺体"},
    coil:{icon:"链", label:"回旋锋纹"},
    trail:{icon:"痕", label:"滑跃尾印"},
    blight:{icon:"腐", label:"腐花孢冠"},
    shard:{icon:"锋", label:"裂锋骨片"},
    vault:{icon:"跃", label:"跃潮碑纹"},
    reed:{icon:"芦", label:"溃沼芦穗"}
}

export const upgradeState = {
    active:false,
    queue:0,
    choices:[],
    glowTimer:0
}

export const keys = {}
export let terrain = null
export const ants = []
export const projectiles = []
export const bladeWaves = []
export const particles = []
export const treasures = []
export const encounterZones = []
export const plants = []
export const eventPoints = []
export const hazards = []
export let gameState = "playing"
export const runtimeBoot = {
    active:false,
    phase:"idle"
}

export const tongue = {
    active:false,
    timer:0,
    duration:0.16,
    fromX:0,
    fromY:0,
    toX:0,
    toY:0
}

export const mobile = {
    active:false,
    joystickPointerId:null,
    attackPointerId:null,
    aoePointerId:null,
    moveX:0,
    moveY:0,
    stickX:0,
    stickY:0,
    joystickBaseX:0,
    joystickBaseY:0,
    joystickRadius:56 * MOBILE_CONTROL_SCALE,
    knobRadius:24 * MOBILE_CONTROL_SCALE,
    maxStickDistance:56 * MOBILE_CONTROL_SCALE,
    attackX:0,
    attackY:0,
    attackRadius:40 * MOBILE_CONTROL_SCALE,
    attackPressed:false,
    attackScale:1,
    attackTargetScale:1,
    aoeX:0,
    aoeY:0,
    aoeRadius:28 * MOBILE_CONTROL_SCALE,
    aoePressed:false,
    aoeScale:1,
    dashPointerId:null,
    skillPointerId:null,
    slamPointerId:null,
    stompPointerId:null,
    dashX:0,
    dashY:0,
    dashRadius:26 * MOBILE_CONTROL_SCALE,
    skillX:0,
    skillY:0,
    skillRadius:28 * MOBILE_CONTROL_SCALE,
    stompX:0,
    stompY:0,
    stompRadius:30 * MOBILE_CONTROL_SCALE,
    dashPressed:false,
    skillPressed:false,
    slamPressed:false,
    stompPressed:false,
    dashScale:1,
    skillScale:1,
    slamScale:1,
    stompScale:1
}

export const world = {
    width: 0,
    height: 0
}

export const camera = {
    x:0,
    y:0
}

export const view = {
    width: 0,
    height: 0,
    scaleX: 1,
    scaleY: 1
}

export const mobileCalibration = {
    active:false,
    orientation:"desktop",
    visibleWorldWidthFactor:1,
    visibleWorldHeightFactor:1,
    hudScale:1,
    controlScale:1,
    buttonClusterScale:1,
    overlayScale:1,
    safeInset:18,
}

export const waveState = {
    index:0,
    current:0,
    cleared:0,
    pendingTimer:30,
    bannerTimer:0,
    bannerText:"",
    active:false
}

export const progression = {
    tongueRangeBonus:0,
    tongueCooldownBonus:0,
    jumpCooldownBonus:0,
    tonguePower:0,
    aoeRangeBonus:0,
    aoeDamageBonus:0,
    dashMomentumTimer:0,
    dashMomentumBonus:0,
    tongueCritBonus:0,
    poisonCloudBonus:0,
    upgrades:[]
}

export const bossState = {
    pending:false,
    spawnTimer:0,
    warningTimer:0,
    active:false,
    defeated:false,
    entity:null,
    name:BOSS_NAME,
    spawnX:0,
    spawnY:0
}

export function initializeRuntime(canvasElement){
    canvas = canvasElement
    ctx = canvas.getContext("2d", {alpha:false, desynchronized:true}) || canvas.getContext("2d")
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    world.width = canvas.width
    world.height = canvas.height
    frog.x = canvas.width / 2
    frog.y = canvas.height / 2
    view.width = canvas.width
    view.height = canvas.height
    view.scaleX = 1
    view.scaleY = 1
}

export function setViewSize(nextWidth, nextHeight){
    view.width = Math.max(1, Math.round(nextWidth))
    view.height = Math.max(1, Math.round(nextHeight))
    view.scaleX = canvas ? canvas.width / view.width : 1
    view.scaleY = canvas ? canvas.height / view.height : 1
    return view
}

export function setMobileCalibration(nextCalibration = {}){
    Object.assign(mobileCalibration, nextCalibration)
    return mobileCalibration
}

export function syncPlayerConfigToRuntime(resetVitals = false){
    frog.speed = playerConfig.moveSpeed
    frog.tongueRange = playerConfig.tongueRange
    frog.maxHp = playerConfig.maxHp
    frog.defense = playerConfig.defense
    frogAbilities.tongue.cooldown = playerConfig.tongueCooldown
    frogAbilities.jump.cooldown = playerConfig.jumpCooldown
    frogAbilities.dash.cooldown = playerConfig.dashCooldown
    frogAbilities.slam.cooldown = playerConfig.slamCooldown
    frogAbilities.poison.cooldown = playerConfig.poisonCooldown
    combatStats.slamRadius = playerConfig.slamRadius
    combatStats.slamDamage = playerConfig.slamDamage
    combatStats.poisonDamage = playerConfig.poisonDamageScale
    combatStats.poisonInterval = playerConfig.poisonTick
    combatStats.dashDistance = playerConfig.dashDistance

    if(resetVitals){
        frog.hp = frog.maxHp
    }else{
        frog.hp = Math.min(frog.hp, frog.maxHp)
    }
}

export function setTerrainData(nextTerrain){
    terrain = nextTerrain
    return terrain
}

export function replaceCollection(collection, nextItems = []){
    collection.length = 0
    collection.push(...nextItems)
    return collection
}

export function setGameState(nextGameState){
    gameState = nextGameState
    return gameState
}

export function setRuntimeBoot(nextState = {}){
    Object.assign(runtimeBoot, nextState)
    return runtimeBoot
}
