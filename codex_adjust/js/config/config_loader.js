/**
 * 该模块负责读取开发模式 override 文件。
 * 负责把默认配置再叠加 dev_overrides JSON；不负责编辑器 UI，也不负责具体玩法逻辑。
 */

import { applyPlayerConfig } from "./player_config.js"
import { applyEnemyConfig } from "./enemy_config.js"

const playerOverrideUrl = new URL("../../dev_overrides/player.override.json", import.meta.url)
const enemyOverrideUrl = new URL("../../dev_overrides/enemy.override.json", import.meta.url)

const overrideMeta = {
    player:{
        status:"default",
        sourceLabelZh:"默认配置",
        path:playerOverrideUrl.pathname,
        hasOverride:false,
        error:null
    },
    enemy:{
        status:"default",
        sourceLabelZh:"默认配置",
        path:enemyOverrideUrl.pathname,
        hasOverride:false,
        error:null
    }
}

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value){
    return !!value && typeof value === "object" && !Array.isArray(value)
}

async function readOverrideJson(url){
    try{
        const response = await fetch(url.href, {cache:"no-store"})
        if(response.status === 404){
            return {status:"missing", data:{}}
        }
        if(!response.ok){
            return {status:"error", data:{}, error:`HTTP ${response.status}`}
        }

        const data = await response.json()
        if(!isPlainObject(data)){
            return {status:"invalid", data:{}, error:"override 文件必须是对象 JSON。"}
        }

        const hasOverride = Object.keys(data).length > 0
        return {
            status: hasOverride ? "override" : "default",
            data,
            hasOverride
        }
    }catch(error){
        return {
            status:"error",
            data:{},
            error:error && error.message ? error.message : String(error)
        }
    }
}

function updateMeta(kind, result){
    const entry = overrideMeta[kind]
    entry.status = result.status
    entry.hasOverride = !!result.hasOverride
    entry.error = result.error || null
    entry.sourceLabelZh = result.status === "override" ? "本地 override 覆盖中" : "默认配置"
}

export async function loadConfigOverrides(){
    const [playerResult, enemyResult] = await Promise.all([
        readOverrideJson(playerOverrideUrl),
        readOverrideJson(enemyOverrideUrl)
    ])

    applyPlayerConfig(playerResult.data)
    applyEnemyConfig(enemyResult.data)

    updateMeta("player", playerResult)
    updateMeta("enemy", enemyResult)

    if(playerResult.status === "error" || playerResult.status === "invalid"){
        console.warn("读取 player.override.json 失败，已回退默认配置。", playerResult.error)
    }
    if(enemyResult.status === "error" || enemyResult.status === "invalid"){
        console.warn("读取 enemy.override.json 失败，已回退默认配置。", enemyResult.error)
    }

    return getConfigOverrideMeta()
}

export function getConfigOverrideMeta(){
    return clone(overrideMeta)
}

export function getOverrideUrls(){
    return {
        player:playerOverrideUrl.href,
        enemy:enemyOverrideUrl.href
    }
}
