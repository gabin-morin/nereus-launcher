import React, { useEffect, useState } from 'react'
import BGImage from "./assets/images/background.jpg"
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Loader2 } from 'lucide-react'
import { Progress } from './components/ui/progress'
import { OfflineProfile } from '../../types'
import Minimize from "./assets/icons/minimize.svg"
import Fullscreen from "./assets/icons/fullscreen.svg"
import Close from "./assets/icons/close.svg"

type LauncherInstance = {
  id: string
  label: string
  version: string
  modloader: string
  modloaderVersion: string,
  serveur: {
    ip: string,
    port: number
  }
}


export default function App() {
  const [username, setUsername] = useState('')
  const [ram, setRam] = useState(2048)
  const [status, setStatus] = useState('')
  const [percent, setPercent] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)

  const [selectedInstance, setSelectedInstance] = useState<LauncherInstance>()

  const [page, setPage] = useState("load")
  const [profile, setProfile] = useState<OfflineProfile | null>(null)
  const [instances, setInstances] = useState<LauncherInstance[]>([])

  const fetchManifest = async () => {
    const res = await fetch("https://gabin-morin.fr/manifest.json");

    if (!res.ok) return;

    const currentManifest = await res.json()

    setInstances(Array.isArray(currentManifest.instances) ? currentManifest.instances : [])
    setSelectedInstance(Array.isArray(currentManifest.instances) ? currentManifest.instances[0] : undefined)
  }

  useEffect(() => {
    fetchManifest();
    window.launcher.autoLogin().then(profile => {
      if (profile) {
        console.log("Auto-login réussi :", profile)
        setProfile(profile)
        setPage("home")
      }
      else setPage("login")
    })
    window.launcher.loadOfflineAuth().then(username => {
      if (username) {
        console.log("Pseudo hors ligne trouvé :", username)
        setUsername(username.username)
        setPage("home")
      }
    })
    return window.launcher.onProgress(({ step, percent }) => {
      setStatus(step)
      setPercent(percent)
    })
  }, [])

  const checkUsername = () => {
    if (!username || username.trim().length < 2 || username.includes(' ')) return alert('Entre un pseudo valide !')
    window.launcher.saveOfflineAuth(username.trim())
    setPage("home")
  }

  async function play() {
    if (!selectedInstance || !selectedInstance.id) return alert('Sélectionne une instance !')
    setLoading(true)
    const result = await window.launcher.launch({ username: username.trim(), version: selectedInstance?.version, ram, serveur: selectedInstance.serveur, profile, id: selectedInstance.id, modloader: selectedInstance.modloader, modloaderVersion: selectedInstance.modloaderVersion })
    if (!result.success) alert('Erreur : ' + result.error)
    setLoading(false)
  }

  const changeValue = (val: string) => {
    console.log(val)
    setSelectedInstance(instances.find(i => i.id === val))
  }

  const microsoftLogin = async () => {
    setLoadingProfile(true)
    try {
      const profile = await window.launcher.loginMicrosoft()
      console.log(profile)
      setProfile(profile)
      setPage("home");
      setLoadingProfile(false)
    } catch (err) {
      setLoadingProfile(false)
      console.error(err)
    }
  }

  const logout = async () => {
    await window.launcher.logout()
    setProfile(null)
    setPage("login")
  }


  return (
    <main className='bg-background/70 w-screen h-screen'>
      <img className='w-full h-full object-cover absolute blur-lg -z-10 scale-125' src={BGImage} alt="Background" />
      <div style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} className='bg-primary z-50 w-screen h-8 flex items-center justify-end px-5 gap-2'>
        <button style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => window.launcher.minimize()}><img src={Minimize} alt="Logo" className="h-4 w-4 pointer-events-none" /></button>
        <button style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => window.launcher.toggleFullscreen()}><img src={Fullscreen} alt="Logo" className="h-4 w-4 pointer-events-none" /></button>
        <button style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => window.launcher.close()}><img src={Close} alt="Logo" className="h-4 w-4 pointer-events-none" /></button>
      </div>
      {page === "load" && <div className='flex items-center justify-center h-full'>
        <Loader2 className='animate-spin text-white' />
      </div>}
      {page === "login" && <div className='flex items-center justify-center h-full'>
        <Tabs defaultValue="offline" className="w-100 flex flex-col bg-primary p-6 rounded-xl items-center h-[50%]">
          <TabsList className='bg-background p-1.25'>
            <TabsTrigger value="offline">Hors ligne</TabsTrigger>
            <TabsTrigger value="online">Connexion</TabsTrigger>
          </TabsList>
          <TabsContent className='flex flex-col justify-center gap-6 items-center w-full' value="offline">
            <input value={username} onChange={e => setUsername(e.target.value)} className='bg-background text-white placeholder:text-white/45 rounded-lg px-3.5 py-2.5 w-2/3' placeholder='Pseudo' />
            <button onClick={checkUsername} className='bg-[#BD3D3D] text-white hover:opacity-80 transition-all duration-150 cursor-pointer rounded-xl py-2.5 px-6'>Jouer</button>
          </TabsContent>
          <TabsContent className='flex flex-col justify-center gap-6 items-center w-full' value="online">
            <button disabled={loadingProfile} onClick={microsoftLogin} className='bg-[#BD3D3D] disabled:bg-[#b66969] text-white hover:opacity-80 transition-all duration-150 cursor-pointer rounded-xl py-2.5 px-6'>{loadingProfile ? <Loader2 className='animate-spin' /> : 'Connexion avec Microsoft'}</button>
          </TabsContent>
        </Tabs>
      </div>}
      {page === "home" && (
        <div className='flex w-full h-screen'>
          <div className='border-r min-w-1/4 border-white/20 p-6 flex flex-col gap-3.5'>
            <button onClick={() => logout()} className='flex cursor-pointer hover:opacity-60 transition-all duration-150 w-full justify-center gap-2 px-3.5 border-b border-white/20 pb-6'>
              <img className='h-14' src={`https://mc-heads.net/avatar/${profile ? profile.username : username}`} />
              <div>
                <p className='text-white text-xl'>{profile ? profile.username : username}</p>
                <p className='text-white/60 text-nowrap'>{profile ? "Connecté" : "Hors ligne"}</p>
              </div>
            </button>
            <p className='text-white'>Instance</p>
            {instances && instances.length > 0 &&< Select defaultValue={instances[0].id} onValueChange={(val) => changeValue(val)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Instances" />
              </SelectTrigger>
              <SelectContent>
                {instances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    <img className='h-6 w-6 mr-2' src={`https://gabin-morin.fr/nereus/${instance.id}/${instance.id}.png`} />
                    <p>{instance.label}</p>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>}
          </div>
          <div className='px-12 w-full flex text-white flex-col justify-center gap-5'>
            <h1 className='text-7xl font-bold '>{selectedInstance?.label}</h1>
            {percent > 0 && (
              <div className='flex gap-2 items-center w-full'>
                <Progress className='h-2 bg-white/40 w-2/3' value={percent} max={100} />
                <p className='w-full'>{status}</p>
              </div>
            )}
            <button className='bg-[#BD3D3D] text-white hover:opacity-80 transition-all duration-150 cursor-pointer rounded-xl py-2.5 px-6 w-fit' onClick={play} disabled={loading}>{loading ? <Loader2 className='animate-spin' /> : "JOUER"}</button>
          </div>
          <div className='absolute bottom-0'>
            <input value={ram} type="number" onChange={e => setRam(+e.target.value)} placeholder="RAM (MB)" />
          </div>
        </div>
      )}
    </main>
  )
}