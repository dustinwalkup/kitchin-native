// Builds an unsigned JWT at runtime, so no test file contains a real-looking token
// (4-test-plan §8.3). The signature is a placeholder; nothing here verifies it.

function base64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makeJwt(payload: Record<string, unknown>): string {
  return [base64url({ alg: 'HS256', typ: 'JWT' }), base64url(payload), 'test-signature'].join('.');
}
