/**
 * This module draws the main HUD, relics, cooldown icons, and game-over overlays.
 * It is responsible for on-screen information and does not interpret raw input.
 */


import { GAME_TITLE, BUILD_ID, treasureGoal } from "../config/game_config.js"
import {
    ctx,
    canvas,
    frog,
    abilities,
    frogAbilities,
    relicLibrary,
    treasures,
    eventPoints,
    encounterZones,
    ants,
    mobile,
    mobileCalibration,
    bossState,
    waveState,
    gameState,
} from "../core/state.js"
import { clamp, roundedRectPath } from "../core/utils.js"
import { getCurrentZoneName } from "../world/zones.js"
import { getTerrainLabel, getTerrainTypeAt } from "../world/terrain.js"
import { getTreasureCount } from "../entities/treasures.js"
import { drawBanner } from "./banners.js"

export function drawAbilityIcons(){
    if(mobile.active){
        return
    }

    const entries = [
        {key:"jump", label:"跳跃", icon:"跳"},
        {key:"dash", label:"冲刺", icon:"冲"},
        {key:"aoe", label:"群攻", icon:"群"},
        {key:"slam", label:"震地", icon:"震"},
        {key:"poison", label:"剧毒", icon:"毒"}
    ]
    const baseY = canvas.height - 94
    let x = canvas.width - 62

    for(let i = entries.length - 1; i >= 0; i--){
        const entry = entries[i]
        const unlocked = !!abilities[entry.key]
        const data = frogAbilities[entry.key]
        ctx.fillStyle = unlocked ? "rgba(17,39,21,0.72)" : "rgba(60,60,60,0.62)"
        roundedRectPath(ctx, x - 26, baseY - 26, 52, 52, 14)
        ctx.fill()

        ctx.strokeStyle = unlocked ? "rgba(226,245,206,0.26)" : "rgba(180,180,180,0.12)"
        ctx.lineWidth = 2
        roundedRectPath(ctx, x - 26, baseY - 26, 52, 52, 14)
        ctx.stroke()

        ctx.fillStyle = unlocked ? "#eef8d7" : "rgba(215,215,215,0.45)"
        ctx.font = "700 18px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(entry.icon, x, baseY + 6)
        ctx.font = "600 9px sans-serif"
        ctx.fillText(entry.label, x, baseY + 18)

        if(unlocked && data.timer > 0){
            const fill = clamp(data.timer / data.cooldown, 0, 1)
            ctx.fillStyle = "rgba(6,11,7,0.58)"
            roundedRectPath(ctx, x - 22, baseY + 14, 44 * fill, 6, 3)
            ctx.fill()
        }

        x -= 60
    }

    ctx.textAlign = "left"
}

export function drawRelicIcons(){
    const relics = frog.relics.slice(0, 5)
    const hudScale = mobile.active ? mobileCalibration.hudScale : 1
    const size = mobile.active ? Math.max(22, Math.round(30 * hudScale)) : 30
    const radius = mobile.active ? Math.max(6, Math.round(8 * hudScale)) : 8
    const gap = mobile.active ? Math.max(6, Math.round(36 * hudScale)) : 36
    let x = mobile.active ? mobileCalibration.safeInset + Math.round(14 * hudScale) : 32
    const y = mobile.active
        ? mobileCalibration.safeInset + Math.round(154 * hudScale)
        : 206

    for(const relicId of relics){
        const relic = relicLibrary[relicId]
        ctx.fillStyle = "rgba(36,52,18,0.72)"
        roundedRectPath(ctx, x, y, size, size, radius)
        ctx.fill()
        ctx.strokeStyle = "rgba(255,224,138,0.34)"
        ctx.lineWidth = 2
        roundedRectPath(ctx, x, y, size, size, radius)
        ctx.stroke()
        ctx.fillStyle = "#ffe18d"
        ctx.font = `700 ${mobile.active ? Math.max(10, Math.round(14 * hudScale)) : 14}px sans-serif`
        ctx.textAlign = "center"
        ctx.fillText(relic.icon, x + size * 0.5, y + size * 0.63)
        x += gap
    }

    ctx.textAlign = "left"
}

export function drawHUD(){
    const treasureCount = getTreasureCount()
    let nearestTreasure = null
    let nearestTreasureDist = Infinity
    let currentHintText = ""
    let currentHintTarget = null
    const zoneName = getCurrentZoneName()
    const terrainLabel = getTerrainLabel(getTerrainTypeAt(frog.x, frog.y))
    const activeEncounter = encounterZones.find(zone => zone.active)
    const nearbyEvent = eventPoints.find(point => !point.used && Math.hypot(point.x - frog.x, point.y - frog.y) < 320)
    const nearbyEventLabel =
        !nearbyEvent ? "" :
        nearbyEvent.type === "altar" ? "祝福祭坛" :
        nearbyEvent.type === "spring" ? "灵泉涌眼" :
        nearbyEvent.type === "idol" ? "沉碑祭像" :
        nearbyEvent.type === "waygate" ? "桥头守卫碑" :
        nearbyEvent.type === "shrine" ? "潮蚀神龛" :
        nearbyEvent.type === "tidecache" ? "潮痕秘匣" :
        nearbyEvent.type === "nest" ? "污染花巢" :
        "埋伏宝箱"

    for(const treasure of treasures){
        if(treasure.opened) continue
        const dist = Math.hypot(treasure.x - frog.x, treasure.y - frog.y)
        if(dist < nearestTreasureDist){
            nearestTreasureDist = dist
            nearestTreasure = treasure
        }
    }

    const hudScale = mobile.active ? mobileCalibration.hudScale : 1
    const ms = value => Math.round(value * hudScale)
    const panelInset = mobile.active ? mobileCalibration.safeInset : 18
    const leftPanelX = panelInset
    const leftPanelY = panelInset
    const topPanelWidth = mobile.active ? ms(304) : 324
    const topPanelHeight = mobile.active ? ms(226) : 268
    const textX = mobile.active ? leftPanelX + ms(14) : 32
    const hintY = mobile.active ? leftPanelY + ms(120) : 167
    const targetY = mobile.active ? leftPanelY + ms(138) : 186

    ctx.save()
    ctx.fillStyle = "rgba(12,28,14,0.55)"
    roundedRectPath(ctx, leftPanelX, leftPanelY, topPanelWidth, topPanelHeight, mobile.active ? ms(18) : 18)
    ctx.fill()

    const titleFont = mobile.active ? ms(16) : 18
    const buildFont = mobile.active ? Math.max(10, ms(11)) : 12
    const statFont = mobile.active ? ms(14) : 15
    const smallFont = mobile.active ? Math.max(10, ms(11)) : 13
    const titleY = mobile.active ? leftPanelY + ms(24) : 44
    const buildY = mobile.active ? leftPanelY + ms(39) : 60
    const treasureY = mobile.active ? leftPanelY + ms(60) : 83
    const levelY = mobile.active ? leftPanelY + ms(80) : 104
    const waveY = mobile.active ? leftPanelY + ms(100) : 125
    const zoneY = mobile.active ? leftPanelY + ms(100) : 146
    const rightColX = mobile.active ? leftPanelX + ms(152) : 170

    ctx.fillStyle = "#eef8d7"
    ctx.font = `600 ${titleFont}px sans-serif`
    ctx.fillText(GAME_TITLE, textX, titleY)
    ctx.fillStyle = "rgba(238,248,215,0.84)"
    ctx.font = `600 ${buildFont}px sans-serif`
    ctx.fillText(`Build: ${BUILD_ID}`, textX, buildY)
    ctx.fillStyle = "#eef8d7"
    ctx.font = `600 ${statFont}px sans-serif`
    ctx.fillText(`宝物：${treasureCount}/${treasureGoal}`, textX, treasureY)
    ctx.fillText(`等级：${frog.level}`, textX, levelY)
    ctx.fillText(`分数：${frog.score}`, rightColX, levelY)
    ctx.fillText(`波次：${waveState.current}`, textX, waveY)
    ctx.fillText(`附近敌人：${ants.length + (bossState.active ? 1 : 0)}`, rightColX, waveY)
    ctx.fillText(`区域：${zoneName}`, textX, mobile.active ? leftPanelY + ms(120) : 146)
    ctx.fillText(`地形：${terrainLabel}`, rightColX, mobile.active ? leftPanelY + ms(120) : 146)
    if(nearestTreasure){
        currentHintText = `提示：前往${nearestTreasure.zoneName}（${Math.round(nearestTreasureDist)} 像素）`
        currentHintTarget = nearestTreasure
    }else if(activeEncounter && activeEncounter.kind === "defend"){
        currentHintText = `提示：守住祭坛 ${Math.ceil(activeEncounter.remaining / 60)} 秒`
    }else if(activeEncounter){
        currentHintText = `提示：处理${activeEncounter.template.label}`
    }else if(nearbyEvent){
        currentHintText = `提示：附近发现${nearbyEventLabel}`
        currentHintTarget = nearbyEvent
    }else{
        currentHintText = bossState.active || bossState.pending ? "提示：击败蚁后" : "提示：宝物已全部找到"
    }

    const targetCoordText = currentHintTarget ? `T(${Math.round(currentHintTarget.x)},${Math.round(currentHintTarget.y)})` : ""
    const playerCoordText = `P(${Math.round(frog.x)},${Math.round(frog.y)})`

    if(mobile.active){
        ctx.font = `600 ${statFont}px sans-serif`
        ctx.fillStyle = "#eef8d7"
        ctx.fillText(currentHintText, textX, hintY)
        ctx.fillStyle = "rgba(238,248,215,0.84)"
        ctx.font = `600 ${smallFont}px sans-serif`
        ctx.fillText(targetCoordText ? `${targetCoordText}  ${playerCoordText}` : playerCoordText, textX, targetY)
    }else{
        if(targetCoordText){
            currentHintText += ` ${targetCoordText} ${playerCoordText}`
        }else{
            currentHintText += ` ${playerCoordText}`
        }
        ctx.fillText(currentHintText, 32, hintY)
    }

    ctx.fillStyle = "rgba(255,255,255,0.14)"
    roundedRectPath(ctx, mobile.active ? leftPanelX + ms(114) : 132, mobile.active ? leftPanelY + ms(54) : 92, mobile.active ? ms(166) : 166, mobile.active ? ms(10) : 10, mobile.active ? ms(5) : 5)
    ctx.fill()
    ctx.fillStyle = "#9ee56e"
    roundedRectPath(ctx, mobile.active ? leftPanelX + ms(114) : 132, mobile.active ? leftPanelY + ms(54) : 92, (mobile.active ? ms(166) : 166) * clamp(frog.xp / frog.xpToNext, 0, 1), mobile.active ? ms(10) : 10, mobile.active ? ms(5) : 5)
    ctx.fill()
    ctx.fillStyle = "#eef8d7"
    ctx.font = `600 ${mobile.active ? Math.max(10, ms(11)) : 12}px sans-serif`
    ctx.fillText(`经验：${frog.xp}/${frog.xpToNext}`, mobile.active ? leftPanelX + ms(162) : 180, mobile.active ? leftPanelY + ms(65) : 103)

    const hpBarX = textX
    const hpBarY = mobile.active ? leftPanelY + ms(190) : 248
    const hpBarWidth = mobile.active ? ms(176) : 186
    const hpBarHeight = mobile.active ? ms(14) : 14
    const hpBarRadius = mobile.active ? ms(7) : 7
    const hpRatio = clamp(frog.hp / Math.max(1, frog.maxHp), 0, 1)
    const hpTextY = mobile.active ? hpBarY - ms(8) : hpBarY - 7
    const defenseTextY = mobile.active ? hpBarY + ms(25) : hpBarY + 28

    ctx.fillStyle = "#eef8d7"
    ctx.font = `600 ${mobile.active ? Math.max(10, ms(11)) : 12}px sans-serif`
    ctx.fillText(`生命 ${frog.hp}/${frog.maxHp}`, hpBarX, hpTextY)

    ctx.fillStyle = "rgba(255,255,255,0.12)"
    roundedRectPath(ctx, hpBarX, hpBarY, hpBarWidth, hpBarHeight, hpBarRadius)
    ctx.fill()

    ctx.fillStyle = "#2c1015"
    roundedRectPath(ctx, hpBarX + 1, hpBarY + 1, Math.max(0, hpBarWidth - 2), Math.max(0, hpBarHeight - 2), Math.max(3, hpBarRadius - 1))
    ctx.fill()

    const hpGradient = ctx.createLinearGradient(hpBarX, hpBarY, hpBarX + hpBarWidth, hpBarY)
    hpGradient.addColorStop(0, "#ff7687")
    hpGradient.addColorStop(1, "#d74f63")
    ctx.fillStyle = hpGradient
    roundedRectPath(ctx, hpBarX + 1, hpBarY + 1, Math.max(0, (hpBarWidth - 2) * hpRatio), Math.max(0, hpBarHeight - 2), Math.max(3, hpBarRadius - 1))
    ctx.fill()

    ctx.fillStyle = "rgba(238,248,215,0.84)"
    ctx.fillText(`防御 ${frog.defense}`, hpBarX, defenseTextY)

    drawRelicIcons()

    const infoPanelWidth = mobile.active ? ms(206) : 218
    const infoPanelHeight = mobile.active ? ms(162) : 154
    const infoPanelX = canvas.width - infoPanelWidth - panelInset
    const infoFont = mobile.active ? ms(14) : 15
    const debugFont = mobile.active ? Math.max(9, ms(10)) : 11

    ctx.fillStyle = "rgba(12,28,14,0.5)"
    roundedRectPath(ctx, infoPanelX, panelInset, infoPanelWidth, infoPanelHeight, mobile.active ? ms(18) : 18)
    ctx.fill()
    ctx.fillStyle = "#eef8d7"
    ctx.font = `600 ${infoFont}px sans-serif`
    ctx.fillText("移动：WASD / 方向键", infoPanelX + (mobile.active ? ms(12) : 12), panelInset + (mobile.active ? ms(22) : 22))
    ctx.fillText("普攻：空格 / 冲刺：E", infoPanelX + (mobile.active ? ms(12) : 12), panelInset + (mobile.active ? ms(43) : 43))
    ctx.fillText(`跳跃：Shift / 群攻：F`, infoPanelX + (mobile.active ? ms(12) : 12), panelInset + (mobile.active ? ms(64) : 64))
    if(mobile.active){
        ctx.fillText("触屏：摇杆 + 普攻 / 冲刺 / 群攻", infoPanelX + ms(12), panelInset + ms(84))
        ctx.fillText(`姿态：${frog.renderState} / 朝向：${frog.moveDirection}`, infoPanelX + ms(12), panelInset + ms(104))
        ctx.font = `600 ${debugFont}px sans-serif`
        ctx.fillText(`资源：${frog.currentSprite || "-"}`, infoPanelX + ms(12), panelInset + ms(121))
        ctx.fillText(`拾取：${Math.round(frog.pickupX)},${Math.round(frog.pickupY)} r${Math.round(frog.pickupRadius)}`, infoPanelX + ms(12), panelInset + ms(136))
        ctx.fillText(`接触：${frog.pickupContactType ? `${frog.pickupContactType} ${frog.pickupContactId}` : "-"}`, infoPanelX + ms(12), panelInset + ms(149))
    }else{
        ctx.fillText("震地：Q / 探索地图、升级成长、击败蚁后", infoPanelX + 12, 85)
        ctx.font = `600 ${debugFont}px sans-serif`
        ctx.fillText(`姿态：${frog.renderState} / 朝向：${frog.moveDirection}`, infoPanelX + 12, 104)
        ctx.fillText(`资源：${frog.currentSprite || "-"}`, infoPanelX + 12, 120)
        ctx.fillText(`拾取：${Math.round(frog.pickupX)},${Math.round(frog.pickupY)} r${Math.round(frog.pickupRadius)}`, infoPanelX + 12, 136)
        ctx.fillText(`接触：${frog.pickupContactType ? `${frog.pickupContactType} ${frog.pickupContactId}` : "-"}`, infoPanelX + 12, 149)
    }

    drawBanner()

    if(nearestTreasure){
        const dx = nearestTreasure.x - frog.x
        const dy = nearestTreasure.y - frog.y
        const dist = Math.hypot(dx, dy)
        if(dist > Math.min(canvas.width, canvas.height) * 0.32){
            const angle = Math.atan2(dy, dx)
            const indicatorRadius = Math.min(canvas.width, canvas.height) * 0.18
            const ix = canvas.width * 0.5 + Math.cos(angle) * indicatorRadius
            const iy = canvas.height * 0.5 + Math.sin(angle) * indicatorRadius

            ctx.save()
            ctx.translate(ix, iy)
            ctx.rotate(angle)
            ctx.fillStyle = "rgba(255,229,123,0.85)"
            ctx.beginPath()
            ctx.moveTo(16, 0)
            ctx.lineTo(-10, -9)
            ctx.lineTo(-5, 0)
            ctx.lineTo(-10, 9)
            ctx.closePath()
            ctx.fill()
            ctx.restore()
        }
    }

    if(bossState.pending || bossState.active){
        ctx.fillStyle = "rgba(10,18,9,0.72)"
        roundedRectPath(ctx, canvas.width * 0.5 - 196, 76, 392, bossState.active ? 54 : 42, 18)
        ctx.fill()
        ctx.fillStyle = "#ffe7a0"
        ctx.textAlign = "center"
        ctx.font = "700 18px sans-serif"
        ctx.fillText(bossState.active ? bossState.name : "首领逼近", canvas.width * 0.5, 102)

        if(bossState.active && bossState.entity){
            const barX = canvas.width * 0.5 - 142
            const barY = 112
            const barW = 284
            ctx.fillStyle = "rgba(255,255,255,0.12)"
            roundedRectPath(ctx, barX, barY, barW, 12, 6)
            ctx.fill()
            ctx.fillStyle = "#f0b26d"
            roundedRectPath(ctx, barX, barY, barW * clamp(bossState.entity.hp / bossState.entity.maxHp, 0, 1), 12, 6)
            ctx.fill()
        }
        ctx.textAlign = "left"
    }

    if(gameState !== "playing"){
        ctx.fillStyle = "rgba(8,16,10,0.58)"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.fillStyle = "#f3ffda"
        ctx.textAlign = "center"
        ctx.font = "700 42px sans-serif"
        ctx.fillText(gameState === "victory" ? "胜利" : "失败", canvas.width * 0.5, canvas.height * 0.44)
        ctx.font = "600 18px sans-serif"
        ctx.fillText(gameState === "victory" ? "蚁后已被击败" : "按 R / 回车 或点按屏幕重开", canvas.width * 0.5, canvas.height * 0.5)
        if(gameState === "victory"){
            ctx.fillText("按 R / 回车 或点按屏幕再次探索", canvas.width * 0.5, canvas.height * 0.54)
        }
        ctx.textAlign = "left"
    }

    drawAbilityIcons()
    ctx.restore()
}
