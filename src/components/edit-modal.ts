import { CATEGORY_COLOR } from '../persistence/db.ts'
import type { CategoryColor } from '../persistence/db.ts'
import { appState, saveData } from '../state/app-state.ts'
import { $, clearRecord } from '../dom/helpers.ts'
import { closeOverlay, openOverlay } from '../dom/modal.ts'
import { renderAll } from '../render.ts'
import { handleImgUpload } from './image-upload.ts'

const COLOR_ORDER = [
  CATEGORY_COLOR.blue, CATEGORY_COLOR.orange, CATEGORY_COLOR.purple,
  CATEGORY_COLOR.green, CATEGORY_COLOR.red, CATEGORY_COLOR.teal,
  CATEGORY_COLOR.pink, CATEGORY_COLOR.yellow,
] as const

export function editCategory(ci: number): void {
  const cat = appState.data.categories[ci]
  if (!cat) return
  const content = $('edit-content')
  content.textContent = ''

  const title = document.createElement('div')
  title.className = 'modal-title'
  title.textContent = 'Edit Category'
  content.appendChild(title)

  const nameLabel = document.createElement('div')
  nameLabel.className = 'field-label'
  nameLabel.textContent = 'Category Name'
  content.appendChild(nameLabel)

  const nameInput = document.createElement('input')
  nameInput.className = 'edit-input'
  nameInput.id = 'ec-name'
  nameInput.value = cat.name
  content.appendChild(nameInput)

  const colorLabel = document.createElement('div')
  colorLabel.className = 'field-label'
  colorLabel.style.marginTop = '16px'
  colorLabel.textContent = 'Color'
  content.appendChild(colorLabel)

  const colorRow = document.createElement('div')
  colorRow.className = 'color-picker-row'
  colorRow.id = 'ec-colors'
  for (const c of COLOR_ORDER) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'color-swatch'
    swatch.dataset.color = c
    swatch.dataset.action = 'pick-color'
    if (c === cat.color) swatch.classList.add('selected')
    colorRow.appendChild(swatch)
  }
  content.appendChild(colorRow)

  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'edit-save'
  saveBtn.textContent = 'Save Category'
  saveBtn.dataset.action = 'save-category'
  saveBtn.dataset.ci = String(ci)
  content.appendChild(saveBtn)

  openOverlay('edit-overlay')
}

function saveCategoryEdit(ci: number): void {
  const cat = appState.data.categories[ci]
  if (!cat) return

  const nameEl = document.getElementById('ec-name') as HTMLInputElement | null
  if (nameEl) cat.name = nameEl.value.trim() || cat.name

  const selectedSwatch = document.querySelector('#ec-colors .color-swatch.selected') as HTMLElement | null
  const color = selectedSwatch?.dataset.color
  if (color && Object.values(CATEGORY_COLOR).includes(color as CategoryColor)) {
    cat.color = color as CategoryColor
  }

  saveData()
  renderAll()
  closeOverlay('edit-overlay')
}

export function editCell(ci: number, qi: number): void {
  const cat = appState.data.categories[ci]
  if (!cat) return
  const question = cat.questions[qi]
  if (!question) return
  const pts = cat.points[qi] ?? 100

  const content = $('edit-content')
  content.textContent = ''

  const title = document.createElement('div')
  title.className = 'modal-title'
  title.textContent = 'Edit Question'
  content.appendChild(title)

  const context = document.createElement('div')
  context.className = 'cell-editor-context'
  const catDot = document.createElement('span')
  catDot.className = 'cell-editor-dot'
  catDot.dataset.color = cat.color
  context.appendChild(catDot)
  context.appendChild(document.createTextNode(`${cat.name} — ${pts} pts`))
  content.appendChild(context)

  const ptsLabel = document.createElement('div')
  ptsLabel.className = 'field-label'
  ptsLabel.textContent = 'Points'
  content.appendChild(ptsLabel)

  const ptsInput = document.createElement('input')
  ptsInput.type = 'number'
  ptsInput.className = 'ec-pts-input'
  ptsInput.id = 'cell-pts'
  ptsInput.value = String(pts)
  ptsInput.min = '0'
  ptsInput.step = '50'
  ptsInput.style.width = '100%'
  content.appendChild(ptsInput)

  const qLabel = document.createElement('div')
  qLabel.className = 'field-label'
  qLabel.textContent = 'Question'
  content.appendChild(qLabel)

  const qTextarea = document.createElement('textarea')
  qTextarea.className = 'edit-textarea'
  qTextarea.id = 'cell-q'
  qTextarea.value = question.q
  content.appendChild(qTextarea)

  const aLabel = document.createElement('div')
  aLabel.className = 'field-label'
  aLabel.textContent = 'Answer'
  content.appendChild(aLabel)

  const aInput = document.createElement('input')
  aInput.className = 'edit-input'
  aInput.id = 'cell-a'
  aInput.value = question.a
  content.appendChild(aInput)

  const imgLabel = document.createElement('div')
  imgLabel.className = 'field-label'
  imgLabel.textContent = 'Image (optional)'
  content.appendChild(imgLabel)

  const imgZone = document.createElement('div')
  imgZone.className = 'img-upload-zone'

  const preview = document.createElement('img')
  preview.className = 'img-preview-thumb'
  preview.id = 'cell-img-preview'
  preview.alt = 'Question image preview'
  if (question.img) {
    preview.src = question.img
    preview.style.display = 'block'
  } else {
    preview.style.display = 'none'
  }
  imgZone.appendChild(preview)

  const imgBtnRow = document.createElement('div')
  imgBtnRow.style.cssText = 'display:flex;gap:8px;align-items:center'

  const chooseBtn = document.createElement('button')
  chooseBtn.type = 'button'
  chooseBtn.className = 'img-file-btn'
  chooseBtn.textContent = 'Choose Image'
  chooseBtn.dataset.action = 'cell-choose-image'
  imgBtnRow.appendChild(chooseBtn)

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'img-clear-btn'
  clearBtn.id = 'cell-img-clear'
  clearBtn.textContent = 'Remove'
  clearBtn.dataset.action = 'cell-clear-image'
  clearBtn.dataset.ci = String(ci)
  clearBtn.dataset.qi = String(qi)
  clearBtn.style.display = question.img ? 'inline-block' : 'none'
  imgBtnRow.appendChild(clearBtn)

  imgZone.appendChild(imgBtnRow)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.id = 'cell-img-file'
  fileInput.dataset.ci = String(ci)
  fileInput.dataset.qi = String(qi)
  fileInput.style.display = 'none'
  imgZone.appendChild(fileInput)

  content.appendChild(imgZone)

  const actions = document.createElement('div')
  actions.className = 'cell-editor-actions'

  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'edit-save'
  saveBtn.textContent = 'Save'
  saveBtn.dataset.action = 'save-cell'
  saveBtn.dataset.ci = String(ci)
  saveBtn.dataset.qi = String(qi)
  actions.appendChild(saveBtn)

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'cell-editor-cancel'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.dataset.action = 'cancel-cell'
  actions.appendChild(cancelBtn)

  content.appendChild(actions)

  openOverlay('edit-overlay')
}

function saveCellEdit(ci: number, qi: number): void {
  const cat = appState.data.categories[ci]
  if (!cat) return
  const question = cat.questions[qi]
  if (!question) return

  const ptsEl = document.getElementById('cell-pts') as HTMLInputElement | null
  const qEl = document.getElementById('cell-q') as HTMLTextAreaElement | null
  const aEl = document.getElementById('cell-a') as HTMLInputElement | null

  if (ptsEl) cat.points[qi] = Number(ptsEl.value) || 100
  if (qEl) question.q = qEl.value
  if (aEl) question.a = aEl.value

  const imgKey = `${ci}-${qi}`
  const imgValue = appState.imgStaging[imgKey]
  if (imgValue !== undefined) {
    if (imgValue) {
      question.img = imgValue
    } else {
      delete question.img
    }
  }

  clearRecord(appState.imgStaging)
  saveData()
  renderAll()
  closeOverlay('edit-overlay')
}

export function setupEditModalEvents(signal: AbortSignal): void {
  $('btn-close-edit').addEventListener('click', () => closeOverlay('edit-overlay'), { signal })

  $('edit-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return

      switch (target.dataset.action) {
        case 'save-category':
          saveCategoryEdit(Number(target.dataset.ci))
          break
        case 'pick-color': {
          document.querySelectorAll('#ec-colors .color-swatch').forEach((s) => s.classList.remove('selected'))
          target.classList.add('selected')
          break
        }
        case 'save-cell':
          saveCellEdit(Number(target.dataset.ci), Number(target.dataset.qi))
          break
        case 'cancel-cell':
          clearRecord(appState.imgStaging)
          closeOverlay('edit-overlay')
          break
        case 'cell-choose-image':
          document.getElementById('cell-img-file')?.click()
          break
        case 'cell-clear-image': {
          const ci = Number(target.dataset.ci)
          const qi = Number(target.dataset.qi)
          appState.imgStaging[`${ci}-${qi}`] = ''
          const preview = document.getElementById('cell-img-preview') as HTMLImageElement | null
          if (preview) { preview.src = ''; preview.style.display = 'none' }
          target.style.display = 'none'
          break
        }
        default:
          break
      }
    },
    { signal },
  )

  $('edit-modal').addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLInputElement
      if (target.id !== 'cell-img-file') return
      const ci = Number(target.dataset.ci)
      const qi = Number(target.dataset.qi)
      const file = target.files?.[0]
      if (file) handleImgUpload(ci, qi, file, 'cell-img-preview', 'cell-img-clear')
    },
    { signal },
  )
}
