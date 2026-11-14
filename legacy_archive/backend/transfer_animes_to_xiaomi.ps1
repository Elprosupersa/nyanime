# ==============================================================================
# SCRIPT DE TRANSFERENCIA ULTRA RÁPIDA DE ANIMES A XIAOMI 14T PRO
# Organizador Anime Antigravity - Protocolo de Saturación USB / MTP
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "===================================================================="
Write-Host "  INICIANDO PROTOCOLO DE TRANSFERENCIA DE ANIMES AL CELULAR"
Write-Host "===================================================================="

# 1. Conexión COM al Shell de Windows
$shell = New-Object -ComObject Shell.Application
$pc = $shell.Namespace(17) # ssfDRIVES

$device = $null
foreach ($item in $pc.Items()) {
    if ($item.Name -match 'Xiaomi|14T|Phone') {
        $device = $item
        break
    }
}

if (-not $device) {
    Write-Error "No se encontro el dispositivo Xiaomi conectado."
    exit 1
}

Write-Host "[+] Dispositivo detectado: $($device.Name)"

$storage = $null
foreach ($st in $device.GetFolder.Items()) {
    if ($st.Name -match 'Almacenamiento interno|Internal storage') {
        $storage = $st
        break
    }
}

if (-not $storage) {
    Write-Error "No se encontro el Almacenamiento Interno Compartido."
    exit 1
}

Write-Host "[+] Almacenamiento: $($storage.Name)"
$storageFolder = $storage.GetFolder

# 2. Localizar o crear carpeta Anime en el celular
$animeItem = $null
foreach ($f in $storageFolder.Items()) {
    if ($f.Name -eq 'Anime') {
        $animeItem = $f
        break
    }
}

if (-not $animeItem) {
    Write-Host "[*] Creando carpeta principal Anime en el celular..."
    $storageFolder.NewFolder('Anime')
    Start-Sleep -Seconds 2
    foreach ($f in $storageFolder.Items()) {
        if ($f.Name -eq 'Anime') {
            $animeItem = $f
            break
        }
    }
}

$destAnimeFolder = $animeItem.GetFolder
Write-Host "[+] Directorio destino listo: Almacenamiento interno compartido\Anime"

# Función para contar archivos recursivamente en MTP
function Get-MtpItemCount($folderObj) {
    $count = 0
    try {
        foreach ($sub in $folderObj.Items()) {
            if ($sub.IsFolder) {
                $count += Get-MtpItemCount $sub.GetFolder
            } else {
                $count++
            }
        }
    } catch {}
    return $count
}

# 3. Definición de las 4 series a transferir
$sourceBasePath = "E:\Anime\03 - Heavy Ecchi (Sin Censura BD)"
$seriesList = @(
    "Mahou Shoujo ni Akogarete",
    "Prison School",
    "Mato Seihei no Slave",
    "High School DxD"
)

$srcShellNamespace = $shell.Namespace($sourceBasePath)

$globalStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$seriesIndex = 0

foreach ($seriesName in $seriesList) {
    $seriesIndex++
    $localSeriesPath = Join-Path $sourceBasePath $seriesName
    
    if (-not (Test-Path $localSeriesPath)) {
        Write-Warning "No se encontro la ruta local para $seriesName en $localSeriesPath"
        continue
    }

    # Censo local de archivos de la serie
    $localFiles = Get-ChildItem -Path $localSeriesPath -Recurse -File
    $localVideos = $localFiles | Where-Object { $_.Extension -in @('.mp4', '.mkv', '.avi') }
    $totalLocalBytes = ($localFiles | Measure-Object -Property Length -Sum).Sum
    $totalLocalMB = [math]::Round($totalLocalBytes / 1MB, 2)
    $totalLocalGB = [math]::Round($totalLocalBytes / 1GB, 2)
    $totalLocalCount = $localFiles.Count
    $totalVideoCount = $localVideos.Count

    Write-Host ""
    Write-Host "--------------------------------------------------------------------"
    Write-Host "[$seriesIndex/4] SERIE: $seriesName"
    Write-Host "    Archivos totales: $totalLocalCount ($totalVideoCount episodios de video)"
    Write-Host "    Peso total: $totalLocalGB GB ($totalLocalMB MB)"
    Write-Host "--------------------------------------------------------------------"

    # Verificar si ya existe en el celular
    $destSeriesItem = $null
    foreach ($it in $destAnimeFolder.Items()) {
        if ($it.Name -eq $seriesName) {
            $destSeriesItem = $it
            break
        }
    }

    $alreadyCopied = $false
    if ($destSeriesItem) {
        $currentCount = Get-MtpItemCount $destSeriesItem.GetFolder
        if ($currentCount -ge $totalLocalCount) {
            Write-Host "    [OK] La serie ya se encuentra transferida al 100% en el celular ($currentCount de $totalLocalCount archivos)."
            $alreadyCopied = $true
        } else {
            Write-Host "    [*] Detectada copia previa parcial ($currentCount de $totalLocalCount archivos). Continuando..."
        }
    }

    if (-not $alreadyCopied) {
        $seriesFolderItem = $srcShellNamespace.ParseName($seriesName)
        if (-not $seriesFolderItem) {
            Write-Error "No se pudo obtener el FolderItem de Shell para $seriesName"
            continue
        }

        Write-Host "    [>>] Iniciando transferencia via Shell CopyHere hacia Xiaomi 14T Pro..."
        $seriesStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        # 16 = FOF_NOCONFIRMATION
        $destAnimeFolder.CopyHere($seriesFolderItem, 16)

        # Monitoreo activo de progreso
        $lastReport = 0
        $maxWaitSeconds = 1800 # 30 minutos máximo por serie
        $waitInterval = 3

        while ($true) {
            Start-Sleep -Seconds $waitInterval

            # Re-buscar el item en destino
            $destSeriesItem = $null
            foreach ($it in $destAnimeFolder.Items()) {
                if ($it.Name -eq $seriesName) {
                    $destSeriesItem = $it
                    break
                }
            }

            if ($destSeriesItem) {
                $destCount = Get-MtpItemCount $destSeriesItem.GetFolder
                $elapsedSec = [math]::Max(1, [math]::Round($seriesStopwatch.ElapsedMilliseconds / 1000, 1))
                $pct = [math]::Min(100.0, [math]::Round(($destCount / $totalLocalCount) * 100, 1))
                
                # Reportar progreso cada ~6 segundos o al completar
                if (($seriesStopwatch.ElapsedMilliseconds - $lastReport -ge 6000) -or ($destCount -ge $totalLocalCount)) {
                    $lastReport = $seriesStopwatch.ElapsedMilliseconds
                    Write-Host "    -> Progreso: $destCount / $totalLocalCount archivos ($pct%) | Tiempo: ${elapsedSec}s"
                }

                if ($destCount -ge $totalLocalCount) {
                    Start-Sleep -Seconds 5
                    $destCountFinal = Get-MtpItemCount $destSeriesItem.GetFolder
                    $seriesStopwatch.Stop()
                    $finalSec = [math]::Round($seriesStopwatch.ElapsedMilliseconds / 1000, 1)
                    $speed = [math]::Round($totalLocalMB / [math]::Max(1, $finalSec), 2)
                    Write-Host "    [OK] $seriesName TRANSFERIDO AL 100%! ($destCountFinal/$totalLocalCount archivos en ${finalSec}s @ ~$speed MB/s)"
                    break
                }
            }

            if (($seriesStopwatch.ElapsedMilliseconds / 1000) -gt $maxWaitSeconds) {
                Write-Warning "    [!] Tiempo limite de espera alcanzado para $seriesName."
                break
            }
        }
    }
}

$globalStopwatch.Stop()
$totalGlobalMin = [math]::Round($globalStopwatch.ElapsedMilliseconds / 60000, 2)

Write-Host ""
Write-Host "===================================================================="
Write-Host "  AUDITORIA FINAL FORENSE EN XIAOMI 14T PRO"
Write-Host "===================================================================="

foreach ($seriesName in $seriesList) {
    $found = $null
    foreach ($it in $destAnimeFolder.Items()) {
        if ($it.Name -eq $seriesName) {
            $found = $it
            break
        }
    }
    if ($found) {
        $c = Get-MtpItemCount $found.GetFolder
        Write-Host "  [VERIFICADO] $seriesName -> En celular ($c archivos presentes)"
    } else {
        Write-Host "  [ERROR] $seriesName -> No encontrado en celular"
    }
}

Write-Host ""
Write-Host "===================================================================="
Write-Host "  TRANSFERENCIA COMPLETADA EXITOSAMENTE EN $totalGlobalMin MINUTOS"
Write-Host "===================================================================="
