const { appendFileSync } = require('node:fs');

function validateReleaseTag(refType, tag, packageVersion) {
  // SemVer without build metadata; numeric identifiers cannot have leading zeros.
  const number = '(0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  const pattern = new RegExp(`^v${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?$`);
  if (refType !== 'tag' || !pattern.test(tag)) throw new Error('Expected a version tag such as v0.1.0 or v0.2.0-beta.1 (no build metadata).');
  const version = tag.slice(1);
  if (version !== packageVersion) throw new Error(`Tag version ${version} does not match package.json version ${packageVersion}.`);
  return { version, prerelease: version.includes('-'), installer: `Screenshot-Setup-${version}-windows-x64.exe` };
}

module.exports = { validateReleaseTag };
if (require.main === module) {
  try {
    const release = validateReleaseTag(process.env.GITHUB_REF_TYPE, process.env.GITHUB_REF_NAME, require('../package.json').version);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${release.version}\ninstaller=${release.installer}\n`);
    console.log(`Validated release ${release.version}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
