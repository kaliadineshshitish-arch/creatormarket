import os, json, urllib.request

tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')

def get(path):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}{path}",
        headers={"Authorization": f"Bearer {tok}"})
    return urllib.request.urlopen(req, timeout=30).read().decode()

def q(sql):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        method="POST")
    return urllib.request.urlopen(req, timeout=30).read().decode()

print('REF =', ref)
try:
    d = json.loads(get('/config/auth'))
    print('--- AUTH CONFIG ---')
    for k in ['mailer_autoconfirm','external_email_enabled','rate_limit_email_sent','rate_limit_verify','security_captcha_enabled','password_min_length','jwt_exp']:
        print(k, '=', d.get(k))
except Exception as e:
    print('auth cfg err:', e)

try:
    print('--- RLS (public tables) ---')
    print(q("select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;"))
except Exception as e:
    print('rls err:', e)

try:
    print('--- POLICIES ---')
    print(q("select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename, policyname;"))
except Exception as e:
    print('pol err:', e)
