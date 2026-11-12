import pytest
from fastapi.testclient import TestClient
from src.api.server import app

client = TestClient(app)

def test_get_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "html" in response.headers.get("content-type", "")

def test_get_subscriptions():
    response = client.get("/api/subscriptions")
    assert response.status_code == 200
    assert "animes" in response.json()

def test_get_status():
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "percent" in data

def test_get_catalog():
    response = client.get("/api/catalog")
    assert response.status_code == 200
    data = response.json()
    assert "trending" in data
    assert "releasing" in data
    assert "popular" in data
