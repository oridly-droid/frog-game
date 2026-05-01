/**
 * 该模块集中管理主角参数。
 * 负责默认值、运行时覆盖、字段 schema，以及给参数编辑器提供统一接口；不负责具体玩法逻辑。
 */

const PLAYER_CONFIG_STORAGE_KEY = "frog_game_player_config_v1"

export const defaultPlayerConfig = {
    maxHp: 864,
    defense: 0,
    moveSpeed: 4,
    baseAttackDamage: 2,
    xpGainScale: 1,
    pickupRadius: 6,
    baseCritChance: 0,
    tongueRange: 208,
    tongueCooldown: 28,
    dashCooldown: 120,
    jumpCooldown: 60,
    slamCooldown: 180,
    poisonCooldown: 240,
    poisonDuration: 210,
    poisonTick: 45,
    poisonDamageScale: 1,
    dashDistance: 120,
    slamRadius: 104,
    slamDamage: 2
}

export const playerConfigSchema = [
    {
        id: "player_base",
        titleZh: "基础参数",
        fields: [
            {key: "maxHp", labelZh: "最大生命", type: "number", min: 1, max: 1200, step: 1, descriptionZh: "青蛙的默认最大生命。"},
            {key: "defense", labelZh: "防御", type: "number", min: 0, max: 120, step: 1, descriptionZh: "主角的基础防御值，会按伤害公式减轻受到的伤害。"},
            {key: "moveSpeed", labelZh: "移动速度", type: "number", min: 1, max: 12, step: 0.1, descriptionZh: "青蛙默认移动速度。"},
            {key: "baseAttackDamage", labelZh: "基础攻击伤害", type: "number", min: 0, max: 10, step: 1, descriptionZh: "斩击默认基础伤害。"},
            {key: "xpGainScale", labelZh: "经验获取倍率", type: "number", min: 0.1, max: 5, step: 0.05, descriptionZh: "全局经验获取倍率。"},
            {key: "pickupRadius", labelZh: "拾取半径加值", type: "number", min: 0, max: 40, step: 1, descriptionZh: "靠近宝物或事件点时的额外判定半径。"},
            {key: "baseCritChance", labelZh: "基础暴击率", type: "number", min: 0, max: 0.8, step: 0.01, descriptionZh: "斩击的基础暴击率。"}
        ]
    },
    {
        id: "player_skills",
        titleZh: "技能默认参数",
        fields: [
            {key: "tongueRange", labelZh: "斩击距离", type: "number", min: 60, max: 360, step: 1, descriptionZh: "斩击默认作用距离。"},
            {key: "tongueCooldown", labelZh: "斩击冷却", type: "number", min: 8, max: 120, step: 1, descriptionZh: "斩击默认冷却帧数。"},
            {key: "dashCooldown", labelZh: "冲刺冷却", type: "number", min: 20, max: 300, step: 1, descriptionZh: "冲刺默认冷却帧数。"},
            {key: "jumpCooldown", labelZh: "跳跃冷却", type: "number", min: 20, max: 240, step: 1, descriptionZh: "跳跃默认冷却帧数。"},
            {key: "slamCooldown", labelZh: "震地冷却", type: "number", min: 30, max: 360, step: 1, descriptionZh: "震地默认冷却帧数。"},
            {key: "poisonCooldown", labelZh: "毒素冷却", type: "number", min: 30, max: 420, step: 1, descriptionZh: "毒素能力默认冷却帧数。"}
        ]
    },
    {
        id: "player_combat",
        titleZh: "战斗与异常参数",
        fields: [
            {key: "poisonDuration", labelZh: "中毒持续时间", type: "number", min: 30, max: 600, step: 1, descriptionZh: "中毒默认持续帧数。"},
            {key: "poisonTick", labelZh: "中毒跳伤间隔", type: "number", min: 6, max: 120, step: 1, descriptionZh: "中毒每次跳伤之间的间隔帧数。"},
            {key: "poisonDamageScale", labelZh: "毒伤倍率", type: "number", min: 0, max: 10, step: 0.25, descriptionZh: "默认毒伤害系数。"},
            {key: "dashDistance", labelZh: "冲刺距离", type: "number", min: 24, max: 300, step: 1, descriptionZh: "默认冲刺总距离。"},
            {key: "slamRadius", labelZh: "震地半径", type: "number", min: 20, max: 240, step: 1, descriptionZh: "默认震地范围半径。"},
            {key: "slamDamage", labelZh: "震地伤害", type: "number", min: 0, max: 10, step: 1, descriptionZh: "默认震地伤害。"}
        ]
    }
]

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function canUseStorage(){
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function toNumber(value, fallback){
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

export function sanitizePlayerConfig(source = {}){
    const next = clone(defaultPlayerConfig)

    for(const section of playerConfigSchema){
        for(const field of section.fields){
            const fallback = defaultPlayerConfig[field.key]
            let value = source[field.key]

            if(field.type === "number"){
                value = toNumber(value, fallback)
                if(field.min !== undefined){
                    value = Math.max(field.min, value)
                }
                if(field.max !== undefined){
                    value = Math.min(field.max, value)
                }
                if(field.step !== undefined && field.step < 1){
                    const stepParts = String(field.step).split(".")
                    const precision = stepParts[1] ? stepParts[1].length : 0
                    value = Number(value.toFixed(precision))
                }
            }

            next[field.key] = value
        }
    }

    return next
}

function readStoredPlayerConfig(){
    if(!canUseStorage()){
        return clone(defaultPlayerConfig)
    }

    try{
        const raw = window.localStorage.getItem(PLAYER_CONFIG_STORAGE_KEY)
        if(!raw){
            return clone(defaultPlayerConfig)
        }
        return sanitizePlayerConfig(JSON.parse(raw))
    }catch(error){
        console.warn("读取 player_config 覆盖失败，已回退默认值。", error)
        return clone(defaultPlayerConfig)
    }
}

export const playerConfig = clone(defaultPlayerConfig)

export function applyPlayerConfig(nextConfig){
    const sanitized = sanitizePlayerConfig(nextConfig)
    Object.assign(playerConfig, sanitized)
    return clone(playerConfig)
}

export function resetPlayerConfig(){
    Object.assign(playerConfig, clone(defaultPlayerConfig))
    if(canUseStorage()){
        window.localStorage.removeItem(PLAYER_CONFIG_STORAGE_KEY)
    }
    return clone(playerConfig)
}

export function persistPlayerConfig(nextConfig = playerConfig){
    const sanitized = sanitizePlayerConfig(nextConfig)
    Object.assign(playerConfig, sanitized)
    if(canUseStorage()){
        window.localStorage.setItem(PLAYER_CONFIG_STORAGE_KEY, JSON.stringify(sanitized, null, 2))
    }
    return clone(playerConfig)
}

export function exportPlayerConfig(){
    return clone(playerConfig)
}
