const { File } = require('megajs');
const fs = require('fs');

async function download(url, dest) {
    try {
        const file = File.fromURL(url);
        await file.loadAttributes();
        
        console.log(`[download] 0.0% of ${file.size} bytes at 0.0MiB/s ETA 00:00`);
        
        const stream = file.download();
        const destStream = fs.createWriteStream(dest);
        
        let downloaded = 0;
        let lastReport = Date.now();
        let lastDownloaded = 0;
        let lastActivity = Date.now();

        // Watchdog por inactividad (si no recibe datos en 25 segundos, salir con error)
        const stallInterval = setInterval(() => {
            if (Date.now() - lastActivity > 25000) {
                console.error(`[mega] Descarga congelada (sin datos por >25s). Abortando.`);
                clearInterval(stallInterval);
                try { destStream.destroy(); } catch (_) {}
                try { stream.destroy(); } catch (_) {}
                process.exit(1);
            }
        }, 3000);

        // Timeout global máximo de 7 minutos por archivo
        const globalTimeout = setTimeout(() => {
            console.error(`[mega] Timeout global de descarga (7 minutos). Abortando.`);
            clearInterval(stallInterval);
            try { destStream.destroy(); } catch (_) {}
            try { stream.destroy(); } catch (_) {}
            process.exit(1);
        }, 7 * 60 * 1000);
        
        stream.on('data', (chunk) => {
            lastActivity = Date.now();
            downloaded += chunk.length;
            const now = Date.now();
            if (now - lastReport > 1000) {
                const pct = ((downloaded / file.size) * 100).toFixed(1);
                const deltaBytes = downloaded - lastDownloaded;
                const elapsedSec = (now - lastReport) / 1000;
                const spd = ((deltaBytes / elapsedSec) / (1024 * 1024)).toFixed(1);
                console.log(`[download] ${pct}% of ${file.size} bytes at ${spd}MiB/s ETA --`);
                lastReport = now;
                lastDownloaded = downloaded;
            }
        });
        
        stream.pipe(destStream);
        
        await new Promise((resolve, reject) => {
            stream.on('end', () => {
                clearInterval(stallInterval);
                clearTimeout(globalTimeout);
                resolve();
            });
            stream.on('error', (err) => {
                clearInterval(stallInterval);
                clearTimeout(globalTimeout);
                reject(err);
            });
            destStream.on('error', (err) => {
                clearInterval(stallInterval);
                clearTimeout(globalTimeout);
                reject(err);
            });
        });
        
        console.log(`[download] 100.0% of ${file.size} bytes at --MiB/s ETA 00:00`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

const url = process.argv[2];
const dest = process.argv[3];
if (!url || !dest) {
    console.error("Uso: node mega_downloader.js <url> <dest>");
    process.exit(1);
}

download(url, dest);
