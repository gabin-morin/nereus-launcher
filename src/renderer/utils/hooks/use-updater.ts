import { useEffect, useState } from 'react'

type UpdateState =
    | { status: 'idle' }
    | { status: 'available'; version: string }
    | { status: 'downloading'; percent: number }
    | { status: 'downloaded'; version: string }
    | { status: 'error'; message: string }

export function useUpdater() {
    const [state, setState] = useState<UpdateState>({ status: 'idle' })

    useEffect(() => {
        // Ajoute ces listeners dans ton preload (voir dessous)
        window.launcher.onUpdateAvailable((info: any) =>
            setState({ status: 'available', version: info.version }))

        window.launcher.onUpdateProgress((p: any) =>
            setState({ status: 'downloading', percent: Math.round(p.percent) }))

        window.launcher.onUpdateDownloaded((info: any) =>
            setState({ status: 'downloaded', version: info.version }))

        window.launcher.onUpdateError((msg: string) =>
            setState({ status: 'error', message: msg }))
    }, [])

    return {
        state,
        download: () => window.launcher.downloadUpdate(),
        install: () => window.launcher.installUpdate(),
    }
}