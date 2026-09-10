import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { publishRelease } = createRequire(import.meta.url)('../scripts/publish-release.cjs');

describe('release publication', () => {
  let directory: string;
  const binary = Buffer.from('installer fixture');
  const version = '0.1.0';
  const installer = `Screenshot-Setup-${version}-windows-x64.exe`;
  const checksum = `${createHash('sha256').update(binary).digest('hex')}  ${installer}\n`;
  const assets = [{ name: installer, size: binary.length, state: 'uploaded' },
    { name: 'SHA256SUMS.txt', size: Buffer.byteLength(checksum), state: 'uploaded' }];
  const response = (status: number, body?: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const options = () => ({ tag: `v${version}`, version, repository: 'owner/repo', directory });
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'screenshot-release-test-'));
    writeFileSync(join(directory, installer), binary);
    writeFileSync(join(directory, 'SHA256SUMS.txt'), checksum);
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('uses the created draft ID without rediscovering it by tag or listing', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(200, { ref: `refs/tags/v${version}` }))
      .mockResolvedValueOnce(response(201, { id: 42, tag_name: `v${version}`, draft: true, assets: [] }))
      .mockResolvedValueOnce(response(200, { id: 42, draft: true, assets }));
    await publishRelease(options(), { request, run });
    expect(run.mock.calls.map(call => call[0][1])).toEqual(['upload', 'edit']);
    expect(run.mock.calls[1][0]).toContain('--prerelease=false');
    expect(request.mock.calls[3][1].method).toBe('POST');
    expect(JSON.parse(request.mock.calls[3][1].body)).toMatchObject({ tag_name: `v${version}`, draft: true, generate_release_notes: true });
    expect(request.mock.calls.map(call => call[0])).toEqual([
      'https://api.github.com/repos/owner/repo/releases/tags/v0.1.0',
      'https://api.github.com/repos/owner/repo/releases?per_page=100&page=1',
      'https://api.github.com/repos/owner/repo/git/ref/tags/v0.1.0',
      'https://api.github.com/repos/owner/repo/releases',
      'https://api.github.com/repos/owner/repo/releases/42',
    ]);
  });
  it('resumes a draft without creating another release', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200, [{ id: 42, tag_name: `v${version}`, draft: true, assets: [] }]))
      .mockResolvedValueOnce(response(200, { draft: true, assets }));
    await publishRelease(options(), { request, run });
    expect(run.mock.calls.map(call => call[0][1])).toEqual(['upload', 'edit']);
    expect(request.mock.calls[2][0]).toBe('https://api.github.com/repos/owner/repo/releases/42');
  });
  it('does not create a draft when the remote tag is missing', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(404));
    await expect(publishRelease(options(), { request, run })).rejects.toThrow('tag verification failed: HTTP 404');
    expect(request).toHaveBeenCalledTimes(3);
    expect(run).not.toHaveBeenCalled();
  });
  it.each([401, 403, 422])('reports draft creation HTTP %s without uploading', async status => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(status));
    await expect(publishRelease(options(), { request, run })).rejects.toThrow(`creation failed: HTTP ${status}`);
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects a creation response without a release ID', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(201, { draft: true }));
    await expect(publishRelease(options(), { request, run })).rejects.toThrow('no valid ID');
    expect(run).not.toHaveBeenCalled();
  });
  it('leaves a complete published release unchanged, even if rebuild sizes differ', async () => {
    const run = vi.fn();
    await publishRelease(options(), { run, request: async () => response(200, { draft: false, assets: assets.map(asset => ({ ...asset, size: 1 })) }) });
    expect(run).not.toHaveBeenCalled();
  });
  it('finds a draft beyond the first page of releases', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200, Array.from({ length: 100 }, (_, id) => ({ id, tag_name: `other-${id}` }))))
      .mockResolvedValueOnce(response(200, [{ id: 142, tag_name: `v${version}`, draft: true, assets: [] }]))
      .mockResolvedValueOnce(response(200, { draft: true, assets }));
    await publishRelease(options(), { request, run });
    expect(request.mock.calls[2][0]).toContain('page=2');
    expect(request.mock.calls[3][0]).toBe('https://api.github.com/repos/owner/repo/releases/142');
    expect(run.mock.calls.map(call => call[0][1])).toEqual(['upload', 'edit']);
  });
  it('does not create a release when draft listing fails', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(403));
    await expect(publishRelease(options(), { request, run })).rejects.toThrow('HTTP 403');
    expect(run).not.toHaveBeenCalled();
  });
  it('reports a missing draft after upload separately from incomplete assets', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200, [{ id: 42, tag_name: `v${version}`, draft: true, assets: [] }]))
      .mockResolvedValueOnce(response(404));
    await expect(publishRelease(options(), { request, run })).rejects.toThrow('not found after upload');
    expect(run.mock.calls.map(call => call[0][1])).toEqual(['upload']);
  });
  it('does not publish when uploaded asset sizes differ', async () => {
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200, [{ id: 42, tag_name: `v${version}`, draft: true, assets: [] }]))
      .mockResolvedValueOnce(response(200, { draft: true, assets: assets.map(asset => ({ ...asset, size: 1 })) }));
    await expect(publishRelease(options(), { request, run })).rejects.toThrow('sizes differ');
    expect(run.mock.calls.map(call => call[0][1])).toEqual(['upload']);
  });
  it.each([401, 403, 500])('does not create a release after HTTP %s', async status => {
    const run = vi.fn();
    await expect(publishRelease(options(), { run, request: async () => response(status) })).rejects.toThrow(`HTTP ${status}`);
    expect(run).not.toHaveBeenCalled();
  });
  it('does not repair an incomplete published release', async () => {
    const run = vi.fn();
    await expect(publishRelease(options(), { run, request: async () => response(200, { draft: false, assets: [] }) })).rejects.toThrow(/missing assets/);
    expect(run).not.toHaveBeenCalled();
  });
  it('does not publish if an upload fails', async () => {
    const run = vi.fn(() => { throw new Error('Upload failed'); });
    await expect(publishRelease(options(), { run, request: async () => response(200, { id: 42, draft: true, assets: [] }) })).rejects.toThrow('Upload failed');
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('does not publish a draft with incomplete uploaded assets', async () => {
    const run = vi.fn();
    await expect(publishRelease(options(), { run, request: async () => response(200, { id: 42, draft: true, assets: [] }) })).rejects.toThrow(/incomplete/);
    expect(run.mock.calls.map(call => call[0][1])).toEqual(['upload']);
  });
  it('rejects a corrupted installer before contacting GitHub', async () => {
    writeFileSync(join(directory, installer), 'corrupted');
    const request = vi.fn();
    await expect(publishRelease(options(), { request })).rejects.toThrow(/checksum mismatch/);
    expect(request).not.toHaveBeenCalled();
  });
  it('marks prereleases and does not make them Latest', async () => {
    const betaVersion = '0.2.0-beta.1';
    const betaInstaller = `Screenshot-Setup-${betaVersion}-windows-x64.exe`;
    const betaChecksum = `${createHash('sha256').update(binary).digest('hex')}  ${betaInstaller}\n`;
    writeFileSync(join(directory, betaInstaller), binary);
    writeFileSync(join(directory, 'SHA256SUMS.txt'), betaChecksum);
    const betaAssets = [{ ...assets[0], name: betaInstaller }, { ...assets[1], size: Buffer.byteLength(betaChecksum) }];
    const run = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(200, { ref: `refs/tags/v${betaVersion}` }))
      .mockResolvedValueOnce(response(201, { id: 43, tag_name: `v${betaVersion}`, draft: true, assets: [] }))
      .mockResolvedValueOnce(response(200, { id: 43, draft: true, assets: betaAssets }));
    await publishRelease({ ...options(), tag: `v${betaVersion}`, version: betaVersion }, { request, run });
    expect(JSON.parse(request.mock.calls[3][1].body)).toMatchObject({ prerelease: true, make_latest: 'false' });
    expect(run.mock.calls[1][0]).toContain('--latest=false');
    expect(run.mock.calls[1][0]).toContain('--prerelease=true');
  });
});
