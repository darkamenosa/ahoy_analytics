import fs from 'node:fs'
import path from 'node:path'

const buildRoot = path.resolve('app/assets/ahoy_analytics/build')

try {
  if (fs.existsSync(buildRoot)) {
    fs.rmSync(buildRoot, { recursive: true, force: true })
  }
  fs.mkdirSync(buildRoot, { recursive: true })
} catch (error) {
  console.error('[clean-build] Failed to reset build directory:', error)
  process.exitCode = 1
}
