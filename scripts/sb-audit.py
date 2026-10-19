import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}{path}", data=data,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method=method)
    return urllib.request.urlopen(r, timeout=30).read().decode()

print('Enabling: leaked-password protection + require current password on change ...')
try:
    call('PATCH', '/config/auth', {"password_hibp_enabled": True,
                                   "security_update_password_require_current_password": True})
    print('PATCH ok')
except Exception as e:
    print('PATCH err:', e)

d = json.loads(call('GET', '/config/auth'))
for k in ['password_hibp_enabled','security_update_password_require_current_password',
          'password_min_length','mfa_totp_enroll_enabled','external_phone_enabled']:
    print('AFTER ->', k, '=', d.get(k))
