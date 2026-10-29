import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import Lenis from 'lenis'
import App from './App.jsx'
import './App.css'

function Root() {
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return undefined

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.15,
      anchors: true,
    })
    let frameId
    const raf = (time) => {
      lenis.raf(time)
      frameId = window.requestAnimationFrame(raf)
    }
    frameId = window.requestAnimationFrame(raf)
    return () => {
      window.cancelAnimationFrame(frameId)
      lenis.destroy()
    }
  }, [])

  return <React.StrictMode><App /></React.StrictMode>
}

createRoot(document.getElementById('root')).render(<Root />)
