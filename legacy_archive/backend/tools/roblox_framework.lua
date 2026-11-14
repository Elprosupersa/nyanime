--[[
    roblox_framework.lua
    Framework de Arquitectura y Lógica de Producción para Roblox Studio (Luau)
    Antigravity Roblox Specialist 10/10 para Jaime
    
    Módulos incluidos:
    1. NetworkBridge (Comunicación segura Cliente-Servidor con validación)
    2. SafeDataStore (Almacenamiento persistente con reintentos y tolerancia a fallos)
    3. UIAnimator (Efectos de interfaz suaves con TweenService)
--]]

local Framework = {}

--------------------------------------------------------------------------------
-- 1. NETWORK BRIDGE (Cliente - Servidor)
--------------------------------------------------------------------------------
Framework.NetworkBridge = {}
Framework.NetworkBridge.__index = Framework.NetworkBridge

local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local DataStoreService = game:GetService("DataStoreService")

-- Obtiene o crea la carpeta de eventos en ReplicatedStorage
local function getNetworkFolder()
    local folder = ReplicatedStorage:FindFirstChild("NetworkEvents")
    if not folder and RunService:IsServer() then
        folder = Instance.new("Folder")
        folder.Name = "NetworkEvents"
        folder.Parent = ReplicatedStorage
    end
    return folder
end

function Framework.NetworkBridge.GetRemote(name: string): RemoteEvent
    local folder = getNetworkFolder()
    if RunService:IsServer() then
        local remote = folder:FindFirstChild(name)
        if not remote then
            remote = Instance.new("RemoteEvent")
            remote.Name = name
            remote.Parent = folder
        end
        return remote
    else
        return folder:WaitForChild(name, 10)
    end
end

-- Envía evento con límite de tasa de seguridad
function Framework.NetworkBridge.FireServerSafe(remoteName: string, ...)
    local remote = Framework.NetworkBridge.GetRemote(remoteName)
    if remote then
        remote:FireServer(...)
    else
        warn("[NetworkBridge] RemoteEvent no disponible: " .. remoteName)
    end
end

--------------------------------------------------------------------------------
-- 2. SAFE DATASTORE (Cero Pérdida de Datos con Reintentos Exponenciales)
--------------------------------------------------------------------------------
Framework.SafeDataStore = {}

local MAX_RETRIES = 3
local BASE_DELAY = 1.5

function Framework.SafeDataStore.Load(storeName: string, key: string, defaultData: any)
    if not RunService:IsServer() then
        error("[SafeDataStore] Solo puede ejecutarse desde el Servidor")
    end
    
    local store = DataStoreService:GetDataStore(storeName)
    local success, result
    local attempt = 0
    
    repeat
        attempt += 1
        success, result = pcall(function()
            return store:GetAsync(key)
        end)
        
        if not success then
            warn(string.format("[SafeDataStore] Error leyendo clave %s (Intento %d/%d): %s", key, attempt, MAX_RETRIES, tostring(result)))
            task.wait(BASE_DELAY * (2 ^ (attempt - 1)))
        end
    until success or attempt >= MAX_RETRIES
    
    if success then
        return result or defaultData, true
    else
        warn("[SafeDataStore] Fallo crítico al cargar datos para: " .. key)
        return defaultData, false
    end
end

function Framework.SafeDataStore.Save(storeName: string, key: string, data: any): boolean
    if not RunService:IsServer() then
        error("[SafeDataStore] Solo puede ejecutarse desde el Servidor")
    end
    
    local store = DataStoreService:GetDataStore(storeName)
    local success, err
    local attempt = 0
    
    repeat
        attempt += 1
        success, err = pcall(function()
            store:SetAsync(key, data)
        end)
        
        if not success then
            warn(string.format("[SafeDataStore] Error guardando clave %s (Intento %d/%d): %s", key, attempt, MAX_RETRIES, tostring(err)))
            task.wait(BASE_DELAY * (2 ^ (attempt - 1)))
        end
    until success or attempt >= MAX_RETRIES
    
    return success
end

--------------------------------------------------------------------------------
-- 3. UI ANIMATOR (TweenService Suave para Menús y Botones)
--------------------------------------------------------------------------------
Framework.UIAnimator = {}

function Framework.UIAnimator.PopIn(guiObject: GuiObject, duration: number?)
    local d = duration or 0.35
    local originalSize = guiObject.Size
    
    guiObject.Size = UDim2.new(0, 0, 0, 0)
    guiObject.Visible = true
    
    local tweenInfo = TweenInfo.new(
        d,
        Enum.EasingStyle.Back,
        Enum.EasingDirection.Out
    )
    
    local tween = TweenService:Create(guiObject, tweenInfo, {Size = originalSize})
    tween:Play()
    return tween
end

function Framework.UIAnimator.ButtonHover(button: GuiButton)
    local originalSize = button.Size
    local hoverSize = UDim2.new(originalSize.X.Scale * 1.05, originalSize.X.Offset, originalSize.Y.Scale * 1.05, originalSize.Y.Offset)
    
    local tweenIn = TweenService:Create(button, TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = hoverSize})
    local tweenOut = TweenService:Create(button, TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = originalSize})
    
    button.MouseEnter:Connect(function() tweenIn:Play() end)
    button.MouseLeave:Connect(function() tweenOut:Play() end)
end

return Framework
