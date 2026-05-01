/**
 * This module draws the level-up choice overlay and resolves card hit-testing.
 * It is responsible for upgrade overlay presentation and does not roll upgrade data.
 */

import { ctx, canvas, upgradeState, mobile, mobileCalibration } from "../core/state.js"
import { clamp, roundedRectPath } from "../core/utils.js"

export function wrapOverlayText(text, maxWidth, maxLines = Infinity){
    const lines = []
    let current = ""

    for(const char of text){
        const test = current + char
        if(current && ctx.measureText(test).width > maxWidth){
            lines.push(current)
            current = char
        }else{
            current = test
        }
    }

    if(current){
        lines.push(current)
    }

    if(lines.length <= maxLines){
        return lines
    }

    const clipped = lines.slice(0, maxLines)
    let last = clipped[maxLines - 1]
    while(last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth){
        last = last.slice(0, -1)
    }
    clipped[maxLines - 1] = `${last}…`
    return clipped
}

export function getUpgradeOverlayLayout(){
    const choiceCount = Math.max(1, upgradeState.choices.length || 3)
    const singleColumn = mobile.active || canvas.width < 820
    const overlayScale = (mobile.active ? mobileCalibration.overlayScale : 1) * 0.9
    const shortEdge = Math.min(canvas.width, canvas.height)
    const overlayPadding = mobile.active
        ? Math.max(mobileCalibration.safeInset, Math.round(shortEdge * 0.032 * overlayScale))
        : Math.max(18, Math.min(36, canvas.width * 0.05))
    const titleFont = singleColumn
        ? (mobile.active
            ? clamp(shortEdge * 0.135 * overlayScale, 34, 56)
            : Math.max(52, Math.min(72, canvas.width * 0.15)))
        : Math.max(52, Math.min(82, canvas.width * 0.068))
    const hintFont = singleColumn
        ? (mobile.active
            ? clamp(shortEdge * 0.06 * overlayScale, 18, 28)
            : Math.max(24, Math.min(34, canvas.width * 0.065)))
        : Math.max(24, Math.min(34, canvas.width * 0.03))
    const cardGap = singleColumn
        ? (mobile.active
            ? clamp(shortEdge * 0.018 * overlayScale, 8, 14)
            : Math.max(10, Math.min(18, canvas.height * 0.018)))
        : Math.max(18, Math.min(30, canvas.width * 0.025))
    const headerHeight = titleFont + hintFont + overlayPadding * 1.8
    const cardW = singleColumn
        ? (mobile.active
            ? Math.min(canvas.width - overlayPadding * 2, Math.max(260, shortEdge * 0.78))
            : Math.min(canvas.width - overlayPadding * 2, 380))
        : Math.min(340, (canvas.width - overlayPadding * 2 - cardGap * 2) / 3)
    const availableHeight = canvas.height - overlayPadding * 2 - headerHeight - cardGap * (choiceCount - 1)
    const cardH = singleColumn
        ? (mobile.active
            ? clamp(availableHeight / choiceCount, 92, 152)
            : clamp(availableHeight / choiceCount, 132, 210))
        : clamp(Math.min(250, canvas.height * 0.31), 200, 250)

    return {
        singleColumn,
        overlayScale,
        overlayPadding,
        titleFont,
        hintFont,
        cardGap,
        cardW,
        cardH,
        headerHeight,
        startX: singleColumn
            ? canvas.width * 0.5 - cardW * 0.5
            : canvas.width * 0.5 - (cardW * 3 + cardGap * 2) * 0.5,
        startY: overlayPadding + headerHeight
    }
}

export function drawUpgradeOverlay(){
    if(!upgradeState.active){
        return
    }

    const layout = getUpgradeOverlayLayout()
    const cardNumberFont = layout.singleColumn
        ? clamp(layout.cardH * 0.2, 28, 40)
        : clamp(layout.cardH * 0.18, 26, 38)
    const optionTitleFont = layout.singleColumn
        ? clamp(layout.cardH * 0.22, 32, 46)
        : clamp(layout.cardH * 0.19, 30, 42)
    const optionDescFont = layout.singleColumn
        ? clamp(layout.cardH * 0.16, 22, 32)
        : clamp(layout.cardH * 0.14, 20, 28)
    const titleLineHeight = optionTitleFont * 1.05
    const descLineHeight = optionDescFont * 1.08

    ctx.save()
    ctx.fillStyle = "rgba(7,14,9,0.5)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = "center"
    ctx.fillStyle = "#f3ffda"
    ctx.font = `700 ${layout.titleFont}px sans-serif`
    ctx.fillText("选择强化", canvas.width * 0.5, layout.overlayPadding + layout.titleFont)
    ctx.font = `600 ${layout.hintFont}px sans-serif`
    ctx.fillText(
        "按 1 / 2 / 3 或点按卡片选择",
        canvas.width * 0.5,
        layout.overlayPadding + layout.titleFont + layout.hintFont + (mobile.active ? Math.round(12 * layout.overlayScale) : 18)
    )

    for(let i = 0; i < upgradeState.choices.length; i++){
        const choice = upgradeState.choices[i]
        const x = layout.singleColumn
            ? layout.startX
            : layout.startX + i * (layout.cardW + layout.cardGap)
        const y = layout.singleColumn
            ? layout.startY + i * (layout.cardH + layout.cardGap)
            : layout.startY
        const glow = 0.18 + Math.sin((upgradeState.glowTimer + i * 12) * 0.08) * 0.06

        ctx.fillStyle = `rgba(34,64,28,${0.9 + glow})`
        roundedRectPath(ctx, x, y, layout.cardW, layout.cardH, 22)
        ctx.fill()

        ctx.strokeStyle = "rgba(220,248,190,0.3)"
        ctx.lineWidth = 2
        roundedRectPath(ctx, x, y, layout.cardW, layout.cardH, 22)
        ctx.stroke()

        ctx.fillStyle = "#d9f7a6"
        ctx.font = `700 ${cardNumberFont}px sans-serif`
        ctx.fillText(String(i + 1), x + layout.cardW * 0.12, y + layout.cardH * 0.18)

        ctx.fillStyle = "#f5ffdf"
        ctx.font = `700 ${optionTitleFont}px sans-serif`
        const titleLines = wrapOverlayText(choice.title, layout.cardW * 0.82, 2)
        let lineY = y + layout.cardH * 0.3
        for(const line of titleLines){
            ctx.fillText(line, x + layout.cardW * 0.5, lineY)
            lineY += titleLineHeight
        }

        ctx.font = `600 ${optionDescFont}px sans-serif`
        const descLines = wrapOverlayText(choice.desc, layout.cardW * 0.84, 3)
        lineY += layout.cardH * 0.08
        for(const line of descLines){
            ctx.fillText(line, x + layout.cardW * 0.5, lineY)
            lineY += descLineHeight
        }
    }

    ctx.restore()
}

export function getUpgradeCardIndexAtPoint(x, y){
    if(!upgradeState.active){
        return -1
    }

    const layout = getUpgradeOverlayLayout()

    for(let i = 0; i < upgradeState.choices.length; i++){
        const cardX = layout.singleColumn
            ? layout.startX
            : layout.startX + i * (layout.cardW + layout.cardGap)
        const cardY = layout.singleColumn
            ? layout.startY + i * (layout.cardH + layout.cardGap)
            : layout.startY
        if(x >= cardX && x <= cardX + layout.cardW && y >= cardY && y <= cardY + layout.cardH){
            return i
        }
    }

    return -1
}
