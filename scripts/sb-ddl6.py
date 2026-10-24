import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=40).read().decode()
try:
    print('DDL ok:', sql("alter table public.orders add column if not exists notified_at timestamptz;")[:80])
except Exception as e:
    print('DDL err:', e)
print('col:', sql("select column_name from information_schema.columns where table_schema='public' and table_name='orders' and column_name='notified_at';"))
