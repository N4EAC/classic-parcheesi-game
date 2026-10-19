import asyncio, json, random, os, logging
from pathlib import Path
from html import escape
from functools import lru_cache
ROOT = Path(__file__).resolve().parent
from aiohttp import web, WSMsgType

clients = {}; seats = [None]*4; lock = asyncio.Lock()
# A pawn traverses 64 of the 68 shared spaces, then seven private spaces and HOME.
START = [55,38,4,21]  # red, green, yellow, blue; 17 squares apart
SAFE = {4,12,21,29,38,46,55,63}
HOME = 71
serial = 0; event = None
# Session-wide scores survive game resets; intentionally no disk persistence.
victory_hall = {}
# Ubuntu's /run runtime directory is RAM-backed and survives service restarts.
HALL_FILE = Path(os.environ['PARCHEESI_HALL_FILE']) if os.environ.get('PARCHEESI_HALL_FILE') else None

def save_hall():
    if HALL_FILE is None:return
    try:
        temporary=HALL_FILE.with_suffix('.tmp')
        temporary.write_text(json.dumps(list(victory_hall.values()),ensure_ascii=False),encoding='utf-8')
        temporary.replace(HALL_FILE)
    except OSError:
        logging.exception('Could not checkpoint Victory Hall; scores remain in process memory')

def load_hall():
    if HALL_FILE is None or not HALL_FILE.exists():return
    try:
        rows=json.loads(HALL_FILE.read_text(encoding='utf-8'))
        if not isinstance(rows,list):raise ValueError('Invalid score list')
        loaded={}
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('name'),str) or type(row.get('wins')) is not int or row['wins']<1 or type(row.get('bot')) is not bool:raise ValueError('Invalid score row')
            loaded[(row['name'].casefold(),row['bot'])]=dict(name=row['name'],wins=row['wins'],bot=row['bot'])
        victory_hall.clear();victory_hall.update(loaded)
    except (OSError,ValueError):
        logging.exception('Could not restore Victory Hall checkpoint')

def hall_rows():
    return sorted(victory_hall.values(),key=lambda row:(-row['wins'],row['name'].casefold(),row['bot']))

def record_win(player):
    seat=seats[player]
    key=(seat['name'].casefold(),bool(seat['bot']))
    row=victory_hall.setdefault(key,dict(name=seat['name'],bot=bool(seat['bot']),wins=0))
    row['wins']+=1
    save_hall()

def fresh():
    return dict(started=False,turn=0,dice=None,remaining=[],rolled=False,pieces=[[-1]*4 for _ in range(4)],winner=None,message='Waiting for players',doubles=0,bonus=[],bonus_active=False,blockade_origins=[])
game=fresh()
def emit(kind,**data):
    global serial,event
    serial+=1; event=dict(id=serial,kind=kind,**data)
def human_present():
    return any(s and not s['bot'] and s.get('ws') in clients and not s['ws'].closed for s in seats)

def reset_game():
    game.update(fresh())
    for i,s in enumerate(seats):
        if s and (s['bot'] or s.get('ws') not in clients or s['ws'].closed):seats[i]=None
    emit('reset')

def reset_if_abandoned():
    if game['started'] and not human_present():
        reset_game()
        game['message']='Previous game ended: all human players left. Join a new game.'
        return True
    return False

def public():
    return dict(type='state',game=game,can_reset=game['winner'] is not None or not human_present(),options=choices(game['turn']) if game['started'] and game['winner'] is None else [],seats=[dict(name=s['name'],bot=s['bot']) if s else None for s in seats],event=event)
async def broadcast():
    msg=json.dumps(public())
    for ws in list(clients):
        try: await ws.send_str(msg)
        except Exception: pass

def next_player(p):
    return next(((p+n)%4 for n in range(1,5) if seats[(p+n)%4]),p)
def sq(p,v):return (START[p]+v)%68

def occupants(square):
    return [(p,i) for p in range(4) for i,v in enumerate(game['pieces'][p]) if 0<=v<64 and sq(p,v)==square]
def blocked(square):
    o=occupants(square)
    return len(o)>=2 and o[0][0]==o[1][0]

def legal_piece(p,i,steps,enter=False):
    if not isinstance(i,int) or not 0<=i<4 or steps<=0:return False
    old=game['pieces'][p][i]
    if old==HOME:return False
    if old==-1:
        if not enter or steps!=5:return False
        dest=START[p]
        o=occupants(dest)
        return not blocked(dest) and len([a for a,b in o if a==p])<2
    if enter or old+steps>HOME:return False
    if old<64:
        for v in range(old+1,min(63,old+steps)+1):
            target=sq(p,v)
            if blocked(target):return False
        if old+steps<64:
            o=occupants(sq(p,old+steps))
            if len([a for a,b in o if a==p])>=2:return False
            if sq(p,old+steps) in SAFE and any(a!=p for a,b in o):return False
    # Private home lanes also obey the two-pawn blockade rule.
    for v in range(max(64,old+1),min(HOME-1,old+steps)+1):
        if game['pieces'][p].count(v)>=2:return False
    # A blockade pair cannot travel together to recreate it elsewhere this turn.
    dest=old+steps
    for pair in game['blockade_origins']:
        if i in pair and dest!=HOME:
            other=pair[0] if pair[1]==i else pair[1]
            if game['pieces'][p][other]==dest:return False
    return True

def raw_choices(p):
    r=game['remaining']; out=[]
    for i in range(4):
        for d in sorted(set(r)):
            if legal_piece(p,i,d):out.append(dict(piece=i,steps=d,used=[d],enter=False))
            if not game['bonus_active'] and d==5 and legal_piece(p,i,5,True):
                out.append(dict(piece=i,steps=5,used=[d],enter=True))
        if not game['bonus_active'] and len(r)==2 and sum(r)==5 and legal_piece(p,i,5,True):
            out.append(dict(piece=i,steps=5,used=list(r),enter=True))
    entries=[o for o in out if o['enter']]
    return entries or out

def choices(p):
    if not game['rolled']:return []
    # Search complete die allocations. Require both dice when possible; an
    # all-entered doubles bonus must use all four faces or move no pawns.
    original=[a[:] for a in game['pieces']]; remaining=game['remaining'][:]
    @lru_cache(None)
    def best(board, dice):
        game['pieces']=[list(a) for a in board];game['remaining']=list(dice)
        score=0
        for o in raw_choices(p):
            apply_preview(p,o)
            rest=list(dice)
            for d in o['used']:rest.remove(d)
            score=max(score,len(o['used'])+best(tuple(tuple(a) for a in game['pieces']),tuple(rest)))
            game['pieces']=[list(a) for a in board];game['remaining']=list(dice)
        return score
    try:
        board=tuple(tuple(a) for a in original);dice=tuple(remaining)
        opts=raw_choices(p);target=best(board,dice)
        if len(remaining)==4 and target<4:return []
        result=[]
        for o in opts:
            game['pieces']=[a[:] for a in original];game['remaining']=remaining[:]
            apply_preview(p,o);rest=remaining[:]
            for d in o['used']:rest.remove(d)
            if len(o['used'])+best(tuple(tuple(a) for a in game['pieces']),tuple(rest))==target:result.append(o)
        return result
    finally:
        game['pieces']=original;game['remaining']=remaining

def apply_preview(p,o):
    i=o['piece'];v=0 if o['enter'] else game['pieces'][p][i]+o['steps']
    game['pieces'][p][i]=v
    if v<64:
        target=sq(p,v)
        for q,j in occupants(target):
            if q!=p and (target not in SAFE or o['enter']):game['pieces'][q][j]=-1

def end_turn():
    game.update(turn=next_player(game['turn']),rolled=False,dice=None,remaining=[],bonus=[],bonus_active=False,blockade_origins=[])

def roll():
    p=game['turn']
    game['blockade_origins']=[[i,j] for i in range(4) for j in range(i+1,4) if 0<=game['pieces'][p][i]<HOME and game['pieces'][p][i]==game['pieces'][p][j]]
    a,b=random.randint(1,6),random.randint(1,6)
    if a==b:
        game['doubles']+=1
        if game['doubles']==3:
            candidates=[(v,i) for i,v in enumerate(game['pieces'][p]) if 0<=v<HOME]
            if candidates:
                _,i=max(candidates);game['pieces'][p][i]=-1
            game['message']='Third doubles: closest piece to HOME returns to START'
            emit('penalty',player=p,dice=[a,b]);end_turn();game['doubles']=0;return
    else:game['doubles']=0
    # With all pawns entered, doubles grant the four top/bottom faces (total 14).
    all_entered=all(v!=-1 for v in game['pieces'][p]);r=[a,b]
    if a==b and all_entered:r=[a,b,7-a,7-b]
    game.update(dice=[a,b],remaining=r,rolled=True,bonus=[],bonus_active=False)
    game['message']=seats[p]['name']+' rolled '+str(a)+' + '+str(b)
    emit('roll',player=p,dice=[a,b])
    if not choices(p):finish_roll()

def finish_roll():
    p=game['turn']; doubles=game['dice'] and game['dice'][0]==game['dice'][1]
    while game['bonus']:
        game['remaining']=[game['bonus'].pop(0)];game['bonus_active']=True;game['rolled']=True
        if choices(p):return
    game['bonus_active']=False
    game.update(rolled=False,remaining=[],dice=None)
    if not doubles:game['doubles']=0;game['turn']=next_player(p)
    game['message']='Roll complete' + (' — doubles: roll again' if doubles else '')

def move(p,option):
    if game['winner'] is not None:return
    i=option['piece'];old=game['pieces'][p][i];v=0 if option['enter'] else old+option['steps']
    game['pieces'][p][i]=v
    for u in option['used']:game['remaining'].remove(u)
    capture=[]
    if v<64:
        target=sq(p,v)
        for q,j in occupants(target):
            if q!=p and (target not in SAFE or target==START[p]):
                game['pieces'][q][j]=-1;capture.append([q,j])
    if capture:game['bonus'].append(20)
    if v==HOME:game['bonus'].append(10)
    emit('move',player=p,piece=i,from_pos=old,to_pos=v,steps=option['steps'],capture=bool(capture),home=v==HOME)
    if all(x==HOME for x in game['pieces'][p]):
        game['winner']=p;record_win(p);game['message']=seats[p]['name']+' wins!';emit('win',player=p,piece=i,from_pos=old,to_pos=v);return
    game['message']=seats[p]['name']+' moved '+str(option['steps'])+' spaces'
    if not game['remaining'] or not choices(p):finish_roll()

async def bots():
    while True:
        await asyncio.sleep(.85)
        async with lock:
            if reset_if_abandoned():
                await broadcast()
                continue
            if not game['started'] or game['winner'] is not None or not seats[game['turn']] or not seats[game['turn']]['bot']:continue
            p=game['turn']
            if not game['rolled']:roll()
            else:
                opts=choices(p)
                if opts:
                    def score(o):
                        v=0 if o['enter'] else game['pieces'][p][o['piece']]+o['steps']
                        target=sq(p,v) if v<64 else -1
                        return (v==HOME, target not in SAFE and any(q!=p for q,j in occupants(target)),o['enter'],v,random.random())
                    move(p,max(opts,key=score))
                else:finish_roll()
            await broadcast()

async def websocket(request):
    ws=web.WebSocketResponse(heartbeat=25);await ws.prepare(request);clients[ws]=None
    async with lock:
        if reset_if_abandoned():await broadcast()
        else:await ws.send_str(json.dumps(public()))
    try:
        async for msg in ws:
            if msg.type!=WSMsgType.TEXT:continue
            try:data=json.loads(msg.data)
            except Exception:continue
            if not isinstance(data,dict):continue
            async with lock:
                action=data.get('action');seat=clients.get(ws)
                if action=='join' and seat is None and not game['started']:
                    name=str(data.get('name','Player')).strip()[:20] or 'Player'
                    for i in range(4):
                        if seats[i] is None:
                            seats[i]=dict(name=name,bot=False,ws=ws);clients[ws]=i
                            await ws.send_str(json.dumps(dict(type='joined',seat=i)));break
                elif action=='start' and seat is not None and not game['started']:
                    if data.get('with_bots'):
                        for i in range(4):
                            if not seats[i]:seats[i]=dict(name='Computer '+str(i+1),bot=True,ws=None)
                    if sum(bool(s) for s in seats)>=2:
                        game.update(fresh())
                        contenders=[i for i,s in enumerate(seats) if s]
                        opening=[]
                        while len(contenders)>1:
                            rolls={i:random.randint(1,6)+random.randint(1,6) for i in contenders}
                            opening.append(', '.join(seats[i]['name']+': '+str(v) for i,v in rolls.items()))
                            contenders=[i for i,v in rolls.items() if v==max(rolls.values())]
                        game.update(started=True,turn=contenders[0],message='Opening rolls: '+' / '.join(opening)+'. '+seats[contenders[0]]['name']+' starts');emit('start')
                elif action=='roll' and seat==game['turn'] and game['started'] and not game['rolled'] and game['winner'] is None:roll()
                elif action=='move' and seat==game['turn'] and game['rolled'] and game['winner'] is None:
                    opts=choices(seat)
                    selected=next((o for o in opts if o['piece']==data.get('piece') and o['steps']==data.get('steps') and o['enter']==data.get('enter',False)),None)
                    if selected:move(seat,selected)
                elif action=='reset' and (seat is not None or game['winner'] is not None or not human_present()):
                    reset_game()
                await broadcast()
    finally:
        async with lock:
            seat=clients.pop(ws,None)
            if seat is not None and seats[seat] and seats[seat]['ws'] is ws:
                seats[seat]=dict(name='Computer '+str(seat+1),bot=True,ws=None) if game['started'] else None
            reset_if_abandoned()
            await broadcast()
    return ws

async def index(request):return web.FileResponse(ROOT/'index.html')
async def hall(request):
    rows=''.join('<tr><td>'+escape(row['name'])+(' <small>(Computer)</small>' if row['bot'] else '')+'</td><td>'+str(row['wins'])+'</td></tr>' for row in hall_rows())
    if not rows:rows='<tr><td colspan="2" class="empty">No champions yet. Finish a game to claim your place!</td></tr>'
    source='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Victory Hall · Classic Parcheesi</title><style>body{margin:0;background:#14252d;color:#f4f1e7;font:17px/1.6 system-ui}main{max-width:680px;margin:40px auto;padding:24px}h1{font:700 clamp(30px,6vw,46px) Georgia,serif;color:#efd597}a{color:#efd597}table{width:100%;border-collapse:collapse;background:#20313b;border-radius:12px;overflow:hidden}th,td{text-align:left;padding:16px 20px;border-bottom:1px solid #ffffff18;overflow-wrap:anywhere}th{color:#efd597;font-size:15px}th:last-child,td:last-child{text-align:right}small,p{color:#bfcbd0}.empty{text-align:center!important}button{font:inherit;padding:8px 16px;background:#e7c575;border:0;border-radius:8px;cursor:pointer}</style><main><a href="/">← Classic Parcheesi</a><h1>🏆 Victory Hall</h1><p>The most wins, at the top.</p><table><thead><tr><th scope="col">Player</th><th scope="col">Wins</th></tr></thead><tbody>'''+rows+'''</tbody></table><p><small>Wins are grouped by nickname and kept until the server process restarts. Resetting a game does not clear them.</small></p><button onclick="location.reload()">Refresh scores</button></main></html>'''
    if HALL_FILE is not None:source=source.replace('until the server process restarts','until the server machine reboots')
    if request.query.get('embedded')=='1':
        source=source.replace('<a href="/">','<a href="/" onclick="if(parent!==window){event.preventDefault();parent.postMessage(\'close-victory-hall\',location.origin)}">',1)
    return web.Response(text=source,content_type='text/html',headers={'Cache-Control':'no-store'})
async def lobby_music(request):return web.FileResponse(ROOT/'music2.mp3',headers={'Cache-Control':'public, max-age=3600'})
async def winner_audio(request):return web.FileResponse(ROOT/'winner.wav',headers={'Cache-Control':'public, max-age=3600'})
async def rules(request):
    language=request.match_info['language']
    if language not in {'en','pt-BR','es-ES','fr-FR','it-IT','ru-RU','ja-JP','zh-CN','hi-IN'}:raise web.HTTPNotFound()
    return web.FileResponse(ROOT/'rules'/f'{language}.html')
async def startup(app):
    load_hall()
    app['bots']=asyncio.create_task(bots())
async def cleanup(app):app['bots'].cancel()
app=web.Application();app.router.add_get('/',index);app.router.add_get('/victory-hall',hall);app.router.add_get('/ws',websocket);app.router.add_get('/winner.wav',winner_audio);app.router.add_get('/music2.mp3',lobby_music);app.router.add_get('/rules/{language}',rules);app.on_startup.append(startup);app.on_cleanup.append(cleanup)
if __name__=='__main__':web.run_app(app,host='0.0.0.0',port=8080)
