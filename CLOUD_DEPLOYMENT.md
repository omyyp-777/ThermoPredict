# ThermoPredict AI: cloud deployment from VS Code

This project can run locally first, then be deployed so the ESP32 uploads sensor readings to the cloud and your phone can view them over mobile data.

## 0. Keep secrets private

- Never commit `.env`, the Supabase service-role key, Wi-Fi password, or device token.
- The Supabase **service-role key belongs only in Render backend environment variables**. Never put it in Vercel or ESP32 firmware.
- Generate a long random `DEVICE_API_TOKEN`; use the same value in Render and the ESP32 sketch.
- The included ESP32 sketch uses `WiFiClientSecure.setInsecure()` for first-connect testing. HTTPS traffic is encrypted, but server certificates are not verified. Before a production deployment, replace it with `client.setCACert(root_ca)` using the correct current root CA certificate for your Render domain.

## 1. Set up Supabase database

1. Open your Supabase project.
2. Open **SQL Editor** → **New query**.
3. Open `supabase_schema.sql` in VS Code, copy its full contents into the SQL editor, and click **Run**.
4. In Supabase **Project Settings → API** (or API Keys), copy the Project URL and the `service_role` / secret key. Labels can differ in the current Supabase dashboard.

## 2. Deploy backend to Render

1. Push the project to a private GitHub repository. Check `.gitignore` and do not commit secrets.
2. In Render, choose **New → Web Service**, connect the repository.
3. Set **Root Directory** to `backend`.
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add these Environment Variables in Render:
   - `SUPABASE_URL` = your Supabase Project URL (e.g. `https://projectref.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` = the Supabase service-role/secret key
   - `SUPABASE_TABLE` = `telemetry`
   - `COMFORT_LIMIT_C` = `30.0`
   - `FRONTEND_ORIGINS` = `https://YOUR-VERCEL-PROJECT.vercel.app` (replace with the actual deployed frontend domain)
   - `DEVICE_API_TOKEN` = a long random secret you generate; use exactly the same value in the ESP32 sketch
7. Deploy. Copy the Render service URL, e.g. `https://your-service.onrender.com`.
8. Test `https://YOUR-RENDER-SERVICE.onrender.com/health`. Expected JSON is `{"status":"ok"}`. Then check `/api/config`; its `storage` field should say `supabase`. If it says `memory`, the Supabase environment variables are missing or not configured.
9. Open `https://YOUR-RENDER-SERVICE.onrender.com/docs` to view API docs.

## 3. Deploy frontend to Vercel

1. In Vercel, import the same Git repository.
2. Set **Root Directory** to `frontend`.
3. Framework preset: Vite. Build command: `npm run build`; output directory: `dist`.
4. Add environment variable `VITE_API_BASE_URL` = your Render service URL, without a trailing slash (e.g. `https://your-service.onrender.com`).
5. Deploy/redeploy after setting the variable.
6. Open the Vercel URL on your phone using mobile data. The dashboard polls the cloud API every five seconds.

If the frontend was already deployed before you added `VITE_API_BASE_URL`, trigger a new deployment so Vite includes the variable.

## 4. Configure and flash the ESP32

Open `esp32/thermopredict_esp32.ino` in Arduino IDE or PlatformIO (VS Code can use the PlatformIO extension). Install libraries: OneWire, DallasTemperature, and DHT sensor library by Adafruit (plus Adafruit Unified Sensor if prompted).

Edit these constants in the sketch:

- `WIFI_SSID` and `WIFI_PASSWORD`: the Wi-Fi network the ESP32 will use. It must have Internet access. Most ESP32 boards require 2.4 GHz Wi-Fi; some captive-portal/enterprise networks will not work.
- `BACKEND_URL`: `https://YOUR-RENDER-SERVICE.onrender.com/api/readings`
- `DEVICE_API_TOKEN`: exact same secret as Render's `DEVICE_API_TOKEN`.
- `DHT_PIN`: match the actual DHT22 data wire. Default is GPIO 5; if wired to GPIO 15, change it to `15`.
- `ONE_WIRE_BUS`: match the DS18B20 data wire. Default is GPIO 4.

Wire both DS18B20 probes to the same OneWire bus and use the required 4.7 kΩ pull-up between the data line and 3.3 V. Confirm the sketch reports two probes. Open Serial Monitor at 115200 baud, flash the sketch, and watch for `Cloud POST status: 200` or another 2xx status. HTTP 401 means the device token differs; 422 means payload validation failed; a negative code usually indicates a connection/TLS/DNS issue. `-127 C` means a DS18B20 is disconnected; `nan` usually means the DHT sensor/wiring/read failed.

## 5. Verify live readings

Replace the domain and open:

- `https://YOUR-RENDER-SERVICE.onrender.com/health`
- `https://YOUR-RENDER-SERVICE.onrender.com/api/readings/latest?device_id=thermopredict-01`

The latest endpoint will show `available:false` until a valid ESP32 POST has been stored. Once the ESP32 POST succeeds, the latest endpoint and Vercel dashboard should show the sensor values. Use Supabase **Table Editor → telemetry** to confirm rows are being saved.

## 6. Common issues

- **Health URL does not load:** inspect Render logs and deployment status.
- **Health says storage=memory:** check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Render and redeploy.
- **Database insert/query fails:** confirm `supabase_schema.sql` ran successfully and the table is named `telemetry`.
- **Dashboard says backend disconnected:** check `VITE_API_BASE_URL`, redeploy Vercel, and ensure `FRONTEND_ORIGINS` in Render exactly matches the Vercel domain.
- **Dashboard connects but no readings:** inspect ESP32 Serial Monitor; check Wi-Fi, URL, device token, sensor wiring, NTP, and HTTP status.
- **Render free service sleeps:** the first request after inactivity may take longer while it wakes. The ESP32 retries every 10 seconds.

## Local development

Backend terminal:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend second terminal:

```powershell
cd frontend
npm install
npm run dev
```

For local development, leave `VITE_API_BASE_URL` unset so Vite proxies API requests to `localhost:8000`. If you set the Render `DEVICE_API_TOKEN` locally, use the same token for local ESP32 posts too.
