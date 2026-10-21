import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=30).read().decode()

print('PRIV CHECK:', sql("""select c.relname,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_sel,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_sel,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_ins,
  has_table_privilege('authenticated', c.oid, 'INSERT') as auth_ins
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v') order by c.relname;"""))
