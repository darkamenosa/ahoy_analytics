import fs from 'node:fs'
import path from 'node:path'

const buildRoot = path.resolve('app/assets/ahoy_analytics/build')
const action = process.argv[2] || 'clean'

if (action === 'clean') {
  try {
    if (fs.existsSync(buildRoot)) {
      fs.rmSync(buildRoot, { recursive: true, force: true })
    }
    fs.mkdirSync(buildRoot, { recursive: true })
  } catch (error) {
    console.error('[build] Failed to reset build directory:', error)
    process.exitCode = 1
  }
} else if (action === 'finalize') {
  // Rename .vite → vite (fixes Ruby Dir[] not matching dotfiles in gemspec)
  const dotViteDir = path.join(buildRoot, '.vite')
  const viteDir = path.join(buildRoot, 'vite')
  try {
    if (fs.existsSync(dotViteDir)) {
      if (fs.existsSync(viteDir)) {
        fs.rmSync(viteDir, { recursive: true, force: true })
      }
      fs.renameSync(dotViteDir, viteDir)
    }
  } catch (error) {
    console.error('[build] Failed to rename .vite directory:', error)
    process.exitCode = 1
  }
}
