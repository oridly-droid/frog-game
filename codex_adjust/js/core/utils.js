/**
 * This module groups shared math and small helper utilities.
 * It is responsible for reusable helpers; most are pure, and roundedRectPath is kept here temporarily as a shared canvas helper.
 */

export function clamp(value, min, max){
    return Math.max(min, Math.min(max, value))
}

export function lerp(a, b, t){
    return a + (b - a) * t
}

export function smoothstep(edge0, edge1, value){
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)
}

export function rangeLerp(min, max, t){
    return min + (max - min) * t
}

export function getRandomRange(rng, min, max){
    return min + rng() * (max - min)
}

export function mulberry32(seed){
    return function(){
        let t = seed += 0x6D2B79F5
        t = Math.imul(t ^ t >>> 15, t | 1)
        t ^= t + Math.imul(t ^ t >>> 7, t | 61)
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

export function createOrganicPoints(cx, cy, rx, ry, pointCount, jitter, rng){
    const points = []
    const phaseA = rng() * Math.PI * 2
    const phaseB = rng() * Math.PI * 2
    const phaseC = rng() * Math.PI * 2

    for(let i = 0; i < pointCount; i++){
        const angle = i / pointCount * Math.PI * 2
        const wobbleX =
            1 +
            Math.sin(angle * 2 + phaseA) * 0.08 +
            Math.sin(angle * 3 + phaseB) * 0.06 +
            (rng() - 0.5) * jitter

        const wobbleY =
            1 +
            Math.sin(angle * 2 + phaseB) * 0.07 +
            Math.cos(angle * 4 + phaseC) * 0.05 +
            (rng() - 0.5) * jitter

        points.push({
            x: cx + Math.cos(angle) * rx * wobbleX,
            y: cy + Math.sin(angle) * ry * wobbleY
        })
    }

    return points
}

export function traceSmoothPath(context, points){
    if(!points || points.length < 2){
        return
    }

    const first = points[0]
    const last = points[points.length - 1]

    context.beginPath()
    context.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2)

    for(let i = 0; i < points.length; i++){
        const current = points[i]
        const next = points[(i + 1) % points.length]
        const midX = (current.x + next.x) / 2
        const midY = (current.y + next.y) / 2
        context.quadraticCurveTo(current.x, current.y, midX, midY)
    }

    context.closePath()
}

export function roundedRectPath(context, x, y, w, h, r){
    const radius = Math.min(r, w * 0.5, h * 0.5)
    context.beginPath()
    context.moveTo(x + radius, y)
    context.arcTo(x + w, y, x + w, y + h, radius)
    context.arcTo(x + w, y + h, x, y + h, radius)
    context.arcTo(x, y + h, x, y, radius)
    context.arcTo(x, y, x + w, y, radius)
    context.closePath()
}

export function getClosestPointOnSegment(px, py, x1, y1, x2, y2){
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy || 1
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1)
    return {
        x:x1 + dx * t,
        y:y1 + dy * t,
        t
    }
}

export function isInsideCircle(x, y, cx, cy, radius){
    return Math.hypot(x - cx, y - cy) <= radius
}
