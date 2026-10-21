import os, json, urllib.request, urllib.error
ref = os.environ.get('REF',''); anon = os.environ.get('ANON','')
for path in ['products?select=id,title,is_published&limit=3',
             'product_stats?select=*&limit=3',
             'creator_stats?select=*&limit=3',
             'profiles?select=id,full_name&limit=3']:
    req = urllib.request.Request(f"https://{ref}.supabase.co/rest/v1/{path}",
        headers={"apikey": anon, "Authorization": f"Bearer {anon}"})
    try:
        print('OK  ', path, '->', urllib.request.urlopen(req, timeout=20).read().decode()[:200])
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, path, '->', e.read().decode()[:200])
    except Exception as e:
        print('ERR ', path, e)
