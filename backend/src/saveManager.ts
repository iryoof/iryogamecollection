import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const SAVES_DIR = path.join(__dirname, '../../saves')

interface SaveMeta {
  id: string
  name: string
  date: string
}

function ensureDir() {
  if (!fs.existsSync(SAVES_DIR)) {
    fs.mkdirSync(SAVES_DIR, { recursive: true })
  }
}

export function listSaves(): SaveMeta[] {
  ensureDir()
  const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith('.json'))
  return files.map(f => {
    try {
      const raw = fs.readFileSync(path.join(SAVES_DIR, f), 'utf-8')
      const obj = JSON.parse(raw)
      return { id: obj.id || f.replace('.json', ''), name: obj.name || f, date: obj.date || '' }
    } catch (e) {
      return { id: f.replace('.json', ''), name: f, date: '' }
    }
  })
}

export function saveGame(name: string, data: any) {
  ensureDir()
  const id = uuidv4()
  const payload = { id, name, date: new Date().toISOString(), data }
  const file = path.join(SAVES_DIR, `${id}.json`)
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
  return { id, name: payload.name, date: payload.date }
}

export function loadSave(id: string) {
  ensureDir()
  const file = path.join(SAVES_DIR, `${id}.json`)
  if (!fs.existsSync(file)) throw new Error('Save not found')
  const raw = fs.readFileSync(file, 'utf-8')
  const obj = JSON.parse(raw)
  return obj
}

export function deleteSave(id: string) {
  ensureDir()
  const file = path.join(SAVES_DIR, `${id}.json`)
  if (!fs.existsSync(file)) throw new Error('Save not found')
  fs.unlinkSync(file)
}
