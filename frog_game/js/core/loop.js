/**
 * This module owns the frame update/draw loop.
 * It is responsible for loop ordering and does not perform one-time bootstrapping.
 */

import { canvas, ctx, view, runtimeBoot } from "./state.js"
import { updateCamera } from "./camera.js"
import { updateFrog } from "../entities/frog.js"
import { drawFrog } from "../entities/frog_render.js"
import { updateAnts, drawAnts } from "../entities/enemies.js"
import { buildPlants, updatePlants, drawPlants } from "../entities/plants.js"
import { updateProjectiles, drawProjectiles } from "../entities/projectiles.js"
import { updateParticles, drawParticles } from "../entities/particles.js"
import { updateTreasures, drawTreasures } from "../entities/treasures.js"
import { updateBoss, drawBoss } from "../systems/boss_system.js"
import { updateWaves } from "../systems/encounters.js"
import { updateTongue, drawTongue, drawAbilityEffects } from "../systems/abilities.js"
import { drawHUD } from "../ui/hud.js"
import { drawMobileControls } from "../ui/mobile_ui.js"
import { drawUpgradeOverlay } from "../ui/upgrade_ui.js"
import { drawBackground, drawBushes, drawRocks, drawTerrainLogicOverlay } from "../world/terrain_render.js"

let loopStarted = false

export function gameLoop(){
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if(!runtimeBoot.active){
        updateFrog()
        updateAnts()
        updatePlants()
        updateBoss()
        updateProjectiles()
        updateWaves()
        updateTreasures()
        updateTongue()
        updateParticles()
        updateCamera()
    }

    ctx.save()
    ctx.scale(view.scaleX || 1, view.scaleY || 1)
    drawBackground()
    drawBushes()
    drawRocks()
    drawTerrainLogicOverlay()
    drawTreasures()
    drawPlants()
    drawAnts()
    drawBoss()
    drawProjectiles()
    drawTongue()
    drawAbilityEffects()
    drawFrog()
    drawParticles()
    ctx.restore()
    drawHUD()
    drawMobileControls()
    drawUpgradeOverlay()

    requestAnimationFrame(gameLoop)
}

export function startGameLoop(){
    if(loopStarted){
        return
    }
    loopStarted = true
    gameLoop()
}
