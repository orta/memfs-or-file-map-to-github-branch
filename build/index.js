"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Creates a bunch of blobs, wraps them in a tree, updates a reference from a memfs volume
 */
exports.memFSToGitHubCommits = (api, volume, settings) => __awaiter(this, void 0, void 0, function* () {
    const fileMap = volume.toJSON();
    return exports.filepathContentsMapToUpdateGitHubBranch(api, fileMap, settings);
});
/**
 * Creates a bunch of blobs, wraps them in a tree, updates a reference from a map of files to contents
 */
exports.filepathContentsMapToUpdateGitHubBranch = (api, fileMap, settings) => __awaiter(this, void 0, void 0, function* () {
    const getSha = yield shaForBranch(api, settings);
    const baseSha = getSha.data.object.sha;
    const tree = yield exports.createTree(api, settings)(fileMap);
    const commit = yield exports.createACommit(api, settings)(tree.sha, baseSha);
    yield exports.updateReference(api, settings)(commit.data.sha, baseSha);
});
/** If we want to make a commit, or update a reference, we'll need the original commit */
const shaForBranch = (api, settings) => __awaiter(this, void 0, void 0, function* () {
    return api.gitdata.getReference({
        owner: settings.owner,
        repo: settings.repo,
        ref: settings.fullBranchReference
    });
});
/**
 * A Git tree object creates the hierarchy between files in a Git repository. To create a tree
 * we need to make a list of blobs (which represent changes to the FS)
 *
 * https://developer.github.com/v3/git/trees/
 */
exports.createTree = (api, settings) => (fileMap) => __awaiter(this, void 0, void 0, function* () {
    const blobSettings = { owner: settings.owner, repo: settings.repo };
    const createBlobs = Object.keys(fileMap).map(filename => api.gitdata.createBlob(Object.assign({}, blobSettings, { content: fileMap[filename] })).then((blob) => ({
        sha: blob.data.sha,
        path: filename,
        mode: "100644",
        type: "blob"
    })));
    const blobs = yield Promise.all(createBlobs);
    const tree = yield api.gitdata.createTree(Object.assign({}, blobSettings, { tree: blobs }));
    return tree.data;
});
/**
 * A Git commit is a snapshot of the hierarchy (Git tree) and the contents of the files (Git blob) in a Git repository
 *
 * https://developer.github.com/v3/git/commits/
 */
exports.createACommit = (api, settings) => (treeSha, parentSha) => api.gitdata.createCommit({
    owner: settings.owner,
    repo: settings.repo,
    message: settings.message,
    tree: treeSha,
    parents: [parentSha]
});
/**
 * A Git reference (git ref) is just a file that contains a Git commit SHA-1 hash. When referring
 * to a Git commit, you can use the Git reference, which is an easy-to-remember name, rather than
 * the hash. The Git reference can be rewritten to point to a new commit.
 *
 * https://developer.github.com/v3/git/refs/#git-references
 */
exports.updateReference = (api, settings) => (newSha, parentSha) => api.gitdata.updateReference({
    owner: settings.owner,
    repo: settings.repo,
    ref: settings.fullBranchReference,
    sha: newSha
});
