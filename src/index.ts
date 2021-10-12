import simpleGit, { SimpleGit } from 'simple-git'

const format = (result: string): string[] => result.split('\n').filter(Boolean)

interface Log {
  sha: string
  ref: string
  date: string
  action: string
}

interface Ref {
  name: string
  sha: string
}

const formatRef = (ref: string): string => ref.replace(/^refs\/(heads|remotes\/[^/]+)\//, '')

/**
 * Find deleted unmerged branches by local repository directory
 * @param dir local directory
 */
const findDeletedUnmergedBranches = async (dir: string): Promise<Array<{ name: string, sha: string }>> => {
  const git: SimpleGit = simpleGit({ baseDir: dir })
  const isRepo = await git.checkIsRepo()
  if (!isRepo) {
    throw new Error('Not a git repository')
  }

  const getRefLogs = async (): Promise<Log[]> => {
    const reflogs = format(await git.raw(['reflog', '--all', '--date=iso']))
    const regex = /^\s*([^\s]+) ([^@]+)@{([^}]+)}: (.*)\s*$/
    const logs = reflogs.map(log => {
      const [, sha, ref, date, action] = regex.exec(log) ?? []
      return {
        sha,
        ref: formatRef(ref),
        date,
        action: action?.split(':')[0]
      }
    }).reverse()
    return logs
  }

  const getRefs = async (): Promise<Ref[]> => {
    const refs = format(await git.raw('show-ref'))
    return refs.map(e => {
      const [sha, name] = e.split(' ')
      return { sha, name }
    }).filter(e => e.name.startsWith('refs/heads/') || e.name.startsWith('refs/remotes/'))
  }

  const getChildrenCommits = async (commits: string[], withSelf = true): Promise<Set<string>> => {
    const result = new Set<string>()
    for (const commit of commits) {
      const revList = format(await git.raw('log', commit, '--pretty=format:%h'))
      revList.forEach((sha, index) => {
        if (withSelf || index > 0) {
          result.add(sha)
        }
      })
    }
    return result
  }

  const getReachableCommits = async (): Promise<Set<string>> => {
    const refs = await getRefs()
    return await getChildrenCommits(refs.map(e => e.sha))
  }

  const getReachableRefNames = async (): Promise<Set<string>> => {
    const refs = await getRefs()
    return new Set(refs.map(e => formatRef(e.name)))
  }

  const logs = await getRefLogs()
  const reachableCommits = await getReachableCommits()
  const reachableRefNames = await getReachableRefNames()
  const deletedUnmergedBranchMap: Record<string, string> = {}
  const unresolvedCommits: Set<string> = new Set()
  for (const reflog of logs) {
    if (!reachableCommits.has(reflog.sha) && !reachableRefNames.has(reflog.ref)) {
      if (reflog.ref !== 'HEAD') {
        deletedUnmergedBranchMap[reflog.ref] = reflog.sha
        unresolvedCommits.delete(reflog.sha)
      } else {
        unresolvedCommits.add(reflog.sha)
      }
    }
  }

  const unresolvedCommitsChildren = await getChildrenCommits(Array.from(unresolvedCommits), false)
  unresolvedCommitsChildren.forEach(sha => {
    unresolvedCommits.delete(sha)
  })

  const data = [
    ...Array.from(unresolvedCommits).map((sha: string) => ({ name: '<unknown>', sha })),
    ...(Object.keys(deletedUnmergedBranchMap).map(branch => ({ name: branch, sha: deletedUnmergedBranchMap[branch] })))
  ]
  return data
}

export default findDeletedUnmergedBranches
