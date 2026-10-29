# ThermoPredict AI

IoT-enabled environmental monitoring dashboard based on the supplied PRD.

## Features
- FastAPI backend on `0.0.0.0:8000`
- Strict Pydantic validation and timezone-aware ISO-8601 timestamps
- Thread-safe in-memory reading store, capped at 2,000 entries (prunes oldest 1,000 when exceeded)
- Latest/history endpoints, health check, thermal analytics endpoint
- React + Vite dashboard polls every 5 seconds
- Optional Nugen Companies API integration configuration via environment variables
- ESP32 Arduino example for two DS18B20 probes and DHT22

## Requirements
- Python 3.10+
- Node.js 18+
- For real sensor telemetry: ESP32 firmware and sensors

## Run backend (Windows PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Run backend (macOS/Linux)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs  
Health: http://localhost:8000/health

## Run frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the URL printed by Vite (usually http://localhost:5173).

The Vite development server proxies `/api` and `/health` to `http://localhost:8000`.

## Test with sample data
```bash
curl -X POST http://localhost:8000/api/readings \
  -H "Content-Type: application/json" \
  -d '{"device_id":"thermopredict-01","timestamp":"2026-10-27T10:30:00Z","exterior_wall_temp_c":35.0,"interior_wall_temp_c":29.5,"room_temp_c":29.2,"humidity_pct":61.0}'
```
Then refresh the dashboard or call:
`http://localhost:8000/api/readings/latest?device_id=thermopredict-01`

## Nugen Companies API keys
**Do not commit API keys to source control or put them in frontend code.** Put credentials in `backend/.env`, which is excluded from git:
```env
NUGEN_API_KEY=replace_with_your_real_key
NUGEN_API_BASE_URL=https://replace-with-official-nugen-api-base-url
NUGEN_API_KEY_HEADER=Authorization
NUGEN_API_KEY_PREFIX=Bearer
```
If Nugen specifies an API-key header such as `x-api-key`, set:
```env
NUGEN_API_KEY_HEADER=x-api-key
NUGEN_API_KEY_PREFIX=
```
The included `backend/nugen_client.py` is an optional, generic authenticated HTTP client. It does not make an API request until you configure a base URL and call its helper. Because the supplied PRD does not include Nugen's official API URL, authentication requirements, or endpoint contract, this generic adapter must be matched to the official documentation before live integration can be considered verified. Sensor ingestion and dashboard operation do not depend on Nugen being configured.

## Notes
- Data is held in memory and is lost when the backend restarts, as specified in the PRD's in-memory option.
- Thermal velocity needs at least two readings for the same device.
- Configure the comfort threshold with `COMFORT_LIMIT_C` in `.env` (default 30°C).
- For access from other machines, use the backend computer's LAN IP in the browser and allow port 8000/5173 through your firewall as appropriate.

## Cloud deployment

See [`CLOUD_DEPLOYMENT.md`](CLOUD_DEPLOYMENT.md) for the complete Render + Supabase + Vercel + ESP32 walkthrough. Run `supabase_schema.sql` in the Supabase SQL Editor before deploying the backend. Keep the Supabase service-role key exclusively in Render environment variables.

## Predictive features (new)

The dashboard now includes:
- A 15/30/60-minute **linear-trend baseline forecast** using recent room-temperature telemetry.
- A cooling recommendation based on current temperature, relative humidity, the forecast and the configured comfort limit.
- An illustrative hourly electricity-cost estimate. Default appliance wattages are examples; update them to match your actual appliances.
- Forecast sample count, fit error and a qualitative confidence label.

New backend endpoints:
- `GET /api/predictions?device_id=thermopredict-01`
- `GET /api/recommendations?device_id=thermopredict-01`

Important: the forecast is **not a trained ML model** and should be treated as a baseline. It needs at least three readings and should be validated against future measurements before users rely on it. Outdoor temperature, solar exposure, room size, appliance state and actual power readings would improve later versions.

## Nugen API credentials

The backend retains the `NUGEN_API_KEY` and `NUGEN_API_BASE_URL` environment variables and reports whether credentials are present. The Nugen model is **not yet invoked** because the project files do not contain the provider's official endpoint, authentication requirements, request schema or response schema. Do not paste the API key into source code, the frontend, the ESP32 sketch, or a public chat. Add it as a secret environment variable in Render only after checking Nugen's official API documentation. Once the exact documentation link or API contract is available, the optional adapter can be wired to the correct endpoint safely.

Recommended Render environment variables:
- `COMFORT_LIMIT_C=30.0`
- `ELECTRICITY_RATE_INR_PER_KWH=8.0`
- Existing Supabase and device-token variables from `CLOUD_DEPLOYMENT.md`
- `NUGEN_API_KEY` and `NUGEN_API_BASE_URL` only when confirmed by Nugen's documentation

## UI refresh: geometric hero + Lenis scrolling

The frontend now includes a responsive, animated geometric shader hero inspired by the supplied HeroGeometric component, with a live device status card and in-page calls to action. Lenis smooth scrolling is initialized in `frontend/src/main.jsx`, and it respects the visitor's reduced-motion preference. The frontend dependencies include `@react-three/fiber`, `three`, `framer-motion`, and `lenis`.

To install and run the updated frontend locally:

```bash
cd frontend
npm install
npm run dev
```

The shader background is decorative; the live temperature and connection status remain driven by the existing API polling.

