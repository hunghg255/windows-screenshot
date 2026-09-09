const { readFileSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateReleaseTag } = require('./validate-release-tag.cjs');

async function publishRelease({ tag, version, repository, directory }, dependencies = {}) {
  const request = dependencies.request || fetch;
  const run = dependencies.run || (args => execFileSync('gh', args, { stdio: 'inherit' }));
  const release = validateReleaseTag('tag', tag, version);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository.');
  const files = [release.installer, 'SHA256SUMS.txt'];
  const paths = files.map(name => join(resolve(directory), name));
  const sizes = paths.map(path => statSync(path).size);
  if (sizes.some(size => size === 0)) throw new Error('Release assets must not be empty.');
  const hash = createHash('sha256').update(readFileSync(paths[0])).digest('hex');
  if (readFileSync(paths[1], 'utf8').trim() !== `${hash}  ${release.installer}`) throw new Error('Installer checksum mismatch.');

  const endpoint = `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`;
  async function lookup() {
    const response = await request(endpoint, {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Release lookup failed: HTTP ${response.status}.`);
    return response.json();
  }
  function hasAssets(remote, exactSizes) {
    return files.every((name, index) => remote.assets.some(asset =>
      asset.name === name && asset.state === 'uploaded' && asset.size > 0 && (!exactSizes || asset.size === sizes[index])));
  }
  const remote = await lookup();
  if (remote && !remote.draft) {
    if (!hasAssets(remote, false)) throw new Error('Published release is missing assets; repair manually or publish a new version.');
    console.log(`Release ${tag} is already published; leaving its assets unchanged.`);
    return;
  }
  const repoArgs = ['--repo', repository];
  if (!remote) {
    const notes = `Download ${release.installer} under Assets and run it on Windows x64. Node.js is not required.\n\nThis installer is unsigned. In-app automatic updates are not included. SHA256SUMS.txt contains the installer checksum.`;
    const notesPath = join(resolve(directory), 'RELEASE-NOTES.md');
    writeFileSync(notesPath, notes);
    const args = ['release', 'create', tag, ...repoArgs, '--verify-tag', '--draft', '--generate-notes', '--notes-file', notesPath];
    if (release.prerelease) args.push('--prerelease', '--latest=false');
    run(args);
  }
  // Only drafts can reach this point. Never replace assets of a published release.
  run(['release', 'upload', tag, ...paths, ...repoArgs, '--clobber']);
  const uploaded = await lookup();
  if (!uploaded || !uploaded.draft || !hasAssets(uploaded, true)) throw new Error('Draft assets are incomplete; refusing to publish.');
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
