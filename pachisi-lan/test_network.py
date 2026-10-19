import unittest
from aiohttp import ClientSession, web
from aiohttp.test_utils import TestServer
import server as s

class Network(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        s.game=s.fresh();s.seats[:]=[None]*4;s.clients.clear();s.victory_hall.clear()
        app=web.Application();app.router.add_get('/',s.index);app.router.add_get('/victory-hall',s.hall);app.router.add_get('/ws',s.websocket);app.router.add_get('/rules/{language}',s.rules);app.router.add_get('/winner.wav',s.winner_audio);app.router.add_get('/music2.mp3',s.lobby_music)
        self.server=TestServer(app);await self.server.start_server();self.client=ClientSession()
    async def asyncTearDown(self):
        await self.client.close();await self.server.close()
    async def state(self,ws):
        while True:
            msg=await ws.receive_json(timeout=3)
            if msg['type']=='state':return msg
    async def test_multiplayer(self):
        a=await self.client.ws_connect(self.server.make_url('/ws'));await self.state(a)
        b=await self.client.ws_connect(self.server.make_url('/ws'));await self.state(b)
        await a.send_json({'action':'join','name':'Alice'});self.assertEqual((await a.receive_json())['seat'],0);await self.state(a);await self.state(b)
        await b.send_json({'action':'join','name':'Bob'});self.assertEqual((await b.receive_json())['seat'],1);await self.state(b);await self.state(a)
        await a.send_json({'action':'start'});g=await self.state(a);await self.state(b)
        self.assertTrue(g['game']['started'])
        for _ in range(100):
            turn=s.game['turn'];ws=[a,b][turn]
            if s.game['rolled']:
                opts=s.choices(turn)
                if not opts:break
                await ws.send_json({'action':'move',**opts[0]})
            else:await ws.send_json({'action':'roll'})
            ga=await self.state(a);gb=await self.state(b);self.assertEqual(ga,gb)
        # malformed JSON values and unauthorized actions cannot corrupt a game
        before=s.game['pieces'];await a.send_json([])
        await b.send_json({'action':'move','piece':99,'steps':1000})
        await self.state(a);await self.state(b);self.assertEqual(before,s.game['pieces'])
        await b.close();g=await self.state(a);self.assertTrue(g['seats'][1]['bot'])
        await a.send_json({'action':'reset'});g=await self.state(a);self.assertFalse(g['game']['started']);self.assertIsNone(g['seats'][1])
        await a.close()
    async def join(self,name):
        ws=await self.client.ws_connect(self.server.make_url('/ws'));await self.state(ws)
        await ws.send_json({'action':'join','name':name})
        self.assertEqual((await ws.receive_json())['type'],'joined');await self.state(ws)
        return ws
    async def test_last_human_leaves_with_spectator(self):
        human=await self.join('Solo')
        await human.send_json({'action':'start','with_bots':True});await self.state(human)
        spectator=await self.client.ws_connect(self.server.make_url('/ws'));await self.state(spectator)
        await human.close();g=await self.state(spectator)
        self.assertFalse(g['game']['started']);self.assertEqual(g['seats'],[None]*4)
        self.assertEqual(g['game']['pieces'],[[-1]*4 for _ in range(4)])
        await spectator.send_json({'action':'join','name':'New human'})
        self.assertEqual((await spectator.receive_json())['seat'],0);await self.state(spectator)
        await spectator.close()
    async def test_reopen_after_all_browsers_close(self):
        human=await self.join('Solo')
        await human.send_json({'action':'start','with_bots':True});await self.state(human)
        await human.close()
        reopened=await self.client.ws_connect(self.server.make_url('/ws'));g=await self.state(reopened)
        self.assertFalse(g['game']['started']);self.assertEqual(g['seats'],[None]*4)
        await reopened.close()
    async def test_old_bot_only_game_recovers_on_open(self):
        s.game.update(started=True);s.seats[:]=[dict(name='Bot',bot=True,ws=None) for _ in range(4)]
        visitor=await self.client.ws_connect(self.server.make_url('/ws'));g=await self.state(visitor)
        self.assertFalse(g['game']['started']);self.assertEqual(g['seats'],[None]*4)
        await visitor.close()
    async def test_spectator_cannot_reset_active_humans(self):
        human=await self.join('Solo');await human.send_json({'action':'start','with_bots':True});await self.state(human)
        spectator=await self.client.ws_connect(self.server.make_url('/ws'));await self.state(spectator)
        await spectator.send_json({'action':'reset'});g=await self.state(spectator);await self.state(human)
        self.assertTrue(g['game']['started']);self.assertFalse(g['can_reset'])
        await spectator.close();await self.state(human);self.assertTrue(s.game['started'])
        await human.close()
    async def test_winner_wav(self):
        async with self.client.get(self.server.make_url('/winner.wav')) as r:
            self.assertEqual(r.status,200);self.assertEqual(await r.read(),(s.ROOT/'winner.wav').read_bytes())
        async with self.client.get(self.server.make_url('/winner.wav'),headers={'Range':'bytes=0-11'}) as r:
            self.assertEqual(r.status,206);data=await r.read();self.assertEqual(data[:4],b'RIFF');self.assertEqual(data[8:12],b'WAVE')
    async def test_lobby_music(self):
        async with self.client.get(self.server.make_url('/music2.mp3')) as r:
            self.assertEqual(r.status,200);self.assertEqual(await r.read(),(s.ROOT/'music2.mp3').read_bytes())
        async with self.client.get(self.server.make_url('/music2.mp3'),headers={'Range':'bytes=0-31'}) as r:
            self.assertEqual(r.status,206);self.assertEqual(await r.read(),(s.ROOT/'music2.mp3').read_bytes()[:32])
    async def test_victory_hall(self):
        async with self.client.get(self.server.make_url('/victory-hall')) as r:
            self.assertEqual(r.status,200);self.assertIn('No champions yet',await r.text());self.assertEqual(r.headers['Cache-Control'],'no-store')
        s.seats[:]=[dict(name='Alice <script>',bot=False),dict(name='Bob',bot=False),dict(name='Computer 3',bot=True),None]
        s.record_win(1);s.record_win(0);s.record_win(1);s.record_win(2)
        async with self.client.get(self.server.make_url('/victory-hall')) as r:
            html=await r.text();self.assertLess(html.index('Bob'),html.index('Alice &lt;script&gt;'))
            self.assertIn('<th scope="col">Player</th>',html);self.assertIn('<th scope="col">Wins</th>',html);self.assertNotIn('Alice <script>',html)
        s.reset_game();self.assertEqual(s.hall_rows()[0]['wins'],2)
        s.game.update(started=True);s.reset_if_abandoned();self.assertEqual(s.hall_rows()[0]['wins'],2)
    async def test_pages(self):
        for path in ['/','/rules/en','/rules/pt-BR','/rules/es-ES','/rules/fr-FR','/rules/it-IT','/rules/ru-RU','/rules/ja-JP','/rules/zh-CN','/rules/hi-IN']:
            async with self.client.get(self.server.make_url(path)) as r:self.assertEqual(r.status,200);body=await r.text();self.assertIn('<html',body)
            if path.startswith('/rules/'):
                self.assertIn('Signal To Noise',body);self.assertIn('https://www.youtube.com/@ScottBuckley',body)
        async with self.client.get(self.server.make_url('/rules/no')) as r:self.assertEqual(r.status,404)

if __name__=='__main__':unittest.main()
