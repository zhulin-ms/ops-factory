import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { handleFindFiles, handleReadFile, handleSearchContent } from './handlers.js'

async function withTempRoot(run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fs-qa-'))
  const previousRoot = process.env.QA_CLI_ROOT_DIR

  process.env.QA_CLI_ROOT_DIR = tempDir
  try {
    await run(tempDir)
  } finally {
    if (previousRoot === undefined) {
      delete process.env.QA_CLI_ROOT_DIR
    } else {
      process.env.QA_CLI_ROOT_DIR = previousRoot
    }
    await rm(tempDir, { recursive: true, force: true })
  }
}

test('find_files lists matching files within the configured root', async () => {
  await withTempRoot(async (rootDir) => {
    const resolvedRoot = await realpath(rootDir)
    await mkdir(path.join(rootDir, 'config'), { recursive: true })
    await writeFile(path.join(rootDir, 'config', 'app.yaml'), 'name: app\n', 'utf8')
    await writeFile(path.join(rootDir, 'config', 'note.txt'), 'hello\n', 'utf8')

    const result = JSON.parse(await handleFindFiles({ pathPrefix: 'config', glob: '*.yaml' }))

    assert.equal(result.rootDir, resolvedRoot)
    assert.equal(result.total, 1)
    assert.equal(result.files[0].path, path.join(resolvedRoot, 'config', 'app.yaml'))
  })
})

test('search_content finds text hits and returns absolute file paths', async () => {
  await withTempRoot(async (rootDir) => {
    const resolvedRoot = await realpath(rootDir)
    await mkdir(path.join(rootDir, 'logs'), { recursive: true })
    const filePath = path.join(resolvedRoot, 'logs', 'service.log')
    await writeFile(filePath, 'INFO startup\nERROR failed to bind port\n', 'utf8')

    const result = JSON.parse(await handleSearchContent({ query: 'failed to bind', pathPrefix: 'logs' }))

    assert.equal(result.rootDir, resolvedRoot)
    assert.equal(result.total, 1)
    assert.equal(result.hits[0].path, filePath)
    assert.equal(result.hits[0].line, 2)
  })
})

test('read_file returns numbered content for the requested line range', async () => {
  await withTempRoot(async (rootDir) => {
    const resolvedRoot = await realpath(rootDir)
    const filePath = path.join(resolvedRoot, 'run.log')
    await writeFile(filePath, 'line1\nline2\nline3\nline4\n', 'utf8')

    const result = JSON.parse(await handleReadFile({ path: filePath, startLine: 2, endLine: 3 }))

    assert.equal(result.path, filePath)
    assert.equal(result.startLine, 2)
    assert.equal(result.endLine, 3)
    assert.match(result.content, /2\s+line2/)
    assert.match(result.content, /3\s+line3/)
  })
})

test('read_file rejects paths outside the configured root', async () => {
  await withTempRoot(async (rootDir) => {
    const outsideFile = path.join(path.dirname(rootDir), 'outside.txt')
    await writeFile(outsideFile, 'outside\n', 'utf8')

    await assert.rejects(
      handleReadFile({ path: outsideFile }),
      /escapes configured rootDir/,
    )

    await rm(outsideFile, { force: true })
  })
})
