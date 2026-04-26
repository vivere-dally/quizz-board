import type { Category } from '../persistence/db.ts'
import { appState, saveData } from '../state/app-state.ts'
import { $, clearRecord } from '../dom/helpers.ts'
import { closeOverlay, openOverlay } from '../dom/modal.ts'
import { renderAll } from '../render.ts'
import { handleImgUpload } from './image-upload.ts'

function buildAdminAccordion(cat: Category, ci: number, qi: number, pts: number): HTMLElement {
  const q = cat.questions[qi]
  const hasImg = !!q?.img

  const accordion = document.createElement('div')
  accordion.className = 'q-accordion'

  const accHeader = document.createElement('div')
  accHeader.className = 'q-acc-header'
  accHeader.dataset.action = 'toggle-accordion'
  const headerLabel = document.createElement('span')
  let headerText = pts + ' pts'
  if (hasImg) headerText += ' 📷'
  headerLabel.textContent = headerText
  const arrow = document.createElement('span')
  arrow.style.cssText = 'font-size:11px;opacity:.6'
  arrow.textContent = '▼'
  accHeader.appendChild(headerLabel)
  accHeader.appendChild(arrow)

  const accBody = document.createElement('div')
  accBody.className = 'q-acc-body'
  const fieldRow = document.createElement('div')
  fieldRow.className = 'q-field-row'

  const qLabel = document.createElement('label')
  qLabel.style.cssText = 'font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em'
  qLabel.textContent = 'Question'
  fieldRow.appendChild(qLabel)

  const qTextarea = document.createElement('textarea')
  qTextarea.className = 'mini-textarea'
  qTextarea.id = `adm-q-${ci}-${qi}`
  qTextarea.textContent = q?.q ?? ''
  fieldRow.appendChild(qTextarea)

  const aLabel = document.createElement('label')
  aLabel.style.cssText = 'font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em'
  aLabel.textContent = 'Answer'
  fieldRow.appendChild(aLabel)

  const aInput = document.createElement('input')
  aInput.className = 'mini-input'
  aInput.id = `adm-a-${ci}-${qi}`
  aInput.value = q?.a ?? ''
  fieldRow.appendChild(aInput)

  const imgZone = document.createElement('div')
  imgZone.className = 'img-upload-zone'

  const imgLabel = document.createElement('span')
  imgLabel.className = 'img-upload-label'
  imgLabel.textContent = 'Image (optional) — shown during the question'
  imgZone.appendChild(imgLabel)

  const imgPreview = document.createElement('img')
  imgPreview.className = 'img-preview-thumb'
  imgPreview.id = `adm-img-preview-${ci}-${qi}`
  if (hasImg && q?.img) {
    imgPreview.src = q.img
  } else {
    imgPreview.style.display = 'none'
  }
  imgZone.appendChild(imgPreview)

  const imgBtnRow = document.createElement('div')
  imgBtnRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'

  const chooseImgBtn = document.createElement('button')
  chooseImgBtn.type = 'button'
  chooseImgBtn.className = 'img-file-btn'
  chooseImgBtn.textContent = '📷 Choose Image'
  chooseImgBtn.dataset.action = 'choose-image'
  chooseImgBtn.dataset.ci = String(ci)
  chooseImgBtn.dataset.qi = String(qi)
  imgBtnRow.appendChild(chooseImgBtn)

  const clearImgBtn = document.createElement('button')
  clearImgBtn.type = 'button'
  clearImgBtn.className = 'img-clear-btn'
  clearImgBtn.id = `adm-img-clear-${ci}-${qi}`
  if (!hasImg) clearImgBtn.style.display = 'none'
  clearImgBtn.textContent = '✗ Remove'
  clearImgBtn.dataset.action = 'clear-image'
  clearImgBtn.dataset.ci = String(ci)
  clearImgBtn.dataset.qi = String(qi)
  imgBtnRow.appendChild(clearImgBtn)
  imgZone.appendChild(imgBtnRow)

  const imgFileInput = document.createElement('input')
  imgFileInput.type = 'file'
  imgFileInput.accept = 'image/*'
  imgFileInput.className = 'admin-img-file'
  imgFileInput.id = `adm-img-file-${ci}-${qi}`
  imgFileInput.dataset.ci = String(ci)
  imgFileInput.dataset.qi = String(qi)
  imgFileInput.style.display = 'none'
  imgZone.appendChild(imgFileInput)
  fieldRow.appendChild(imgZone)

  accBody.appendChild(fieldRow)
  accordion.appendChild(accHeader)
  accordion.appendChild(accBody)
  return accordion
}

export function openAdmin(): void {
  const content = $('admin-content')
  content.textContent = ''

  const heading = document.createElement('div')
  heading.style.cssText =
    "font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.08em;color:var(--gold);margin-bottom:4px"
  heading.textContent = 'All Questions Editor'
  content.appendChild(heading)

  const desc = document.createElement('p')
  desc.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:18px'
  desc.textContent = 'Edit category names, questions, answers, and add optional images to any tile.'
  content.appendChild(desc)

  for (const [ci, cat] of appState.data.categories.entries()) {
    const sectionTitle = document.createElement('div')
    sectionTitle.className = 'admin-section-title'
    sectionTitle.textContent = `${cat.name} — Category ${ci + 1}`
    content.appendChild(sectionTitle)

    const catRow = document.createElement('div')
    catRow.className = 'admin-cat-row'

    const catLabel = document.createElement('label')
    catLabel.style.cssText = 'font-size:11px;color:var(--text-muted);white-space:nowrap'
    catLabel.textContent = 'Category Name'
    catRow.appendChild(catLabel)

    const catInput = document.createElement('input')
    catInput.className = 'admin-cat-input'
    catInput.id = `adm-cat-${ci}`
    catInput.value = cat.name
    catRow.appendChild(catInput)
    content.appendChild(catRow)

    for (const [qi, pts] of cat.points.entries()) {
      content.appendChild(buildAdminAccordion(cat, ci, qi, pts))
    }
  }

  openOverlay('admin-overlay')
}

function saveAdmin(): void {
  for (const [ci, cat] of appState.data.categories.entries()) {
    const catInput = document.getElementById(`adm-cat-${ci}`) as HTMLInputElement | null
    if (catInput) cat.name = catInput.value.trim() || cat.name

    for (const [qi] of cat.questions.entries()) {
      const qEl = document.getElementById(`adm-q-${ci}-${qi}`) as HTMLTextAreaElement | null
      const aEl = document.getElementById(`adm-a-${ci}-${qi}`) as HTMLInputElement | null
      if (!qEl || !aEl) continue

      const existing = cat.questions[qi]
      if (existing) {
        existing.q = qEl.value
        existing.a = aEl.value
      } else {
        cat.questions[qi] = { q: qEl.value, a: aEl.value }
      }

      const question = cat.questions[qi]
      if (!question) continue

      const imgKey = `${ci}-${qi}`
      const imgValue = appState.imgStaging[imgKey]
      if (imgValue !== undefined) {
        if (imgValue) {
          question.img = imgValue
        } else {
          delete question.img
        }
      }
    }
  }

  clearRecord(appState.imgStaging)
  saveData()
  renderAll()
  closeOverlay('admin-overlay')
}

export function setupAdminPanelEvents(signal: AbortSignal): void {
  $('btn-close-admin').addEventListener('click', () => closeOverlay('admin-overlay'), { signal })
  $('btn-save-admin').addEventListener('click', saveAdmin, { signal })

  $('admin-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return

      const ci = Number(target.dataset.ci)
      const qi = Number(target.dataset.qi)

      switch (target.dataset.action) {
        case 'toggle-accordion': {
          target.classList.toggle('collapsed')
          const body = target.nextElementSibling as HTMLElement | null
          if (body) body.classList.toggle('hidden')
          break
        }
        case 'choose-image':
          document.getElementById(`adm-img-file-${ci}-${qi}`)?.click()
          break
        case 'clear-image': {
          appState.imgStaging[`${ci}-${qi}`] = ''
          const preview = document.getElementById(`adm-img-preview-${ci}-${qi}`) as HTMLImageElement | null
          if (preview) {
            preview.src = ''
            preview.style.display = 'none'
          }
          target.style.display = 'none'
          break
        }
        default:
          break
      }
    },
    { signal },
  )

  $('admin-modal').addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLInputElement
      if (!target.classList.contains('admin-img-file')) return
      const ci = Number(target.dataset.ci)
      const qi = Number(target.dataset.qi)
      const file = target.files?.[0]
      if (file) handleImgUpload(ci, qi, file, `adm-img-preview-${ci}-${qi}`, `adm-img-clear-${ci}-${qi}`)
    },
    { signal },
  )
}
