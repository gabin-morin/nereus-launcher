import React, { useState } from 'react'

export default function App() {
  const [username, setUsername] = useState('')
  const [version, setVersion] = useState('26.1.2')
  const [ram, setRam] = useState(2048)
  const [status, setStatus] = useState('')
  const [percent, setPercent] = useState(0)
  const [loading, setLoading] = useState(false)

  window.launcher.onProgress(({ step, percent }) => {
    setStatus(step)
    setPercent(percent)
  })

  async function play() {
    if (!username) return alert('Entre un pseudo !')
    setLoading(true)
    const result = await window.launcher.launch({ username, version, ram })
    if (!result.success) alert('Erreur : ' + result.error)
    setLoading(false)
  }

  return (
    <main>
      <div style={{ WebkitAppRegion: 'drag' }  as React.CSSProperties} className='bg-black/80 w-screen h-8 flex items-center justify-end px-5 gap-2'>
        <button style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => window.launcher.minimize()}><img src="/assets/icons/minimize.svg" alt="Logo" className="h-4 w-4 pointer-events-none" /></button>
        <button style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => window.launcher.toggleFullscreen()}><img src="/assets/icons/fullscreen.svg" alt="Logo" className="h-4 w-4 pointer-events-none" /></button>
        <button style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => window.launcher.close()}><img src="/assets/icons/close.svg" alt="Logo" className="h-4 w-4 pointer-events-none" /></button>
      </div>
      <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Pseudo" />
      <input value={version} onChange={e => setVersion(e.target.value)} placeholder="Version" />
      <input value={ram} type="number" onChange={e => setRam(+e.target.value)} placeholder="RAM (MB)" />
      <button onClick={play} disabled={loading}>JOUER</button>
      <div>{status}</div>
      <progress value={percent} max={100} />
    </main>
  )
}