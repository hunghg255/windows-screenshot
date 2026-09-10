const { readFileSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { validateReleaseTag } = require('./validate-release-tag.cjs');

function describeError(error) {
  return [error.code, error.message, error.cause && describeError(error.cause),
    ...(error.errors || []).map(describeError)].filter(Boolean).join(': ');
}

async function publishRelease({ tag, version, repository, directory }, dependencies = {}) {
  const request = dependencies.request || fetch;
  const wait = dependencies.wait || delay;
  const run = dependencies.run || (args => execFileSync('gh', args, { stdio: 'inherit' }));
  const release = validateReleaseTag('tag', tag, version);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository.');
  const files = [release.installer, 'SHA256SUMS.txt'];
  const paths = files.map(name => join(resolve(directory), name));
  const sizes = paths.map(path => statSync(path).size);
  if (sizes.some(size => size === 0)) throw new Error('Release assets must not be empty.');
  const hash = createHash('sha256').update(readFileSync(paths[0])).digest('hex');
  if (readFileSync(paths[1], 'utf8').trim() !== `${hash}  ${release.installer}`) throw new Error('Installer checksum mismatch.');

  const endpoint = `https://api.github.com/repos/${repository}/releases`;
  const headers = { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28' };
  async function apiRequest(url, operation, options = {}) {
    const method = options.method || 'GET';
    const attempts = method === 'GET' ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let failure;
      try {
        const response = await request(url, { headers, ...options, signal: AbortSignal.timeout(30_000) });
        if (method === 'GET' && [500, 502, 503, 504].includes(response.status) && attempt < attempts) {
          await response.body?.cancel();
          failure = `HTTP ${response.status}`;
        } else {
          // Read the body within the timeout/retry boundary as well.
          const data = response.ok ? await response.json() : null;
          return { response, data };
        }
      } catch (error) {
        failure = describeError(error);
        if (attempt === attempts) {
          throw new Error(`${operation} failed (${method} ${url}) after ${attempt} attempt(s): ${failure}`, { cause: error });
        }
      }
      console.warn(`${operation} failed (${method} ${url}): ${failure}. Retrying (${attempt + 1}/${attempts}).`);
      await wait(1000 * 2 ** (attempt - 1));
    }
  }
  async function getRelease(path) {
    const { response, data } = await apiRequest(`${endpoint}${path}`, 'Release lookup');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Release lookup failed: HTTP ${response.status}.`);
    return data;
  }
  async function lookup() {
    const published = await getRelease(`/tags/${encodeURIComponent(tag)}`);
    if (published) return published;
    // The tag endpoint only returns published releases. Include drafts on reruns.
    for (let page = 1; ; page++) {
      const releases = await getRelease(`?per_page=100&page=${page}`);
      if (!releases) throw new Error('Release listing failed: HTTP 404.');
      const match = releases.find(candidate => candidate.tag_name === tag);
      if (match) return match;
      if (releases.length < 100) return null;
    }
  }
  function hasAssets(remote, exactSizes) {
    return files.every((name, index) => remote.assets.some(asset =>
      asset.name === name && asset.state === 'uploaded' && asset.size > 0 && (!exactSizes || asset.size === sizes[index])));
  }
  let remote = await lookup();
  if (remote && !remote.draft) {
    if (!hasAssets(remote, false)) throw new Error('Published release is missing assets; repair manually or publish a new version.');
    console.log(`Release ${tag} is already published; leaving its assets unchanged.`);
    return;
  }
  const repoArgs = ['--repo', repository];
  if (!remote) {
    // Preserve --verify-tag behavior: never create a release for a missing tag.
    const { response: tagResponse } = await apiRequest(`https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`, 'Release tag verification');
    if (!tagResponse.ok) throw new Error(`Release tag verification failed: HTTP ${tagResponse.status}.`);
    const notes = `Download ${release.installer} under Assets and run it on Windows x64. Node.js is not required.\n\nThis installer is unsigned. In-app automatic updates are not included. SHA256SUMS.txt contains the installer checksum.`;
    const { response: created, data } = await apiRequest(endpoint, 'Draft release creation', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, body: notes, draft: true, prerelease: release.prerelease,
        generate_release_notes: true, ...(release.prerelease ? { make_latest: 'false' } : {}) }),
    });
    if (!created.ok) throw new Error(`Draft release creation failed: HTTP ${created.status}.`);
    // Use the creation response directly; draft discovery can lag behind creation.
    remote = data;
  }
  if (!Number.isSafeInteger(remote?.id) || remote.id <= 0) throw new Error('Draft release has no valid ID; refusing to upload.');
  if (!remote.draft) throw new Error('Release is no longer a draft; refusing to replace assets.');
  // Only drafts can reach this point. Never replace assets of a published release.
  run(['release', 'upload', tag, ...paths, ...repoArgs, '--clobber']);
  const uploaded = await getRelease(`/${remote.id}`);
  if (!uploaded) throw new Error('Draft release was not found after upload; refusing to publish.');
  if (!uploaded.draft) throw new Error('Release is no longer a draft; refusing to publish.');
  if (!hasAssets(uploaded, true)) throw new Error('Draft assets are incomplete or sizes differ; refusing to publish.');
  const args = ['release', 'edit', tag, ...repoArgs, '--draft=false', `--prerelease=${release.prerelease}`];
  if (release.prerelease) args.push('--latest=false');
  run(args);
  console.log(`Published https://github.com/${repository}/releases/tag/${tag}`);
}

module.exports = { publishRelease };
if (require.main === module) {
  publishRelease({ tag: process.env.GITHUB_REF_NAME, version: require('../package.json').version,
    repository: process.env.GITHUB_REPOSITORY, directory: process.argv[2] || 'release-assets' })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
