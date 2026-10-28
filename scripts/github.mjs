import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const root = resolve('.'), tools = join(root, '.tools'), statePath = join(root, '.deployment-state.json')
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
function run(binary, args, options = {}) { const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options }); if (result.error) throw result.error; return result }
async function executable() {
  const installed = run('where.exe', ['gh']); if (installed.status === 0) return installed.stdout.trim().split(/\r?\n/)[0]
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Install the official GitHub CLI from https://cli.github.com, then rerun this command.')
  const target = join(tools, 'github-cli', 'bin', 'gh.exe'); if (existsSync(target)) return target
  mkdirSync(tools, { recursive: true })
  const releaseResponse = await fetch('https://api.github.com/repos/cli/cli/releases/latest', { headers: { 'User-Agent': 'Tend-project-setup', Accept: 'application/vnd.github+json' } })
  if (!releaseResponse.ok) throw new Error('Could not locate the official GitHub CLI release.')
  const release = await releaseResponse.json(), version = release.tag_name.replace(/^v/, '')
  const asset = release.assets.find(a => a.name === `gh_${version}_windows_amd64.zip`), checksums = release.assets.find(a => a.name === `gh_${version}_checksums.txt`)
  if (!asset || !checksums) throw new Error('Official GitHub CLI download was not found.')
  const [archiveResponse, checksumsResponse] = await Promise.all([fetch(asset.browser_download_url), fetch(checksums.browser_download_url)])
  if (!archiveResponse.ok || !checksumsResponse.ok) throw new Error('GitHub CLI download failed.')
  const archive = Buffer.from(await archiveResponse.arrayBuffer()), expected = (await checksumsResponse.text()).split('\n').find(line => line.trim().endsWith(asset.name))?.trim().split(/\s+/)[0]
  if (!expected || createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('GitHub CLI checksum verification failed.')
  const zip = join(tools, 'github-cli.zip'), output = join(tools, 'github-cli'); writeFileSync(zip, archive)
  const quote = value => `'${value.replaceAll("'", "''")}'`
  const extracted = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(output)} -Force`])
  if (extracted.status !== 0 || !existsSync(target)) throw new Error('GitHub CLI extraction failed.')
  console.log('Downloaded and verified the official GitHub CLI into ignored .tools/.')
  return target
}
try {
  const gh = await executable(), mode = process.argv[2] || 'status'
  if (mode === 'login') { const result = run(gh, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'], { stdio: 'inherit' }); process.exitCode = result.status || 0 }
  else {
    const identity = run(gh, ['api', 'user'])
    if (identity.status !== 0) throw new Error('GitHub is not signed in. Run npm run github:login to authorize your personal account.')
    const user = JSON.parse(identity.stdout)
    if (mode === 'status') { console.log(`GitHub signed in as ${user.login}.`); process.exitCode = 0 }
    else if (mode === 'publish') {
      const remote = run('git', ['remote', 'get-url', 'origin'])
      if (remote.status === 0 && !state.github?.url) throw new Error('An existing Git remote is not registered to this setup. Review it before publishing; nothing was overwritten.')
      if (state.github && state.github.owner !== user.login) throw new Error('The signed-in GitHub account differs from the recorded repository owner.')
      if (!existsSync(join(root, '.git'))) { const init = run('git', ['init', '-b', 'main']); if (init.status !== 0) throw new Error('Git initialization failed.') }
      if (run('git', ['config', 'user.name']).status !== 0) run('git', ['config', 'user.name', user.name || user.login])
      if (run('git', ['config', 'user.email']).status !== 0) run('git', ['config', 'user.email', `${user.id}+${user.login}@users.noreply.github.com`])
      if (run('git', ['add', '.']).status !== 0) throw new Error('Could not stage project files.')
      if (run('git', ['diff', '--cached', '--quiet']).status !== 0) { if (run('git', ['commit', '-m', 'Build authenticated Turso habit tracker for Vercel']).status !== 0) throw new Error('Git commit failed.') }
      if (!state.github) {
        let name = 'dynamic-habit-tracker'
        if (run(gh, ['repo', 'view', `${user.login}/${name}`, '--json', 'id']).status === 0) name += `-${Date.now().toString(36)}`
        const created = run(gh, ['repo', 'create', `${user.login}/${name}`, '--private', '--source=.', '--remote=origin'])
        if (created.status !== 0) throw new Error('GitHub repository creation failed. No existing repository was replaced.')
        const verified = run(gh, ['repo', 'view', `${user.login}/${name}`, '--json', 'id,url,nameWithOwner,isPrivate'])
        if (verified.status !== 0) throw new Error('Repository creation could not be verified. Inspect GitHub before retrying.')
        const repo = JSON.parse(verified.stdout); state.github = { ...repo, owner: user.login }; writeFileSync(statePath, JSON.stringify(state, null, 2))
      }
      const helper = `!'${gh.replaceAll('\\', '/').replaceAll("'", "'\\''")}' auth git-credential`
      const pushed = run('git', ['-c', 'credential.helper=', '-c', `credential.helper=${helper}`, 'push', '-u', 'origin', 'main']); if (pushed.status !== 0) throw new Error('Git push failed. The local commit is preserved.')
      const verified = run(gh, ['repo', 'view', state.github.nameWithOwner, '--json', 'url,isPrivate,defaultBranchRef']); if (verified.status !== 0) throw new Error('The pushed repository could not be verified.')
      console.log(verified.stdout.trim())
    } else throw new Error('Use status, login, or publish.')
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'GitHub setup failed.'); process.exitCode = 1 }
