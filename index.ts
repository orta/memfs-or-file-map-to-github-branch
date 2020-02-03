import { Octokit } from "@octokit/rest"

interface MemFSVolume {
  toJSON(): any
}

/**
 * The config for creating a branch. Noting the repo,
 * base branch (what should it work from), the new branch
 * and the message for the generated commit. The commit's
 * author will be whomever the API is authenticated with.
 */
export interface BranchCreationConfig {
  /** The danger in danger/danger-js */
  owner: string
  /** The danger-js in danger/danger-js */
  repo: string
  /** Base branch to start working from, null is implied to be `heads/master` */
  fullBaseBranch?: string
  /** The ref in the URL must `heads/branch`, not just `branch`. */
  fullBranchReference: string
  /** Message for the commit */
  message: string
}

/** Basically a filename to file contents map */
interface FileMap {
  [filename: string]: string
}

/**
 * Creates a bunch of blobs, wraps them in a tree, updates a reference from a memfs volume
 */
export const memFSToGitHubCommits = async (api: Octokit, volume: MemFSVolume, settings: BranchCreationConfig) => {
  const fileMap: FileMap = volume.toJSON()
  return filepathContentsMapToUpdateGitHubBranch(api, fileMap, settings)
}

/**
 * Creates a bunch of blobs, wraps them in a tree, updates a reference from a map of files to contents
 */
export const filepathContentsMapToUpdateGitHubBranch = async (
  api: Octokit,
  fileMap: FileMap,
  settings: BranchCreationConfig
) => {
  const getSha = await shaForBranch(api, settings)
  const baseSha = getSha.data.object.sha
  const tree = await createTree(api, settings)(fileMap, baseSha)
  const commit = await createACommit(api, settings)(tree.sha, baseSha)
  await updateReference(api, settings)(commit.data.sha)
}

/** If we want to make a commit, or update a reference, we'll need the original commit */
const shaForBranch = async (api: Octokit, settings: BranchCreationConfig) =>
  api.git.getRef({
    owner: settings.owner,
    repo: settings.repo,
    ref: settings.fullBaseBranch || "heads/master"
  })

/**
 * A Git tree object creates the hierarchy between files in a Git repository. To create a tree
 * we need to make a list of blobs (which represent changes to the FS)
 *
 * We want to build on top of the tree that already exists at the last sha
 *
 * https://developer.github.com/v3/git/trees/
 */
export const createTree = (api: Octokit, settings: BranchCreationConfig) => async (
  fileMap: FileMap,
  baseSha: string
): Promise<any> => {
  const blobSettings = { owner: settings.owner, repo: settings.repo }
  const createBlobs = Object.keys(fileMap).map(filename =>
    api.git.createBlob({ ...blobSettings, content: fileMap[filename] }).then((blob: any) => ({
      sha: blob.data.sha,
      path: filename,
      mode: "100644",
      type: "blob"
    }))
  )

  const blobs = await Promise.all(createBlobs)
  const tree = await api.git.createTree({ ...blobSettings, tree: blobs as any, base_tree: baseSha })
  return tree.data
}

/**
 * A Git commit is a snapshot of the hierarchy (Git tree) and the contents of the files (Git blob) in a Git repository
 *
 * https://developer.github.com/v3/git/commits/
 */
export const createACommit = (api: Octokit, settings: BranchCreationConfig) => (
  treeSha: string,
  parentSha: string
): Promise<any> =>
  api.git.createCommit({
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
export const updateReference = (api: Octokit, settings: BranchCreationConfig) => async (
  newSha: string
): Promise<any> => {
  const refSettings = {
    owner: settings.owner,
    repo: settings.repo,
    ref: `refs/${settings.fullBranchReference}`
  }
  try {
    await api.git.getRef(refSettings)

    // It must exist, so we should update it
    return api.git.createRef({
      ...refSettings,
      sha: newSha
    })
  } catch (error) {
    // We have to create the reference because it doesn't exist yet
    return api.git.createRef({
      ...refSettings,
      sha: newSha
    })
  }
}
