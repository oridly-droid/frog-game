/**
 * This module centralizes terrain collision and walkability checks.
 * It is responsible for shared world collision helpers and does not update entity AI by itself.
 */


import { enemyStats } from "../config/game_config.js"
import { canvas, terrain, world, frog, waveState } from "../core/state.js"
import { getRandomRange, getClosestPointOnSegment, mulberry32 } from "../core/utils.js"

export function isInsideWorld(x, y, margin = 0){
    return x >= margin && y >= margin && x <= world.width - margin && y <= world.height - margin
}

export function isWalkablePoint(x, y, radius = 18){
    if(!terrain) return false
    if(!isInsideWorld(x, y, radius + 8)) return false
    if(circleCollidesRocks(x, y, radius)) return false
    return true
}

export function hasWalkablePocket(x, y, radius = 18){
    if(!isWalkablePoint(x, y, radius)){
        return false
    }

    let clearChecks = 0
    const ringA = radius + 18
    const ringB = radius + 42

    for(const ring of [ringA, ringB]){
        for(let i = 0; i < 8; i++){
            const angle = i / 8 * Math.PI * 2
            const px = x + Math.cos(angle) * ring
            const py = y + Math.sin(angle) * ring
            if(isWalkablePoint(px, py, Math.max(12, radius * 0.42))){
                clearChecks++
            }
        }
    }

    return clearChecks >= 10
}

export function isBossSpawnPoint(x, y, radius = enemyStats.boss.size * 0.82){
    if(!isInsideWorld(x, y, radius + 84)){
        return false
    }

    if(!hasWalkablePocket(x, y, radius)){
        return false
    }

    let openLanes = 0
    const laneRadius = radius + 86
    const laneCheckRadius = Math.max(14, radius * 0.54)

    for(let i = 0; i < 12; i++){
        const angle = i / 12 * Math.PI * 2
        const px = x + Math.cos(angle) * laneRadius
        const py = y + Math.sin(angle) * laneRadius
        if(hasWalkablePocket(px, py, laneCheckRadius)){
            openLanes++
        }
    }

    return openLanes >= 7
}

export function findNearestWalkablePoint(startX, startY, radius = 18, maxSearchRadius = 360){
    if(hasWalkablePocket(startX, startY, radius)){
        return {x:startX, y:startY}
    }

    const step = Math.max(18, radius * 0.45)
    for(let searchRadius = step; searchRadius <= maxSearchRadius; searchRadius += step){
        const samples = Math.max(12, Math.floor(searchRadius / step) * 6)
        for(let i = 0; i < samples; i++){
            const angle = i / samples * Math.PI * 2
            const x = startX + Math.cos(angle) * searchRadius
            const y = startY + Math.sin(angle) * searchRadius
            if(hasWalkablePocket(x, y, radius)){
                return {x, y}
            }
        }
    }

    return null
}

export function findNearestBossSpawnPoint(startX, startY, radius = enemyStats.boss.size * 0.82, maxSearchRadius = 520){
    if(isBossSpawnPoint(startX, startY, radius)){
        return {x:startX, y:startY}
    }

    const candidate = findNearestWalkablePoint(startX, startY, radius, maxSearchRadius)
    if(candidate && isBossSpawnPoint(candidate.x, candidate.y, radius)){
        return candidate
    }

    const step = Math.max(24, radius * 0.5)
    for(let searchRadius = step; searchRadius <= maxSearchRadius; searchRadius += step){
        const samples = Math.max(18, Math.floor(searchRadius / step) * 8)
        for(let i = 0; i < samples; i++){
            const angle = i / samples * Math.PI * 2
            const x = startX + Math.cos(angle) * searchRadius
            const y = startY + Math.sin(angle) * searchRadius
            if(isBossSpawnPoint(x, y, radius)){
                return {x, y}
            }
        }
    }

    return null
}

export function findBossSpawnNearPlayer(centerX = frog.x, centerY = frog.y, radius = enemyStats.boss.size * 0.82){
    const minDistance = Math.max(170, radius * 4)
    const searchStep = Math.max(26, radius * 0.52)
    const nearRadius = minDistance + 28
    const maxSearchRadius = Math.max(nearRadius + 260, Math.min(920, Math.max(canvas.width, canvas.height) * 1.1))
    const seed = ((((centerX | 0) * 173) ^ ((centerY | 0) * 211) ^ (waveState.current * 977) ^ 0xB055F1) >>> 0)
    const rng = mulberry32(seed)

    const searchAroundPlayer = validator => {
        for(let searchRadius = nearRadius; searchRadius <= maxSearchRadius; searchRadius += searchStep){
            const samples = Math.max(18, Math.floor(searchRadius / searchStep) * 8)
            const baseAngle = rng() * Math.PI * 2
            for(let i = 0; i < samples; i++){
                const angle = baseAngle + i / samples * Math.PI * 2
                const x = centerX + Math.cos(angle) * searchRadius
                const y = centerY + Math.sin(angle) * searchRadius
                if(Math.hypot(x - centerX, y - centerY) < minDistance){
                    continue
                }
                if(validator(x, y, radius)){
                    return {x, y}
                }
            }
        }
        return null
    }

    const bossSpawn = searchAroundPlayer(isBossSpawnPoint)
    if(bossSpawn){
        return bossSpawn
    }

    const walkableFallback = searchAroundPlayer(hasWalkablePocket)
    if(walkableFallback){
        return walkableFallback
    }

    const outwardAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]
    for(const angle of outwardAngles){
        const anchorX = centerX + Math.cos(angle) * nearRadius
        const anchorY = centerY + Math.sin(angle) * nearRadius
        const fallback = findNearestWalkablePoint(anchorX, anchorY, radius, maxSearchRadius)
        if(fallback && Math.hypot(fallback.x - centerX, fallback.y - centerY) >= minDistance * 0.82){
            return fallback
        }
    }

    return null
}

export function findBossSpawnPoint(region, existingPoints, rng){
    const radius = enemyStats.boss.size * 0.82
    const minDistance = 180
    const margin = radius + 84

    for(let attempt = 0; attempt < 180; attempt++){
        const x = getRandomRange(rng, region.x1 + margin, region.x2 - margin)
        const y = getRandomRange(rng, region.y1 + margin, region.y2 - margin)

        let tooClose = false
        for(const point of existingPoints){
            if(Math.hypot(x - point.x, y - point.y) < minDistance){
                tooClose = true
                break
            }
        }
        if(tooClose) continue

        if(isBossSpawnPoint(x, y, radius)){
            return {x, y}
        }

        const fallback = findNearestBossSpawnPoint(x, y, radius, 220)
        if(fallback){
            let fallbackTooClose = false
            for(const point of existingPoints){
                if(Math.hypot(fallback.x - point.x, fallback.y - point.y) < minDistance){
                    fallbackTooClose = true
                    break
                }
            }
            if(!fallbackTooClose){
                return fallback
            }
        }
    }

    const step = Math.max(radius * 1.6, 34)
    for(let y = region.y1 + margin; y < region.y2 - margin; y += step){
        for(let x = region.x1 + margin; x < region.x2 - margin; x += step){
            let tooClose = false
            for(const point of existingPoints){
                if(Math.hypot(x - point.x, y - point.y) < minDistance){
                    tooClose = true
                    break
                }
            }
            if(tooClose) continue

            if(isBossSpawnPoint(x, y, radius)){
                return {x, y}
            }

            const fallback = findNearestBossSpawnPoint(x, y, radius, 260)
            if(fallback){
                return fallback
            }
        }
    }

    const regionCenterX = (region.x1 + region.x2) * 0.5
    const regionCenterY = (region.y1 + region.y2) * 0.5
    return findNearestBossSpawnPoint(regionCenterX, regionCenterY, radius, 620)
}

export function circleCollidesRocks(x, y, radius){
    if(!terrain){
        return false
    }

    for(const rock of terrain.rocks || []){
        if(Math.hypot(x - rock.x, y - rock.y) < rock.r * 0.82 + radius){
            return true
        }
    }

    for(const barrier of terrain.barriers || []){
        const point = getClosestPointOnSegment(x, y, barrier.x1, barrier.y1, barrier.x2, barrier.y2)
        if(Math.hypot(x - point.x, y - point.y) < barrier.radius + radius){
            return true
        }
    }

    return false
}

export function resolveRockCollisions(entity, radius){
    if(!terrain){
        return
    }

    for(const rock of terrain.rocks || []){
        const avoid = rock.r * 0.82 + radius
        let dx = entity.x - rock.x
        let dy = entity.y - rock.y
        let dist = Math.hypot(dx, dy)

        if(dist === 0){
            dx = 1
            dy = 0
            dist = 1
        }

        if(dist < avoid){
            const push = avoid - dist
            entity.x += dx / dist * push
            entity.y += dy / dist * push
        }
    }

    for(const barrier of terrain.barriers || []){
        const point = getClosestPointOnSegment(entity.x, entity.y, barrier.x1, barrier.y1, barrier.x2, barrier.y2)
        let dx = entity.x - point.x
        let dy = entity.y - point.y
        let dist = Math.hypot(dx, dy)
        const avoid = barrier.radius + radius

        if(dist === 0){
            const segDx = barrier.x2 - barrier.x1
            const segDy = barrier.y2 - barrier.y1
            dx = -segDy || 1
            dy = segDx || 0
            dist = Math.hypot(dx, dy)
        }

        if(dist < avoid){
            const push = avoid - dist
            entity.x += dx / dist * push
            entity.y += dy / dist * push
        }
    }
}
