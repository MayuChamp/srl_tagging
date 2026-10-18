import copy
import unittest
from environment_overview import prepare_tagging, validate_overview, analyze_overview, SECTIONS
from test_environment_macro import fixtures


def overview_fixture():
    sources, macro = fixtures()
    value = {key: [] for key in SECTIONS}
    value['limitations'] = []
    value['progression'] = [{'id': 'p1', 'text': 'sampled task', 'episode_ids': ['e1'],
        'evidence_ids': ['w1_f0'], 'tag_ids': [], 'basis': 'observation', 'kind': 'finding'}]
    tagging = {'session_id': 'session1', 'tags': [{'id': 'tag1', 'label': 'monitoring',
        'text': 'annotator interpretation', 'start_time': 60, 'end_time': 80}]}
    return sources, macro, value, tagging


class OverviewTests(unittest.TestCase):
    def test_no_tagging_valid_and_explicit_limitation(self):
        sources, macro, value, _ = overview_fixture()
        class Fake:
            def synthesize_overview(self, payload):
                self.payload = payload
                return value
            def audit_overview(self, candidate, payload): return {'issues': []}
        model = Fake()
        result = analyze_overview([dict(sources[0], status='completed')], macro, model, total_windows=5)
        self.assertIsNone(result['tagging_session_id'])
        self.assertEqual(result['coverage'], {'completed_windows': 1, 'total_windows': 5})
        self.assertIsNone(model.payload['tagging'])
        self.assertTrue(any('לא נבחר תיוג' in s for s in result['limitations']))

    def test_combined_needs_temporal_alignment_and_both_sources(self):
        sources, macro, value, tags = overview_fixture()
        item = value['progression'][0]
        item.update(basis='combined', tag_ids=['tag1'])
        validate_overview(value, macro['episodes'], sources, tags)
        tags['tags'][0].update(start_time=120, end_time=130)
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, tags)
        tags['tags'][0].update(start_time=40, end_time=60)
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, tags)
        tags['tags'][0].update(start_time=90, end_time=100)
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, tags)
        tags['tags'][0].update(start_time=60, end_time=80)
        item['evidence_ids'] = []
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, tags)

    def test_tag_only_cannot_claim_observation_or_missed_opportunity(self):
        sources, macro, value, tags = overview_fixture()
        item = value['progression'].pop()
        item.update(basis='tagging', evidence_ids=[], episode_ids=[], tag_ids=['tag1'], kind='missed_opportunity')
        value['opportunities'] = [item]
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, tags)
        item['kind'] = 'suggestion'
        validate_overview(value, macro['episodes'], sources, tags)
        item['basis'] = 'observation'
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, tags)

    def test_refs_must_belong_to_cited_episode(self):
        sources, macro, value, _ = overview_fixture()
        macro['episodes'][0]['evidence_ids'] = ['t0']
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, None)

    def test_context_only_cannot_prove_missed_opportunity(self):
        sources, macro, value, _ = overview_fixture()
        item = value['progression'].pop()
        item.update(kind='missed_opportunity', evidence_ids=['t0'])
        value['opportunities'] = [item]
        with self.assertRaises(ValueError): validate_overview(value, macro['episodes'], sources, None)

    def test_invalid_duplicate_and_nonfinite_tags(self):
        _, _, _, tags = overview_fixture()
        for bad in [float('nan'), float('inf'), -1, True]:
            candidate = copy.deepcopy(tags)
            candidate['tags'][0]['start_time'] = bad
            with self.assertRaises(ValueError): prepare_tagging(candidate)
        tags['tags'].append(copy.deepcopy(tags['tags'][0]))
        with self.assertRaises(ValueError): prepare_tagging(tags)

    def test_snapshot_strips_private_fields(self):
        _, _, _, tags = overview_fixture()
        tags['secret'] = 'private'
        tags['tags'][0]['signed_url'] = 'private'
        clean = prepare_tagging(tags)
        self.assertNotIn('secret', clean)
        self.assertNotIn('signed_url', clean['tags'][0])

    def test_bad_snapshot_metadata(self):
        _, _, _, tags = overview_fixture()
        for field, value in [('limitations', 'text'), ('limitations', [42]),
                             ('session_name', {}), ('is_ai_generated', 'yes')]:
            candidate = dict(tags, **{field: value})
            with self.assertRaises(ValueError): prepare_tagging(candidate)

    def test_audit_removes_claim_and_retains_original(self):
        sources, macro, value, tags = overview_fixture()
        class Fake:
            def synthesize_overview(self, payload): return value
            def audit_overview(self, candidate, payload):
                return {'issues': [{'item_id': 'p1', 'reason': 'unsupported recurrence'}]}
        result = analyze_overview([dict(sources[0], status='completed')], macro, Fake(), tags)
        self.assertEqual(result['progression'], [])
        self.assertEqual(len(result['audit']['original_candidate']['progression']), 1)
        self.assertEqual(len(value['progression']), 1)

    def test_all_rejected_abstains_without_provider_calls(self):
        sources, macro, value, _ = overview_fixture()
        macro['audit'] = {'issues': [{'episode_id': 'e1'}]}
        class Fake:
            def synthesize_overview(self, payload): raise AssertionError('No billable synthesis needed')
            def audit_overview(self, candidate, payload): raise AssertionError('No audit needed')
        for snapshot in (None, {'session_id': 'empty', 'tags': []}):
            result = analyze_overview([dict(sources[0], status='completed')], macro, Fake(), snapshot, 31)
            self.assertEqual(result['status'], 'completed')
            self.assertEqual(result['evidence_status'], 'insufficient')
            self.assertFalse(result['audit']['performed'])
            self.assertEqual(result['coverage'], {'completed_windows': 1, 'total_windows': 31})
            self.assertTrue(all(not result[key] for key in SECTIONS))

    def test_rejected_episode_cannot_return_through_tagged_synthesis(self):
        sources, macro, value, tagging = overview_fixture()
        macro['audit'] = {'issues': [{'episode_id': 'e1'}]}
        class Fake:
            def synthesize_overview(self, payload):
                self.payload = payload
                return value
        model = Fake()
        with self.assertRaises(ValueError):
            analyze_overview([dict(sources[0], status='completed')], macro, model, tagging)
        self.assertEqual(model.payload['samples'], [])
        self.assertEqual(model.payload['allowed_episode_ids'], [])

    def test_tag_only_analysis_remains_possible_after_episode_rejection(self):
        sources, macro, value, tagging = overview_fixture()
        macro['audit'] = {'issues': [{'episode_id': 'e1'}]}
        value['progression'][0].update(basis='tagging', episode_ids=[], evidence_ids=[], tag_ids=['tag1'])
        class Fake:
            def synthesize_overview(self, payload): return value
            def audit_overview(self, candidate, payload): return {'issues': []}
        result = analyze_overview([dict(sources[0], status='completed')], macro, Fake(), tagging)
        self.assertEqual(result['progression'][0]['basis'], 'tagging')
        self.assertEqual(result['evidence_status'], 'available')


if __name__ == '__main__': unittest.main()
