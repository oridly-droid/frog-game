/**
 * This module stores mobile calibration rules.
 * It is responsible for unified mobile viewport/HUD/control sizing and does not handle gameplay logic.
 */

export const MOBILE_CONTROL_SCALE = 1.5

export function detectMobileMode(){
    const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
    return ("ontouchstart" in window) || navigator.maxTouchPoints > 0 || coarsePointer
}

export function getMobileCalibration(viewportWidth, viewportHeight, isMobile = detectMobileMode()){
    if(!isMobile){
        return {
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
    }

    const isLandscape = viewportWidth > viewportHeight
    if(isLandscape){
        return {
            active:true,
            orientation:"landscape",
            visibleWorldWidthFactor:1.68,
            visibleWorldHeightFactor:1.68,
            hudScale:0.78,
            controlScale:0.72,
            buttonClusterScale:0.72,
            overlayScale:0.74,
            safeInset:12,
        }
    }

    return {
        active:true,
        orientation:"portrait",
        visibleWorldWidthFactor:1.56,
        visibleWorldHeightFactor:1.56,
        hudScale:0.84,
        controlScale:0.78,
        buttonClusterScale:0.8,
        overlayScale:0.82,
        safeInset:14,
    }
}
