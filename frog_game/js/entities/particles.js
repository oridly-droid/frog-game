/**
 * This module handles hit feedback, floating text, rings, and generic particles.
 * It is responsible for particle state and drawing, and it does not own combat decisions.
 */


import { ctx, camera, particles } from "../core/state.js"
import { clamp } from "../core/utils.js"
import { replaceCollection } from "../core/state.js"

const MAX_PARTICLES = 520

function isFiniteParticleValue(value){
    return Number.isFinite(value) || value === undefined
}

function canAddParticle(particle){
    return particle
        && isFiniteParticleValue(particle.x)
        && isFiniteParticleValue(particle.y)
        && isFiniteParticleValue(particle.vx)
        && isFiniteParticleValue(particle.vy)
        && isFiniteParticleValue(particle.life)
        && isFiniteParticleValue(particle.maxLife)
        && isFiniteParticleValue(particle.size)
        && isFiniteParticleValue(particle.radius)
        && isFiniteParticleValue(particle.growth)
}

function pushParticle(particle){
    if(!canAddParticle(particle)){
        return
    }
    particles.push(particle)
    if(particles.length > MAX_PARTICLES){
        particles.splice(0, particles.length - MAX_PARTICLES)
    }
}

export function spawnRingParticle(x, y, color, startRadius, growth, life, lineWidth = 4){
    pushParticle({
        type:"ring",
        x,
        y,
        radius:startRadius,
        growth,
        life,
        maxLife:life,
        size:lineWidth,
        color
    })
}

export function spawnHitParticles(x, y, color, count){
    for(let i = 0; i < count; i++){
        const angle = i / count * Math.PI * 2 + Math.random() * 0.5
        const speed = 1.2 + Math.random() * 1.8
        const life = 20 + Math.random() * 10
        pushParticle({
            x,
            y,
            vx:Math.cos(angle) * speed,
            vy:Math.sin(angle) * speed - 0.3,
            life,
            maxLife:life,
            size:2 + Math.random() * 3,
            color
        })
    }
}

export function spawnDamageNumber(x, y, amount, color = "#fff4d8"){
    pushParticle({
        type:"text",
        text:String(amount),
        x,
        y,
        vx:(Math.random() - 0.5) * 0.45,
        vy:-1.4 - Math.random() * 0.25,
        life:34,
        maxLife:34,
        size:16,
        color
    })
}

export function updateParticles(){
    replaceCollection(particles, particles.filter(p => {
        if(!canAddParticle(p)){
            return false
        }
        p.x += p.vx || 0
        p.y += p.vy || 0
        if(p.type === "ring"){
            p.radius += p.growth || 0
        }else{
            p.vx *= 0.96
            p.vy *= 0.96
        }
        p.life -= 1
        return Number.isFinite(p.life) && p.life > 0
    }))
}

export function drawParticles(){
    for(const p of particles){
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1)
        if(p.type === "ring"){
            ctx.strokeStyle = p.color
            ctx.lineWidth = p.size
            ctx.beginPath()
            ctx.arc(p.x - camera.x, p.y - camera.y, p.radius, 0, Math.PI * 2)
            ctx.stroke()
        }else if(p.type === "text"){
            ctx.fillStyle = p.color
            ctx.font = `700 ${p.size}px sans-serif`
            ctx.textAlign = "center"
            ctx.fillText(p.text, p.x - camera.x, p.y - camera.y)
            ctx.textAlign = "left"
        }else{
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.arc(p.x - camera.x, p.y - camera.y, p.size, 0, Math.PI * 2)
            ctx.fill()
        }
    }
    ctx.globalAlpha = 1
}
