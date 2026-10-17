"""Offline tests: no real classroom data, credentials, network or paid model calls."""
import copy
import math
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from environment_protocol import (
    CODEBOOK, OBSERVATION_SCHEMA, sampling_windows, summarize, transcript_evidence,
    validate_interpretation, validate_observation, validate_schema, guard_interpretation,
)
from environment_worker import analyze_window, probe_duration, fenced_update


def observation(ref="w0_f0", needs_video=False):
    return {"description": "נראים שולחנות ותלמידים בקבוצות", "organization": "groups",
            "teacher_actions": [], "student_actions": [], "resources": ["שולחנות"],
            "coverage": "partial_class", "limitations": ["רק חלק מהכיתה נראה"],
            "evidence_ids": [ref], "needs_video": needs_video,
            "video_reason": "בדיקת מעבר פעילות" if needs_video else "", "video_check_time": 20}


def interpretation():
    return {"findings": [{"code": code, "state": "unknown", "rationale": "אין מספיק ראיות",
                          "evidence_ids": [], "scope": "visible_group", "uptake": "unknown",
                          "uptake_evidence_ids": [], "direct_support_also_present": False}
                         for code in CODEBOOK], "limitations": []}


class ProtocolTests(unittest.TestCase):
    def test_sampling_comparison_and_last_partial_window(self):
        self.assertEqual(sum(len(w["timestamps"]) for w in sampling_windows(2700)), 135)
        self.assertEqual(len(sampling_windows(2700, 180, 1)), 15)
        windows = sampling_windows(65)
        self.assertEqual(windows[0]["timestamps"], [0, 20, 40])
        self.assertEqual(windows[1], {"index": 1, "start": 60, "end": 65, "timestamps": [60]})
        self.assertEqual(len(sampling_windows(60)), 1)
        self.assertEqual(sampling_windows(0.1)[0]["timestamps"], [0])

    def test_invalid_sampling_fails_before_model_calls(self):
        for duration in (0, -1, math.inf, math.nan):
            with self.assertRaises(ValueError):
                sampling_windows(duration)
        for interval, frames in ((180, 3), (0, 3), (60, True), (60, 100)):
            with self.assertRaises(ValueError):
                sampling_windows(60, interval, frames)

    def test_context_is_exact_timestamped_and_speech_only(self):
        source = [{"start": 5, "end": 15, "text": "הקשר קודם"},
                  {"start": 59, "end": 61, "text": "חוצה גבול"},
                  {"start": 70, "end": 72, "text": "בחרו דרך"},
                  {"start": 75, "end": 80, "type": "ambient", "text": "שקט"},
                  {"start": 120, "end": 125, "text": "חלון הבא"}, None]
        result = transcript_evidence(source, 60, 120)
        self.assertEqual([e["id"] for e in result], ["t0", "t1", "t2"])
        self.assertTrue(result[0]["context_only"])
        self.assertFalse(result[1]["context_only"])
        self.assertEqual(result[2]["text"], source[2]["text"])

    def test_structured_output_is_not_blindly_trusted(self):
        for field, value in (("coverage", "all_students_attentive"), ("needs_video", "yes"), ("video_check_time", math.nan)):
            data = observation(); data[field] = value
            with self.assertRaises(ValueError):
                validate_schema(data, OBSERVATION_SCHEMA)
        extra = observation(); extra["confidence"] = 0.99
        with self.assertRaises(ValueError):
            validate_schema(extra, OBSERVATION_SCHEMA)

    def test_visual_references_and_video_time_must_exist(self):
        evidence = [{"id": "w0_f0", "kind": "image"}]
        window = sampling_windows(60)[0]
        with self.assertRaises(ValueError):
            validate_observation(observation("hallucinated"), evidence, window)
        value = observation(needs_video=True); value["video_check_time"] = 60
        with self.assertRaises(ValueError):
            validate_observation(value, evidence, window)

    def test_context_alone_cannot_establish_current_opportunity_or_uptake(self):
        evidence = [{"id": "past", "kind": "transcript", "context_only": True},
                    {"id": "now", "kind": "image", "context_only": False}]
        data = interpretation(); data["findings"][0].update(state="supported", evidence_ids=["past"])
        with self.assertRaises(ValueError):
            validate_interpretation(data, evidence, observation())
        data["findings"][0].update(evidence_ids=["now"], uptake="observed", uptake_evidence_ids=["past"])
        with self.assertRaises(ValueError):
            validate_interpretation(data, evidence, observation())
        data["findings"][0].update(uptake="unknown", uptake_evidence_ids=[])
        self.assertIs(validate_interpretation(data, evidence, observation()), data)

    def test_partial_camera_cannot_support_whole_class_claim(self):
        data = interpretation(); data["findings"][0]["scope"] = "visible_class"
        with self.assertRaises(ValueError):
            validate_interpretation(data, [], observation())

    def test_guard_abstains_only_for_invalid_claim_and_preserves_original(self):
        data = interpretation()
        data["findings"][0].update(scope="visible_class", state="supported", evidence_ids=["now"])
        data["findings"][1].update(state="supported", evidence_ids=["now"])
        cleaned, issues = guard_interpretation(data, [{"id": "now", "kind": "image"}], observation())
        self.assertEqual(cleaned["findings"][0]["state"], "unknown")
        self.assertEqual(cleaned["findings"][0]["scope"], "unknown")
        self.assertEqual(cleaned["findings"][1]["state"], "supported")
        self.assertEqual(data["findings"][0]["state"], "supported")
        self.assertEqual(issues, [{"code": "ENV_CHOICE", "reason": "Claim exceeds camera coverage"}])

    def test_unknown_evidence_and_duplicate_codes_rejected(self):
        data = interpretation(); data["findings"][0]["evidence_ids"] = ["invented"]
        with self.assertRaises(ValueError):
            validate_interpretation(data, [], observation())
        data = interpretation(); data["findings"][1] = copy.deepcopy(data["findings"][0])
        with self.assertRaises(ValueError):
            validate_interpretation(data, [], observation())

    def test_unusable_camera_is_unknown_not_absence(self):
        obs = observation(); obs["coverage"] = "unusable"
        data = interpretation(); data["findings"][0].update(state="not_observed", evidence_ids=["frame"])
        with self.assertRaises(ValueError):
            validate_interpretation(data, [{"id": "frame"}], obs)

    def test_denominators_exclude_unknown_and_failures(self):
        a, b = interpretation(), interpretation()
        a["findings"][0]["state"] = "supported"
        rows = [{"status": "completed", "interpretation": a},
                {"status": "completed", "interpretation": b}, {"status": "failed"}]
        result = summarize(rows, 4)
        self.assertEqual(result["counts"]["ENV_CHOICE"]["assessable"], 1)
        self.assertEqual(result["counts"]["ENV_CHOICE"]["unknown"], 1)
        self.assertEqual(result["failed_windows"], 1)
        self.assertEqual(result["unprocessed_windows"], 1)
        self.assertEqual(result["unit"], "sampled_windows_not_lesson_duration")

    def test_stale_worker_cannot_update_run(self):
        from unittest.mock import MagicMock
        db = MagicMock()
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        with self.assertRaisesRegex(RuntimeError, "lease lost"):
            fenced_update(db, {"id": "run", "lease_token": "old-token"}, {"status": "completed"})


class FakeModels:
    def __init__(self, require_clip=False, issues=False):
        self.usage = []; self.require_clip = require_clip; self.issues = issues
        self.saw_clip = False

    def observe(self, window, media):
        self.saw_clip = any(e["kind"] == "video" for e, _ in media)
        result = observation(media[0][0]["id"], self.require_clip and not self.saw_clip)
        result["video_check_time"] = window["start"] + (window["end"] - window["start"]) / 2
        return result

    def interpret(self, window, obs, evidence, media):
        result = interpretation()
        current = next(e["id"] for e in evidence if e["kind"] == "image")
        result["findings"][0].update(state="supported", evidence_ids=[current], rationale="הנחה לבדיקה")
        return result

    def audit(self, obs, result, evidence, media):
        return {"issues": [{"code": "ENV_CHOICE", "reason": "אין בתמונה עדות לבחירה"}] if self.issues else []}


class ProviderAdapterTests(unittest.TestCase):
    def call_provider(self, result, status=200):
        from environment_models import EnvironmentModels
        from unittest.mock import MagicMock
        model = EnvironmentModels.__new__(EnvironmentModels)
        model.models = {"interpretation": "test-model", "reasoning_effort": "high"}
        model.usage = []
        response = MagicMock(status_code=status, ok=status == 200)
        response.json.return_value = result
        post = MagicMock(return_value=response)
        module = SimpleNamespace(post=post, RequestException=ConnectionError)
        with patch.dict("sys.modules", {"requests": module}), patch.dict("os.environ", {"OPENAI_API_KEY": "offline-test"}):
            data = model.interpret(sampling_windows(60)[0], observation(), [], [])
        return data, post, model

    def test_strict_response_contract_and_no_provider_storage(self):
        expected = interpretation()
        data, post, model = self.call_provider({"status": "completed", "usage": {"input_tokens": 9},
            "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(expected)}]}]})
        self.assertEqual(data, expected)
        body = post.call_args.kwargs["json"]
        self.assertFalse(body["store"])
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertEqual(model.usage[0]["tokens"]["input_tokens"], 9)

    def test_incomplete_output_never_becomes_success(self):
        from environment_models import ModelError
        with self.assertRaisesRegex(ModelError, "incomplete"):
            self.call_provider({"status": "incomplete", "output": []})

    def test_provider_error_body_is_not_exposed(self):
        from environment_models import ModelError
        with self.assertRaisesRegex(ModelError, r"HTTP 401") as error:
            self.call_provider({"error": "sensitive provider content"}, 401)
        self.assertNotIn("sensitive", str(error.exception))

    def test_exhausted_credits_are_not_retried(self):
        from environment_models import ModelError
        with patch("time.sleep") as sleep:
            with self.assertRaisesRegex(ModelError, "credit balance exhausted"):
                self.call_provider({"error": {"type": "insufficient_quota", "code": "credit_balance_exhausted"}}, 429)
            sleep.assert_not_called()

    def test_explicit_gemini_interpretation_uses_selected_model(self):
        from environment_models import EnvironmentModels
        from unittest.mock import MagicMock
        model = EnvironmentModels.__new__(EnvironmentModels)
        model.models = {"interpretation_provider": "gemini", "interpretation": "test-gemini"}
        model.gemini = MagicMock(return_value=interpretation())
        result = model.interpret(sampling_windows(60)[0], observation(), [], [])
        self.assertEqual(result, interpretation())
        self.assertEqual(model.gemini.call_args.kwargs["model"], "test-gemini")


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg not installed")
class MediaPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.video = Path(cls.directory.name) / "synthetic.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                        "testsrc=size=160x90:rate=1:duration=65", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-y", str(cls.video)], check=True, capture_output=True, timeout=30)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_full_window_real_frame_extraction_and_audit_downgrade(self):
        self.assertAlmostEqual(probe_duration(self.video), 65, places=1)
        models = FakeModels(issues=True)
        with tempfile.TemporaryDirectory() as directory:
            row, media = analyze_window(self.video, sampling_windows(65)[0], [], models, directory)
            self.assertEqual(len(media), 3)
            self.assertTrue(all(path.stat().st_size > 0 for _, path in media))
            self.assertEqual([e["start"] for e in row["evidence"]], [0, 20, 40])
            self.assertEqual(row["interpretation"]["findings"][0]["state"], "unknown")
            self.assertEqual(row["audit"]["original_interpretation"]["findings"][0]["state"], "supported")

    def test_partial_final_window_clip_bounds_and_absolute_timestamps(self):
        models = FakeModels(require_clip=True)
        budget = {"remaining": 1}
        with tempfile.TemporaryDirectory() as directory:
            row, media = analyze_window(self.video, sampling_windows(65)[1], [], models, directory, clip_budget=budget)
            self.assertEqual(row["start_time"], 60)
            self.assertEqual(row["end_time"], 65)
            clip = next(e for e, _ in media if e["kind"] == "video")
            self.assertEqual((clip["start"], clip["end"]), (60, 65))
            self.assertEqual(budget["remaining"], 0)
            self.assertTrue(models.saw_clip)

    def test_no_clip_after_budget_exhausted(self):
        with tempfile.TemporaryDirectory() as directory, patch("environment_worker.extract_clip") as extract:
            row, media = analyze_window(self.video, sampling_windows(65)[0], [], FakeModels(require_clip=True),
                                        directory, clip_budget={"remaining": 0})
            extract.assert_not_called()
            self.assertEqual(len(media), 3)
            self.assertTrue(row["observation"]["limitations"])


if __name__ == "__main__":
    unittest.main()
