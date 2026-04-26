import { appState } from '../state/app-state.ts'

export function handleImgUpload(ci: number, qi: number, file: File, previewId: string, clearBtnId: string): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = (e.target as FileReader).result as string
    appState.imgStaging[`${ci}-${qi}`] = base64
    const preview = document.getElementById(previewId) as HTMLImageElement | null
    if (preview) {
      preview.src = base64
      preview.style.display = 'block'
    }
    const clearBtn = document.getElementById(clearBtnId)
    if (clearBtn) clearBtn.style.display = 'inline-block'
  }
  reader.readAsDataURL(file)
}
