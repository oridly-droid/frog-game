/**
 * This module owns hostile plant placement, behavior, and rendering.
 * It is responsible for plant entities and does not resolve generic progression systems.
 */


import { plantStats } from "../config/game_config.js"
import {
    ctx,
    camera,
    world,
    terrain,
    frog,
    plants,
    treasures,
    upgradeState,
    gameState,
    replaceCollection,
} from "../core/state.js"
import { mulberry32, clamp, roundedRectPath } from "../core/utils.js"
import { findPlacementInRegion } from "../world/zones.js"
import { damageFrog } from "../systems/combat.js"
import { fireProjectile } from "./projectiles.js"

export function createPlant(x, y, rng, overrides = {}){
    const plant = {
        x,
        y,
        size: plantStats.size + rng() * 4 - 2,
        range: plantStats.range + rng() * 24 - 12,
        snapRadius: plantStats.snapRadius + rng() * 8 - 4,
        cooldown: Math.floor(40 + rng() * 50),
        biteTimer: 0,
        spitTimer: 0,
        phase: rng() * Math.PI * 2,
        hp: 3,
        maxHp: 3,
        destroyed:false,
        role:"plant"
    }

    Object.assign(plant, overrides)
    return plant
}

export function spawnPollutionNest(x, y, rng){
    return createPlant(x, y, rng, {
        role:"nestCore",
        size:plantStats.size + 7,
        range:plantStats.range + 30,
        snapRadius:plantStats.snapRadius + 10,
        cooldown:Math.floor(30 + rng() * 35),
        hp:6,
        maxHp:6
    })
}

export function buildPlants(){
    const rng = mulberry32((((world.width * 7331) ^ (world.height * 15937) ^ 0x51A7A7) >>> 0))
    const placementRegions = [
        {region:terrain.zones.thicket, count:6},
        {region:terrain.zones.ruinB, count:2},
        {region:terrain.zones.altar, count:2},
        {
            region:{
                x1:world.width * 0.1,
                y1:world.height * 0.66,
                x2:world.width * 0.28,
                y2:world.height * 0.88
            },
            count:1
        },
        {region:terrain.zones.pollutedNest, count:7}
    ]

    const nestRegions = [
        {
            region:terrain.zones.pollutedNest,
            count:3
        }
    ]

    replaceCollection(plants, [])
    const existingPoints = [{x:terrain.centerX, y:terrain.centerY}, ...treasures.map(treasure => ({x:treasure.x, y:treasure.y}))]

    for(const entry of placementRegions){
        for(let i = 0; i < entry.count; i++){
            const point = findPlacementInRegion(
                entry.region,
                24,
                170,
                existingPoints,
                rng,
                120
            )
            if(!point) continue
            existingPoints.push(point)
            plants.push(createPlant(point.x, point.y, rng))
        }
    }

    for(const entry of nestRegions){
        for(let i = 0; i < entry.count; i++){
            const point = findPlacementInRegion(
                entry.region,
                28,
                220,
                existingPoints,
                rng,
                160
            )
            if(!point) continue
            existingPoints.push(point)
            plants.push(spawnPollutionNest(point.x, point.y, rng))
        }
    }
}

export function updatePlants(){
    if(gameState !== "playing" || upgradeState.active){
        return
    }

    for(const plant of plants){
        plant.phase += 0.05
        plant.cooldown = Math.max(0, plant.cooldown - 1)
        plant.biteTimer = Math.max(0, plant.biteTimer - 1)
        plant.spitTimer = Math.max(0, plant.spitTimer - 1)

        const dx = frog.x - plant.x
        const dy = frog.y - plant.y
        const dist = Math.hypot(dx, dy) || 1

        if(dist < plant.snapRadius && plant.cooldown <= 0){
            plant.biteTimer = 12
            plant.cooldown = 90
            damageFrog(plant.role === "nestCore" ? 5 : 4)
            continue
        }

        if(dist < plant.range && plant.cooldown <= 0){
            plant.spitTimer = 14
            plant.cooldown = plant.role === "nestCore" ? 84 : 110
            fireProjectile(
                {type:plant.role === "nestCore" ? "spore" : "plant", x:plant.x, y:plant.y, size:plant.size},
                dx / dist,
                dy / dist,
                {
                    speed:plant.role === "nestCore" ? 1.2 : 1.55,
                    radius:plant.role === "nestCore" ? 8 : 7,
                    life:plantStats.projectileLife,
                    color:plant.role === "nestCore" ? "#bce47d" : "#abd36a",
                    outer:plant.role === "nestCore" ? "#436027" : "#35501f",
                    owner:plant.role === "nestCore" ? "spore" : "plant"
                }
            )
        }
    }
}

export function drawPlants(){
    for(const plant of plants){
        const x = plant.x - camera.x
        const y = plant.y - camera.y
        const s = plant.size
        const sway = Math.sin(plant.phase) * 2.5
        const mouthOpen = plant.biteTimer > 0 ? 1 : plant.spitTimer > 0 ? 0.55 : 0.2 + (Math.sin(plant.phase * 1.6) + 1) * 0.12

        ctx.save()
        ctx.translate(x, y)

        ctx.fillStyle = "rgba(0,0,0,0.24)"
        ctx.beginPath()
        ctx.ellipse(0, s * 1.1, s * 0.8, s * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#397a31"
        ctx.lineWidth = 6
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(0, s * 0.9)
        ctx.quadraticCurveTo(sway * 0.3, s * 0.3, sway * 0.4, -s * 0.15)
        ctx.stroke()

        ctx.fillStyle = "#58a63d"
        ctx.beginPath()
        ctx.ellipse(-s * 0.45, s * 0.55, s * 0.38, s * 0.18, -0.6, 0, Math.PI * 2)
        ctx.ellipse(s * 0.45, s * 0.55, s * 0.38, s * 0.18, 0.6, 0, Math.PI * 2)
        ctx.fill()

        ctx.save()
        ctx.translate(sway * 0.35, -s * 0.2)
        ctx.rotate(Math.sin(plant.phase * 0.8) * 0.05)

        ctx.fillStyle = plant.role === "nestCore" ? "#4b6522" : "#2d6a28"
        ctx.beginPath()
        ctx.ellipse(0, 0, s * 0.82, s * 0.96, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = plant.role === "nestCore" ? "#a8de67" : "#84d45b"
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.08, s * 0.7, s * 0.82, 0, 0, Math.PI * 2)
        ctx.fill()

        if(plant.role === "nestCore"){
            ctx.fillStyle = "#e7f3b6"
            for(const offset of [-0.24, 0, 0.24]){
                ctx.beginPath()
                ctx.arc(offset * s, -s * 0.32, s * 0.1, 0, Math.PI * 2)
                ctx.fill()
            }
        }else{
            ctx.fillStyle = "#bde57b"
            ctx.beginPath()
            ctx.ellipse(-s * 0.18, -s * 0.36, s * 0.18, s * 0.1, -0.35, 0, Math.PI * 2)
            ctx.fill()
        }

        ctx.fillStyle = plant.role === "nestCore" ? "#663a1f" : "#5a1830"
        ctx.beginPath()
        ctx.ellipse(0, s * 0.08, s * 0.48, s * (0.16 + mouthOpen * 0.26), 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = "#fff3d2"
        ctx.lineWidth = 2
        for(const side of [-1, 1]){
            for(let i = 0; i < 3; i++){
                const tx = side * (s * 0.12 + i * s * 0.12)
                ctx.beginPath()
                ctx.moveTo(tx, s * 0.02)
                ctx.lineTo(tx + side * 2, s * 0.18 + mouthOpen * 8)
                ctx.stroke()
            }
        }

        ctx.fillStyle = "#f7fff0"
        ctx.beginPath()
        ctx.arc(-s * 0.2, -s * 0.18, s * 0.12, 0, Math.PI * 2)
        ctx.arc(s * 0.2, -s * 0.18, s * 0.12, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "#1a210f"
        ctx.beginPath()
        ctx.arc(-s * 0.18, -s * 0.18, s * 0.05, 0, Math.PI * 2)
        ctx.arc(s * 0.22, -s * 0.18, s * 0.05, 0, Math.PI * 2)
        ctx.fill()

        ctx.restore()

        if(plant.hp < plant.maxHp){
            const width = 30
            ctx.fillStyle = "rgba(10,18,9,0.6)"
            roundedRectPath(ctx, -width * 0.5 - 2, -s - 16, width + 4, 10, 4)
            ctx.fill()
            ctx.fillStyle = "#9ee56e"
            roundedRectPath(ctx, -width * 0.5, -s - 14, width * clamp(plant.hp / plant.maxHp, 0, 1), 6, 3)
            ctx.fill()
        }

        ctx.restore()
    }
}
