import { useEffect, useMemo, useState } from 'react'
import HeroGeometric from './HeroGeometric.jsx'
import { Activity, Thermometer, Droplets, Layers, RefreshCw, Wifi, WifiOff, Clock3, ShieldCheck, BrainCircuit, Fan, Zap, TrendingUp } from 'lucide-react'

const DEVICE = new URLSearchParams(window.location.search).get('device_id') || 'thermopredict-01'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const api = (path) => `${API_BASE}${path}`
const fmt = (v, digits = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : '—'

function Metric({ icon: Icon, title, value, unit, tone, note }) {
  return <article className="metric card">
    <div className={`metric-icon ${tone}`}><Icon size={20}/></div>
    <div className="metric-label">{title}</div>
    <div className="metric-value">{value}<span>{unit}</span></div>
    <div className="metric-note">{note}</div>
  </article>
}

export default function App() {
  const [reading, setReading] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(false)
  const [lastChecked, setLastChecked] = useState(new Date())
  const [config, setConfig] = useState({ comfort_limit_c: 30, nugen_configured: false })
  const [history, setHistory] = useState([])
  const [forecast, setForecast] = useState(null)
  const [recommendation, setRecommendation] = useState(null)

  useEffect(() => {
    let active = true
    let timer
    const poll = async () => {
      try {
        const [latestRes, analyticsRes, historyRes, configRes, forecastRes, recommendationRes] = await Promise.all([
          fetch(api(`/api/readings/latest?device_id=${encodeURIComponent(DEVICE)}`)),
          fetch(api(`/api/analytics?device_id=${encodeURIComponent(DEVICE)}`)),
          fetch(api(`/api/readings/history?device_id=${encodeURIComponent(DEVICE)}&limit=24`)),
          fetch(api('/api/config')),
          fetch(api(`/api/predictions?device_id=${encodeURIComponent(DEVICE)}`)),
          fetch(api(`/api/recommendations?device_id=${encodeURIComponent(DEVICE)}`))
        ])
        if (![latestRes, analyticsRes, historyRes, configRes, forecastRes, recommendationRes].every(r => r.ok)) throw new Error('API request failed')
        const [latestData, analyticsData, historyData, configData, forecastData, recommendationData] = await Promise.all([
          latestRes.json(), analyticsRes.json(), historyRes.json(), configRes.json(), forecastRes.json(), recommendationRes.json()
        ])
        if (!active) return
        setReading(latestData.reading)
        setAnalytics(analyticsData.analytics)
        setHistory(historyData.readings || [])
        setConfig(configData)
        setForecast(forecastData)
        setRecommendation(recommendationData.recommendation)
        setConnected(true); setError(false); setLastChecked(new Date())
      } catch {
        if (active) { setConnected(false); setError(true); setLastChecked(new Date()) }
      } finally {
        if (active) timer = setTimeout(poll, 5000)
      }
    }
    poll()
    return () => { active = false; clearTimeout(timer) }
  }, [])

  const updated = reading?.timestamp ? new Date(reading.timestamp).toLocaleString() : 'Waiting for first sensor reading'
  const trend = useMemo(() => {
    if (history.length < 2) return 'Collecting baseline'
    const first = history[0].room_temp_c, last = history[history.length - 1].room_temp_c
    const delta = last - first
    return `${delta > 0 ? '+' : ''}${fmt(delta)}°C across ${history.length} readings`
  }, [history])

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark"><Activity size={23}/></div>
      <div className="brand"><strong>ThermoPredict <span>AI</span></strong><small>ENVIRONMENTAL INTELLIGENCE</small></div>
      <div className={`connection ${connected ? 'online' : 'offline'}`}>
        {connected ? <Wifi size={16}/> : <WifiOff size={16}/>}
        {connected ? 'Backend connected' : 'Backend disconnected'}
      </div>
    </header>

    <HeroGeometric device={DEVICE} reading={reading} connected={connected} />

    {error && <div className="notice error"><WifiOff size={17}/> Cannot connect to backend. Retrying automatically every 5 seconds.</div>}
    {!error && !reading && connected && <div className="notice"><RefreshCw size={17}/> Connected — waiting for the first sensor reading. You can send a test payload from the API docs.</div>}

    <section className="section-heading" id="conditions">
      <div><h2>Current conditions</h2><p>Sensor telemetry from your connected device</p></div>
      <div className="refresh-label"><RefreshCw size={14}/> Auto-refresh · 5 sec</div>
    </section>

    <section className="metrics-grid">
      <Metric icon={Thermometer} title="Room temperature" value={reading ? fmt(reading.room_temp_c) : '—'} unit="°C" tone="orange" note="Ambient air · DHT22"/>
      <Metric icon={Droplets} title="Relative humidity" value={reading ? fmt(reading.humidity_pct) : '—'} unit="%" tone="blue" note="Ambient moisture · DHT22"/>
      <Metric icon={Layers} title="Exterior wall" value={reading ? fmt(reading.exterior_wall_temp_c) : '—'} unit="°C" tone="violet" note="Surface probe · DS18B20 #1"/>
      <Metric icon={Layers} title="Interior wall" value={reading ? fmt(reading.interior_wall_temp_c) : '—'} unit="°C" tone="green" note="Surface probe · DS18B20 #2"/>
    </section>

    <section className="analysis-grid">
      <article className="card analysis-card">
        <div className="card-title"><div><span className="mini-icon"><Activity size={17}/></span><h3>Thermal lag analysis</h3></div><span className="subtle-tag">LIVE ANALYTICS</span></div>
        <div className="delta-block">
          <div><span className="muted-label">WALL TEMPERATURE DELTA</span><div className="big-number">{analytics ? fmt(analytics.wall_delta_c) : reading ? fmt(reading.exterior_wall_temp_c - reading.interior_wall_temp_c) : '—'}<small>°C</small></div></div>
          <div className="delta-graphic"><div className="delta-line"></div><span>EXTERIOR</span><span>INTERIOR</span></div>
        </div>
        <div className="analysis-stats">
          <div><span>Heating velocity</span><strong>{analytics?.heating_rate_c_per_min != null ? `${fmt(analytics.heating_rate_c_per_min, 3)} °C/min` : 'Need 2 readings'}</strong></div>
          <div><span>Estimated time to threshold</span><strong>{analytics?.time_to_limit_min != null ? `${fmt(analytics.time_to_limit_min)} min` : 'Not projected'}</strong></div>
          <div><span>Comfort threshold</span><strong>{fmt(config.comfort_limit_c)} °C</strong></div>
        </div>
      </article>

      <article className="card advisory-card">
        <div className="card-title"><div><span className="mini-icon"><ShieldCheck size={17}/></span><h3>Smart advisory</h3></div></div>
        <div className={`advisory-indicator ${analytics?.threshold_reached ? 'warning' : ''}`}><span></span>{analytics?.threshold_reached ? 'THRESHOLD REACHED' : analytics ? 'MONITORING ACTIVE' : 'AWAITING ANALYSIS'}</div>
        <p className="advisory-copy">{analytics?.advisory || 'Thermal recommendations will appear when sensor readings are available.'}</p>
        <div className="advisory-foot"><Clock3 size={15}/><span>Updated {lastChecked.toLocaleTimeString()}</span></div>
      </article>
    </section>

    <section className="section-heading prediction-heading" id="predictions">
      <div><h2>Predictive comfort engine</h2><p>Short-term temperature outlook and practical cooling guidance</p></div>
      <div className="refresh-label"><BrainCircuit size={15}/> {forecast?.method === 'linear_trend_baseline' ? 'Trend baseline' : 'Collecting data'}</div>
    </section>
    <section className="prediction-grid">
      <article className="card prediction-card">
        <div className="card-title"><div><span className="mini-icon"><TrendingUp size={17}/></span><h3>Temperature forecast</h3></div><span className="subtle-tag">15 / 30 / 60 MIN</span></div>
        {forecast?.available ? <>
          <div className="forecast-values">{forecast.forecasts.map(item => <div className="forecast-value" key={item.minutes_ahead}><span>+{item.minutes_ahead} min</span><strong>{fmt(item.temperature_c)}<small>°C</small></strong></div>)}</div>
          <div className="forecast-track" aria-label="Temperature forecast trend">{forecast.forecasts.map(item => <div key={item.minutes_ahead} className="forecast-point"><span style={{height: `${Math.max(12, Math.min(100, (item.temperature_c - 15) * 5))}%`}}></span></div>)}</div>
          <div className="forecast-meta"><span>Trend rate</span><strong>{fmt(forecast.heating_rate_c_per_min, 3)} °C/min</strong><span>Confidence</span><strong>{forecast.confidence}</strong><span>Samples used</span><strong>{forecast.sample_count}</strong></div>
          <p className="small-note">{forecast.note}</p>
        </> : <div className="forecast-empty"><RefreshCw size={19}/><p>{forecast?.reason || 'Waiting for sensor data.'}</p></div>}
      </article>
      <article className="card prediction-card recommendation-card">
        <div className="card-title"><div><span className="mini-icon"><Fan size={17}/></span><h3>Cooling recommendation</h3></div><span className="subtle-tag">ADVISORY ONLY</span></div>
        {recommendation ? <>
          <div className="recommended-appliance"><div className="appliance-icon"><Fan size={23}/></div><div><span>Suggested option</span><strong>{recommendation.appliance}</strong></div></div>
          <p className="recommendation-reason">{recommendation.reason}</p>
          <div className="recommendation-stats"><div><span>Estimated running cost</span><strong>₹{fmt(recommendation.estimated_cost_inr_per_hour, 2)}/hour</strong></div><div><span>Assumed power</span><strong>{recommendation.estimated_power_w} W</strong></div><div><span>30-min forecast</span><strong>{fmt(recommendation.forecast_30m_c)}°C</strong></div></div>
          <p className="small-note"><Zap size={12}/> {recommendation.cost_note}</p>
        </> : <div className="forecast-empty"><Fan size={19}/><p>Cooling guidance will appear after the first sensor reading.</p></div>}
      </article>
    </section>
    <div className="notice feature-note"><ShieldCheck size={16}/> These are advisory estimates. The current forecast uses a transparent trend baseline, not a trained ML model; appliance wattages are illustrative. Nugen credentials are detected separately, but its API is not called until its documented endpoint and request format are confirmed.</div>

    <section className="section-heading history-heading">
      <div><h2>Recent telemetry</h2><p>Latest {history.length} readings · {trend}</p></div>
      <div className="freshness"><span className="freshness-dot"></span><div><small>DATA FRESHNESS</small><strong>{updated}</strong></div></div>
    </section>
    <article className="card table-card">
      <div className="table-scroll"><table><thead><tr><th>Timestamp</th><th>Room °C</th><th>Humidity</th><th>Exterior °C</th><th>Interior °C</th><th>Wall Δ °C</th></tr></thead>
      <tbody>{history.slice().reverse().slice(0, 10).map((r, i) => <tr key={`${r.timestamp}-${i}`}>
        <td>{new Date(r.timestamp).toLocaleTimeString()}</td><td>{fmt(r.room_temp_c)}</td><td>{fmt(r.humidity_pct)}%</td><td>{fmt(r.exterior_wall_temp_c)}</td><td>{fmt(r.interior_wall_temp_c)}</td><td>{fmt(r.exterior_wall_temp_c - r.interior_wall_temp_c)}</td>
      </tr>)}{history.length === 0 && <tr><td colSpan="6" className="empty-row">No readings yet. Send telemetry to <code>POST /api/readings</code>.</td></tr>}</tbody></table></div>
    </article>

    <footer><div className="footer-brand"><Activity size={16}/> THERMOPREDICT AI</div><span>Thermal monitoring & predictive intelligence</span><span className="nugen-status">Nugen API: {config.nugen_configured ? 'configured' : 'not configured'}</span></footer>
  </main>
}
