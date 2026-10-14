import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}{path}", data=data,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method=method)
    return urllib.request.urlopen(r, timeout=30).read().decode()

print('Applying: confirm-email OFF, password min length 8 ...')
try:
    out = call('PATCH', '/config/auth', {"mailer_autoconfirm": True, "password_min_length": 8})
    print('PATCH ok, response chars:', len(out))
except Exception as e:
    print('PATCH err:', e)

try:
    d = json.loads(call('GET', '/config/auth'))
    print('AFTER -> mailer_autoconfirm =', d.get('mailer_autoconfirm'))
    print('AFTER -> password_min_length =', d.get('password_min_length'))
except Exception as e:
    print('GET err:', e)
