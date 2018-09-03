import * as GitHub from "@octokit/rest"

interface MemFSVolume {
  toJSON(): any
}

interface RepoSettings {
  /** The danger in danger/danger-js */
  owner: string
  /** The danger-js in danger/danger-js */
  repo: string
  /** The ref in the URL must `heads/branch`, not just `branch`. */
  fullBranchReference: string
  /** Message for the commit */
  message: string
}

interface FileMap {
  [filename: string]: string
}

/**
 * Creates a bunch of blobs, wraps them in a tree, updates a reference from a memfs volume
 */
export const memFSToGitHubCommits = async (api: GitHub, volume: MemFSVolume, settings: RepoSettings) => {
  const fileMap: FileMap = volume.toJSON()
  return filepathContentsMapToUpdateGitHubBranch(api, fileMap, settings)
}

/**
 * Creates a bunch of blobs, wraps them in a tree, updates a reference from a map of files to contents
 */
export const filepathContentsMapToUpdateGitHubBranch = async (
  api: GitHub,
  fileMap: FileMap,
  settings: RepoSettings
) => {
  const getSha = await shaForBranch(api, settings)
  const baseSha = getSha.data.object.sha
  const tree = await createTree(api, settings)(fileMap)
  const commit = await createACommit(api, settings)(tree.sha, baseSha)
  await updateReference(api, settings)(commit.data.sha, baseSha)
}

/** If we want to make a commit, or update a reference, we'll need the original commit */
const shaForBranch = async (api: GitHub, settings: RepoSettings) =>
  api.gitdata.getReference({
    owner: settings.owner,
    repo: settings.repo,
    ref: settings.fullBranchReference
  })

/**
 * A Git tree object creates the hierarchy between files in a Git repository. To create a tree
 * we need to make a list of blobs (which represent changes to the FS)
 *
 * https://developer.github.com/v3/git/trees/
 */
export const createTree = (api: GitHub, settings: RepoSettings) => async (fileMap: FileMap) => {
  const blobSettings = { owner: settings.owner, repo: settings.repo }
  const createBlobs = Object.keys(fileMap).map(filename =>
    api.gitdata.createBlob({ ...blobSettings, content: fileMap[filename] }).then((blob: any) => ({
      sha: blob.data.sha,
      path: filename,
      mode: "100644",
      type: "blob"
    }))
  )

  const blobs = await Promise.all(createBlobs)
  const tree = await api.gitdata.createTree({ ...blobSettings, tree: blobs as any })
  return tree.data
}

/**
 * A Git commit is a snapshot of the hierarchy (Git tree) and the contents of the files (Git blob) in a Git repository
 *
 * https://developer.github.com/v3/git/commits/
 */
export const createACommit = (api: GitHub, settings: RepoSettings) => (treeSha: string, parentSha: string) =>
  api.gitdata.createCommit({
    owner: settings.owner,
    repo: settings.repo,
    message: settings.message,
    tree: treeSha,
    parents: [parentSha]
  })

/**
 * A Git reference (git ref) is just a file that contains a Git commit SHA-1 hash. When referring
 * to a Git commit, you can use the Git reference, which is an easy-to-remember name, rather than
 * the hash. The Git reference can be rewritten to point to a new commit.
 *
 * https://developer.github.com/v3/git/refs/#git-references
 */
export const updateReference = (api: GitHub, settings: RepoSettings) => (newSha: string, parentSha: string) =>
  api.gitdata.updateReference({
    owner: settings.owner,
    repo: settings.repo,
    ref: settings.fullBranchReference,
    sha: newSha
  })
