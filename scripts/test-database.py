"""Disposable Postgres integration test. Requires Docker; does not touch cloud projects."""
from pathlib import Path
import concurrent.futures, json, subprocess, time, uuid
root=Path(__file__).resolve().parent.parent
name='cat-days-check-'+uuid.uuid4().hex[:8]
def run(*args,input=None):
    p=subprocess.run(args,input=input,text=True,encoding='utf-8',capture_output=True)
    if p.returncode:raise RuntimeError(p.stderr or p.stdout)
    return p.stdout
def sql(text):return run('docker','exec','-i',name,'psql','-U','postgres','-At','-v','ON_ERROR_STOP=1',input=text)
prefix="set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"
try:
    run('docker','run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17')
    for attempt in range(30):
        if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('Postgres startup timeout')
    sql((root/'supabase/tests/bootstrap.sql').read_text(encoding='utf-8'))
    sql((root/'supabase/migrations/202610110001_sync.sql').read_text(encoding='utf-8'))
    print(sql((root/'supabase/tests/sync.sql').read_text(encoding='utf-8')).splitlines()[-1])
    content='{"date":"2026-10-11","text":"race","mood":"","moodText":""}'
    sql(prefix+f"select public.cat_days_write('{uuid.uuid4()}','save','race',0,'{content}');")
    def update(i):
        body=json.dumps({'date':'2026-10-11','text':f'device-{i}','mood':'','moodText':''})
        result=sql(prefix+f"select public.cat_days_write('{uuid.uuid4()}','save','race',1,'{body}');")
        return json.loads(result.splitlines()[-1])['status']
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:statuses=list(pool.map(update,range(8)))
    assert statuses.count('saved')==1 and statuses.count('conflict')==7, statuses
    print('PASS: 8 concurrent devices, exactly one save and seven conflicts')
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
