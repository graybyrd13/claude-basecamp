import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastPathSegment, decodeProjectDirName } from '../src/lib/paths.js'

test('lastPathSegment handles POSIX paths', () => {
  assert.equal(lastPathSegment('/Users/gray/my-app'), 'my-app')
  assert.equal(lastPathSegment('/Users/gray/my-app/'), 'my-app')
})

test('lastPathSegment handles Windows paths', () => {
  // Project paths on Windows come through as backslash-separated — the naive
  // "split on '/'" that used to live in notify.js/runner.js would return the
  // whole string unchanged for these instead of just the repo name.
  assert.equal(lastPathSegment('C:\\Users\\gray\\my-app'), 'my-app')
  assert.equal(lastPathSegment('C:\\Users\\gray\\my-app\\'), 'my-app')
})

test('lastPathSegment falls back to the input for a bare name', () => {
  assert.equal(lastPathSegment('my-app'), 'my-app')
  assert.equal(lastPathSegment(''), '')
})

test('decodeProjectDirName remains a plain best-effort "-" to "/" decode regardless of host platform', () => {
  // This fallback path only fires for orphaned transcript dirs; it must stay
  // platform-independent since Claude Code's own encoding is what produced
  // the dashes, not the host OS running Basecamp.
  assert.equal(decodeProjectDirName('-Users-test-my-app'), '/Users/test/my/app')
})
