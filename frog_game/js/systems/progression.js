/**
 * This module owns level-up rewards and upgrade choice flow.
 * It is responsible for progression choices and does not handle frog movement or input routing.
 */


import { frog, progression, upgradeState, skillTree, combatStats, frogAbilities } from "../core/state.js"
import { spawnHitParticles } from "../entities/particles.js"
import { setBanner } from "../ui/banners.js"

function getBuildFocusScores(){
    const scores = {
        tongue:0,
        dash:0,
        poison:0
    }

    scores.tongue += skillTree.tongue.range + skillTree.tongue.doubleHit + skillTree.tongue.chain * 1.2 + skillTree.tongue.crit + skillTree.tongue.pierce + skillTree.tongue.frenzy + skillTree.tongue.bladeWave * 1.4
    scores.dash += skillTree.dash.range + skillTree.dash.damage * 1.2 + skillTree.dash.momentum + skillTree.dash.shockwave * 1.2 + skillTree.dash.doubleDash
    scores.poison += skillTree.poison.damage + skillTree.poison.spread + skillTree.poison.explosion * 1.2 + skillTree.poison.duration + skillTree.poison.pool

    for(const relicId of frog.relics){
        if(["stone", "fang", "coil", "shard"].includes(relicId)){
            scores.tongue += 1.5
        }else if(["sigil", "trail", "vault"].includes(relicId)){
            scores.dash += 1.5
        }else if(["charm", "gland", "blight", "reed"].includes(relicId)){
            scores.poison += 1.5
        }
    }

    return scores
}

function getDominantPath(scores){
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1])
    if(!entries.length || entries[0][1] <= 0){
        return null
    }
    return entries[0][0]
}

function getChoiceWeight(choice, scores, dominantPath){
    if(!choice.path){
        return 1
    }

    let weight = 1.05 + scores[choice.path] * 0.22
    if(choice.path === dominantPath){
        weight += 1.15
    }
    return weight
}

function pickWeightedChoices(pool, count, preferredPath = null){
    const remaining = pool.slice()
    const picked = []
    const scores = getBuildFocusScores()
    const dominantPath = getDominantPath(scores)

    const targetPath = preferredPath || dominantPath
    if(targetPath){
        const targetPool = remaining.filter(choice => choice.path === targetPath)
        if(targetPool.length > 0){
            const guaranteed = targetPool[Math.floor(Math.random() * targetPool.length)]
            picked.push(guaranteed)
            remaining.splice(remaining.indexOf(guaranteed), 1)
        }
    }

    while(remaining.length > 0 && picked.length < count){
        let totalWeight = 0
        const weights = remaining.map(choice => {
            let weight = getChoiceWeight(choice, scores, dominantPath)
            if(preferredPath && choice.path === preferredPath){
                weight += 2.1
            }
            totalWeight += weight
            return weight
        })

        let roll = Math.random() * totalWeight
        let chosenIndex = 0
        for(let index = 0; index < remaining.length; index++){
            roll -= weights[index]
            if(roll <= 0){
                chosenIndex = index
                break
            }
        }

        picked.push(remaining[chosenIndex])
        remaining.splice(chosenIndex, 1)
    }

    return picked
}

function pickDistinctRandomChoices(pool, count){
    const remaining = pool.slice()
    const picked = []

    while(remaining.length > 0 && picked.length < count){
        const index = Math.floor(Math.random() * remaining.length)
        picked.push(remaining[index])
        remaining.splice(index, 1)
    }

    return picked
}

function getRandomUpgradePool(){
    return [
        {
            id:"heartbud",
            label:"最大生命 +1",
            apply(){
                frog.maxHp += 1
                frog.hp = Math.min(frog.maxHp, frog.hp + 1)
            }
        },
        {
            id:"barkhide",
            label:"防御提升 +15",
            apply(){
                frog.defense += 15
            }
        },
        {
            id:"renewal",
            label:"生命全满",
            apply(){
                frog.hp = frog.maxHp
            }
        },
        {
            id:"swiftstride",
            label:"跳跃更快",
            apply(){
                frog.speed += 0.2
            }
        },
        {
            id:"quicklick",
            label:"斩击更快",
            path:"tongue",
            apply(){
                progression.tongueCooldownBonus += 3
            }
        },
        {
            id:"attack_focus",
            label:"普攻强化",
            path:"tongue",
            apply(){
                progression.tonguePower += 1
            }
        },
        {
            id:"templecrit",
            label:"斩击暴击",
            path:"tongue",
            apply(){
                skillTree.tongue.crit += 1
                progression.tongueCritBonus += 1
            }
        },
        {
            id:"longlick",
            label:"锋线更远",
            path:"tongue",
            apply(){
                progression.tongueRangeBonus += 0.1
                frog.tongueRange = Math.round(frog.tongueRange * 1.1)
                skillTree.tongue.range += 1
            }
        },
        {
            id:"attack_speed",
            label:"斩击提速",
            path:"tongue",
            apply(){
                progression.tongueCooldownBonus += 4
            }
        },
        {
            id:"springlegs",
            label:"跳跃冷却缩短",
            apply(){
                progression.jumpCooldownBonus += 8
            }
        },
        {
            id:"heavylick",
            label:"斩击更强",
            path:"tongue",
            apply(){
                progression.tonguePower = Math.min(3, progression.tonguePower + 1)
            }
        },
        {
            id:"blade_wave_seed",
            label:"刀锋强化",
            path:"tongue",
            apply(){
                skillTree.tongue.bladeWave += 1
            }
        },
        {
            id:"dashblessing",
            label:"冲刺余势",
            path:"dash",
            apply(){
                skillTree.dash.momentum += 1
            }
        },
        {
            id:"toxicblessing",
            label:"毒池扩散",
            path:"poison",
            apply(){
                skillTree.poison.pool += 1
                progression.poisonCloudBonus += 1
            }
        },
        {
            id:"splitlick",
            label:"连袭斩势",
            path:"tongue",
            apply(){
                skillTree.tongue.chain += 1
                skillTree.tongue.frenzy += 1
            }
        },
        {
            id:"rushcrest",
            label:"冲痕猛进",
            path:"dash",
            apply(){
                skillTree.dash.damage += 1
                skillTree.dash.range += 1
            }
        },
        {
            id:"venomburst",
            label:"腐花余毒",
            path:"poison",
            apply(){
                skillTree.poison.duration += 1
                skillTree.poison.explosion += 1
            }
        },
        {
            id:"tongue_echo",
            label:"追刃连斩",
            path:"tongue",
            apply(){
                skillTree.tongue.doubleHit += 1
                skillTree.tongue.chain += 1
            }
        },
        {
            id:"dash_breaker",
            label:"碎浪冲痕",
            path:"dash",
            apply(){
                skillTree.dash.damage += 1
                skillTree.dash.shockwave += 1
            }
        },
        {
            id:"poison_marsh",
            label:"腐泥渗扩",
            path:"poison",
            apply(){
                skillTree.poison.damage += 1
                skillTree.poison.spread += 1
            }
        }
    ]
}

export function applyRandomUpgradeWithPreference(preferredPath = null){
    const choice = pickWeightedChoices(getRandomUpgradePool(), 1, preferredPath)[0]
    choice.apply()
    progression.upgrades.push(choice.id)
    frog.hp = Math.min(frog.maxHp, frog.hp + 1)
    return choice.label
}

export function applyRandomUpgrade(){
    return applyRandomUpgradeWithPreference(null)
}

export function getUpgradePool(){
    return [
        {
            id:"attack_damage_up",
            title:"斩击强化",
            desc:"普攻伤害 +2",
            path:"tongue",
            apply(){
                progression.tonguePower += 2
            }
        },
        {
            id:"attack_speed_up",
            title:"攻速提升",
            desc:"普攻冷却缩短 6 帧",
            path:"tongue",
            apply(){
                progression.tongueCooldownBonus += 6
            }
        },
        {
            id:"attack_range_up",
            title:"锋线延伸",
            desc:"普攻距离 +15%",
            path:"tongue",
            apply(){
                frog.tongueRange = Math.round(frog.tongueRange * 1.15)
                skillTree.tongue.range += 1
            }
        },
        {
            id:"defense_up",
            title:"防御提升",
            desc:"防御 +12",
            apply(){
                frog.defense += 12
            }
        },
        {
            id:"max_hp_up",
            title:"生命提升",
            desc:"最大生命 +120，并回复 120",
            apply(){
                frog.maxHp += 120
                frog.hp = Math.min(frog.maxHp, frog.hp + 120)
            }
        },
        {
            id:"aoe_up",
            title:"群攻扩散",
            desc:"群攻范围 +22%，额外伤害 +1",
            apply(){
                progression.aoeRangeBonus += 30
                progression.aoeDamageBonus += 1
            }
        },
        {
            id:"dash_up",
            title:"冲刺推进",
            desc:"冲刺距离与速度明显提升",
            path:"dash",
            apply(){
                skillTree.dash.range += 2
                progression.dashMomentumBonus += 2
            }
        }
    ]
}

export function rollUpgradeChoices(){
    upgradeState.choices = pickDistinctRandomChoices(getUpgradePool(), 3)
}

export function queueLevelUpUpgrade(){
    upgradeState.queue = Number.isFinite(upgradeState.queue) ? Math.max(0, Math.min(48, upgradeState.queue + 1)) : 1
    if(!upgradeState.active){
        upgradeState.active = true
        upgradeState.glowTimer = 90
        rollUpgradeChoices()
    }
}

export function chooseUpgrade(index){
    if(!upgradeState.active){
        return
    }

    if(!Number.isFinite(upgradeState.queue) || upgradeState.queue < 0){
        upgradeState.queue = 0
    }

    const choice = upgradeState.choices[index]
    if(!choice){
        return
    }

    choice.apply()
    progression.upgrades.push(choice.id)
    frog.hp = Math.min(frog.maxHp, frog.hp + 1)
    spawnHitParticles(frog.x, frog.y - 10, "#d8ff98", 20)
    setBanner(choice.title, 100)
    upgradeState.queue = Math.max(0, upgradeState.queue - 1)

    if(upgradeState.queue > 0){
        rollUpgradeChoices()
        upgradeState.glowTimer = 90
    }else{
        upgradeState.active = false
        upgradeState.choices = []
    }
}
