import pytest
from fastapi.testclient import TestClient
from urllib.parse import quote
from src.api.server import app

client = TestClient(app)

def test_web_static_assets():
    # 1. Root and static files
    r_root = client.get("/")
    assert r_root.status_code == 200
    assert "text/html" in r_root.headers.get("content-type", "")

    r_app = client.get("/static/app.js")
    assert r_app.status_code == 200
    assert "openLocalSeriesPage" in r_app.text
    assert "playLocalEpisode" in r_app.text
    assert "closeCinemaPlayer" in r_app.text

    r_css = client.get("/static/style.css")
    assert r_css.status_code == 200
    assert ".episode-card" in r_css.text
    assert ".cinema-player-box" in r_css.text

def test_api_status_endpoint():
    r = client.get("/api/status")
    assert r.status_code == 200
    data = r.json()
    assert "message" in data
    assert "percent" in data

def test_local_collection_audit():
    r = client.get("/api/local/collection")
    assert r.status_code == 200
    data = r.json()
    assert data.get("connected") is True
    assert data.get("total_series") >= 90
    assert len(data.get("series", [])) == data.get("total_series")
    assert data.get("total_episodes") >= 1800
    # Invariante de coherencia: la suma de episodios de las series debe coincidir exactamente con el total
    assert data.get("total_episodes") == sum(s["total_episodes"] for s in data["series"])

def test_anime_details_special_characters():
    test_paths = [
        "01 - Erotico (Sin Censura)/Rescue Me!",
        "03 - Heavy Ecchi (Sin Censura BD)/Keijo!!!!!!!!",
        "03 - Heavy Ecchi (Sin Censura BD)/B-gata H-kei",
        "03 - Heavy Ecchi (Sin Censura BD)/Dakara Boku wa, H ga Dekinai",
        "03 - Heavy Ecchi (Sin Censura BD)/High School DxD",
        "Slime Taoshite 300-nen"
    ]

    for p in test_paths:
        url = f"/api/local/anime/details?path={quote(p)}"
        r = client.get(url)
        assert r.status_code == 200, f"Failed for {p}: {r.text}"
        data = r.json()
        assert "seasons" in data
        assert len(data["seasons"]) > 0
        first_season = data["seasons"][0]
        assert len(first_season["episodes"]) > 0

        # Special check for Slime Taoshite: verify episode numbers are NOT 300
        if "Slime" in p:
            ep_nums = [e["episode_number"] for e in first_season["episodes"]]
            assert 1 in ep_nums, f"Slime Taoshite missing Ep 1: {ep_nums}"
            assert 300 not in ep_nums, f"Slime Taoshite misparsed 300nen as episode number: {ep_nums}"

def test_local_art():
    # Valid anime poster
    r_art = client.get("/api/local/art?path=" + quote("03 - Heavy Ecchi (Sin Censura BD)/High School DxD") + "&type=poster")
    assert r_art.status_code == 200
    assert "image/" in r_art.headers.get("content-type", "")

    # Non-existent anime fallback to SVG
    r_fallback = client.get("/api/local/art?path=NonExistentAnimeFolder&type=poster")
    assert r_fallback.status_code == 200
    assert "image/svg+xml" in r_fallback.headers.get("content-type", "")

def test_streaming_and_http_206_range():
    # Fetch details of a known franchise
    r_det = client.get("/api/local/anime/details?path=" + quote("03 - Heavy Ecchi (Sin Censura BD)/High School DxD"))
    assert r_det.status_code == 200
    ep = r_det.json()["seasons"][0]["episodes"][0]
    rel_file = ep["rel_file_path"]

    # 1. Full stream (status 200)
    r_full = client.get(f"/api/local/stream?file={quote(rel_file)}")
    assert r_full.status_code == 200
    assert r_full.headers.get("accept-ranges") == "bytes"
    assert "video/" in r_full.headers.get("content-type", "")

    # 2. Range stream initial chunk (status 206)
    r_range = client.get(f"/api/local/stream?file={quote(rel_file)}", headers={"Range": "bytes=0-1024"})
    assert r_range.status_code == 206
    assert "bytes 0-1024/" in r_range.headers.get("content-range", "")
    assert r_range.headers.get("content-length") == "1025"
    assert len(r_range.content) == 1025

    # 3. Range stream scrub/seek offset (status 206)
    r_scrub = client.get(f"/api/local/stream?file={quote(rel_file)}", headers={"Range": "bytes=100000-200000"})
    assert r_scrub.status_code == 206
    assert "bytes 100000-200000/" in r_scrub.headers.get("content-range", "")
    assert len(r_scrub.content) == 100001

    # 4. Suffix Range (RFC 7233: last 500 bytes of file)
    r_suffix = client.get(f"/api/local/stream?file={quote(rel_file)}", headers={"Range": "bytes=-500"})
    assert r_suffix.status_code == 206
    assert r_suffix.headers.get("content-length") == "500"
    assert len(r_suffix.content) == 500

    # 5. Open-ended Range (RFC 7233: bytes from offset to EOF)
    r_open = client.get(f"/api/local/stream?file={quote(rel_file)}", headers={"Range": "bytes=1000-"})
    assert r_open.status_code == 206
    assert "bytes 1000-" in r_open.headers.get("content-range", "")

    # 6. Oversized Range (RFC 7233: requested end exceeds file size -> clamped, status 206)
    r_over = client.get(f"/api/local/stream?file={quote(rel_file)}", headers={"Range": "bytes=0-999999999999"})
    assert r_over.status_code == 206

    # 7. Range 416 Unsatisfiable (start beyond file length)
    r_416 = client.get(f"/api/local/stream?file={quote(rel_file)}", headers={"Range": "bytes=99999999999-999999999999"})
    assert r_416.status_code == 416

def test_watch_progress_cycle():
    payload = {
        "anime_rel_path": "03 - Heavy Ecchi (Sin Censura BD)/High School DxD",
        "season_number": 1,
        "episode_number": 3,
        "current_time": 450.5,
        "duration": 1420.0,
        "episode_title": "Capítulo 03"
    }
    r_post = client.post("/api/local/progress", json=payload)
    assert r_post.status_code == 200

    r_get = client.get("/api/local/progress")
    assert r_get.status_code == 200
    progress = r_get.json()
    assert payload["anime_rel_path"] in progress
    entry = progress[payload["anime_rel_path"]]
    assert entry["episode_number"] == 3
    assert entry["current_time"] == 450.5

def test_sync_franchise_endpoint():
    r = client.post("/api/sync_franchise", json={"name": "High School DxD"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "success"

def test_security_directory_traversal():
    r_hack = client.get("/api/local/stream?file=../../Windows/System32/calc.exe")
    assert r_hack.status_code in (403, 404)
