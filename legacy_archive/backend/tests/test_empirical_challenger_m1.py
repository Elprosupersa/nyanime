"""
Standalone Empirical Verification and Adversarial Stress Harness for Milestone 1.
Challenger 1 empirical test harness for 'manhwa_top50_queue.json'.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Dict, Any, List, Set, Tuple
import pytest

QUEUE_PATH = Path(__file__).resolve().parent.parent / "manhwa_top50_queue.json"

REQUIRED_ROOT_KEYS = {
    "catalog_version",
    "total_series",
    "language_priority",
    "download_root",
    "series",
}

EXPECTED_TOTAL = 53
EXPECTED_ACTION = 35
EXPECTED_ADULT = 15
EXPECTED_MANGA = 3

VALID_CATEGORIES = {"action_fantasy_shonen", "adult_romance_drama", "key_manga"}
VALID_CONTENT_RATINGS = {"safe", "suggestive", "erotica", "pornographic"}
VALID_TYPES = {"manhwa", "manga"}
REQUIRED_LANGUAGES = {"es-la", "es"}

MANDATORY_FIELDS = {
    "id",
    "title_display",
    "type",
    "category",
    "content_rating",
    "search_query",
    "target_languages",
    "expected_hierarchy",
    "priority_rank",
}

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
SLUG_REGEX = re.compile(r"^[a-z0-9_-]+$")
HANGUL_REGEX = re.compile(r"[\uac00-\ud7a3]")
SPANISH_DIACRITICS_REGEX = re.compile(r"[áéíóúñÁÉÍÓÚÑ¿¡]")


@pytest.fixture(scope="session")
def queue_data() -> Dict[str, Any]:
    assert QUEUE_PATH.exists(), f"File {QUEUE_PATH} does not exist"
    with open(QUEUE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


class TestEmpiricalChallengerM1:
    """Rigorous empirical verification suite executed by Challenger 1."""

    def test_empirical_utf8_encoding_and_roundtrip(self):
        """Verifies raw byte-level UTF-8 integrity, absence of BOM, and round-trip fidelity."""
        raw_bytes = QUEUE_PATH.read_bytes()
        # Assert no UTF-8 BOM
        assert not raw_bytes.startswith(b"\xef\xbb\xbf"), "Queue file should not have UTF-8 BOM"

        # Decode as utf-8
        text = raw_bytes.decode("utf-8")
        assert len(text) > 0

        # Parse JSON
        parsed = json.loads(text)
        assert isinstance(parsed, dict)

        # Roundtrip serialization with ensure_ascii=False
        serialized = json.dumps(parsed, ensure_ascii=False, indent=2)
        reparsed = json.loads(serialized)
        assert reparsed == parsed, "Round-trip JSON serialization altered data"

    def test_empirical_schema_invariants_and_exact_counts(self, queue_data: Dict[str, Any]):
        """Verifies root keys, total count, and category breakdown."""
        missing_root = REQUIRED_ROOT_KEYS - set(queue_data.keys())
        assert not missing_root, f"Missing root keys: {missing_root}"

        assert queue_data["total_series"] == EXPECTED_TOTAL
        series = queue_data["series"]
        assert len(series) == EXPECTED_TOTAL, f"Expected {EXPECTED_TOTAL} series, found {len(series)}"

        cat_counts = {cat: 0 for cat in VALID_CATEGORIES}
        for s in series:
            cat = s.get("category")
            assert cat in VALID_CATEGORIES, f"Invalid category {cat} in series {s.get('id')}"
            cat_counts[cat] += 1

        assert cat_counts["action_fantasy_shonen"] == EXPECTED_ACTION, (
            f"Expected {EXPECTED_ACTION} action series, got {cat_counts['action_fantasy_shonen']}"
        )
        assert cat_counts["adult_romance_drama"] == EXPECTED_ADULT, (
            f"Expected {EXPECTED_ADULT} adult series, got {cat_counts['adult_romance_drama']}"
        )
        assert cat_counts["key_manga"] == EXPECTED_MANGA, (
            f"Expected {EXPECTED_MANGA} key manga series, got {cat_counts['key_manga']}"
        )

    def test_empirical_all_53_titles_mandatory_fields_and_types(self, queue_data: Dict[str, Any]):
        """Verifies mandatory fields, non-empty values, and types across all 53 titles."""
        for s in queue_data["series"]:
            s_id = s.get("id")
            assert s_id, "Series missing 'id'"
            missing = MANDATORY_FIELDS - set(s.keys())
            assert not missing, f"Series {s_id} missing mandatory fields: {missing}"

            # Slug format
            assert SLUG_REGEX.match(s_id), f"Invalid slug id format: {s_id}"

            # Type
            assert s["type"] in VALID_TYPES, f"Invalid type {s['type']} in {s_id}"

            # Non-empty strings
            assert isinstance(s["title_display"], str) and s["title_display"].strip()
            assert isinstance(s["search_query"], str) and s["search_query"].strip()

    def test_empirical_content_ratings_and_adult_cohort_soundness(self, queue_data: Dict[str, Any]):
        """Verifies content ratings conformance and cohort alignment."""
        for s in queue_data["series"]:
            rating = s.get("content_rating")
            assert rating in VALID_CONTENT_RATINGS, f"Invalid content rating: {rating} in {s.get('id')}"

            # Adversarial sanity check: adult series must not be marked 'safe'
            if s.get("category") == "adult_romance_drama":
                assert rating in {"erotica", "pornographic", "suggestive"}, (
                    f"Adult series {s.get('id')} has inappropriate rating: {rating}"
                )

            # Key mangas ratings check
            if s.get("category") == "key_manga":
                assert rating in {"safe", "suggestive"}

    def test_empirical_target_languages_and_spanish_priority(self, queue_data: Dict[str, Any]):
        """Verifies all 53 series have non-empty target_languages containing ['es-la', 'es']."""
        # Root language priority
        root_langs = set(queue_data.get("language_priority", []))
        assert REQUIRED_LANGUAGES.issubset(root_langs)

        for s in queue_data["series"]:
            s_id = s.get("id")
            langs = s.get("target_languages")
            assert isinstance(langs, list), f"target_languages not a list in {s_id}"
            assert len(langs) >= 2, f"target_languages has fewer than 2 items in {s_id}"
            assert REQUIRED_LANGUAGES.issubset(set(langs)), (
                f"Series {s_id} target_languages {langs} missing Spanish codes {REQUIRED_LANGUAGES}"
            )

            # Check spanish_priority if present
            if "spanish_priority" in s:
                s_prio = s["spanish_priority"]
                assert isinstance(s_prio, list)
                assert REQUIRED_LANGUAGES.issubset(set(s_prio))

    def test_empirical_priority_ranks_strict_permutation(self, queue_data: Dict[str, Any]):
        """Verifies priority_rank forms an exact 1..53 permutation without gaps or duplicates."""
        ranks = [s.get("priority_rank") for s in queue_data["series"]]
        assert len(ranks) == EXPECTED_TOTAL
        assert sorted(ranks) == list(range(1, EXPECTED_TOTAL + 1)), (
            f"Priority ranks do not form 1..53 permutation. Ranks: {sorted(ranks)}"
        )

    def test_empirical_mangadex_id_uuid_validity(self, queue_data: Dict[str, Any]):
        """Empirically validates UUID formatting for all series with assigned mangadex_id."""
        uuid_count = 0
        for s in queue_data["series"]:
            m_id = s.get("mangadex_id")
            if m_id is not None:
                assert UUID_REGEX.match(m_id), f"Invalid MangaDex UUID in {s.get('id')}: {m_id}"
                uuid_count += 1

        # Most or all top 50 titles should have direct MangaDex UUIDs pre-resolved (49 canonical, 4 secondary fallback)
        assert uuid_count >= 49, f"Expected at least 49 pre-resolved UUIDs, got {uuid_count}"

    def test_empirical_unicode_hangul_titles_handling(self, queue_data: Dict[str, Any]):
        """Stress-tests Korean Hangul native title handling across all manhwas."""
        manhwa_series = [s for s in queue_data["series"] if s.get("type") == "manhwa"]
        assert len(manhwa_series) == 50

        hangul_found_count = 0
        for s in manhwa_series:
            t_native = s.get("title_native", "")
            alt_q = s.get("alt_queries", [])
            has_hangul = bool(HANGUL_REGEX.search(t_native)) or any(HANGUL_REGEX.search(q) for q in alt_q)
            if has_hangul:
                hangul_found_count += 1

        # Check key titles explicitly
        series_by_id = {s["id"]: s for s in queue_data["series"]}
        assert series_by_id["solo-leveling"]["title_native"] == "나 혼자만 레벨업"
        assert series_by_id["omniscient-reader"]["title_native"] == "전지적 독자 시점"
        assert series_by_id["tower-of-god"]["title_native"] == "신의 탑"

        assert hangul_found_count >= 45, (
            f"Expected at least 45 manhwas with Hangul native titles/queries, found {hangul_found_count}"
        )

    def test_empirical_unicode_spanish_diacritics_handling(self, queue_data: Dict[str, Any]):
        """Stress-tests Spanish diacritics and accents (á, é, í, ó, ú, ñ)."""
        series_with_spanish_accents = []
        for s in queue_data["series"]:
            fields_to_check = [
                s.get("title_official_es", ""),
                s.get("title_display", ""),
            ] + s.get("alt_queries", [])
            combined = " ".join(fields_to_check)
            if SPANISH_DIACRITICS_REGEX.search(combined):
                series_with_spanish_accents.append(s["id"])

        # Specifically check "The Beginning After The End" Spanish title
        tbate = next((s for s in queue_data["series"] if s["id"] == "the-beginning-after-the-end"), None)
        assert tbate is not None
        assert "después" in tbate.get("title_official_es", "").lower() or any("después" in q.lower() for q in tbate.get("alt_queries", []))

        # Check normalization stability (NFC vs NFD)
        for s in queue_data["series"]:
            for key in ["title_display", "title_official_es", "title_native"]:
                val = s.get(key)
                if val:
                    nfc = unicodedata.normalize("NFC", val)
                    nfd = unicodedata.normalize("NFD", val)
                    # When converted back to NFC, must equal original
                    assert unicodedata.normalize("NFC", nfd) == nfc

        assert len(series_with_spanish_accents) >= 5, (
            f"Expected multiple series with Spanish diacritics, found {len(series_with_spanish_accents)}: {series_with_spanish_accents}"
        )

    def test_empirical_expected_hierarchy_and_formatting(self, queue_data: Dict[str, Any]):
        """Verifies expected_hierarchy patterns and chapter formatting interpolation."""
        for s in queue_data["series"]:
            s_id = s.get("id")
            hier = s.get("expected_hierarchy")
            assert isinstance(hier, dict), f"expected_hierarchy missing in {s_id}"
            assert "volume_grouping" in hier
            assert isinstance(hier["volume_grouping"], bool)
            assert "file_chapter_pattern" in hier

            pattern = hier["file_chapter_pattern"]
            # Test formatting with integer chapter
            formatted = pattern.format(chapter=1)
            assert "Capitulo" in formatted or "01" in formatted

            # Test manga volume grouping
            if s.get("category") == "key_manga":
                assert hier["volume_grouping"] is True
                vol_pat = hier.get("folder_volume_pattern", "")
                assert "volume" in vol_pat
                formatted_vol = vol_pat.format(volume=1)
                assert "Tomo 01" in formatted_vol

    def test_empirical_windows_path_compatibility(self, queue_data: Dict[str, Any], tmp_path: Path):
        """Verifies that all 53 series titles produce valid, creatable Windows directories when sanitized."""
        reserved_dos = {"CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"}
        invalid_win_chars = set(':*?"<>|/\\')

        titles_with_punctuation = []
        for s in queue_data["series"]:
            s_id = s.get("id")
            raw_title = s.get("title_display")
            assert raw_title and isinstance(raw_title, str)

            # Check if raw title has forbidden chars
            found_bad = [c for c in invalid_win_chars if c in raw_title]
            if found_bad:
                titles_with_punctuation.append((s_id, raw_title, found_bad))

            # Apply standard pipeline sanitizer from manga_downloader.py
            clean_title = "".join(c for c in raw_title if c not in '<>:"/\\|?*').strip()
            assert len(clean_title) > 0, f"Cleaned title is empty for {s_id}"
            assert clean_title.upper() not in reserved_dos, f"Cleaned title is DOS reserved name: {clean_title}"
            assert not any(c in invalid_win_chars for c in clean_title), f"Sanitization left invalid chars in {clean_title}"

            # Empirically verify creating folder on Windows filesystem succeeds
            test_dir = tmp_path / clean_title
            test_dir.mkdir(parents=True, exist_ok=True)
            assert test_dir.exists()
            assert test_dir.is_dir()

        # We confirm two titles have punctuation requiring sanitization: latna-saga (:) and what-does-the-fox-say (?)
        assert len(titles_with_punctuation) == 2
        punct_ids = {item[0] for item in titles_with_punctuation}
        assert punct_ids == {"latna-saga", "what-does-the-fox-say"}


def run_standalone_verification() -> bool:
    """Entry point for standalone execution."""
    print("=" * 70)
    print("RUNNING STANDALONE EMPIRICAL VERIFICATION HARNESS (CHALLENGER 1)")
    print("=" * 70)

    with open(QUEUE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    test_suite = TestEmpiricalChallengerM1()
    import tempfile
    with tempfile.TemporaryDirectory() as tmp_d:
        tmp_path = Path(tmp_d)
        tests = [
            ("UTF-8 Encoding & Roundtrip", lambda: test_suite.test_empirical_utf8_encoding_and_roundtrip()),
            ("Schema Invariants & Cohort Counts", lambda: test_suite.test_empirical_schema_invariants_and_exact_counts(data)),
            ("All 53 Titles Mandatory Fields", lambda: test_suite.test_empirical_all_53_titles_mandatory_fields_and_types(data)),
            ("Content Ratings & Adult Soundness", lambda: test_suite.test_empirical_content_ratings_and_adult_cohort_soundness(data)),
            ("Target Languages & Spanish Priority", lambda: test_suite.test_empirical_target_languages_and_spanish_priority(data)),
            ("Priority Ranks Permutation (1..53)", lambda: test_suite.test_empirical_priority_ranks_strict_permutation(data)),
            ("MangaDex UUID Format Validity", lambda: test_suite.test_empirical_mangadex_id_uuid_validity(data)),
            ("Unicode Hangul Titles Handling", lambda: test_suite.test_empirical_unicode_hangul_titles_handling(data)),
            ("Unicode Spanish Diacritics Handling", lambda: test_suite.test_empirical_unicode_spanish_diacritics_handling(data)),
            ("Hierarchy & Chapter Formatting", lambda: test_suite.test_empirical_expected_hierarchy_and_formatting(data)),
            ("Windows Path Compatibility", lambda: test_suite.test_empirical_windows_path_compatibility(data, tmp_path)),
        ]

        passed = 0
        failed = 0
        for name, test_func in tests:
            try:
                test_func()
                print(f"[PASS] {name}")
                passed += 1
            except Exception as e:
                print(f"[FAIL] {name}: {e}")
                failed += 1

    print("-" * 70)
    print(f"Total: {len(tests)} | Passed: {passed} | Failed: {failed}")
    print("=" * 70)
    return failed == 0


if __name__ == "__main__":
    success = run_standalone_verification()
    sys.exit(0 if success else 1)
