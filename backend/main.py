from __future__ import annotations
import os
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Annotated
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from thermal_engine import analyze_readings, forecast_temperature, recommend_appliance

load_dotenv()
COMFORT_LIMIT_C = float(os.getenv("COMFORT_LIMIT_C", "30.0"))
ELECTRICITY_RATE_INR_PER_KWH = float(os.getenv("ELECTRICITY_RATE_INR_PER_KWH", "8.0"))
MAX_READINGS = 2000
readings: deque[dict] = deque()
lock = threading.Lock()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "telemetry")
FRONTEND_ORIGINS = [x.strip() for x in os.getenv("FRONTEND_ORIGINS", "*").split(",") if x.strip()]
DEVICE_API_TOKEN = os.getenv("DEVICE_API_TOKEN", "").strip()

app = FastAPI(title="ThermoPredict AI API", version="1.1.0", description="Telemetry ingestion and thermal prediction API.")
app.add_middleware(CORSMiddleware, allow_origins=FRONTEND_ORIGINS, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])

class SensorReading(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_id: str = Field(min_length=1, max_length=64)
    timestamp: datetime
    exterior_wall_temp_c: float = Field(ge=-50.0, le=100.0, allow_inf_nan=False)
    interior_wall_temp_c: float = Field(ge=-50.0, le=100.0, allow_inf_nan=False)
    room_temp_c: float = Field(ge=-20.0, le=80.0, allow_inf_nan=False)
    humidity_pct: float = Field(ge=0.0, le=100.0, allow_inf_nan=False)

    @field_validator("timestamp")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include a timezone (for example, Z or +00:00)")
        return value

    def normalized(self) -> dict:
        data = self.model_dump()
        data["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        return data

def supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)

def supabase_headers() -> dict:
    return {"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}

def save_reading(item: dict) -> None:
    if supabase_configured():
        try:
            response = httpx.post(f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}", headers=supabase_headers(), json=item, timeout=8.0)
            response.raise_for_status()
        except Exception as exc:
            print(f"Supabase insert failed: {exc}")
            raise HTTPException(status_code=503, detail="Could not save reading to the database") from exc
    else:
        with lock:
            readings.append(item)
            if len(readings) > MAX_READINGS:
                for _ in range(min(1000, len(readings))):
                    readings.popleft()

def get_readings(device_id: str, limit: int = MAX_READINGS) -> list[dict]:
    if supabase_configured():
        try:
            response = httpx.get(
                f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}",
                headers=supabase_headers(),
                params={"select": "device_id,timestamp,exterior_wall_temp_c,interior_wall_temp_c,room_temp_c,humidity_pct", "device_id": f"eq.{device_id}", "order": "timestamp.desc", "limit": str(limit)},
                timeout=8.0,
            )
            response.raise_for_status()
            rows = response.json()
            return list(reversed(rows))
        except Exception as exc:
            print(f"Supabase query failed: {exc}")
            raise HTTPException(status_code=503, detail="Could not read telemetry from the database") from exc
    with lock:
        return [r for r in readings if r["device_id"] == device_id][-limit:]

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/readings")
def ingest(reading: SensorReading, x_device_token: str | None = Header(default=None)):
    if DEVICE_API_TOKEN and x_device_token != DEVICE_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid device token")
    item = reading.normalized()
    save_reading(item)
    received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    print(f"POST /api/readings 200 device_id={item['device_id']}")
    return {"accepted": True, "device_id": item["device_id"], "received_at": received_at}

@app.get("/api/readings/latest")
def latest(device_id: Annotated[str, Query(min_length=1, max_length=64)] = "thermopredict-01"):
    matches = get_readings(device_id, 1)
    if not matches:
        return {"available": False, "reading": None}
    return {"available": True, "reading": matches[-1]}

@app.get("/api/readings/history")
def history(device_id: Annotated[str, Query(min_length=1, max_length=64)] = "thermopredict-01", limit: int = Query(default=100, ge=1, le=2000)):
    return {"device_id": device_id, "readings": get_readings(device_id, limit)}

@app.get("/api/analytics")
def analytics(device_id: Annotated[str, Query(min_length=1, max_length=64)] = "thermopredict-01"):
    matches = get_readings(device_id, 2)
    if not matches:
        return {"available": False, "analytics": None}
    previous = matches[-2] if len(matches) >= 2 else None
    return {"available": True, "analytics": analyze_readings(matches[-1], previous, COMFORT_LIMIT_C)}

@app.get("/api/predictions")
def predictions(device_id: Annotated[str, Query(min_length=1, max_length=64)] = "thermopredict-01"):
    matches = get_readings(device_id, 2000)
    forecast = forecast_temperature(matches, COMFORT_LIMIT_C)
    return {"device_id": device_id, **forecast}

@app.get("/api/recommendations")
def recommendations(device_id: Annotated[str, Query(min_length=1, max_length=64)] = "thermopredict-01"):
    matches = get_readings(device_id, 2000)
    if not matches:
        return {"available": False, "recommendation": None, "reason": "No sensor readings yet."}
    forecast = forecast_temperature(matches, COMFORT_LIMIT_C)
    return {"available": True, "recommendation": recommend_appliance(matches[-1], forecast, COMFORT_LIMIT_C, ELECTRICITY_RATE_INR_PER_KWH)}

@app.get("/api/config")
def config():
    nugen_key_present = bool(os.getenv("NUGEN_API_KEY", "").strip())
    nugen_base_present = bool(os.getenv("NUGEN_API_BASE_URL", "").strip())
    return {
        "comfort_limit_c": COMFORT_LIMIT_C,
        "electricity_rate_inr_per_kwh": ELECTRICITY_RATE_INR_PER_KWH,
        "nugen_configured": nugen_key_present and nugen_base_present,
        "nugen_integration_ready": False,
        "nugen_note": "Credentials alone are not enough to integrate Nugen. Set the documented API endpoint, authentication format, request schema, and response schema after consulting its official documentation.",
        "storage": "supabase" if supabase_configured() else "memory",
    }
