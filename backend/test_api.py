from fastapi.testclient import TestClient
from main import app, readings, lock

client = TestClient(app)

def setup_function():
    with lock:
        readings.clear()

def payload(ts="2026-10-27T10:30:00Z"):
    return {
        "device_id": "thermopredict-01",
        "timestamp": ts,
        "exterior_wall_temp_c": 35.0,
        "interior_wall_temp_c": 29.5,
        "room_temp_c": 29.2,
        "humidity_pct": 61.0,
    }

def test_health():
    assert client.get("/health").json() == {"status": "ok"}

def test_ingest_latest_history_analytics():
    assert client.post("/api/readings", json=payload()).status_code == 200
    latest = client.get("/api/readings/latest").json()
    assert latest["available"] is True
    assert latest["reading"]["device_id"] == "thermopredict-01"
    assert len(client.get("/api/readings/history").json()["readings"]) == 1
    assert client.get("/api/analytics").json()["analytics"]["wall_delta_c"] == 5.5

def test_reject_timezone_missing():
    assert client.post("/api/readings", json=payload("2026-10-27T10:30:00")).status_code == 422

def test_reject_bad_humidity():
    data = payload()
    data["humidity_pct"] = 120
    assert client.post("/api/readings", json=data).status_code == 422

def test_reject_extra_fields():
    data = payload()
    data["unexpected"] = True
    assert client.post("/api/readings", json=data).status_code == 422

def test_predictions_need_three_readings_then_forecast():
    assert client.get('/api/predictions').json()['available'] is False
    for i, temp in enumerate([28.0, 28.4, 28.8]):
        data = payload(f'2026-10-27T10:{30 + i:02d}:00Z')
        data['room_temp_c'] = temp
        client.post('/api/readings', json=data)
    result = client.get('/api/predictions').json()
    assert result['available'] is True
    assert result['is_trained_ml_model'] is False
    assert [x['minutes_ahead'] for x in result['forecasts']] == [15, 30, 60]
    assert result['forecasts'][0]['temperature_c'] > 28.8


def test_recommendations_include_cost_estimate():
    client.post('/api/readings', json=payload())
    result = client.get('/api/recommendations').json()
    assert result['available'] is True
    assert result['recommendation']['appliance']
    assert result['recommendation']['estimated_cost_inr_per_hour'] >= 0
