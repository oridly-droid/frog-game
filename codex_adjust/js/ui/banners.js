/**
 * This module owns short banner notifications.
 * It is responsible for banner state and drawing, and it does not manage broader HUD layout.
 */


import { ctx, canvas, waveState, gameState } from "../core/state.js"
import { roundedRectPath } from "../core/utils.js"

export function setBanner(text, timer = 100){
    waveState.bannerText = text
    waveState.bannerTimer = timer
}


export function drawBanner(){
    if(gameState === "playing" && waveState.bannerTimer > 0){
        ctx.fillStyle = "rgba(8,16,10,0.3)"
        roundedRectPath(ctx, canvas.width * 0.5 - 172, 28, 344, 40, 20)
        ctx.fill()
        ctx.fillStyle = "#f3ffda"
        ctx.font = "700 20px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(waveState.bannerText || "已获得宝物", canvas.width * 0.5, 55)
        ctx.textAlign = "left"
    }
}
