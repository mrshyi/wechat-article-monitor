import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertCredentialCertificateTrusted,
  CredentialCertificateError,
  checkCredentialCertificate,
} from '../server/utils/credential-certificate.ts';

function checker(overrides: Partial<Parameters<typeof checkCredentialCertificate>[0]> = {}) {
  return {
    platform: 'darwin',
    checkReadable: async () => {},
    verifyTrust: async () => {},
    ...overrides,
  };
}

test('trusted CA passes without installing certificates or requiring a network request', async () => {
  const status = await checkCredentialCertificate(checker());
  assert.equal(status.state, 'trusted');
  assert.doesNotThrow(() => assertCredentialCertificateTrusted(status));
});

test('unsupported platforms do not touch files or execute macOS security', async () => {
  const unexpected = async () => assert.fail('must not run on unsupported platform');
  const status = await checkCredentialCertificate(
    checker({ platform: 'linux', checkReadable: unexpected, verifyTrust: unexpected })
  );
  assert.equal(status.state, 'unsupported');
  assert.throws(() => assertCredentialCertificateTrusted(status), CredentialCertificateError);
});

test('missing CA blocks activation before attempting trust verification', async () => {
  const status = await checkCredentialCertificate(
    checker({
      checkReadable: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
      verifyTrust: async () => assert.fail('missing CA must not be verified'),
    })
  );
  assert.equal(status.state, 'missing');
  assert.throws(() => assertCredentialCertificateTrusted(status), CredentialCertificateError);
});

test('unreadable CA is not misclassified as missing or untrusted', async () => {
  const status = await checkCredentialCertificate(
    checker({
      checkReadable: async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
      verifyTrust: async () => assert.fail('unreadable CA must not be verified'),
    })
  );
  assert.equal(status.state, 'error');
  assert.throws(() => assertCredentialCertificateTrusted(status), CredentialCertificateError);
});

for (const stream of ['stdout', 'stderr']) {
  test(`untrusted CA reported on ${stream} blocks activation with an actionable message`, async () => {
    const status = await checkCredentialCertificate(
      checker({
        verifyTrust: async () => {
          throw Object.assign(new Error('verify failed'), { [stream]: 'Cert Verify Result: CSSMERR_TP_NOT_TRUSTED' });
        },
      })
    );
    assert.equal(status.state, 'untrusted');
    assert.match(status.message, /未信任|尚未信任/);
    assert.throws(() => assertCredentialCertificateTrusted(status), CredentialCertificateError);
  });
}

for (const failure of [
  { killed: true, signal: 'SIGTERM' },
  { code: 'ENOENT' },
  { stderr: 'CSSMERR_TP_CERT_EXPIRED' },
  { stderr: 'Error reading file' },
]) {
  test(`trust verification fails closed without suggesting installation for ${JSON.stringify(failure)}`, async () => {
    const status = await checkCredentialCertificate(
      checker({
        verifyTrust: async () => {
          throw Object.assign(new Error('verify failed'), failure);
        },
      })
    );
    assert.equal(status.state, 'error');
    assert.throws(() => assertCredentialCertificateTrusted(status), CredentialCertificateError);
  });
}

test('rechecking detects a newly generated CA, manual trust, and revoked trust without stale caching', async () => {
  let exists = false;
  let trusted = false;
  const dependencies = checker({
    checkReadable: async () => {
      if (!exists) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    verifyTrust: async () => {
      if (!trusted) throw Object.assign(new Error('untrusted'), { stderr: 'CSSMERR_TP_NOT_TRUSTED' });
    },
  });
  assert.equal((await checkCredentialCertificate(dependencies)).state, 'missing');
  exists = true;
  assert.equal((await checkCredentialCertificate(dependencies)).state, 'untrusted');
  trusted = true;
  assert.equal((await checkCredentialCertificate(dependencies)).state, 'trusted');
  trusted = false;
  assert.equal((await checkCredentialCertificate(dependencies)).state, 'untrusted');
});

test('manual and remembered-consent activation share the check before any state or proxy mutation', async () => {
  const source = await readFile(new URL('../server/utils/system-proxy-manager.ts', import.meta.url), 'utf8');
  const enable = source.slice(
    source.indexOf('export async function enableSystemProxy'),
    source.indexOf('export async function restoreSystemProxy')
  );
  const guard = enable.indexOf('assertCredentialCertificateTrusted(await checkCredentialCertificate())');
  assert.ok(guard >= 0);
  for (const operation of [
    'await readState()',
    'await captureSnapshot()',
    'await saveState(',
    'await applyMitmProxy(',
  ]) {
    assert.ok(enable.indexOf(operation) > guard, `${operation} must follow certificate verification`);
  }
  const autoEnable = source.slice(
    source.indexOf('export async function autoEnableSystemProxy'),
    source.indexOf('export async function getSystemProxyStatus')
  );
  assert.match(autoEnable, /await enableSystemProxy\(\)/);
  assert.match(autoEnable, /error instanceof CredentialCertificateError \? null/);
});

test('status checks the current CA and mitmdump uses the same explicit configuration directory', async () => {
  const manager = await readFile(new URL('../server/utils/system-proxy-manager.ts', import.meta.url), 'utf8');
  const plugin = await readFile(new URL('../server/plugins/credential-service.ts', import.meta.url), 'utf8');
  assert.match(
    manager.slice(manager.indexOf('export async function getSystemProxyStatus')),
    /await checkCredentialCertificate\(\)/
  );
  assert.match(plugin, /confdir=\$\{CREDENTIAL_MITM_CONFDIR\}/);
  assert.doesNotMatch(plugin, /ssl_insecure|ssl-insecure|http2=false/);
});

test('UI blocks activation, exposes single-line commands, and clears stale action errors on recheck', async () => {
  const gate = await readFile(new URL('../composables/useCredentialGate.ts', import.meta.url), 'utf8');
  const modal = await readFile(new URL('../components/global/CredentialGateModal.vue', import.meta.url), 'utf8');
  const endpoint = await readFile(new URL('../server/api/credential/proxy/enable.post.ts', import.meta.url), 'utf8');
  assert.match(
    gate,
    /async function recheckEnvironment\(\)\s*\{\s*actionError\.value = null;\s*await refreshServiceStatus\(\);/
  );
  assert.match(gate, /certificate\?\.state !== 'trusted'/);
  assert.match(modal, /:disabled="certificateBlocked"/);
  assert.match(modal, /v-if="certificate\?\.state === 'untrusted'"/);
  assert.match(
    modal,
    /sudo security add-trusted-cert -d -r trustRoot -k \/Library\/Keychains\/System.keychain "\$HOME\/\.mitmproxy\/mitmproxy-ca-cert.pem"/
  );
  assert.match(endpoint, /statusCode: 409/);
});
