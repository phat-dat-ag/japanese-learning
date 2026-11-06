"""Live JWKS migration check. Creates one unique User account; never deletes data.
Tokens and generated credentials remain in memory and are never printed.
Run after starting the migrated .NET, Quarkus and JWKS development containers.
"""
import argparse
import base64
import hashlib
import json
import secrets
import urllib.error
import urllib.request
import uuid


def request(base, path, expected=200, *, body=None, token=None, content_type='application/json'):
    headers = {}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        headers['Content-Type'] = content_type
    req = urllib.request.Request(base + path, headers=headers,
                                 data=body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == expected, f'{path}: expected {expected}, got {response.status}'
        raw = response.read()
        payload = json.loads(raw) if raw and response.headers.get_content_type() == 'application/json' else None
        if path.startswith('/api/auth/') and expected < 300 and isinstance(payload, dict) and payload.get('success') is True:
            return payload['data']
        return payload


def decode(value):
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--auth', default='http://127.0.0.1:8081')
    parser.add_argument('--backend', default='http://127.0.0.1:8082')
    parser.add_argument('--jwks', default='http://127.0.0.1:8083')
    parser.add_argument('--check-swagger', action='store_true',
                        help='Check the retired route in Swagger when documentation is enabled.')
    args = parser.parse_args()
    request(args.auth, '/.well-known/jwks.json', 404)
    if args.check_swagger:
        swagger = request(args.auth, '/swagger/v1/swagger.json')
        assert '/.well-known/jwks.json' not in swagger['paths']
    suffix = uuid.uuid4().hex
    password = 'Aa1!' + secrets.token_hex(24)
    email = f'jwks-migration-{suffix}@example.invalid'
    request(args.auth, '/api/auth/register', 201,
            body={'username': 'jwks-' + suffix, 'email': email, 'password': password})
    login = request(args.auth, '/api/auth/login', body={'email': email, 'password': password})
    token = login['accessToken']
    header, payload, signature = token.split('.')
    metadata, claims = json.loads(decode(header)), json.loads(decode(payload))
    jwks = request(args.jwks, '/api/v1/jwks/user')
    key = next(k for k in jwks['keys'] if k['kid'] == metadata['kid'])
    assert metadata['alg'] == key['alg'] == 'RS256' and key['kty'] == 'RSA'
    assert not {'d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'} & key.keys()
    # Independently check the issued RS256 signature against the published public key.
    modulus, exponent = int.from_bytes(decode(key['n']), 'big'), int.from_bytes(decode(key['e']), 'big')
    size = (modulus.bit_length() + 7) // 8
    encoded = pow(int.from_bytes(decode(signature), 'big'), exponent, modulus).to_bytes(size, 'big')
    digest_info = bytes.fromhex('3031300d060960864801650304020105000420') + hashlib.sha256(
        (header + '.' + payload).encode()).digest()
    assert encoded == b'\x00\x01' + b'\xff' * (size - len(digest_info) - 3) + b'\x00' + digest_info
    assert claims['role'] == 'User' and 'iat' not in claims
    me = request(args.auth, '/api/auth/me', token=token)
    request(args.auth, '/.well-known/jwks.json', 404, token=token)
    assert me['userId'] == claims['sub'] and me['role'] == 'User'
    request(args.backend, '/api/v1/jlpt-levels', token=token)
    request(args.auth, '/api/auth/admin-test', 403, token=token)
    request(args.backend, '/api/vocabularies/import', 403, body=b'--jwks-test--\r\n', token=token,
            content_type='multipart/form-data; boundary=jwks-test')
    bad_signature = bytearray(decode(signature))
    bad_signature[0] ^= 1
    invalid = header + '.' + payload + '.' + base64.urlsafe_b64encode(bad_signature).decode().rstrip('=')
    for base, path in ((args.auth, '/api/auth/me'), (args.backend, '/api/v1/jlpt-levels')):
        request(base, path, 401, token=invalid)
        request(base, path, 401)
    refreshed = request(args.auth, '/api/auth/refresh', body={'refreshToken': login['refreshToken']})
    for base, path in ((args.auth, '/api/auth/me'), (args.backend, '/api/v1/jlpt-levels')):
        request(base, path, token=refreshed['accessToken'])
    request(args.auth, '/api/auth/logout', 204, body={'refreshToken': refreshed['refreshToken']})
    request(args.auth, '/api/auth/refresh', 401, body={'refreshToken': refreshed['refreshToken']})
    print('PASS: real login, JWKS signature/kid, both protected APIs, User/Admin restrictions,')
    print('invalid-signature/missing-token rejection, refresh and logout; no tokens printed.')
    print('PASS: retired .NET JWKS returns 404.')
    if args.check_swagger:
        print('PASS: retired .NET JWKS is absent from Swagger.')


if __name__ == '__main__':
    main()
