/**
 * This module handles zone lookups and shared region-placement helpers.
 * It is responsible for area naming and placement coordination, and it does not run combat loops.
 */


import { zoneNames } from "../config/game_config.js"
import { frog, terrain, world } from "../core/state.js"
import { getRandomRange } from "../core/utils.js"
import { isWalkablePoint } from "./collisions.js"

let reachabilityCache = null

function ensureReachabilityCache(step = 64, radius = 22){
    if(!terrain){
        return null
    }

    const cacheKey = `${world.width}x${world.height}:${terrain.rocks.length}:${terrain.barriers.length}:${step}:${radius}`
    if(reachabilityCache && reachabilityCache.key === cacheKey){
        return reachabilityCache
    }

    const cols = Math.floor(world.width / step) + 1
    const rows = Math.floor(world.height / step) + 1
    const walkable = new Uint8Array(cols * rows)
    const reachable = new Uint8Array(cols * rows)

    const indexOf = (cx, cy) => cy * cols + cx
    const cellToWorld = (cx, cy) => ({
        x: Math.min(world.width - radius, cx * step + step * 0.5),
        y: Math.min(world.height - radius, cy * step + step * 0.5)
    })

    for(let cy = 0; cy < rows; cy++){
        for(let cx = 0; cx < cols; cx++){
            const point = cellToWorld(cx, cy)
            walkable[indexOf(cx, cy)] = isWalkablePoint(point.x, point.y, radius) ? 1 : 0
        }
    }

    let startCx = Math.max(0, Math.min(cols - 1, Math.floor(terrain.centerX / step)))
    let startCy = Math.max(0, Math.min(rows - 1, Math.floor(terrain.centerY / step)))
    if(!walkable[indexOf(startCx, startCy)]){
        let found = false
        for(let ring = 1; ring < 4 && !found; ring++){
            for(let oy = -ring; oy <= ring && !found; oy++){
                for(let ox = -ring; ox <= ring; ox++){
                    const nx = startCx + ox
                    const ny = startCy + oy
                    if(nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
                    if(walkable[indexOf(nx, ny)]){
                        startCx = nx
                        startCy = ny
                        found = true
                        break
                    }
                }
            }
        }
    }

    const queue = [[startCx, startCy]]
    reachable[indexOf(startCx, startCy)] = 1

    for(let qi = 0; qi < queue.length; qi++){
        const [cx, cy] = queue[qi]
        for(const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
            const nx = cx + dx
            const ny = cy + dy
            if(nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const id = indexOf(nx, ny)
            if(reachable[id] || !walkable[id]) continue
            reachable[id] = 1
            queue.push([nx, ny])
        }
    }

    reachabilityCache = {
        key: cacheKey,
        step,
        cols,
        rows,
        reachable
    }
    return reachabilityCache
}

export function isReachablePoint(x, y, margin = 1, step = 64, radius = 22){
    const cache = ensureReachabilityCache(step, radius)
    if(!cache){
        return true
    }

    const cx = Math.max(0, Math.min(cache.cols - 1, Math.floor(x / cache.step)))
    const cy = Math.max(0, Math.min(cache.rows - 1, Math.floor(y / cache.step)))

    for(let oy = -margin; oy <= margin; oy++){
        for(let ox = -margin; ox <= margin; ox++){
            const nx = cx + ox
            const ny = cy + oy
            if(nx < 0 || ny < 0 || nx >= cache.cols || ny >= cache.rows) continue
            if(cache.reachable[ny * cache.cols + nx]){
                return true
            }
        }
    }

    return false
}

export function getCurrentZoneName(x = frog.x, y = frog.y){
    if(!terrain || !terrain.zones){
        return zoneNames.meadow
    }

    for(const zone of Object.values(terrain.zones)){
        if(x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2){
            return zone.name
        }
    }

    return zoneNames.meadow
}

export function findPlacementInRegion(region, radius, minDistance, existingPoints, rng, maxAttempts = 80, requireReachable = false){
    for(let attempt = 0; attempt < maxAttempts; attempt++){
        const x = getRandomRange(rng, region.x1, region.x2)
        const y = getRandomRange(rng, region.y1, region.y2)
        if(!isWalkablePoint(x, y, radius)) continue
        if(requireReachable && !isReachablePoint(x, y)) continue

        let tooClose = false
        for(const point of existingPoints){
            if(Math.hypot(x - point.x, y - point.y) < minDistance){
                tooClose = true
                break
            }
        }
        if(tooClose) continue

        return {x, y}
    }

    const step = Math.max(radius * 1.8, 28)
    for(let y = region.y1 + step; y < region.y2 - step; y += step){
        for(let x = region.x1 + step; x < region.x2 - step; x += step){
            if(!isWalkablePoint(x, y, radius)) continue
            if(requireReachable && !isReachablePoint(x, y)) continue

            let tooClose = false
            for(const point of existingPoints){
                if(Math.hypot(x - point.x, y - point.y) < minDistance){
                    tooClose = true
                    break
                }
            }
            if(!tooClose){
                return {x, y}
            }
        }
    }

    return null
}
