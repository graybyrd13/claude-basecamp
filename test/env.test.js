import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizedEnv } from '../src/lib/env.js'

// sanitizedEnv reads process.env; snapshot and restore around each mutation so
// tests stay isolated.
function withEnv(vars, fn) {
  const saved = {}
  const keys = Object.keys(vars)
  for (const k of keys) {
    saved[k] = Object.prototype.hasOwnProperty.call(process.env, k) ? process.env[k] : undefined
    if (vars[k] === undefined) delete process.env[k]
    else process.env[k] = vars[k]
  }
  try {
    return fn()
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

test('strips stale ANTHROPIC_* overrides so login credentials win', () => {
  withEnv(
    {
      ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
      ANTHROPIC_AUTH_TOKEN: 'placeholder',
      ANTHROPIC_MODEL: 'some-pinned-model',
      CLAUDE_CODE_SOMETHING: '1',
      CLAUDECODE: '1',
      MAX_THINKING_TOKENS: '10000',
      BASECAMP_KEEP_ENV: undefined,
    },
    () => {
      const env = sanitizedEnv()
      assert.equal(env.ANTHROPIC_BASE_URL, undefined)
      assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined)
      assert.equal(env.ANTHROPIC_MODEL, undefined)
      assert.equal(env.CLAUDE_CODE_SOMETHING, undefined)
      assert.equal(env.CLAUDECODE, undefined)
      assert.equal(env.MAX_THINKING_TOKENS, undefined)
    }
  )
})

test('strips a placeholder / third-party ANTHROPIC_API_KEY (the OpenRouter leak)', () => {
  withEnv(
    { ANTHROPIC_API_KEY: 'YOUR_OPENROUTER_KEY', BASECAMP_KEEP_ENV: undefined },
    () => {
      assert.equal(sanitizedEnv().ANTHROPIC_API_KEY, undefined)
    }
  )
  withEnv(
    { ANTHROPIC_API_KEY: 'sk-or-v1-abc123', BASECAMP_KEEP_ENV: undefined },
    () => {
      assert.equal(sanitizedEnv().ANTHROPIC_API_KEY, undefined)
    }
  )
})

test('preserves a genuine Anthropic API key so key-auth users are not 401ed', () => {
  withEnv(
    {
      ANTHROPIC_API_KEY: 'sk-ant-api03-realkey',
      ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
      BASECAMP_KEEP_ENV: undefined,
    },
    () => {
      const env = sanitizedEnv()
      // Real key survives...
      assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant-api03-realkey')
      // ...but the redirect that would misroute it does not.
      assert.equal(env.ANTHROPIC_BASE_URL, undefined)
    }
  )
})

test('BASECAMP_KEEP_ENV=1 passes everything through untouched', () => {
  withEnv(
    {
      ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
      ANTHROPIC_API_KEY: 'sk-or-v1-abc123',
      BASECAMP_KEEP_ENV: '1',
    },
    () => {
      const env = sanitizedEnv()
      assert.equal(env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api/v1')
      assert.equal(env.ANTHROPIC_API_KEY, 'sk-or-v1-abc123')
    }
  )
})
