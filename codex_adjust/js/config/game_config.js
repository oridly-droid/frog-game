/**
 * This module centralizes static gameplay and world constants.
 * It is responsible for immutable tuning/config data and does not own runtime state.
 */

import { playerConfig } from "./player_config.js"
import { enemyStats } from "./enemy_config.js"

export const GAME_TITLE = "codex调整"
export const BUILD_ID = "v0.3-build-032-codex-art-001"

export const bushAnchors = [
    {nx:0.12, ny:0.18, scale:1.05},
    {nx:0.31, ny:0.12, scale:0.92},
    {nx:0.80, ny:0.20, scale:1.12},
    {nx:0.15, ny:0.76, scale:1.08},
    {nx:0.83, ny:0.72, scale:1.1},
    {nx:0.58, ny:0.83, scale:0.96}
]

export const rockAnchors = [
    {nx:0.24, ny:0.38, scale:0.96},
    {nx:0.75, ny:0.39, scale:1.15},
    {nx:0.31, ny:0.71, scale:1.06},
    {nx:0.69, ny:0.77, scale:0.92}
]

export const waveConfigs = [
    {ants:4, beetles:0, chargers:0},
    {ants:5, beetles:1, chargers:0},
    {ants:5, beetles:2, chargers:1},
    {ants:6, beetles:2, chargers:2}
]

export const treasureGoal = 3
export const maxActiveEnemies = 10
export const baseFrogMaxHp = playerConfig.maxHp
export const BOSS_NAME = "蚁后"

export const plantStats = {
    size: 22,
    range: 240,
    snapRadius: 48,
    projectileLife: 220
}

export const zoneNames = {
    spawn:"中央出生草地",
    causeway:"断碑回廊区",
    shallows:"睡莲浅滩区",
    nestHeart:"孢雾心巢区",
    bridgehead:"断港桥头区",
    harbor:"雾潮主埠区",
    tideflats:"灰青浅湾区",
    shrineWard:"潮蚀神龛区",
    meadow:"开放草地区",
    ruinA:"遗迹一区",
    ruinB:"遗迹二区",
    thicket:"危险植被区",
    pollutedNest:"污染花巢区",
    altar:"遗迹祭坛区"
}

export const encounterTemplates = [
    {
        id:"surrounding_swarm",
        kind:"surround",
        label:"围剿型遭遇",
        reward:"xp",
        ants:4,
        beetles:1,
        chargers:0,
        summoners:0,
        snipers:0,
        spores:0
    },
    {
        id:"elite_watch",
        kind:"elite",
        label:"精英型遭遇",
        reward:"elite",
        ants:2,
        beetles:1,
        chargers:0,
        summoners:1,
        snipers:0,
        spores:0
    },
    {
        id:"altar_hold",
        kind:"defend",
        label:"守点型遭遇",
        reward:"blessing",
        holdTime:260,
        ants:3,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:0
    },
    {
        id:"hunter_pack",
        kind:"hunt",
        label:"追猎型遭遇",
        reward:"hunt",
        holdTime:240,
        ants:1,
        beetles:0,
        chargers:2,
        summoners:0,
        snipers:1,
        spores:0
    },
    {
        id:"pollution_bloom",
        kind:"cleanse",
        label:"污染清除型遭遇",
        reward:"cleanse",
        ants:1,
        beetles:0,
        chargers:0,
        summoners:0,
        snipers:0,
        spores:2,
        plants:3,
        cores:1
    },
    {
        id:"cache_ambush",
        kind:"ambush",
        label:"宝箱埋伏型遭遇",
        reward:"cache",
        ants:3,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:0
    },
    {
        id:"ruin_crossfire",
        kind:"surround",
        label:"交叉火力遭遇",
        reward:"xp",
        ants:2,
        beetles:1,
        chargers:0,
        summoners:0,
        snipers:2,
        spores:0,
        guards:1
    },
    {
        id:"brood_marshall",
        kind:"elite",
        label:"巢卫精英遭遇",
        reward:"elite",
        ants:1,
        beetles:0,
        chargers:1,
        summoners:1,
        snipers:0,
        spores:0,
        guards:1
    },
    {
        id:"altar_resolve",
        kind:"defend",
        label:"祭坛坚守遭遇",
        reward:"blessing",
        holdTime:300,
        ants:2,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:1,
        guards:1
    },
    {
        id:"predator_arc",
        kind:"hunt",
        label:"长追猎遭遇",
        reward:"hunt",
        holdTime:270,
        ants:1,
        beetles:0,
        chargers:1,
        summoners:0,
        snipers:2,
        spores:0,
        guards:1
    },
    {
        id:"nest_purge",
        kind:"cleanse",
        label:"孢巢净除遭遇",
        reward:"cleanse",
        ants:1,
        beetles:0,
        chargers:0,
        summoners:1,
        snipers:0,
        spores:2,
        guards:0,
        plants:4,
        cores:2
    },
    {
        id:"cache_crush",
        kind:"ambush",
        label:"双层埋伏遭遇",
        reward:"cache",
        ants:2,
        beetles:1,
        chargers:1,
        summoners:1,
        snipers:1,
        spores:0,
        guards:1
    },
    {
        id:"causeway_gauntlet",
        kind:"surround",
        label:"回廊夹击遭遇",
        reward:"xp",
        rewardPath:"dash",
        layout:"pinch",
        ants:2,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:0,
        guards:0,
        heralds:1
    },
    {
        id:"idol_guard",
        kind:"elite",
        label:"遗像守卫遭遇",
        reward:"elite",
        rewardPath:"tongue",
        ants:1,
        beetles:0,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:0,
        guards:1,
        heralds:1
    },
    {
        id:"spring_surge",
        kind:"defend",
        label:"泉眼守潮遭遇",
        reward:"blessing",
        rewardPath:"dash",
        layout:"crossfire",
        holdTime:280,
        ants:2,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:0,
        guards:0,
        heralds:1
    },
    {
        id:"nest_choir",
        kind:"cleanse",
        label:"孢雾合唱遭遇",
        reward:"cleanse",
        rewardPath:"poison",
        ants:1,
        beetles:0,
        chargers:0,
        summoners:1,
        snipers:0,
        spores:2,
        guards:1,
        heralds:1,
        plants:4,
        cores:2
    },
    {
        id:"shallows_pursuit",
        kind:"hunt",
        label:"浅滩追袭遭遇",
        reward:"hunt",
        rewardPath:"dash",
        holdTime:260,
        ants:2,
        beetles:0,
        chargers:2,
        summoners:0,
        snipers:1,
        spores:0,
        guards:0,
        heralds:1
    },
    {
        id:"cache_procession",
        kind:"ambush",
        label:"秘藏巡队遭遇",
        reward:"cache",
        rewardPath:"tongue",
        layout:"crossfire",
        ants:1,
        beetles:1,
        chargers:1,
        summoners:1,
        snipers:1,
        spores:0,
        guards:1,
        heralds:1
    },
    {
        id:"bridge_watch",
        kind:"elite",
        label:"桥头守卫遭遇",
        reward:"elite",
        rewardPath:"dash",
        layout:"pinch",
        ants:1,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:0,
        guards:2,
        heralds:1
    },
    {
        id:"harbor_crossfire",
        kind:"surround",
        label:"断港交叉遭遇",
        reward:"xp",
        rewardPath:"tongue",
        layout:"crossfire",
        ants:1,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:2,
        spores:0,
        guards:1,
        heralds:1
    },
    {
        id:"tide_stalk",
        kind:"hunt",
        label:"潮湾追猎遭遇",
        reward:"hunt",
        rewardPath:"poison",
        holdTime:290,
        ants:2,
        beetles:0,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:1,
        guards:0,
        heralds:1
    },
    {
        id:"shrine_vigil",
        kind:"defend",
        label:"神龛守望遭遇",
        reward:"blessing",
        rewardPath:"tongue",
        holdTime:310,
        ants:1,
        beetles:1,
        chargers:0,
        summoners:0,
        snipers:1,
        spores:1,
        guards:2,
        heralds:1
    },
    {
        id:"quay_purge",
        kind:"cleanse",
        label:"冷埠净除遭遇",
        reward:"cleanse",
        rewardPath:"poison",
        ants:1,
        beetles:0,
        chargers:0,
        summoners:1,
        snipers:0,
        spores:2,
        guards:1,
        heralds:1,
        plants:3,
        cores:1
    },
    {
        id:"tide_cache",
        kind:"ambush",
        label:"潮痕秘匣遭遇",
        reward:"cache",
        rewardPath:"dash",
        layout:"pinch",
        ants:1,
        beetles:1,
        chargers:1,
        summoners:0,
        snipers:1,
        spores:1,
        guards:1,
        heralds:1
    }
]

export { enemyStats }
