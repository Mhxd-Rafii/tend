import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { deleteDB } from 'idb'
import type { ReactNode } from 'react'
import { StoreProvider } from '../lib/store'
import { readData } from '../lib/repository'
import { WorkspaceProvider } from '../components/workspace'
import { QuickAdd } from '../components/quick-add'
import ActivityLogPage from '../pages/activity-log'
import GymPage from '../pages/gym'
import HabitsPage from '../pages/habits'
import { mockApi, testAccount } from './mock-api'
vi.mock('../lib/auth-client', () => ({ useAuth: () => ({ session: { user: testAccount, expiresAt: '2080-01-01T00:00:00Z' }, refresh: vi.fn(), signOut: vi.fn() }) }))
beforeEach(async () => { await deleteDB('tend-cloud-cache'); await mockApi(); window.scrollTo = vi.fn() })
function mount(children: ReactNode) { const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={queryClient}><StoreProvider><MemoryRouter><WorkspaceProvider>{children}</WorkspaceProvider></MemoryRouter></StoreProvider></QueryClientProvider>) }
describe('connected activity UI', () => {
  it('searches a suggestion and saves it with one click, without a duplicate on retry', async () => {
    const user = userEvent.setup(); mount(<QuickAdd date="2026-10-28" />)
    const search = await screen.findByRole('textbox', { name: 'Search activity suggestions' }); await user.type(search, 'Phone fully charged')
    const button = screen.getByRole('button', { name: 'Log Phone fully charged' }); await user.click(button)
    await waitFor(async () => expect((await readData()).logs.filter(l => l.templateId === 'devices-1')).toHaveLength(1))
    await user.click(button); await waitFor(async () => expect((await readData()).logs.filter(l => l.templateId === 'devices-1')).toHaveLength(1))
  })
  it('renders the current TanStack table, filters historical records, and opens edit details', async () => {
    const user = userEvent.setup(); mount(<ActivityLogPage />)
    const search = await screen.findByRole('textbox', { name: 'Search activity log' })
    await user.type(search, 'AirPods'); await waitFor(() => expect(screen.getByText('1 activity')).toBeInTheDocument())
    const edit = screen.getAllByRole('button', { name: 'Edit AirPods fully charged' })[0]; await user.click(edit)
    expect(await screen.findByRole('dialog', { name: 'Edit activity' })).toBeInTheDocument()
    const notes = screen.getByRole('textbox', { name: 'Notes' }); await user.type(notes, 'Updated from journal'); await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await readData()).logs.find(l => l.id === 'seed-1')?.notes).toBe('Updated from journal'))
  })
  it('creates a scheduled habit through the validated editor', async () => {
    const user = userEvent.setup(); mount(<HabitsPage />)
    await user.click(await screen.findByRole('button', { name: 'Create habit' }))
    await user.type(screen.getByRole('textbox', { name: 'Activity name' }), 'Read a page')
    await user.click(screen.getByRole('button', { name: 'Save activity' }))
    await waitFor(async () => expect((await readData()).templates.some(t => t.name === 'Read a page' && t.kind === 'habit' && !!t.startDate)).toBe(true))
    expect(await screen.findByRole('heading', { name: 'Read a page' })).toBeInTheDocument()
  })
  it('saves linked overnight events on independent dates without fabricating clock times', async () => {
    const user = userEvent.setup(); mount(<QuickAdd date="2026-10-22" />)
    const search = await screen.findByRole('textbox', { name: 'Search activity suggestions' }); await user.type(search, 'Hair oil applied')
    await user.click(screen.getByRole('button', { name: 'Details for Hair oil applied' }))
    await user.click(screen.getByRole('checkbox', { name: /Also record a linked hair wash/ }))
    await user.click(screen.getByRole('button', { name: 'Save activity' }))
    await waitFor(async () => { const current = await readData(); const oil = current.logs.find(l => l.date === '2026-10-22')!; const wash = current.logs.find(l => l.id === oil.relatedId)!; expect(oil.time).toBe(''); expect(wash.date).toBe('2026-10-23'); expect(wash.timeOfDay).toBe('Morning'); expect(wash.relatedId).toBe(oil.id) })
  })
  it('keeps working offline and saves future entries as plans', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const user = userEvent.setup(); mount(<QuickAdd date="2080-01-01" />)
    const search = await screen.findByRole('textbox', { name: 'Search activity suggestions' }); await user.type(search, 'Phone fully charged'); await user.keyboard('{Enter}')
    await waitFor(async () => expect((await readData()).logs.find(l => l.date === '2080-01-01')?.status).toBe('planned'))
    online.mockRestore()
  })
  it('logs rest days and multiple weighted sets through the gym form', async () => {
    const user = userEvent.setup(); mount(<GymPage />)
    await user.click(await screen.findByRole('button', { name: 'Log workout' }))
    await user.click(screen.getByRole('checkbox', { name: 'This is a rest day' }))
    await user.click(screen.getByRole('button', { name: 'Save session' }))
    await waitFor(async () => expect((await readData()).workouts[0]?.restDay).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Log workout' }))
    await user.type(screen.getByRole('combobox', { name: 'Exercise 1 name' }), 'Squat')
    await user.type(screen.getByRole('spinbutton', { name: 'Squat set 1 reps' }), '10')
    await user.type(screen.getByRole('spinbutton', { name: 'Squat set 1 weight' }), '40')
    await user.click(screen.getByRole('button', { name: 'Add set' }))
    await user.click(screen.getByRole('button', { name: 'Save session' }))
    await waitFor(async () => { const sessions = (await readData()).workouts; expect(sessions).toHaveLength(2); expect(sessions[1].exercises[0].sets).toHaveLength(2); expect(sessions[1].exercises[0].sets[1].weight).toBe(40) })
  })
  it('adds metadata-based fields and stores typed values on a historical event', async () => {
    const user = userEvent.setup(); mount(<ActivityLogPage />)
    await user.click(await screen.findByRole('button', { name: 'Columns' }))
    await user.click(screen.getByRole('button', { name: 'Add custom field' }))
    await user.type(screen.getByRole('textbox', { name: 'Field name' }), 'Oil brand')
    await user.click(screen.getByRole('button', { name: 'Save field' }))
    await waitFor(async () => expect((await readData()).fields.some(f => f.name === 'Oil brand')).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    await user.type(screen.getByRole('textbox', { name: 'Search activity log' }), 'AirPods')
    await user.click(screen.getAllByRole('button', { name: 'Edit AirPods fully charged' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Oil brand' }), 'Custom text')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => { const current = await readData(); expect(current.logs.find(l => l.id === 'seed-1')?.fields[current.fields[0].id]).toBe('Custom text') })
  })
})
