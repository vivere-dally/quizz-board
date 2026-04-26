import { APP_MODE } from '../persistence/db.ts'
import { appState } from '../state/app-state.ts'
import { $, cloneTemplate } from '../dom/helpers.ts'

export function renderBoard(): void {
  const el = $('board')
  const frag = document.createDocumentFragment()
  const isEdit = appState.data.mode === APP_MODE.edit

  if (isEdit && appState.data.categories.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'board-empty'
    const icon = document.createElement('div')
    icon.className = 'board-empty__icon'
    icon.textContent = '＋'
    empty.appendChild(icon)
    const text = document.createElement('div')
    text.className = 'board-empty__text'
    text.textContent = 'No categories yet'
    empty.appendChild(text)
    const hint = document.createElement('div')
    hint.className = 'board-empty__hint'
    hint.textContent = 'Add a category to start building your quiz board'
    empty.appendChild(hint)
    frag.appendChild(empty)
    el.textContent = ''
    el.appendChild(frag)
    return
  }

  for (const [ci, cat] of appState.data.categories.entries()) {
    const col = document.createElement('div')
    col.className = 'board-column'
    col.dataset.color = cat.color

    const header = cloneTemplate('tmpl-cat-header')
    const catName = header.querySelector('.cat-name') as HTMLButtonElement
    catName.textContent = cat.name
    catName.dataset.ci = String(ci)

    if (isEdit) {
      const editIcon = document.createElement('span')
      editIcon.className = 'cat-edit-icon'
      editIcon.textContent = '✎'
      header.appendChild(editIcon)
    }

    col.appendChild(header)

    for (const [qi, pts] of cat.points.entries()) {
      const tile = cloneTemplate('tmpl-tile')
      const tileBtn = tile as HTMLButtonElement
      tileBtn.dataset.ci = String(ci)
      tileBtn.dataset.qi = String(qi)

      const ptsSpan = tileBtn.querySelector('.tile-pts') as HTMLElement
      ptsSpan.textContent = String(pts)

      if (!isEdit) {
        const used = !!appState.data.used[`${cat.id}-${qi}`]
        if (used) {
          tileBtn.classList.add('used')
          tileBtn.disabled = true
        }
      }

      col.appendChild(tileBtn)
    }

    if (isEdit) {
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'remove-cat-btn'
      removeBtn.textContent = '✕ Remove'
      removeBtn.dataset.action = 'remove-category'
      removeBtn.dataset.ci = String(ci)
      col.appendChild(removeBtn)
    }

    frag.appendChild(col)
  }

  el.textContent = ''
  el.appendChild(frag)
}
