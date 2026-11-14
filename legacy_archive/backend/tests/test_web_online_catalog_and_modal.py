import pytest
from fastapi.testclient import TestClient
from urllib.parse import quote
from src.api.server import app

client = TestClient(app)

def test_api_catalog_endpoint():
    r = client.get("/api/catalog")
    assert r.status_code == 200
    data = r.json()
    assert "trending" in data
    assert "releasing" in data
    assert isinstance(data["trending"], list)
    assert isinstance(data["releasing"], list)

def test_api_search_endpoint():
    r = client.get("/api/search?q=Naruto")
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert isinstance(data["results"], list)

def test_api_collection_version():
    r = client.get("/api/local/collection/version")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data

def test_head_method_stream():
    # Fetch a valid episode
    r_det = client.get("/api/local/anime/details?path=" + quote("03 - Heavy Ecchi (Sin Censura BD)/High School DxD"))
    assert r_det.status_code == 200
    ep = r_det.json()["seasons"][0]["episodes"][0]
    rel_file = ep["rel_file_path"]

    # HEAD request on stream
    r_head = client.head(f"/api/local/stream?file={quote(rel_file)}")
    assert r_head.status_code == 200
    assert r_head.headers.get("accept-ranges") == "bytes"
    assert "video/" in r_head.headers.get("content-type", "")
    assert len(r_head.content) == 0  # RFC 7231: HEAD must not return message body

def test_head_method_art():
    r_head = client.head("/api/local/art?path=NonExistentFolder&type=backdrop")
    assert r_head.status_code == 200
    assert "image/svg+xml" in r_head.headers.get("content-type", "")
    assert len(r_head.content) == 0

def test_art_svg_fallbacks():
    # Poster fallback (2:3 aspect ratio: 300x450)
    r_poster = client.get("/api/local/art?path=NonExistentFolder&type=poster")
    assert r_poster.status_code == 200
    assert 'viewBox="0 0 300 450"' in r_poster.text

    # Backdrop fallback (16:9 aspect ratio: 640x360)
    r_backdrop = client.get("/api/local/art?path=NonExistentFolder&type=backdrop")
    assert r_backdrop.status_code == 200
    assert 'viewBox="0 0 640 360"' in r_backdrop.text
