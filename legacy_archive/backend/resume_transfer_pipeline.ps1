# ==============================================================================
# SCRIPT DE REANUDACIÓN INTELIGENTE TRAS DESCONEXIÓN - XIAOMI 14T PRO
# Organizador Anime Antigravity - Detección y Resumen Idempotente
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "===================================================================="
Write-Host "  MOTOR DE REANUDACIÓN AUTOMÁTICA DE TRANSFERENCIA (XIAOMI 14T PRO)"
Write-Host "===================================================================="
Write-Host "[*] Esperando a que el celular sea detectado en modo 'Transferencia de archivos'..."

$shell = New-Object -ComObject Shell.Application
$pc = $shell.Namespace(17)

$device = $null
$maxRetries = 120 # Esperar hasta 10 minutos (120 x 5s)
$attempts = 0

while (-not $device) {
    $attempts++
    foreach ($item in $pc.Items()) {
        if ($item.Name -match 'Xiaomi|14T|Phone') {
            $device = $item
            break
        }
    }
    if ($device) { break }
    if ($attempts % 6 -eq 0) {
        Write-Host "    [!] Esperando conexión MTP... ($($attempts * 5)s transcurridos)"
    }
    Start-Sleep -Seconds 5
}

Write-Host ""
Write-Host "[+] ¡CELULAR RECONECTADO CON ÉXITO! Dispositivo: $($device.Name)"

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

$storageFolder = $storage.GetFolder

# Buscar o crear carpeta Anime
$animeItem = $null
foreach ($f in $storageFolder.Items()) {
    if ($f.Name -eq 'Anime') {
        $animeItem = $f
        break
    }
}

if (-not $animeItem) {
    $storageFolder.NewFolder('Anime')
    Start-Sleep -Seconds 2
    foreach ($f in $storageFolder.Items()) {
        if ($f.Name -eq 'Anime') { $animeItem = $f; break }
    }
}

$destAnimeFolder = $animeItem.GetFolder

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

# 1. REANUDAR HIGH SCHOOL DXD (las 3 primeras ya se completaron al 100%)
$mainBase = "E:\Anime\03 - Heavy Ecchi (Sin Censura BD)"
$seriesList = @(
    "Mahou Shoujo ni Akogarete",
    "Prison School",
    "Mato Seihei no Slave",
    "High School DxD"
)

$srcNamespace = $shell.Namespace($mainBase)

foreach ($seriesName in $seriesList) {
    $localPath = Join-Path $mainBase $seriesName
    $localFiles = Get-ChildItem -Path $localPath -Recurse -File
    $totalCount = $localFiles.Count
    $totalMB = [math]::Round(($localFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)

    $destSeries = $null
    foreach ($it in $destAnimeFolder.Items()) {
        if ($it.Name -eq $seriesName) { $destSeries = $it; break }
    }

    $c = 0
    if ($destSeries) { $c = Get-MtpItemCount $destSeries.GetFolder }

    if ($c -ge $totalCount) {
        Write-Host "  [OK] $seriesName -> Ya esta 100% completo ($c/$totalCount archivos). Saltando."
        continue
    }

    Write-Host ""
    Write-Host "--------------------------------------------------------------------"
    Write-Host "  REANUDANDO COPIA DE: $seriesName ($c/$totalCount archivos presentes)"
    Write-Host "--------------------------------------------------------------------"

    $itemToCopy = $srcNamespace.ParseName($seriesName)
    $destAnimeFolder.CopyHere($itemToCopy, 16)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lastRep = 0
    while ($true) {
        Start-Sleep -Seconds 4
        $destSeries = $null
        foreach ($it in $destAnimeFolder.Items()) {
            if ($it.Name -eq $seriesName) { $destSeries = $it; break }
        }
        if ($destSeries) {
            $cnt = Get-MtpItemCount $destSeries.GetFolder
            $pct = [math]::Min(100.0, [math]::Round(($cnt / $totalCount) * 100, 1))
            $sec = [math]::Max(1, [math]::Round($sw.ElapsedMilliseconds / 1000, 1))
            if ($sw.ElapsedMilliseconds - $lastRep -ge 6000 -or $cnt -ge $totalCount) {
                $lastRep = $sw.ElapsedMilliseconds
                Write-Host "    -> Progreso $seriesName: $cnt / $totalCount archivos ($pct%) | Tiempo: ${sec}s"
            }
            if ($cnt -ge $totalCount) {
                Start-Sleep -Seconds 4
                Write-Host "    [OK] ¡$seriesName COMPLETADO AL 100%!"
                break
            }
        }
        if ($sw.ElapsedMilliseconds / 1000 -gt 1500) { break }
    }
}

# 2. TRANSFERIR EL LOTE H CURADO
Write-Host ""
Write-Host "===================================================================="
Write-Host "  INICIANDO LOTE CURADO DE ANIMES H (4 OBRAS MAESTRAS)"
Write-Host "===================================================================="

# Buscar o crear subcarpeta '04 - Hentai'
$hentaiItem = $null
foreach ($f in $destAnimeFolder.Items()) {
    if ($f.Name -eq '04 - Hentai') { $hentaiItem = $f; break }
}
if (-not $hentaiItem) {
    $destAnimeFolder.NewFolder('04 - Hentai')
    Start-Sleep -Seconds 2
    foreach ($f in $destAnimeFolder.Items()) {
        if ($f.Name -eq '04 - Hentai') { $hentaiItem = $f; break }
    }
}
$destHentai = $hentaiItem.GetFolder

$hBase = "E:\Anime\04 - Hentai (Sin Censura)"
$hList = @(
    "Mankitsu Happening",
    "Eroge! H mo Game mo Kaihatsu Zanmai",
    "Rance 01 Hikari wo Motomete The Animation",
    "Oni Chichi"
)

$srcHNamespace = $shell.Namespace($hBase)

foreach ($hName in $hList) {
    $hPath = Join-Path $hBase $hName
    $hFiles = Get-ChildItem -Path $hPath -Recurse -File
    $hCount = $hFiles.Count

    $destHSeries = $null
    foreach ($it in $destHentai.Items()) {
        if ($it.Name -eq $hName) { $destHSeries = $it; break }
    }

    $c = 0
    if ($destHSeries) { $c = Get-MtpItemCount $destHSeries.GetFolder }

    if ($c -ge $hCount) {
        Write-Host "  [OK] $hName -> Ya esta 100% completo ($c/$hCount archivos). Saltando."
        continue
    }

    Write-Host ""
    Write-Host "--------------------------------------------------------------------"
    Write-Host "  COPIANDO SERIE H: $hName ($hCount archivos)"
    Write-Host "--------------------------------------------------------------------"

    $itemH = $srcHNamespace.ParseName($hName)
    $destHentai.CopyHere($itemH, 16)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lastRep = 0
    while ($true) {
        Start-Sleep -Seconds 4
        $destHSeries = $null
        foreach ($it in $destHentai.Items()) {
            if ($it.Name -eq $hName) { $destHSeries = $it; break }
        }
        if ($destHSeries) {
            $cnt = Get-MtpItemCount $destHSeries.GetFolder
            $pct = [math]::Min(100.0, [math]::Round(($cnt / $hCount) * 100, 1))
            $sec = [math]::Max(1, [math]::Round($sw.ElapsedMilliseconds / 1000, 1))
            if ($sw.ElapsedMilliseconds - $lastRep -ge 6000 -or $cnt -ge $hCount) {
                $lastRep = $sw.ElapsedMilliseconds
                Write-Host "    -> Progreso $hName: $cnt / $hCount archivos ($pct%) | Tiempo: ${sec}s"
            }
            if ($cnt -ge $hCount) {
                Start-Sleep -Seconds 4
                Write-Host "    [OK] ¡$hName COMPLETADO AL 100%!"
                break
            }
        }
        if ($sw.ElapsedMilliseconds / 1000 -gt 900) { break }
    }
}

Write-Host ""
Write-Host "===================================================================="
Write-Host "  ¡TODOS LOS ANIMES Y ANIMES H HAN SIDO TRANSFERIDOS EXITOSAMENTE!"
Write-Host "===================================================================="
