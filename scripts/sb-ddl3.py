import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=30).read().decode()

try:
    print('alter:', sql("alter table public.profiles add column if not exists show_earnings boolean not null default true;")[:120])
except Exception as e:
    print('alter err:', e)
print('cols:', sql("select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position;"))
