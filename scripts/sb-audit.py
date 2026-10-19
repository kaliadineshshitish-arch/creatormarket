import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}{path}", data=data,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method=method)
    return urllib.request.urlopen(r, timeout=30).read().decode()

tests = [
    ('password_hibp_enabled', True),
    ('security_update_password_require_current_password', True),
    ('security_update_password_require_reauthentication', True),
]
for field, val in tests:
    try:
        call('PATCH', '/config/auth', {field: val})
        print('OK  ->', field, 'set to', val)
    except Exception as e:
        print('ERR ->', field, '|', e)

d = json.loads(call('GET', '/config/auth'))
print('--- current values ---')
for f, _ in tests:
    print(f, '=', d.get(f))
