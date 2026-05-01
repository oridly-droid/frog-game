/**
 * 该模块集中管理敌人参数。
 * 负责默认值、运行时覆盖、字段 schema，以及为参数编辑器提供统一读写接口；不负责敌人 AI。
 */

const ENEMY_CONFIG_STORAGE_KEY = "frog_game_enemy_config_v1"

export const defaultEnemyConfig = {
    ant:{
        id:"ant",
        nameZh:"蚂蚁",
        size:15,
        maxHp:2,
        moveSpeed:1.24,
        contactDamage:1,
        attackCooldown:18,
        attackRange:42,
        projectileSpeed:0,
        spawnWeight:1,
        xpReward:2,
        eliteMultiplier:1.8,
        contactRadius:0.74,
        tags:["melee"]
    },
    melee:{
        id:"melee",
        nameZh:"近战虫",
        size:16,
        maxHp:3,
        moveSpeed:1.16,
        contactDamage:1,
        attackCooldown:18,
        attackRange:48,
        projectileSpeed:0,
        spawnWeight:0.9,
        xpReward:3,
        eliteMultiplier:1.8,
        contactRadius:0.78,
        armor:0,
        tags:["melee"]
    },
    beetle:{
        id:"beetle",
        nameZh:"甲虫",
        size:19,
        maxHp:3,
        moveSpeed:0.74,
        contactDamage:1,
        attackCooldown:130,
        attackCooldownMin:110,
        attackCooldownMax:150,
        attackRange:440,
        projectileSpeed:2.1,
        spawnWeight:0.7,
        xpReward:4,
        eliteMultiplier:1.8,
        contactRadius:0.82,
        tags:["ranged"]
    },
    charger:{
        id:"charger",
        nameZh:"冲锋虫",
        size:18,
        maxHp:4,
        moveSpeed:0.9,
        contactDamage:1,
        attackCooldown:130,
        attackCooldownMin:110,
        attackCooldownMax:150,
        attackRange:260,
        projectileSpeed:0,
        spawnWeight:0.55,
        xpReward:5,
        eliteMultiplier:1.8,
        contactRadius:0.82,
        dashSpeed:3.7,
        dashFrames:16,
        tags:["melee", "dash"]
    },
    ranged:{
        id:"ranged",
        nameZh:"远程虫",
        size:17,
        maxHp:3,
        moveSpeed:0.82,
        contactDamage:1,
        attackCooldown:114,
        attackCooldownMin:96,
        attackCooldownMax:130,
        attackRange:520,
        projectileSpeed:2.35,
        spawnWeight:0.58,
        xpReward:4,
        eliteMultiplier:1.8,
        contactRadius:0.74,
        armor:0,
        tags:["ranged"]
    },
    summoner:{
        id:"summoner",
        nameZh:"育巢虫",
        size:20,
        maxHp:4,
        moveSpeed:0.82,
        contactDamage:1,
        attackCooldown:190,
        attackCooldownMin:160,
        attackCooldownMax:220,
        attackRange:180,
        projectileSpeed:0,
        spawnWeight:0.32,
        xpReward:6,
        eliteMultiplier:1.8,
        contactRadius:0.78,
        summonCooldownMin:160,
        summonCooldownMax:220,
        tags:["summoner", "support"]
    },
    sniper:{
        id:"sniper",
        nameZh:"针刺虫",
        size:17,
        maxHp:3,
        moveSpeed:0.78,
        contactDamage:1,
        attackCooldown:107,
        attackCooldownMin:90,
        attackCooldownMax:124,
        attackRange:560,
        projectileSpeed:2.7,
        spawnWeight:0.28,
        xpReward:5,
        eliteMultiplier:1.8,
        contactRadius:0.72,
        tags:["ranged", "sniper"]
    },
    spore:{
        id:"spore",
        nameZh:"孢团虫",
        size:19,
        maxHp:4,
        moveSpeed:0.72,
        contactDamage:1,
        attackCooldown:122,
        attackCooldownMin:105,
        attackCooldownMax:140,
        attackRange:460,
        projectileSpeed:1.18,
        spawnWeight:0.3,
        xpReward:5,
        eliteMultiplier:1.8,
        contactRadius:0.8,
        tags:["ranged", "poison"]
    },
    herald:{
        id:"herald",
        nameZh:"鸣壳虫",
        size:18,
        maxHp:4,
        moveSpeed:0.84,
        contactDamage:1,
        attackCooldown:20,
        attackRange:180,
        projectileSpeed:0,
        spawnWeight:0.18,
        xpReward:5,
        eliteMultiplier:1.8,
        contactRadius:0.76,
        tags:["support", "aura"]
    },
    guard:{
        id:"guard",
        nameZh:"护壳虫",
        size:23,
        maxHp:5,
        moveSpeed:0.72,
        contactDamage:1,
        attackCooldown:18,
        attackRange:56,
        projectileSpeed:0,
        spawnWeight:0.22,
        xpReward:6,
        eliteMultiplier:1.8,
        contactRadius:0.9,
        tags:["melee", "tank"]
    },
    tank:{
        id:"tank",
        nameZh:"重甲虫",
        size:24,
        maxHp:7,
        moveSpeed:0.66,
        contactDamage:2,
        attackCooldown:22,
        attackRange:62,
        projectileSpeed:0,
        spawnWeight:0.34,
        xpReward:6,
        eliteMultiplier:1.8,
        contactRadius:0.92,
        armor:38,
        tags:["tank", "melee"]
    },
    boss:{
        id:"boss",
        nameZh:"蚁后",
        size:46,
        maxHp:26,
        moveSpeed:1.1,
        contactDamage:1,
        attackCooldown:114,
        attackCooldownMin:96,
        attackCooldownMax:132,
        attackRange:520,
        projectileSpeed:1.95,
        spawnWeight:0,
        xpReward:20,
        eliteMultiplier:1,
        contactRadius:1.08,
        dashRateMin:138,
        dashRateMax:178,
        dashSpeed:4.6,
        dashFrames:20,
        tags:["boss", "ranged", "dash"]
    }
}

export const enemyConfigSchema = [
    {key:"id", labelZh:"英文 ID", type:"text", readOnly:true, descriptionZh:"稳定的内部标识。"},
    {key:"nameZh", labelZh:"中文名称", type:"text", descriptionZh:"给开发者看的敌人名称。"},
    {key:"size", labelZh:"体型半径", type:"number", min:4, max:120, step:1, descriptionZh:"基础体型尺寸。"},
    {key:"maxHp", labelZh:"最大生命", type:"number", min:1, max:500, step:1, descriptionZh:"敌人的基础生命。"},
    {key:"moveSpeed", labelZh:"移动速度", type:"number", min:0, max:10, step:0.01, descriptionZh:"敌人的基础移动速度。"},
    {key:"contactDamage", labelZh:"接触伤害", type:"number", min:0, max:20, step:1, descriptionZh:"贴身接触时对主角造成的伤害。"},
    {key:"attackCooldown", labelZh:"攻击冷却", type:"number", min:0, max:600, step:1, descriptionZh:"攻击的基础冷却值。"},
    {key:"attackRange", labelZh:"攻击范围", type:"number", min:0, max:1200, step:1, descriptionZh:"敌人的有效攻击距离。"},
    {key:"projectileSpeed", labelZh:"投射物速度", type:"number", min:0, max:12, step:0.05, descriptionZh:"远程攻击使用的弹速。"},
    {key:"armor", labelZh:"护甲", type:"number", min:0, max:200, step:1, descriptionZh:"用于承受伤害时的减伤。"},
    {key:"spawnWeight", labelZh:"生成权重", type:"number", min:0, max:20, step:0.01, descriptionZh:"后续扩展刷怪权重时使用。"},
    {key:"xpReward", labelZh:"经验奖励", type:"number", min:0, max:100, step:1, descriptionZh:"击败后提供的经验值。"},
    {key:"eliteMultiplier", labelZh:"精英倍率", type:"number", min:1, max:10, step:0.1, descriptionZh:"精英版生命/强度倍率。"},
    {key:"contactRadius", labelZh:"接触判定系数", type:"number", min:0.1, max:2, step:0.01, descriptionZh:"接触伤害的碰撞系数。"},
    {key:"attackCooldownMin", labelZh:"攻击冷却最小值", type:"number", min:0, max:600, step:1, descriptionZh:"需要区间冷却时使用。"},
    {key:"attackCooldownMax", labelZh:"攻击冷却最大值", type:"number", min:0, max:600, step:1, descriptionZh:"需要区间冷却时使用。"},
    {key:"dashRateMin", labelZh:"冲锋冷却最小值", type:"number", min:0, max:600, step:1, descriptionZh:"冲锋型敌人的最小冷却。"},
    {key:"dashRateMax", labelZh:"冲锋冷却最大值", type:"number", min:0, max:600, step:1, descriptionZh:"冲锋型敌人的最大冷却。"},
    {key:"dashSpeed", labelZh:"冲锋速度", type:"number", min:0, max:20, step:0.05, descriptionZh:"冲锋阶段速度。"},
    {key:"dashFrames", labelZh:"冲锋帧数", type:"number", min:0, max:120, step:1, descriptionZh:"冲锋持续帧数。"},
    {key:"summonCooldownMin", labelZh:"召唤冷却最小值", type:"number", min:0, max:600, step:1, descriptionZh:"召唤型敌人的最小冷却。"},
    {key:"summonCooldownMax", labelZh:"召唤冷却最大值", type:"number", min:0, max:600, step:1, descriptionZh:"召唤型敌人的最大冷却。"},
    {key:"tags", labelZh:"标签", type:"tags", descriptionZh:"例如 melee / ranged / poison / summoner。"}
]

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function canUseStorage(){
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function parseNumber(value, fallback){
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

function sanitizeEnemyEntry(source = {}, defaults = {}){
    const next = clone(defaults)
    for(const field of enemyConfigSchema){
        if(field.readOnly){
            next[field.key] = defaults[field.key]
            continue
        }

        const fallback = defaults[field.key]
        let value = source[field.key]

        if(field.type === "number"){
            value = parseNumber(value, fallback !== undefined ? fallback : 0)
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
        }else if(field.type === "tags"){
            if(Array.isArray(value)){
                value = value.filter(Boolean).map(item => String(item).trim()).filter(Boolean)
            }else if(typeof value === "string"){
                value = value.split(",").map(item => item.trim()).filter(Boolean)
            }else{
                value = clone(fallback || [])
            }
        }else{
            value = typeof value === "string" && value.trim() ? value : fallback
        }

        next[field.key] = value
    }
    return next
}

export function sanitizeEnemyConfig(source = {}){
    const next = {}
    for(const [enemyId, defaults] of Object.entries(defaultEnemyConfig)){
        next[enemyId] = sanitizeEnemyEntry(source[enemyId], defaults)
    }
    return next
}

function readStoredEnemyConfig(){
    if(!canUseStorage()){
        return clone(defaultEnemyConfig)
    }

    try{
        const raw = window.localStorage.getItem(ENEMY_CONFIG_STORAGE_KEY)
        if(!raw){
            return clone(defaultEnemyConfig)
        }
        return sanitizeEnemyConfig(JSON.parse(raw))
    }catch(error){
        console.warn("读取 enemy_config 覆盖失败，已回退默认值。", error)
        return clone(defaultEnemyConfig)
    }
}

export const enemyConfig = clone(defaultEnemyConfig)

export function applyEnemyConfig(nextConfig){
    const sanitized = sanitizeEnemyConfig(nextConfig)
    for(const [enemyId, entry] of Object.entries(sanitized)){
        enemyConfig[enemyId] = clone(entry)
    }
    return clone(enemyConfig)
}

export function resetEnemyConfig(){
    const defaults = clone(defaultEnemyConfig)
    for(const [enemyId, entry] of Object.entries(defaults)){
        enemyConfig[enemyId] = entry
    }
    if(canUseStorage()){
        window.localStorage.removeItem(ENEMY_CONFIG_STORAGE_KEY)
    }
    return clone(enemyConfig)
}

export function persistEnemyConfig(nextConfig = enemyConfig){
    const sanitized = sanitizeEnemyConfig(nextConfig)
    for(const [enemyId, entry] of Object.entries(sanitized)){
        enemyConfig[enemyId] = clone(entry)
    }
    if(canUseStorage()){
        window.localStorage.setItem(ENEMY_CONFIG_STORAGE_KEY, JSON.stringify(sanitized, null, 2))
    }
    return clone(enemyConfig)
}

export function exportEnemyConfig(){
    return clone(enemyConfig)
}

function buildEnemyRuntimeStats(entry){
    const attackCooldownMin = entry.attackCooldownMin !== undefined ? entry.attackCooldownMin : entry.attackCooldown
    const attackCooldownMax = entry.attackCooldownMax !== undefined ? entry.attackCooldownMax : entry.attackCooldown
    const dashRateMin = entry.dashRateMin !== undefined ? entry.dashRateMin : entry.attackCooldown
    const dashRateMax = entry.dashRateMax !== undefined ? entry.dashRateMax : entry.attackCooldown
    const summonCooldownMin = entry.summonCooldownMin !== undefined ? entry.summonCooldownMin : entry.attackCooldown
    const summonCooldownMax = entry.summonCooldownMax !== undefined ? entry.summonCooldownMax : entry.attackCooldown

    return {
        ...entry,
        speed: entry.moveSpeed,
        shootRate: [attackCooldownMin, attackCooldownMax],
        dashRate: [dashRateMin, dashRateMax],
        summonRate: [summonCooldownMin, summonCooldownMax]
    }
}

export const enemyStats = new Proxy({}, {
    get(target, prop){
        if(typeof prop !== "string" || !(prop in enemyConfig)){
            return undefined
        }
        return buildEnemyRuntimeStats(enemyConfig[prop])
    }
})
