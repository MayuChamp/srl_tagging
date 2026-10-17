"""Offline macro protocol regression tests."""
import copy
import unittest
from environment_macro import validate_macro, prepare_sources, analyze_macro


def fixtures():
    source = {'window_index': 1, 'start_time': 60, 'end_time': 120,
        'observation': {'visual_artifacts': [{'label':'table', 'evidence_ids':['w1_f0']}]},
        'evidence': [{'id':'w1_f0','kind':'image','start':60,'end':60},
                     {'id':'t0','kind':'transcript','start':10,'end':20,'text':'instruction'}]}
    finding = {'mechanism':'monitoring','support_type':'indirect','responsibility':'shared',
        'state':'partial','rationale':'candidate','evidence_ids':['w1_f0','t0'],
        'uptake':'unknown','uptake_evidence_ids':[]}
    episode = {'id':'e1','start_time':60,'end_time':120,'title':'task','window_indices':[1],
        'evidence_ids':['w1_f0','t0'], 'artifacts':[{'id':'a1','label':'table','evidence_ids':['w1_f0'],
        'continuity':'candidate','changes':''}], 'opportunities':[finding], 'limitations':[]}
    return [source], {'episodes':[episode],'lesson_summary':'sample coverage','limitations':[]}


class MacroTests(unittest.TestCase):
    def test_valid_candidate_and_earlier_instruction(self):
        sources, value = fixtures()
        self.assertEqual(validate_macro(value, sources), value)

    def test_invalid_nested_ref_and_future_uptake(self):
        sources, value = fixtures()
        value['episodes'][0]['opportunities'][0]['evidence_ids'] = ['invented']
        with self.assertRaises(ValueError): validate_macro(value, sources)
        sources, value = fixtures()
        value['episodes'][0]['opportunities'][0].update(uptake='observed',uptake_evidence_ids=['t0'])
        with self.assertRaises(ValueError): validate_macro(value, sources)

    def test_continuity_requires_two_times_and_visual_extraction(self):
        sources, value = fixtures()
        value['episodes'][0]['artifacts'][0]['continuity'] = 'supported'
        with self.assertRaises(ValueError): validate_macro(value, sources)
        sources, value = fixtures()
        sources[0]['observation']['visual_artifacts'] = []
        with self.assertRaises(ValueError): validate_macro(value, sources)

    def test_bad_windows_and_duplicate_episodes(self):
        sources, value = fixtures()
        value['episodes'][0]['window_indices'] = [1.5]
        with self.assertRaises(ValueError): validate_macro(value, sources)
        sources, value = fixtures()
        value['episodes'].append(copy.deepcopy(value['episodes'][0]))
        with self.assertRaises(ValueError): validate_macro(value, sources)

    def test_private_paths_removed(self):
        sources, _ = fixtures()
        row = dict(sources[0],status='completed')
        row['evidence'][0].update(storage_path='private',url='signed',local_path='local')
        cleaned = prepare_sources([row])
        self.assertNotIn('storage_path',cleaned[0]['evidence'][0])
        self.assertNotIn('url',cleaned[0]['evidence'][0])

    def test_context_alone_cannot_establish_opportunity_or_uptake(self):
        sources, value = fixtures()
        value['episodes'][0]['opportunities'][0]['evidence_ids'] = ['t0']
        with self.assertRaises(ValueError): validate_macro(value, sources)
        sources, value = fixtures()
        sources[0]['evidence'][1].update(start=60,end=75,context_only=True)
        value['episodes'][0]['opportunities'][0].update(uptake='observed',uptake_evidence_ids=['t0'])
        with self.assertRaises(ValueError): validate_macro(value, sources)

    def test_exact_boundary_transcript_is_not_current_uptake(self):
        sources, value = fixtures()
        sources[0]['evidence'][1]['end'] = 60
        value['episodes'][0]['opportunities'][0].update(uptake='observed',uptake_evidence_ids=['t0'])
        with self.assertRaises(ValueError): validate_macro(value, sources)

    def test_audit_abstention_preserves_candidate(self):
        sources, value = fixtures()
        class Fake:
            usage = []
            def synthesize_macro(self, sources): return value
            def audit_macro(self, candidate, sources):
                return {'issues':[{'episode_id':'e1','reason':'unsupported'}]}
        result = analyze_macro([dict(sources[0],status='completed')], Fake())
        self.assertEqual(result['episodes'][0]['opportunities'][0]['state'],'unknown')
        self.assertEqual(result['episodes'][0]['artifacts'],[])
        self.assertEqual(value['episodes'][0]['opportunities'][0]['state'],'partial')
        self.assertIsNotNone(result['audit']['original_candidate'])

if __name__ == '__main__': unittest.main()
