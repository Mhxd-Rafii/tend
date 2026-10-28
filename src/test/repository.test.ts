import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import { mutateData, pendingChanges, readData, setRepositoryUser } from '../lib/repository'
import { mockApi } from './mock-api'
import { cacheRead } from '../lib/cache'
let server: Awaited<ReturnType<typeof mockApi>>
beforeEach(async () => { await deleteDB('tend-cloud-cache'); server = await mockApi() })
describe('server persistence and explicit offline synchronization', () => {
  it('writes to the API and reloads real server records', async () => {
    await readData(); await mutateData(d => { d.logs[0].notes = 'Saved to server' })
    expect(server.data.logs.find(l => l.id === 'seed-1')?.notes).toBe('Saved to server')
    expect((await readData()).revision).toBe(1); expect(await pendingChanges()).toBe(0)
  })
  it('serializes concurrent edits without dropping either change', async () => {
    await readData()
    await Promise.all([mutateData(d => { d.logs[0].notes = 'First' }), mutateData(d => { d.logs[1].notes = 'Second' })])
    expect(server.data.logs.find(l => l.id === 'seed-1')?.notes).toBe('First'); expect(server.data.logs.find(l => l.id === 'seed-2')?.notes).toBe('Second')
  })
  it('queues activity edits offline and uploads them only after reconnection', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await mutateData(d => { d.logs[0].notes = 'Queued offline' })
    expect(await pendingChanges()).toBe(1); expect(server.data.logs[0].notes).toBe(''); expect((await readData()).logs[0].notes).toBe('Queued offline')
    online.mockReturnValue(true); await readData(); expect(server.data.logs[0].notes).toBe('Queued offline'); expect(await pendingChanges()).toBe(0)
  })
  it('does not claim success or silently use cached data on database failure', async () => {
    server.fail(true)
    await expect(readData()).rejects.toThrow('Database unavailable')
    await expect(mutateData(d => { d.logs[0].notes = 'Unconfirmed' })).rejects.toThrow('Database unavailable')
    expect(server.data.logs[0].notes).toBe(''); expect(await pendingChanges()).toBe(1)
  })
  it('retries an interrupted response with the same mutation ID', async () => {
    server.loseReply()
    await expect(mutateData(d => { d.logs[0].notes = 'Committed once' })).rejects.toThrow('Network')
    expect(server.data.revision).toBe(1); expect(await pendingChanges()).toBe(1)
    await readData(); expect(server.data.revision).toBe(1); expect(await pendingChanges()).toBe(0)
  })
  it('keeps conflicts pending and isolates cached journals by account', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await mutateData(d => { d.logs[0].notes = 'Offline edit' })
    const changed = server.data; changed.logs[0].notes = 'Other device'; server.replace(changed)
    online.mockReturnValue(true); await expect(readData()).rejects.toThrow('Changed on another device'); expect(await pendingChanges()).toBe(1)
    setRepositoryUser('different-account'); online.mockReturnValue(false); await expect(readData()).rejects.toThrow('Connect once'); expect(await cacheRead('different-account')).toBeUndefined()
  })
})
