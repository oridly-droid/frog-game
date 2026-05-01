/**
 * This module updates camera follow behavior.
 * It is responsible for camera tracking and does not draw world layers.
 */

import { world, camera, frog, view } from "./state.js"
import { clamp, lerp } from "./utils.js"

export function updateCamera(){
    const viewWidth = view.width || 1
    const viewHeight = view.height || 1
    const targetX = clamp(frog.x - viewWidth * 0.5, 0, Math.max(0, world.width - viewWidth))
    const targetY = clamp(frog.y - viewHeight * 0.5, 0, Math.max(0, world.height - viewHeight))
    camera.x = lerp(camera.x, targetX, 0.16)
    camera.y = lerp(camera.y, targetY, 0.16)
}
