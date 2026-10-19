import unittest, random, copy, tempfile
from pathlib import Path
from unittest.mock import patch
import server as s

class Rules(unittest.TestCase):
    def setUp(self):
        s.victory_hall.clear();s.game=s.fresh();s.seats[:]=[dict(name=str(i),bot=True) for i in range(4)]
        s.game.update(started=True,rolled=True,dice=[2,3],remaining=[2,3])
    def test_mandatory_entry(self):
        s.game['pieces'][0]=[10,-1,-1,-1]
        self.assertTrue(all(o['enter'] for o in s.choices(0)))
    def test_entry_capture_and_blockade(self):
        s.game['pieces'][1][0]=17
        self.assertTrue(s.legal_piece(0,0,5,True))
        s.move(0,s.choices(0)[0]);self.assertEqual(s.game['pieces'][1][0],-1)
        self.assertEqual(s.game['remaining'],[20])
        self.assertFalse(s.game['bonus_active'] is False)
    def test_entry_blocked(self):
        s.game['pieces'][1]=[17,17,-1,-1]
        self.assertFalse(s.legal_piece(0,0,5,True))
    def test_safe_landing(self):
        s.game['pieces'][0][0]=7;s.game['pieces'][1][0]=25
        self.assertFalse(s.legal_piece(0,0,1))
    def test_home_lane_blockade(self):
        s.game['pieces'][0]=[63,65,65,-1]
        self.assertFalse(s.legal_piece(0,0,3))
        self.assertTrue(s.legal_piece(0,1,1))
    def test_exact_home(self):
        s.game['pieces'][0][0]=70
        self.assertTrue(s.legal_piece(0,0,1));self.assertFalse(s.legal_piece(0,0,2))
    def test_intermediate_blockade(self):
        s.game['pieces'][0]=[0,2,2,-1];s.game['remaining']=[3,1]
        self.assertFalse(any(o['piece']==0 and o['steps']==3 for o in s.choices(0)))
    def test_use_both_dice_when_possible(self):
        s.game['pieces'][0]=[69,70,71,71];s.game['remaining']=[1,2]
        self.assertFalse(any(o['piece']==0 and o['steps']==1 for o in s.choices(0)))
    def test_doubles_all_or_nothing(self):
        s.game['pieces'][0]=[70,71,71,71];s.game['remaining']=[1,1,6,6]
        self.assertEqual(s.choices(0),[])
    def test_third_doubles(self):
        s.game['pieces'][0]=[12,69,71,-1];s.game['doubles']=2
        with patch.object(s.random,'randint',return_value=2):s.roll()
        self.assertEqual(s.game['pieces'][0],[12,-1,71,-1]);self.assertEqual(s.game['turn'],1)
    def test_no_reformed_blockade(self):
        s.game['pieces'][0]=[10,10,-1,-1];s.game['blockade_origins']=[[0,1]]
        s.game['pieces'][0][0]=12
        self.assertFalse(s.legal_piece(0,1,2))
    def test_separate_bonuses(self):
        s.game['pieces'][0]=[0,20,-1,-1];s.game.update(remaining=[],bonus=[20,10])
        s.finish_roll();self.assertEqual(s.game['remaining'],[20])
        s.move(0,s.choices(0)[0]);self.assertEqual(s.game['remaining'],[10])
    def test_search_does_not_mutate(self):
        s.game['pieces'][0]=[0,4,9,13];s.game['remaining']=[2,2,5,5]
        before=copy.deepcopy(s.game);s.choices(0);self.assertEqual(s.game,before)
    def test_win_counted_once_and_survives_game_reset(self):
        s.seats[0]=dict(name='Champion',bot=False)
        s.game['pieces'][0]=[70,71,71,71];s.game['remaining']=[1]
        option=dict(piece=0,steps=1,used=[1],enter=False)
        s.move(0,option);self.assertEqual(s.hall_rows()[0]['wins'],1)
        s.move(0,option);self.assertEqual(s.hall_rows()[0]['wins'],1)
        s.game=s.fresh();self.assertEqual(s.hall_rows()[0]['wins'],1)
        s.game.update(rolled=True,dice=[1,2],remaining=[1]);s.game['pieces'][0]=[70,71,71,71]
        s.seats[0]['name']='CHAMPION';s.move(0,option)
        self.assertEqual(len(s.hall_rows()),1);self.assertEqual(s.hall_rows()[0]['wins'],2)
    def test_scores_restore_after_service_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(s,'HALL_FILE',Path(folder)/'victory-hall.json'):
                s.record_win(0);s.record_win(0);s.record_win(1)
                s.victory_hall.clear();s.load_hall()
                self.assertEqual([row['wins'] for row in s.hall_rows()],[2,1])
                s.game=s.fresh();self.assertEqual(s.hall_rows()[0]['wins'],2)
    def test_complete_games(self):
        random.seed(923)
        for run in range(20):
            s.game=s.fresh();s.game['started']=True
            for n in range(12000):
                if s.game['winner'] is not None:break
                p=s.game['turn']
                if not s.game['rolled']:s.roll()
                else:
                    opts=s.choices(p)
                    if opts:s.move(p,random.choice(opts))
                    else:s.finish_roll()
                for row in s.game['pieces']:
                    self.assertEqual(len(row),4)
                    self.assertTrue(all(-1<=v<=s.HOME for v in row))
                    for v in set(row)-{-1,s.HOME}:self.assertLessEqual(row.count(v),2)
                for square in range(68):
                    occ=s.occupants(square)
                    self.assertLessEqual(len(occ),2)
                    self.assertLessEqual(len(set(p for p,i in occ)),1)
            self.assertIsNotNone(s.game['winner'],f'Game {run} did not finish')

if __name__=='__main__':unittest.main()
