# antigravity_live_quota.py - Lector en Tiempo Real de la API Nativa de Google Antigravity
# Consulta directamente a language_server.exe local en <50ms con CERO consumo de tokens.

import subprocess
import urllib.request
import urllib.error
import ssl
import json
import re
import os
import sys
import time

try:
    import psutil
except ImportError:
    psutil = None

_CACHE = {
    "pid": None,
    "ports": [],
    "csrf_token": None,
    "last_check": 0
}

def _discover_server():
    global _CACHE
    now = time.time()
    if _CACHE["csrf_token"] and (now - _CACHE["last_check"]) < 60:
        if _CACHE["pid"] and psutil and psutil.pid_exists(_CACHE["pid"]):
            return _CACHE["csrf_token"], _CACHE["ports"]

    csrf = None
    ports = []
    pid = None

    if psutil:
        try:
            for p in psutil.process_iter(['pid', 'name', 'cmdline']):
                name = p.info.get('name') or ''
                if 'language_server' in name.lower():
                    cmd = ' '.join(p.info.get('cmdline') or [])
                    m = re.search(r'--csrf_token\s+([0-9a-fA-F-]+)', cmd)
                    if m:
                        csrf = m.group(1)
                        pid = p.info['pid']
                        for c in p.net_connections(kind='tcp'):
                            if c.status == 'LISTEN' and c.laddr.ip == '127.0.0.1':
                                ports.append(c.laddr.port)
                        break
        except Exception:
            pass

    if not csrf:
        ps_cmd = (
            "$p = Get-CimInstance Win32_Process -Filter \"name = 'language_server.exe'\"; "
            "if ($p) { "
            "  $conns = Get-NetTCPConnection -OwningProcess $p.ProcessId -State Listen -LocalAddress '127.0.0.1' -ErrorAction SilentlyContinue; "
            "  @{ Pid = $p.ProcessId; Cmd = $p.CommandLine; Ports = ($conns.LocalPort) } | ConvertTo-Json "
            "}"
        )
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=4
            )
            if proc.returncode == 0 and proc.stdout.strip():
                info = json.loads(proc.stdout)
                pid = info.get("Pid")
                cmd = info.get("Cmd", "")
                m = re.search(r'--csrf_token\s+([0-9a-fA-F-]+)', cmd)
                if m:
                    csrf = m.group(1)
                p_val = info.get("Ports", [])
                ports = [p_val] if isinstance(p_val, int) else list(p_val)
        except Exception:
            pass

    if csrf:
        _CACHE["pid"] = pid
        _CACHE["ports"] = ports
        _CACHE["csrf_token"] = csrf
        _CACHE["last_check"] = now

    return csrf, ports

def get_live_quota():
    """
    Descubre el proceso language_server.exe en <30ms, extrae el CSRF token y los puertos locales,
    y consulta el endpoint nativo RetrieveUserQuotaSummary.
    Retorna los datos 100% reales y oficiales de Google Antigravity.
    """
    csrf, ports = _discover_server()
    if not csrf or not ports:
        return None

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {
        "X-Codeium-Csrf-Token": csrf,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1"
    }

    raw_data = None
    for port in ports:
        for proto in ["https", "http"]:
            url = f"{proto}://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary"
            try:
                req = urllib.request.Request(url, headers=headers, method="POST", data=b"{}")
                res = urllib.request.urlopen(req, context=ctx, timeout=0.8)
                if res.status == 200:
                    raw_data = json.loads(res.read().decode('utf-8'))
                    break
            except Exception:
                continue
        if raw_data:
            break

    if not raw_data:
        return None

    return parse_quota_data(raw_data)

def parse_quota_data(raw_data):
    """Estructura la respuesta nativa de RetrieveUserQuotaSummary."""
    groups = raw_data.get("response", {}).get("groups", [])
    result = {
        "success": True,
        "gemini": {
            "five_hour_pct": 100.0,
            "five_hour_ui": 100,
            "weekly_pct": 100.0,
            "weekly_ui": 100,
            "five_hour_desc": "",
            "weekly_desc": "",
            "five_hour_reset": "",
            "weekly_reset": ""
        },
        "claude_gpt": {
            "five_hour_pct": 100.0,
            "five_hour_ui": 100,
            "weekly_pct": 100.0,
            "weekly_ui": 100,
            "five_hour_desc": "",
            "weekly_desc": ""
        }
    }

    for g in groups:
        name = g.get("displayName", "").lower()
        buckets = g.get("buckets", [])
        target = result["gemini"] if "gemini" in name else result["claude_gpt"]

        for b in buckets:
            bid = b.get("bucketId", "").lower()
            fraction = float(b.get("remainingFraction", 1.0))
            pct = round(fraction * 100.0, 1)
            pct_ui = round(fraction * 100.0)
            desc = b.get("description", "")
            reset_time = b.get("resetTime", "")

            if "5h" in bid or "hour" in bid:
                target["five_hour_pct"] = pct
                target["five_hour_ui"] = pct_ui
                target["five_hour_desc"] = desc
                target["five_hour_reset"] = reset_time
            elif "week" in bid:
                target["weekly_pct"] = pct
                target["weekly_ui"] = pct_ui
                target["weekly_desc"] = desc
                target["weekly_reset"] = reset_time

    return result

if __name__ == "__main__":
    t0 = time.time()
    data = get_live_quota()
    elapsed = (time.time() - t0) * 1000
    print(f"=== ANTIGRAVITY NATIVE LIVE QUOTA (Tiempo: {elapsed:.1f}ms) ===")
    if data:
        g = data["gemini"]
        print(f"• Gemini Ventana 5h: UI: {g['five_hour_ui']}% (Preciso: {g['five_hour_pct']}%) | {g['five_hour_desc']}")
        print(f"• Gemini Semanal:    UI: {g['weekly_ui']}% (Preciso: {g['weekly_pct']}%) | {g['weekly_desc']}")
        c = data["claude_gpt"]
        print(f"• Claude/GPT 5h:     {c['five_hour_pct']}% | Claude/GPT Semanal: {c['weekly_pct']}%")
    else:
        print("No se pudo conectar con language_server.exe")
