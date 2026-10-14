import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def q(sql):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=30).read().decode()
print('--- POLICY DEFINITIONS (orders/products/profiles) ---')
print(q("select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename in ('orders','products','profiles') order by tablename, policyname;"))
