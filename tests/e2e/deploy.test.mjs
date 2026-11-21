import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const composeFile = fileURLToPath(new URL('../../deploy/docker-compose.yml', import.meta.url));
const envFile = fileURLToPath(new URL('../../deploy/.env.example', import.meta.url));
const command = process.platform === 'win32' ? 'docker.exe' : 'docker';

function config(overrides = {}) {
  const env = {
    ...process.env,
    DOMAIN: 'example.test',
    RELAY_HOST: 'relay.example.test',
    RELAY_PASS: 'test-password-not-a-secret',
    RELAY_PORT_1: '19009',
    RELAY_PORT_2: '19010',
    RELAY_PORT_3: '19011',
    RELAY_PORT_4: '19012',
    RELAY_PORT_5: '19013',
    CADDY_PROXY_IP: '172.30.240.2',
    CADDY_PROXY_SUBNET: '172.30.240.0/24',
    LIMIT_MAX_ASSIGNMENT_BYTES: '123456',
    LIMIT_VPS_TRANSFER_SLOTS: '3',
    ...overrides,
  };
  const output = execFileSync(command, ['compose', '--env-file', envFile, '-f', composeFile, 'config', '--format', 'json'], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

test('Compose uses server config names, health endpoint and one trusted proxy address', () => {
  const resolved = config();
  const server = resolved.services.server;
  assert.equal(server.build.context.replaceAll('\\', '/'), fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, ''));
  assert.equal(server.build.dockerfile, 'apps/server/Dockerfile');
  assert.equal(server.environment.RELAY_ADDRESS, 'relay.example.test:19009');
  assert.equal(server.environment.LIMIT_MAX_ASSIGNMENT_BYTES, '123456');
  assert.equal(server.environment.LIMIT_VPS_TRANSFER_SLOTS, '3');
  assert.equal(server.environment.TRUST_PROXY, '172.30.240.2');
  assert.equal(resolved.services.caddy.networks.proxy.ipv4_address, server.environment.TRUST_PROXY);
  assert.equal(resolved.networks.proxy.ipam.config[0].subnet, '172.30.240.0/24');
  assert.match(server.healthcheck.test.join(' '), /127\.0\.0\.1:3000\/health['"]/);
});

test('Compose derives relay ports from the same five published ports', () => {
  const relay = config().services.relay;
  const ports = relay.ports.map(({ published, target }) => {
    assert.equal(Number(published), target);
    return target;
  });
  assert.deepEqual(ports, [19009, 19010, 19011, 19012, 19013]);
  assert.equal(relay.environment.CROC_PORTS, ports.join(','));
});

test('Compose rejects a missing relay password instead of starting with a default', () => {
  assert.throws(
    () => config({ RELAY_PASS: '' }),
    (error) => typeof error.stderr === 'string' && error.stderr.includes('Set RELAY_PASS in .env'),
  );
});
