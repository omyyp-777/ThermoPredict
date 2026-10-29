from __future__ import annotations
from datetime import datetime
from typing import Any
import math


def _timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def analyze_readings(current: dict[str, Any], previous: dict[str, Any] | None,
                     comfort_limit_c: float = 30.0) -> dict[str, Any]:
    wall_delta = current["exterior_wall_temp_c"] - current["interior_wall_temp_c"]
    rate = None
    time_to_limit = None
    if previous is not None:
        minutes = (_timestamp(current["timestamp"]) - _timestamp(previous["timestamp"])).total_seconds() / 60.0
        if minutes > 0:
            rate = (current["room_temp_c"] - previous["room_temp_c"]) / minutes

    reached = current["room_temp_c"] >= comfort_limit_c
    if reached:
        advisory = "The room has reached the selected temperature threshold."
        time_to_limit = 0.0
    elif rate is not None and rate > 0.001:
        time_to_limit = max(0.0, (comfort_limit_c - current["room_temp_c"]) / rate)
        advisory = "Heating trend suggests considering pre-cooling soon." if time_to_limit <= 60 else "Room is warming; continue monitoring the projected threshold."
    else:
        advisory = "Continue monitoring the room and wall temperatures."

    return {
        "wall_delta_c": round(wall_delta, 3),
        "heating_rate_c_per_min": round(rate, 5) if rate is not None else None,
        "comfort_limit_c": comfort_limit_c,
        "time_to_limit_min": round(time_to_limit, 1) if time_to_limit is not None else None,
        "threshold_reached": reached,
        "advisory": advisory,
    }


def forecast_temperature(readings: list[dict[str, Any]], comfort_limit_c: float = 30.0) -> dict[str, Any]:
    """Transparent short-term linear-trend forecast. Not a trained ML model."""
    if not readings:
        return {"available": False, "reason": "No sensor readings yet.", "forecasts": []}
    recent = readings[-24:]
    current = recent[-1]
    if len(recent) < 3:
        return {"available": False, "reason": "Collect at least 3 readings to start forecasting.", "forecasts": [], "sample_count": len(recent)}

    t0 = _timestamp(recent[0]["timestamp"])
    xs = [(_timestamp(row["timestamp"]) - t0).total_seconds() / 60.0 for row in recent]
    ys = [float(row["room_temp_c"]) for row in recent]
    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    denominator = sum((x - x_mean) ** 2 for x in xs)
    slope = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / denominator if denominator > 0 else 0.0
    # Guard against extrapolating implausibly fast from noisy sensors.
    slope = max(-0.15, min(0.15, slope))
    now = xs[-1]
    forecasts = []
    for horizon in (15, 30, 60):
        predicted = float(current["room_temp_c"]) + slope * horizon
        forecasts.append({"minutes_ahead": horizon, "temperature_c": round(predicted, 2)})
    current_temp = float(current["room_temp_c"])
    time_to_limit = (comfort_limit_c - current_temp) / slope if slope > 0 and current_temp < comfort_limit_c else (0.0 if current_temp >= comfort_limit_c else None)
    residuals = [y - (y_mean + slope * (x - x_mean)) for x, y in zip(xs, ys)]
    rmse = math.sqrt(sum(r * r for r in residuals) / len(residuals))
    confidence = "low" if len(recent) < 8 or rmse > 1.5 else ("moderate" if len(recent) < 16 or rmse > 0.7 else "trend-based")
    return {
        "available": True,
        "method": "linear_trend_baseline",
        "is_trained_ml_model": False,
        "sample_count": len(recent),
        "heating_rate_c_per_min": round(slope, 5),
        "fit_rmse_c": round(rmse, 2),
        "confidence": confidence,
        "comfort_limit_c": comfort_limit_c,
        "minutes_until_limit_estimate": round(max(0.0, time_to_limit), 1) if time_to_limit is not None else None,
        "forecasts": forecasts,
        "note": "Baseline trend estimate, not a guarantee. Collect more data and validate before relying on it.",
    }


def recommend_appliance(current: dict[str, Any], forecast: dict[str, Any], comfort_limit_c: float = 30.0,
                        electricity_rate_inr: float = 8.0) -> dict[str, Any]:
    temp = float(current["room_temp_c"])
    humidity = float(current["humidity_pct"])
    forecast30 = next((x["temperature_c"] for x in forecast.get("forecasts", []) if x["minutes_ahead"] == 30), temp)
    warming = forecast.get("heating_rate_c_per_min", 0) or 0
    if temp >= comfort_limit_c + 2 or forecast30 >= comfort_limit_c + 1:
        appliance, reason = "AC", "The room is hot or is forecast to exceed the comfort limit; AC can provide stronger cooling and dehumidification."
    elif temp >= comfort_limit_c or forecast30 >= comfort_limit_c:
        if humidity >= 65:
            appliance, reason = "AC", "Humidity is high and the room is at or approaching the comfort limit; AC may help with both cooling and dehumidification."
        elif humidity <= 55:
            appliance, reason = "Air cooler (if ventilation is available)", "Conditions are relatively dry, so evaporative cooling may be useful. Keep adequate ventilation."
        else:
            appliance, reason = "Fan first; reassess soon", "The room is near the comfort limit. Try air movement and reassess the measured temperature trend."
    else:
        appliance, reason = "Fan", "Current conditions are below the selected comfort limit. A fan may improve perceived comfort without actively lowering room temperature."
    if warming > 0.02:
        reason += " The room is warming, so check the forecast again shortly."

    # Illustrative common wattages; label these as estimates, not measured consumption.
    watts = {"Fan": 70, "Air cooler (if ventilation is available)": 180, "AC": 1200, "Fan first; reassess soon": 70}
    selected_watts = watts[appliance]
    return {
        "appliance": appliance,
        "reason": reason,
        "room_temp_c": round(temp, 2),
        "humidity_pct": round(humidity, 1),
        "forecast_30m_c": round(float(forecast30), 2),
        "comfort_limit_c": comfort_limit_c,
        "estimated_power_w": selected_watts,
        "estimated_cost_inr_per_hour": round(selected_watts / 1000 * electricity_rate_inr, 2),
        "electricity_rate_inr_per_kwh": electricity_rate_inr,
        "cost_note": "Illustrative estimate using typical appliance wattage. Replace with your appliance's rated power and tariff for a better estimate.",
        "automatic_control": False,
    }
