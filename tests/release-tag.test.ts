import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const { validateReleaseTag } = createRequire(import.meta.url)('../scripts/validate-release-tag.cjs');

describe('release tags', () => {
  it.each(['0.1.0', '12.3.4', '0.2.0-beta.1', '1.0.0-0', '1.0.0-01a'])('accepts %s', version => {
    expect(validateReleaseTag('tag', `v${version}`, version)).toEqual({
      version, prerelease: version.includes('-'), installer: `Screenshot-Setup-${version}-windows-x64.exe`,
    });
  });
  it.each(['v01.0.0', 'v1.0', '1.0.0', 'v1.0.0-01', 'v1.0.0-beta..1', 'v1.0.0+build', 'v1.0.0\n', 'v1.0.0;echo bad'])('rejects %s', tag => {
    expect(() => validateReleaseTag('tag', tag, tag.slice(1))).toThrow();
  });
  it('rejects branch refs and mismatched versions', () => {
    expect(() => validateReleaseTag('branch', 'v0.1.0', '0.1.0')).toThrow();
    expect(() => validateReleaseTag('tag', 'v0.2.0', '0.1.0')).toThrow(/does not match/);
  });
});
