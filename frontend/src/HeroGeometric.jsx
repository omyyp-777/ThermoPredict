import { useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { motion } from 'framer-motion'
import { Activity, ArrowDown, ArrowRight, Wifi, WifiOff } from 'lucide-react'

const vertexShader = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const fragmentShader = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
varying vec2 vUv;
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
 const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
 vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
 vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
 vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod(i,289.0);
 vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
 vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
 vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
 m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
 vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
 return 130.0*dot(m,g);
}
float bayerDither4x4(vec2 uv){
 int x=int(mod(uv.x,4.0)); int y=int(mod(uv.y,4.0)); int matrix[16];
 matrix[0]=0;matrix[1]=8;matrix[2]=2;matrix[3]=10;matrix[4]=12;matrix[5]=4;matrix[6]=14;matrix[7]=6;
 matrix[8]=3;matrix[9]=11;matrix[10]=1;matrix[11]=9;matrix[12]=15;matrix[13]=7;matrix[14]=13;matrix[15]=5;
 return float(matrix[y*4+x])/16.0;
}
void main(){
 vec2 uv=vUv; vec2 coord=gl_FragCoord.xy; float noise=snoise(uv*1.5+vec2(uTime*0.05,uTime*0.03))*0.25;
 float gradient=(uv.x+uv.y)*0.6+noise; vec3 deepBlue=uColor1; vec3 paleBlue=uColor2;
 vec3 softBlue=mix(deepBlue,paleBlue,0.33); vec3 lightBlue=mix(deepBlue,paleBlue,0.66); vec3 color;
 if(gradient<0.3) color=deepBlue; else if(gradient<0.55) color=softBlue; else if(gradient<0.8) color=lightBlue; else color=paleBlue;
 float dither=bayerDither4x4(coord); float threshold=fract(gradient*4.0);
 if(gradient<0.3&&threshold>dither*0.5) color=softBlue; else if(gradient>=0.3&&gradient<0.55&&threshold>dither*0.5) color=lightBlue; else if(gradient>=0.55&&gradient<0.8&&threshold>dither*0.5) color=paleBlue;
 float fadeMask=smoothstep(0.0,0.25,length(vec2(uv.x,uv.y))); color=mix(vec3(1.0),color,fadeMask);
 float vignette=smoothstep(1.2,0.3,length(uv-0.5)); color=mix(color,color*0.97,(1.0-vignette)*0.25); gl_FragColor=vec4(color,1.0);
}
`

function GradientPlane() {
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color('#35B88A') },
    uColor2: { value: new THREE.Color('#E8FFF5') },
  }), [])
  useFrame(({ clock }) => { uniforms.uTime.value = clock.getElapsedTime() * 0.55 })
  return <mesh scale={[2, 2, 1]}><planeGeometry args={[2, 2]} /><shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} depthWrite={false} depthTest={false} /></mesh>
}

export default function HeroGeometric({ device, reading, connected }) {
  return <section className="hero-geometric" aria-labelledby="hero-title">
    <div className="hero-shader" aria-hidden="true"><Canvas camera={{ position: [0, 0, 1] }} dpr={[1, 1.5]} gl={{ antialias: false, alpha: true }}><GradientPlane /></Canvas></div>
    <div className="hero-wireframe hero-wireframe-one" aria-hidden="true"><svg viewBox="0 0 160 120"><g fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M18 40 62 8 142 22 119 92 43 110 18 40 119 92 62 8 43 110 142 22 18 40 119 92"/><path d="M62 8 78 58 142 22M78 58 43 110M18 40 78 58 119 92"/></g></svg></div>
    <div className="hero-wireframe hero-wireframe-two" aria-hidden="true"><svg viewBox="0 0 160 120"><g fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M12 26 91 8 146 52 76 112 12 26 76 112 91 8 83 61 146 52 12 26 83 61 76 112M91 8 83 61 12 26"/></g></svg></div>
    <div className="hero-geometric-inner">
      <motion.div className="hero-kicker" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}><span className="hero-kicker-dot" /> SMART ROOM CLIMATE INTELLIGENCE</motion.div>
      <div className="hero-headline-wrap">
        <motion.h1 id="hero-title" initial={{ y: '100%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }} transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}>THERMOPREDICT AI</motion.h1>
      </div>
      <motion.h2 className="hero-tagline" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.4 }}>Predict room comfort before the heat arrives.</motion.h2>
      <motion.p className="hero-geometric-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.55 }}>Understand your room's temperature, forecast what's next, and choose a smarter way to stay comfortable.</motion.p>
      <motion.div className="hero-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.7 }}>
        <a className="hero-primary-action" href="#conditions">Explore live conditions <ArrowRight size={17} /></a>
        <a className="hero-secondary-action" href="#predictions">See predictions <ArrowDown size={16} /></a>
      </motion.div>
      <motion.div className="hero-live-card" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
        <div className="hero-live-top"><span className="hero-live-label"><Activity size={14}/> LIVE DEVICE</span><span className={`hero-live-connection ${connected ? 'is-online' : ''}`}>{connected ? <Wifi size={14}/> : <WifiOff size={14}/>} {connected ? 'Connected' : 'Connecting'}</span></div>
        <div className="hero-live-main"><div><span className="hero-live-device">{device}</span><span className="hero-live-caption">{reading ? 'Receiving sensor telemetry' : 'Waiting for first sensor reading'}</span></div><div className="hero-live-temperature">{reading?.room_temp_c != null ? Number(reading.room_temp_c).toFixed(1) : '—'}<small>°C</small></div></div>
        <div className="hero-live-bottom"><span>Room temperature</span><span>{reading?.humidity_pct != null ? `${Number(reading.humidity_pct).toFixed(0)}% humidity` : 'Humidity pending'}</span></div>
      </motion.div>
    </div>
    <div className="hero-bottom-mark"><span>THERMAL INTELLIGENCE SYSTEM</span><span>01 / REAL-TIME ENVIRONMENT</span></div>
  </section>
}
