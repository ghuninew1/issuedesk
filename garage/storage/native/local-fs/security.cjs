const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { Worker } = require('node:worker_threads')
const { pipeline } = require('node:stream/promises')
const { Writable } = require('node:stream')
const { openConfined } = require('./confined.node')

async function main() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-security-'))
  const root = path.join(fixture, 'root')
  fs.mkdirSync(root)
  const fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY)
  const file = name => path.join(root, name)
  const outside = path.join(fixture, 'outside')
  const countFDs = () => fs.readdirSync('/proc/self/fd').length
  const identity = fs.fstatSync(fd, { bigint: true })
  const open = name => openConfined(fd, name, false, identity.dev, identity.ino)
  const read = name => {
    const streamFD = open(name)
    try { return fs.readFileSync(streamFD, 'utf8') } finally { fs.closeSync(streamFD) }
  }
  const pass = name => console.log('PASS', name)
  try {
    fs.writeFileSync(outside, 'outside sentinel')
    fs.mkdirSync(file('dir'))
    fs.writeFileSync(file('dir/inside'), 'inside')
    assert.equal(read('dir/inside'), 'inside')
    pass('regular file')
    assert.throws(() => openConfined(fd, 'dir/inside', false, identity.dev, identity.ino + 1n), { code: 'POLICY_DENIED' })
    const regularFD = open('dir/inside')
    try {
      const stat = fs.fstatSync(regularFD, { bigint: true })
      assert.throws(() => openConfined(regularFD, '.', false, stat.dev, stat.ino), { code: 'POLICY_DENIED' })
    } finally { fs.closeSync(regularFD) }
    const removedRoot = file('removed-root')
    fs.mkdirSync(removedRoot)
    const removedFD = fs.openSync(removedRoot, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY)
    try {
      const stat = fs.fstatSync(removedFD, { bigint: true })
      fs.rmdirSync(removedRoot)
      assert.throws(() => openConfined(removedFD, '.', true, stat.dev, stat.ino), { code: 'POLICY_DENIED' })
    } finally { fs.closeSync(removedFD) }
    pass('mismatched, non-directory and unlinked root descriptors')
    for (const name of ['../outside', outside, 'dir/../dir/inside', 'dir/inside\0x']) {
      assert.throws(() => read(name), { code: 'INVALID_PATH' })
    }
    pass('traversal, absolute path and NUL')
    fs.symlinkSync(fixture, file('parent'))
    fs.symlinkSync(outside, file('leaf'))
    for (const name of ['parent/outside', 'leaf']) assert.throws(() => read(name), { code: 'SYMLINK_DENIED' })
    pass('parent and leaf symlink')
    fs.linkSync(outside, file('hard'))
    assert.throws(() => read('hard'), { code: 'POLICY_DENIED' })
    pass('hard link policy')
    fs.linkSync(file('dir/inside'), file('inside-hard'))
    assert.throws(() => read('dir/inside'), { code: 'POLICY_DENIED' })
    fs.unlinkSync(file('inside-hard'))

    if (process.env.NESTED_ROOT) {
      const nestedFD = fs.openSync(process.env.NESTED_ROOT, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY)
      try {
        const stat = fs.fstatSync(nestedFD, { bigint: true })
        assert.throws(() => openConfined(nestedFD, 'nested', true, stat.dev, stat.ino), { code: 'BOUNDARY_DENIED' })
      } finally { fs.closeSync(nestedFD) }
      pass('nested mount')
    } else throw Error('NESTED_ROOT and a real nested mount are required')

    const prior = open('dir/inside')
    try {
      fs.writeFileSync(file('replacement'), 'replacement')
      fs.renameSync(file('replacement'), file('dir/inside'))
      assert.equal(fs.readFileSync(prior, 'utf8'), 'inside')
      assert.equal(read('dir/inside'), 'replacement')
    } finally { fs.closeSync(prior) }
    pass('replacement after open preserves descriptor identity')

    await swapRace(false)
    await swapRace(true)

    async function swapRace(regularOnly) {
      const gate = new Int32Array(new SharedArrayBuffer(8))
      const worker = new Worker(`
        const {workerData} = require('node:worker_threads')
        const fs = require('node:fs')
        const {root, outside, gate, regularOnly} = workerData
        fs.writeFileSync(root+'/race', 'inside')
        Atomics.store(gate, 0, 1)
        Atomics.notify(gate, 0)
        while (!Atomics.load(gate, 1)) {
          if (regularOnly) fs.writeFileSync(root+'/swap', 'replacement')
          else fs.symlinkSync(outside, root+'/swap')
          fs.renameSync(root+'/swap', root+'/race')
          fs.writeFileSync(root+'/swap', 'inside')
          fs.renameSync(root+'/swap', root+'/race')
        }
      `, { eval: true, workerData: {root, outside, gate, regularOnly} })
      const done = new Promise((resolve, reject) => {
        worker.once('error', reject)
        worker.once('exit', code => code ? reject(Error('Worker exit ' + code)) : resolve())
      })
      done.catch(() => {})
      try {
        Atomics.wait(gate, 0, 0, 5000)
        assert.equal(Atomics.load(gate, 0), 1)
        const observed = new Set()
        let denied = 0
        for (let i = 0; i < 10000; i++) {
          try {
            const bytes = read('race')
            assert(bytes === 'inside' || (regularOnly && bytes === 'replacement'))
            observed.add(bytes)
          } catch (error) {
            const permitted = regularOnly ? ['POLICY_DENIED', 'LOOKUP_RACE'] : ['SYMLINK_DENIED', 'POLICY_DENIED', 'LOOKUP_RACE']
            if (!permitted.includes(error.code)) throw error
            denied++
          }
        }
        assert(regularOnly ? observed.size === 2 : observed.size === 1 && denied > 0)
        pass(regularOnly ? 'regular-to-regular swap race' : 'symlink swap race')
      } finally { Atomics.store(gate, 1, 1); await done }
    }

    fs.writeFileSync(file('stream'), Buffer.alloc(1024 * 1024, 42))
    const stream = () => fs.createReadStream(null, { fd: open('stream'), autoClose: true })
    const before = countFDs()
    await Promise.all(Array.from({length: 8}, async () => {
      let bytes = 0
      for await (const chunk of stream()) { assert(chunk.every(byte => byte === 42)); bytes += chunk.length }
      assert.equal(bytes, 1024 * 1024)
    }))
    assert.equal(countFDs(), before)
    pass('8 concurrent reads and FD cleanup')
    for (let i = 0; i < 25; i++) {
      const controller = new AbortController()
      const output = new Writable({write(_chunk, _encoding, callback) { controller.abort(); callback() }})
      await assert.rejects(pipeline(stream(), output, {signal: controller.signal}), {code: 'ABORT_ERR'})
    }
    for (let i = 0; i < 1000; i++) assert.throws(() => open('hard'), {code: 'POLICY_DENIED'})
    assert.equal(countFDs(), before)
    pass('simulated downstream disconnect and rejection FD cleanup')
  } finally {
    fs.closeSync(fd)
    fs.rmSync(fixture, {recursive: true})
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
