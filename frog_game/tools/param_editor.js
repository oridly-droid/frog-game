/**
 * 该模块负责参数编辑器页面。
 * 负责读取 schema、展示表单、写入 dev_overrides 文件，以及给后续更多配置面板预留扩展接口。
 *
 * 后续若扩展到地图/区域/事件编辑，必须遵守这些硬约束：
 * 1. 绝对不要生成封闭地形。
 * 2. 不得出现外面进不去、里面出不来的区域。
 * 3. 不得出现不可达奖励区或不可达遭遇区。
 * 4. 所有新增区域必须可进入、可离开、可通行。
 * 5. 地图始终要保持明确通道。
 */

import {
    defaultPlayerConfig,
    playerConfigSchema,
    exportPlayerConfig,
    applyPlayerConfig,
} from "../js/config/player_config.js"
import {
    defaultEnemyConfig,
    enemyConfigSchema,
    exportEnemyConfig,
    applyEnemyConfig,
} from "../js/config/enemy_config.js"
import {
    loadConfigOverrides,
    getConfigOverrideMeta,
} from "../js/config/config_loader.js"

const HANDLE_DB_NAME = "frog_game_param_editor"
const HANDLE_STORE_NAME = "fs_handles"
const DIRECTORY_HANDLE_KEY = "dev_overrides_directory"
const PLAYER_OVERRIDE_FILE = "player.override.json"
const ENEMY_OVERRIDE_FILE = "enemy.override.json"

const sectionNav = document.getElementById("section-nav")
const panelTitle = document.getElementById("panel-title")
const panelSubtitle = document.getElementById("panel-subtitle")
const contentRoot = document.getElementById("content-root")
const statusMessage = document.getElementById("status-message")
const bindingStatus = document.getElementById("binding-status")
const sourceStatus = document.getElementById("source-status")
const autoSaveToggle = document.getElementById("autosave-toggle")
const jsonArea = document.getElementById("json-area")
const futureRulesList = document.getElementById("future-rules-list")

const bindDirectoryButton = document.getElementById("bind-directory-button")
const applyButton = document.getElementById("apply-button")
const clearOverrideButton = document.getElementById("clear-override-button")
const resetButton = document.getElementById("reset-button")
const exportButton = document.getElementById("export-button")
const copyButton = document.getElementById("copy-button")
const importButton = document.getElementById("import-button")

const FUTURE_RULES = [
    "地图工具必须禁止封闭地形，所有新区域都要可进入、可离开、可通行。",
    "奖励点、遭遇点、事件点必须始终可达，不能刷在死区或隔离区。",
    "未来新增 encounter / progression / event 编辑时，继续沿用英文 key + 中文界面标签。"
]

const editorSections = [
    {id:"player", labelZh:"主角参数", subtitleZh:"基础 / 技能 / 异常默认值", type:"ready"},
    {id:"enemies", labelZh:"怪物参数", subtitleZh:"按敌人类型编辑默认参数", type:"ready"},
    {id:"encounters", labelZh:"遭遇配置", subtitleZh:"后续接入", type:"placeholder"},
    {id:"progression", labelZh:"成长配置", subtitleZh:"后续接入", type:"placeholder"},
    {id:"events", labelZh:"事件配置", subtitleZh:"后续接入", type:"placeholder"}
]

let currentSectionId = "player"
let currentEnemyId = "ant"
let playerDraft = clone(defaultPlayerConfig)
let enemyDraft = clone(defaultEnemyConfig)
let currentFieldErrors = {}
let overrideMeta = getConfigOverrideMeta()
let directoryHandle = null
let autoSaveTimer = null

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function arraysEqual(a, b){
    return JSON.stringify(a) === JSON.stringify(b)
}

function isPlainObject(value){
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function setStatus(message, isError = false){
    statusMessage.textContent = message
    statusMessage.classList.toggle("error", isError)
}

function setSourceBadge(text, tone = ""){
    sourceStatus.textContent = `来源：${text}`
    sourceStatus.className = `meta-pill ${tone}`.trim()
}

function updateBindingStatus(){
    if(directoryHandle){
        bindingStatus.textContent = `已绑定目录：${directoryHandle.name}`
        bindingStatus.className = "meta-pill override"
    }else{
        bindingStatus.textContent = "未绑定配置目录"
        bindingStatus.className = "meta-pill warning"
    }
}

function updateSourceStatus(){
    if(currentSectionId === "player"){
        const sourceLabel = overrideMeta.player && overrideMeta.player.hasOverride ? "本地 override 覆盖中" : "默认配置"
        setSourceBadge(sourceLabel, overrideMeta.player && overrideMeta.player.hasOverride ? "override" : "")
    }else if(currentSectionId === "enemies"){
        const sourceLabel = overrideMeta.enemy && overrideMeta.enemy.hasOverride ? "本地 override 覆盖中" : "默认配置"
        setSourceBadge(sourceLabel, overrideMeta.enemy && overrideMeta.enemy.hasOverride ? "override" : "")
    }else{
        setSourceBadge("预留扩展区")
    }
}

function renderSidebar(){
    sectionNav.innerHTML = ""
    for(const section of editorSections){
        const button = document.createElement("button")
        button.type = "button"
        button.className = `nav-button ${section.type === "placeholder" ? "placeholder" : ""} ${section.id === currentSectionId ? "active" : ""}`
        button.innerHTML = `<strong>${section.labelZh}</strong><span>${section.subtitleZh}</span>`
        button.addEventListener("click", () => {
            currentSectionId = section.id
            currentFieldErrors = {}
            render()
        })
        sectionNav.appendChild(button)
    }
}

function renderFutureRules(){
    futureRulesList.innerHTML = ""
    for(const rule of FUTURE_RULES){
        const item = document.createElement("li")
        item.textContent = rule
        futureRulesList.appendChild(item)
    }
}

function buildFieldCard(field, value, errorText, onInput){
    const wrapper = document.createElement("div")
    wrapper.className = `field-card ${errorText ? "invalid" : ""}`

    const label = document.createElement("label")
    label.textContent = field.labelZh
    const key = document.createElement("span")
    key.className = "field-key"
    key.textContent = field.key
    label.appendChild(key)
    wrapper.appendChild(label)

    let input
    if(field.type === "tags"){
        input = document.createElement("textarea")
        input.value = Array.isArray(value) ? value.join(", ") : ""
    }else{
        input = document.createElement("input")
        input.type = field.type === "number" ? "number" : "text"
        input.value = value !== undefined && value !== null ? value : ""
        if(field.min !== undefined) input.min = String(field.min)
        if(field.max !== undefined) input.max = String(field.max)
        if(field.step !== undefined) input.step = String(field.step)
        if(field.readOnly) input.readOnly = true
    }

    input.addEventListener("input", event => onInput(field, event.target.value))
    wrapper.appendChild(input)

    if(field.descriptionZh){
        const desc = document.createElement("div")
        desc.className = "field-desc"
        desc.textContent = field.descriptionZh
        wrapper.appendChild(desc)
    }

    if(errorText){
        const error = document.createElement("div")
        error.className = "field-error"
        error.textContent = errorText
        wrapper.appendChild(error)
    }

    return wrapper
}

function validateFieldValue(field, rawValue){
    if(field.readOnly){
        return {ok:true, value:rawValue}
    }

    if(field.type === "number"){
        if(rawValue === "" || rawValue === null || rawValue === undefined){
            return {ok:false, error:"数值不能为空。"}
        }
        const value = Number(rawValue)
        if(!Number.isFinite(value)){
            return {ok:false, error:"请输入合法数字。"}
        }
        if(field.min !== undefined && value < field.min){
            return {ok:false, error:`不能小于 ${field.min}。`}
        }
        if(field.max !== undefined && value > field.max){
            return {ok:false, error:`不能大于 ${field.max}。`}
        }
        return {ok:true, value:value}
    }

    if(field.type === "tags"){
        if(typeof rawValue !== "string"){
            return {ok:false, error:"标签必须是文本。"}
        }
        return {
            ok:true,
            value:rawValue.split(",").map(item => item.trim()).filter(Boolean)
        }
    }

    if(typeof rawValue !== "string" || !rawValue.trim()){
        return {ok:false, error:"文本不能为空。"}
    }

    return {ok:true, value:rawValue.trim()}
}

function validatePlayerDraft(){
    const errors = {}
    for(const section of playerConfigSchema){
        for(const field of section.fields){
            const result = validateFieldValue(field, playerDraft[field.key])
            if(!result.ok){
                errors[field.key] = result.error
            }
        }
    }
    return errors
}

function validateEnemyEntry(entry){
    const errors = {}
    for(const field of enemyConfigSchema){
        const result = validateFieldValue(field, entry[field.key])
        if(!result.ok){
            errors[field.key] = result.error
        }
    }
    return errors
}

function validateAllEnemies(){
    const errorsByEnemy = {}
    for(const enemyId of Object.keys(enemyDraft)){
        const entryErrors = validateEnemyEntry(enemyDraft[enemyId])
        if(Object.keys(entryErrors).length > 0){
            errorsByEnemy[enemyId] = entryErrors
        }
    }
    return errorsByEnemy
}

function renderPlayerPanel(){
    const card = document.createElement("div")
    card.className = "panel-card"

    for(const section of playerConfigSchema){
        const sectionNode = document.createElement("section")
        sectionNode.className = "form-section"
        sectionNode.innerHTML = `<h3>${section.titleZh}</h3>`
        const grid = document.createElement("div")
        grid.className = "field-grid"

        for(const field of section.fields){
            const errorText = currentFieldErrors[field.key]
            grid.appendChild(buildFieldCard(field, playerDraft[field.key], errorText, function(targetField, nextValue){
                playerDraft[targetField.key] = nextValue
                scheduleAutoSave()
            }))
        }

        sectionNode.appendChild(grid)
        card.appendChild(sectionNode)
    }

    contentRoot.appendChild(card)
}

function buildEnemySidebar(){
    const sidebar = document.createElement("div")
    sidebar.className = "enemy-list"

    for(const enemyId of Object.keys(enemyDraft)){
        const enemy = enemyDraft[enemyId]
        const button = document.createElement("button")
        button.type = "button"
        button.className = `enemy-tab ${enemyId === currentEnemyId ? "active" : ""}`
        button.innerHTML = `${enemy.nameZh}<small>${enemy.id}</small>`
        button.addEventListener("click", () => {
            currentEnemyId = enemyId
            currentFieldErrors = {}
            render()
        })
        sidebar.appendChild(button)
    }

    return sidebar
}

function renderEnemyPanel(){
    const wrapper = document.createElement("div")
    wrapper.className = "panel-card enemy-layout"
    wrapper.appendChild(buildEnemySidebar())

    const details = document.createElement("div")
    details.className = "form-section"
    details.innerHTML = `<h3>${enemyDraft[currentEnemyId].nameZh}</h3>`
    const grid = document.createElement("div")
    grid.className = "field-grid"

    for(const field of enemyConfigSchema){
        const errorText = currentFieldErrors[field.key]
        grid.appendChild(buildFieldCard(field, enemyDraft[currentEnemyId][field.key], errorText, function(targetField, nextValue){
            enemyDraft[currentEnemyId][targetField.key] = nextValue
            scheduleAutoSave()
        }))
    }

    details.appendChild(grid)
    wrapper.appendChild(details)
    contentRoot.appendChild(wrapper)
}

function renderPlaceholderPanel(section){
    const card = document.createElement("div")
    card.className = "placeholder-card"
    card.innerHTML = `
        <h3>${section.labelZh}</h3>
        <p>该面板为后续扩展预留，目前先不开放编辑。</p>
        <p>建议下一步接入：字段 schema、校验、override 文件、以及和游戏读取层一致的配置模块。</p>
    `
    contentRoot.appendChild(card)
}

function render(){
    renderSidebar()
    contentRoot.innerHTML = ""

    const section = editorSections.find(item => item.id === currentSectionId)
    panelTitle.textContent = section.labelZh
    panelSubtitle.textContent = section.type === "ready"
        ? "修改后会写入 dev_overrides override 文件，刷新游戏页即可生效。"
        : "当前为预留扩展区，结构已为后续 encounter / progression / event 配置准备好。"

    updateBindingStatus()
    updateSourceStatus()

    if(currentSectionId === "player"){
        renderPlayerPanel()
    }else if(currentSectionId === "enemies"){
        renderEnemyPanel()
    }else{
        renderPlaceholderPanel(section)
    }
}

function exportAllConfigs(){
    return {
        player:clone(playerDraft),
        enemies:clone(enemyDraft)
    }
}

function fillJsonAreaWithExport(){
    jsonArea.value = JSON.stringify(exportAllConfigs(), null, 2)
}

function buildPlayerOverridePayload(){
    const payload = {}
    for(const section of playerConfigSchema){
        for(const field of section.fields){
            if(field.readOnly){
                continue
            }
            const nextValue = playerDraft[field.key]
            const defaultValue = defaultPlayerConfig[field.key]
            const normalized = field.type === "tags"
                ? (typeof nextValue === "string" ? nextValue.split(",").map(item => item.trim()).filter(Boolean) : nextValue)
                : (field.type === "number" ? Number(nextValue) : nextValue)

            if(field.type === "tags"){
                if(!arraysEqual(normalized || [], defaultValue || [])){
                    payload[field.key] = normalized
                }
            }else if(normalized !== defaultValue){
                payload[field.key] = normalized
            }
        }
    }
    return payload
}

function buildEnemyOverridePayload(){
    const payload = {}
    for(const enemyId of Object.keys(enemyDraft)){
        const entryOverride = {}
        const draftEntry = enemyDraft[enemyId]
        const defaultEntry = defaultEnemyConfig[enemyId]

        for(const field of enemyConfigSchema){
            if(field.readOnly){
                continue
            }
            let nextValue = draftEntry[field.key]
            const defaultValue = defaultEntry[field.key]

            if(field.type === "number"){
                nextValue = Number(nextValue)
                if(nextValue !== defaultValue){
                    entryOverride[field.key] = nextValue
                }
            }else if(field.type === "tags"){
                const normalized = typeof nextValue === "string"
                    ? nextValue.split(",").map(item => item.trim()).filter(Boolean)
                    : (Array.isArray(nextValue) ? nextValue : [])
                if(!arraysEqual(normalized, defaultValue || [])){
                    entryOverride[field.key] = normalized
                }
            }else if(nextValue !== defaultValue){
                entryOverride[field.key] = nextValue
            }
        }

        if(Object.keys(entryOverride).length > 0){
            payload[enemyId] = entryOverride
        }
    }
    return payload
}

function openHandleDatabase(){
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(HANDLE_DB_NAME, 1)
        request.onupgradeneeded = function(event){
            const db = event.target.result
            if(!db.objectStoreNames.contains(HANDLE_STORE_NAME)){
                db.createObjectStore(HANDLE_STORE_NAME)
            }
        }
        request.onsuccess = function(){
            resolve(request.result)
        }
        request.onerror = function(){
            reject(request.error)
        }
    })
}

async function withHandleStore(mode, callback){
    const db = await openHandleDatabase()
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HANDLE_STORE_NAME, mode)
        const store = transaction.objectStore(HANDLE_STORE_NAME)
        const request = callback(store)
        transaction.oncomplete = function(){
            resolve(request && request.result !== undefined ? request.result : null)
            db.close()
        }
        transaction.onerror = function(){
            reject(transaction.error)
            db.close()
        }
        transaction.onabort = function(){
            reject(transaction.error)
            db.close()
        }
    })
}

async function saveDirectoryHandle(handle){
    return withHandleStore("readwrite", store => store.put(handle, DIRECTORY_HANDLE_KEY))
}

async function loadStoredDirectoryHandle(){
    return withHandleStore("readonly", store => store.get(DIRECTORY_HANDLE_KEY))
}

async function clearStoredDirectoryHandle(){
    return withHandleStore("readwrite", store => store.delete(DIRECTORY_HANDLE_KEY))
}

async function ensureDirectoryPermission(handle, requestPermission){
    const options = {mode:"readwrite"}
    if(!handle || !handle.queryPermission){
        return false
    }
    const currentPermission = await handle.queryPermission(options)
    if(currentPermission === "granted"){
        return true
    }
    if(!requestPermission){
        return false
    }
    const nextPermission = await handle.requestPermission(options)
    return nextPermission === "granted"
}

async function bindDirectoryHandle(){
    if(!window.showDirectoryPicker){
        setStatus("当前浏览器不支持文件系统访问接口，请使用桌面 Chrome。", true)
        return
    }

    try{
        const handle = await window.showDirectoryPicker({mode:"readwrite"})
        if(handle.name !== "dev_overrides"){
            setStatus("请绑定 frog_game/dev_overrides 目录，而不是其它目录。", true)
            return
        }

        const granted = await ensureDirectoryPermission(handle, true)
        if(!granted){
            setStatus("未获得目录写入权限，无法保存 override 文件。", true)
            return
        }

        directoryHandle = handle
        await saveDirectoryHandle(handle)
        updateBindingStatus()
        setStatus("配置目录已绑定。之后修改参数会自动保存到 override 文件。")
        render()
    }catch(error){
        if(error && error.name === "AbortError"){
            setStatus("已取消绑定目录。")
            return
        }
        setStatus("绑定目录失败，请重试。", true)
    }
}

async function restoreDirectoryBinding(){
    try{
        const handle = await loadStoredDirectoryHandle()
        if(!handle){
            updateBindingStatus()
            return
        }

        const granted = await ensureDirectoryPermission(handle, false)
        if(!granted){
            directoryHandle = null
            updateBindingStatus()
            setStatus("已发现旧目录绑定，但当前权限失效，请重新点击“绑定配置目录”。")
            return
        }

        directoryHandle = handle
        updateBindingStatus()
    }catch(error){
        directoryHandle = null
        updateBindingStatus()
    }
}

async function writeOverrideFile(filename, payload){
    if(!directoryHandle){
        throw new Error("尚未绑定配置目录。")
    }

    const granted = await ensureDirectoryPermission(directoryHandle, true)
    if(!granted){
        directoryHandle = null
        await clearStoredDirectoryHandle()
        throw new Error("目录写入权限已失效，请重新绑定配置目录。")
    }

    const fileHandle = await directoryHandle.getFileHandle(filename, {create:true})
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(payload, null, 2))
    await writable.close()
}

async function saveOverrideFiles(showSuccessMessage){
    if(currentSectionId === "player"){
        currentFieldErrors = validatePlayerDraft()
        if(Object.keys(currentFieldErrors).length > 0){
            render()
            setStatus("主角参数存在非法值，请先修正。", true)
            return false
        }
    }else if(currentSectionId === "enemies"){
        const allEnemyErrors = validateAllEnemies()
        currentFieldErrors = allEnemyErrors[currentEnemyId] || {}
        if(Object.keys(allEnemyErrors).length > 0){
            render()
            setStatus("怪物参数存在非法值，请先修正。", true)
            return false
        }
    }

    if(!directoryHandle){
        setStatus("请先点击“绑定配置目录”，选择 frog_game/dev_overrides。", true)
        return false
    }

    try{
        await writeOverrideFile(PLAYER_OVERRIDE_FILE, buildPlayerOverridePayload())
        await writeOverrideFile(ENEMY_OVERRIDE_FILE, buildEnemyOverridePayload())
        await loadConfigOverrides()
        overrideMeta = getConfigOverrideMeta()
        applyPlayerConfig(playerDraft)
        applyEnemyConfig(enemyDraft)
        fillJsonAreaWithExport()
        render()
        if(showSuccessMessage){
            setStatus("override 文件已保存。刷新游戏页后立即生效。")
        }
        return true
    }catch(error){
        setStatus(error && error.message ? error.message : "保存 override 文件失败。", true)
        updateBindingStatus()
        render()
        return false
    }
}

function scheduleAutoSave(){
    if(!autoSaveToggle.checked){
        return
    }
    if(currentSectionId !== "player" && currentSectionId !== "enemies"){
        return
    }
    if(!directoryHandle){
        return
    }

    clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(function(){
        saveOverrideFiles(false).then(function(saved){
            if(saved){
                setStatus("已自动保存到 override 文件。")
            }
        })
    }, 450)
}

function handleResetDraft(){
    currentFieldErrors = {}
    if(currentSectionId === "player"){
        playerDraft = clone(defaultPlayerConfig)
        setStatus("主角草稿已恢复默认值，保存后会覆盖 player.override.json。")
    }else if(currentSectionId === "enemies"){
        enemyDraft = clone(defaultEnemyConfig)
        currentEnemyId = Object.keys(enemyDraft)[0]
        setStatus("怪物草稿已恢复默认值，保存后会覆盖 enemy.override.json。")
    }else{
        setStatus("预留面板当前没有可重置内容。")
    }
    render()
}

async function handleClearOverride(){
    if(currentSectionId !== "player" && currentSectionId !== "enemies"){
        setStatus("预留面板当前没有 override 文件。")
        return
    }
    if(!directoryHandle){
        setStatus("请先绑定 dev_overrides 目录。", true)
        return
    }

    if(currentSectionId === "player"){
        playerDraft = clone(defaultPlayerConfig)
        try{
            await writeOverrideFile(PLAYER_OVERRIDE_FILE, {})
            await loadConfigOverrides()
            overrideMeta = getConfigOverrideMeta()
            applyPlayerConfig(playerDraft)
            setStatus("player.override.json 已清空，当前回到默认配置。")
        }catch(error){
            setStatus(error && error.message ? error.message : "清空 player override 失败。", true)
        }
    }else{
        enemyDraft = clone(defaultEnemyConfig)
        currentEnemyId = Object.keys(enemyDraft)[0]
        try{
            await writeOverrideFile(ENEMY_OVERRIDE_FILE, {})
            await loadConfigOverrides()
            overrideMeta = getConfigOverrideMeta()
            applyEnemyConfig(enemyDraft)
            setStatus("enemy.override.json 已清空，当前回到默认配置。")
        }catch(error){
            setStatus(error && error.message ? error.message : "清空 enemy override 失败。", true)
        }
    }

    currentFieldErrors = {}
    fillJsonAreaWithExport()
    render()
}

function handleCopy(){
    fillJsonAreaWithExport()
    navigator.clipboard.writeText(jsonArea.value).then(function(){
        setStatus("当前配置 JSON 已复制到剪贴板。")
    }).catch(function(){
        setStatus("复制失败，请手动复制 JSON。", true)
    })
}

function downloadJson(filename, content){
    const blob = new Blob([content], {type:"application/json"})
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
}

function handleExport(){
    fillJsonAreaWithExport()
    downloadJson("frog_game_param_config.json", jsonArea.value)
    setStatus("当前配置已导出为 JSON。")
}

function handleImport(){
    let parsed
    try{
        parsed = JSON.parse(jsonArea.value)
    }catch(error){
        setStatus("JSON 格式不合法，无法导入。", true)
        return
    }

    if(!isPlainObject(parsed)){
        setStatus("导入内容必须是对象。", true)
        return
    }

    if(parsed.player && isPlainObject(parsed.player)){
        playerDraft = Object.assign({}, playerDraft, parsed.player)
    }else if(currentSectionId === "player"){
        playerDraft = Object.assign({}, playerDraft, parsed)
    }

    if(parsed.enemies && isPlainObject(parsed.enemies)){
        for(const enemyId of Object.keys(enemyDraft)){
            if(parsed.enemies[enemyId] && isPlainObject(parsed.enemies[enemyId])){
                enemyDraft[enemyId] = Object.assign({}, enemyDraft[enemyId], parsed.enemies[enemyId])
            }
        }
    }

    currentFieldErrors = {}
    render()
    setStatus("JSON 已载入到草稿。检查后可手动保存或等待自动保存。")
    scheduleAutoSave()
}

bindDirectoryButton.addEventListener("click", bindDirectoryHandle)
applyButton.addEventListener("click", function(){
    saveOverrideFiles(true)
})
clearOverrideButton.addEventListener("click", handleClearOverride)
resetButton.addEventListener("click", handleResetDraft)
exportButton.addEventListener("click", handleExport)
copyButton.addEventListener("click", handleCopy)
importButton.addEventListener("click", handleImport)
autoSaveToggle.addEventListener("change", function(){
    if(autoSaveToggle.checked){
        setStatus("自动保存已开启。修改参数后会写入 override 文件。")
        scheduleAutoSave()
    }else{
        clearTimeout(autoSaveTimer)
        setStatus("自动保存已关闭。请手动点击“立即保存”。")
    }
})

async function bootstrap(){
    await loadConfigOverrides()
    overrideMeta = getConfigOverrideMeta()
    playerDraft = clone(exportPlayerConfig())
    enemyDraft = clone(exportEnemyConfig())
    currentEnemyId = Object.keys(enemyDraft)[0]
    await restoreDirectoryBinding()
    renderFutureRules()
    fillJsonAreaWithExport()
    render()
    setStatus("已加载默认配置与 override 配置。首次使用请先绑定 dev_overrides 目录。")
}

bootstrap()
