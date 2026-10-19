import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}{path}", data=data,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method=method)
    return urllib.request.urlopen(r, timeout=30).read().decode()

d = json.loads(call('GET', '/config/auth'))
print('--- security-related auth settings ---')
for k in sorted(d.keys()):
    if any(t in k.lower() for t in ['password','security','hibp','leak','captcha','mfa','otp','rate','session','jwt','disable','enable']):
        print(k, '=', d.get(k))
print('--- done ---')
