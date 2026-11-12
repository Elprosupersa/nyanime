"""
Opaque-box test suite for the Manga & Manhwa autonomous acquisition pipeline queue.
Validates 'manhwa_top50_queue.json' according to ORIGINAL_REQUEST.md (R1), PROJECT.md,
and TEST_INFRA.md specifications.
"""

import os
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Tuple, Set
import pytest

# Constants and specification constraints
REQUIRED_ROOT_KEYS = {
    "catalog_version",
    "total_series",
    "language_priority",
    "download_root",
    "series",
}

EXPECTED_TOTAL_SERIES = 53
EXPECTED_ACTION_FANTASY_COUNT = 35
EXPECTED_ADULT_ROMANCE_COUNT = 15
EXPECTED_KEY_MANGA_COUNT = 3

VALID_CONTENT_RATINGS = {"safe", "suggestive", "erotica", "pornographic"}
VALID_SERIES_TYPES = {"manhwa", "manga"}
VALID_CATEGORIES = {"action_fantasy_shonen", "adult_romance_drama", "key_manga"}
REQUIRED_SPANISH_CODES = {"es-la", "es"}

MANDATORY_SERIES_FIELDS = {
    "id",
    "title_display",
    "type",
    "category",
    "content_rating",
    "search_query",
    "target_languages",
}

KEY_MANGA_SLUGS = {
    "chainsaw-man",
    "sousou-no-frieren",
    "dandadan",
}

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

BLACKLISTED_FABRICATED_UUIDS: Set[str] = {
    "16da7d56-14e3-4696-9818-472efab53e8e",
    "0d8a59be-c956-4c4c-83b6-96a605809707",
    "0d8ef313-a442-4217-a006-258129e92d84",
    "50ae6f1c-7f52-47ef-8b70-1f9dbbb64ff8",
    "40d6d538-349f-4315-ad24-b153ff2fa68c",
    "4ebbe31d-0f5a-4aa4-8fbb-256ea880a184",
    "5b5978a9-4674-4b5d-bb80-87a32e29fc60",
    "75d0fef3-f112-4e89-a2e6-a0e28f3ea7b3",
    "898516ba-4a21-4f81-a7b2-6db6d734cf78",
    "6e262de6-cf4c-47ea-a844-aa0da736c07a",
    "b6f8bc8f-8fc6-4d1e-bb97-a5113aa1e946",
    "8c772cb6-5c5a-4b71-b6a4-44b2c140409a",
    "0d3c0fb8-1933-4f9e-9533-5c8e3100ba0d",
    "0a178ba7-c75c-4235-98a7-7d4e5f2cfc93",
    "313936a7-0624-4f2d-8622-c36199f36f32",
    "6f8be91a-c7a7-47b8-b11c-d784a9611f7c",
}

ALLOWED_UNHOSTED_DMCA_SLUGS: Set[str] = {
    "god-of-high-school",
    "sweet-home",
    "landlord-girls",
    "my-stepmom",
}

VERIFIED_REMEDIATED_CANONICAL_UUIDS: Dict[str, str] = {
    "sss-class-suicide-hunter": "4a973243-952e-44d7-a50f-883b4b7c9cc2",
    "leveling-with-the-gods": "4a43c227-b201-4fb7-b796-924c51797d50",
    "overgeared": "3fc308c9-4b00-4dc3-943e-1f39242bc708",
    "pick-me-up-infinite-gacha": "58167656-a065-4b49-b499-bd73d00555d5",
    "damn-reincarnation": "6e769716-df1e-4d66-89cc-32f3b46e17dc",
    "bastard": "bb169078-7289-4f95-948f-9315960e6905",
    "hero-killer": "163306e6-1700-42a4-882f-26db124cbec2",
    "player-who-cant-level-up": "a796fb50-cdc9-4c15-a48d-bc1d733d89b2",
    "silent-war": "1c5f98e8-9516-468f-8b64-2bac7e257709",
    "a-perverts-daily-life": "650dbb60-013a-4b77-b0d8-a546ecdce20d",
    "s-flower": "e388cfa2-1481-4592-8e38-d6eef93d0e05",
    "what-does-the-fox-say": "658662c8-bee6-442c-91c4-cb94681810b5",
}


def get_queue_path() -> Path:
    """Locates manhwa_top50_queue.json from workspace root or environment override."""
    env_p = os.environ.get("MANHWA_QUEUE_PATH")
    if env_p and Path(env_p).exists():
        return Path(env_p)

    project_root = Path(__file__).resolve().parent.parent
    root_candidate = project_root / "manhwa_top50_queue.json"
    if root_candidate.exists():
        return root_candidate

    cwd_candidate = Path("manhwa_top50_queue.json")
    if cwd_candidate.exists():
        return cwd_candidate

    return root_candidate


def validate_catalog_schema(data: Any) -> Tuple[bool, List[str]]:
    """
    Validates a catalog data dictionary against the strict specification schema.
    Returns (is_valid, list_of_errors).
    """
    errors: List[str] = []

    if not isinstance(data, dict):
        return False, ["Root structure must be a JSON object"]

    # Check root keys
    missing_root = REQUIRED_ROOT_KEYS - set(data.keys())
    if missing_root:
        errors.append(f"Missing required root keys: {sorted(missing_root)}")

    series_list = data.get("series")
    if not isinstance(series_list, list):
        errors.append("'series' must be a list of series objects")
        return False, errors

    # Total series count check
    total_series = data.get("total_series")
    if total_series != EXPECTED_TOTAL_SERIES:
        errors.append(f"Expected total_series={EXPECTED_TOTAL_SERIES}, got {total_series}")

    if len(series_list) != EXPECTED_TOTAL_SERIES:
        errors.append(f"Expected exactly {EXPECTED_TOTAL_SERIES} series in list, got {len(series_list)}")

    # Language priority check
    lang_prio = data.get("language_priority")
    if not isinstance(lang_prio, list) or not REQUIRED_SPANISH_CODES.issubset(set(lang_prio)):
        errors.append(f"Root 'language_priority' must contain {sorted(REQUIRED_SPANISH_CODES)}")

    # Breakdown counters
    action_count = 0
    adult_count = 0
    manga_count = 0

    seen_ids: Set[str] = set()
    seen_ranks: Set[int] = set()
    seen_mangadex_ids: Set[str] = set()

    for idx, s in enumerate(series_list):
        if not isinstance(s, dict):
            errors.append(f"Series index {idx} is not an object")
            continue

        s_id = s.get("id")
        # Field completeness
        missing_fields = MANDATORY_SERIES_FIELDS - set(s.keys())
        if missing_fields:
            errors.append(f"Series '{s_id or idx}' missing fields: {sorted(missing_fields)}")

        # ID validation
        if not s_id or not isinstance(s_id, str) or not re.match(r"^[a-z0-9_-]+$", s_id):
            errors.append(f"Series index {idx} has invalid slug id: {s_id!r}")
        elif s_id in seen_ids:
            errors.append(f"Duplicate slug ID detected: '{s_id}'")
        else:
            seen_ids.add(s_id)

        # Critical empty or null checks
        for crit in ["title_display", "search_query"]:
            val = s.get(crit)
            if val is None or not isinstance(val, str) or not val.strip():
                errors.append(f"Series '{s_id}' has empty or null '{crit}'")

        # Type check
        s_type = s.get("type")
        if s_type not in VALID_SERIES_TYPES:
            errors.append(f"Series '{s_id}' has invalid type '{s_type}'. Allowed: {sorted(VALID_SERIES_TYPES)}")

        # Category check
        s_cat = s.get("category")
        if s_cat not in VALID_CATEGORIES:
            errors.append(f"Series '{s_id}' has invalid category '{s_cat}'. Allowed: {sorted(VALID_CATEGORIES)}")
        else:
            if s_cat == "action_fantasy_shonen":
                action_count += 1
            elif s_cat == "adult_romance_drama":
                adult_count += 1
            elif s_cat == "key_manga":
                manga_count += 1

        # Content rating check
        rating = s.get("content_rating")
        if rating not in VALID_CONTENT_RATINGS:
            errors.append(f"Series '{s_id}' has invalid content_rating '{rating}'. Allowed: {sorted(VALID_CONTENT_RATINGS)}")

        # Target languages check
        langs = s.get("target_languages")
        if not isinstance(langs, list) or not REQUIRED_SPANISH_CODES.issubset(set(langs)):
            errors.append(f"Series '{s_id}' target_languages must contain {sorted(REQUIRED_SPANISH_CODES)}")

        # Priority rank check
        rank = s.get("priority_rank")
        if rank is not None:
            if not isinstance(rank, int) or rank <= 0:
                errors.append(f"Series '{s_id}' priority_rank must be positive integer, got {rank!r}")
            elif rank in seen_ranks:
                errors.append(f"Duplicate priority_rank detected: {rank} on series '{s_id}'")
            else:
                seen_ranks.add(rank)

        # MangaDex ID validation
        mid = s.get("mangadex_id")
        if mid is not None:
            if not isinstance(mid, str) or not UUID_REGEX.match(mid):
                errors.append(f"Series '{s_id}' has invalid mangadex_id format: {mid!r}")
            elif mid in BLACKLISTED_FABRICATED_UUIDS:
                errors.append(f"Series '{s_id}' has blacklisted fabricated UUID: {mid}")
            elif mid in seen_mangadex_ids:
                errors.append(f"Duplicate mangadex_id detected: {mid} on series '{s_id}'")
            else:
                seen_mangadex_ids.add(mid)
        else:
            if s_id not in ALLOWED_UNHOSTED_DMCA_SLUGS:
                errors.append(f"Series '{s_id}' has null mangadex_id but is not in allowed DMCA/unhosted list")

    # Category breakdown verification
    if action_count != EXPECTED_ACTION_FANTASY_COUNT:
        errors.append(f"Expected {EXPECTED_ACTION_FANTASY_COUNT} action/fantasy series, found {action_count}")
    if adult_count != EXPECTED_ADULT_ROMANCE_COUNT:
        errors.append(f"Expected {EXPECTED_ADULT_ROMANCE_COUNT} adult/romance series, found {adult_count}")
    if manga_count != EXPECTED_KEY_MANGA_COUNT:
        errors.append(f"Expected {EXPECTED_KEY_MANGA_COUNT} key manga series, found {manga_count}")

    return len(errors) == 0, errors


# ==============================================================================
# Pytest Fixtures
# ==============================================================================

@pytest.fixture(scope="session")
def queue_file_path() -> Path:
    return get_queue_path()


@pytest.fixture(scope="session")
def queue_payload(queue_file_path: Path) -> Dict[str, Any]:
    if not queue_file_path.exists():
        pytest.skip(f"Queue file '{queue_file_path}' does not exist yet (M1 implementation pending).")
    try:
        with open(queue_file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        pytest.fail(f"Failed to read or parse '{queue_file_path}' as valid JSON: {e}")


@pytest.fixture(scope="session")
def series_list(queue_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    series = queue_payload.get("series", [])
    assert isinstance(series, list), "'series' key in catalog must be a list"
    return series


# ==============================================================================
# Tier 1: Feature Coverage (Happy Path & Schema Validation)
# ==============================================================================

class TestCatalogTier1FeatureCoverage:
    """Tier 1: Feature coverage for catalog structure, keys, counts, and ratings."""

    def test_json_structure_and_root_keys(self, queue_payload: Dict[str, Any]):
        """Verifies root keys exist and have appropriate data types."""
        missing = REQUIRED_ROOT_KEYS - set(queue_payload.keys())
        assert not missing, f"Missing required root keys: {missing}"

        assert isinstance(queue_payload["catalog_version"], str)
        assert isinstance(queue_payload["total_series"], int)
        assert isinstance(queue_payload["language_priority"], list)
        assert isinstance(queue_payload["download_root"], str)
        assert isinstance(queue_payload["series"], list)

    def test_total_series_count_and_cohort_breakdown(self, queue_payload: Dict[str, Any], series_list: List[Dict[str, Any]]):
        """Verifies total count equals 53 (35 action/fantasy, 15 adult/romance, 3 key manga)."""
        assert queue_payload["total_series"] == EXPECTED_TOTAL_SERIES
        assert len(series_list) == EXPECTED_TOTAL_SERIES

        action_count = sum(1 for s in series_list if s.get("category") == "action_fantasy_shonen")
        adult_count = sum(1 for s in series_list if s.get("category") == "adult_romance_drama")
        manga_count = sum(1 for s in series_list if s.get("category") == "key_manga")

        assert action_count == EXPECTED_ACTION_FANTASY_COUNT, (
            f"Expected {EXPECTED_ACTION_FANTASY_COUNT} action/fantasy series, found {action_count}"
        )
        assert adult_count == EXPECTED_ADULT_ROMANCE_COUNT, (
            f"Expected {EXPECTED_ADULT_ROMANCE_COUNT} adult/romance series, found {adult_count}"
        )
        assert manga_count == EXPECTED_KEY_MANGA_COUNT, (
            f"Expected {EXPECTED_KEY_MANGA_COUNT} key manga series, found {manga_count}"
        )

    def test_each_series_mandatory_fields_present(self, series_list: List[Dict[str, Any]]):
        """Verifies each series has all mandatory fields specified in the interface contract."""
        for s in series_list:
            s_id = s.get("id", "UNKNOWN")
            missing = MANDATORY_SERIES_FIELDS - set(s.keys())
            assert not missing, f"Series '{s_id}' missing mandatory fields: {missing}"

    def test_content_ratings_are_valid(self, series_list: List[Dict[str, Any]]):
        """Verifies content ratings conform strictly to MangaDex rating tiers."""
        for s in series_list:
            rating = s.get("content_rating")
            assert rating in VALID_CONTENT_RATINGS, (
                f"Series '{s.get('id')}' has invalid rating '{rating}'. Allowed: {VALID_CONTENT_RATINGS}"
            )

    def test_target_languages_contain_dual_spanish_codes(self, queue_payload: Dict[str, Any], series_list: List[Dict[str, Any]]):
        """Verifies target languages in root and per series contain both 'es-la' and 'es'."""
        root_langs = set(queue_payload.get("language_priority", []))
        assert REQUIRED_SPANISH_CODES.issubset(root_langs), (
            f"Root language_priority missing codes: {REQUIRED_SPANISH_CODES - root_langs}"
        )

        for s in series_list:
            s_langs = set(s.get("target_languages", []))
            assert REQUIRED_SPANISH_CODES.issubset(s_langs), (
                f"Series '{s.get('id')}' target_languages missing codes: {REQUIRED_SPANISH_CODES - s_langs}"
            )

    def test_download_root_is_configured_correctly(self, queue_payload: Dict[str, Any]):
        """Verifies download_root points to designated storage destination."""
        download_root = queue_payload.get("download_root", "")
        assert download_root, "download_root must not be empty"
        assert "manga" in download_root.lower() or "e:" in download_root.lower(), (
            f"download_root '{download_root}' should point to Manga folder"
        )


# ==============================================================================
# Tier 2: Boundary & Corner Cases (Adversarial, Integrity, and Key Mangas)
# ==============================================================================

class TestCatalogTier2BoundaryAndCornerCases:
    """Tier 2: Boundary conditions, uniqueness checks, and adversarial validation."""

    def test_slug_ids_uniqueness_and_format(self, series_list: List[Dict[str, Any]]):
        """Verifies all slug IDs are unique and follow alphanumeric-hyphen-underscore format."""
        slug_ids = [s["id"] for s in series_list]
        assert len(slug_ids) == len(set(slug_ids)), f"Duplicate slug IDs found: {[x for x in slug_ids if slug_ids.count(x) > 1]}"

        for s_id in slug_ids:
            assert re.match(r"^[a-z0-9_-]+$", s_id), f"Slug ID '{s_id}' does not match regex ^[a-z0-9_-]+$"

    def test_priority_ranks_are_positive_integers_and_unique(self, series_list: List[Dict[str, Any]]):
        """Verifies priority_rank values are strictly positive and unique across all 53 titles."""
        ranks = []
        for s in series_list:
            rank = s.get("priority_rank")
            assert rank is not None, f"Series '{s.get('id')}' is missing 'priority_rank'"
            assert isinstance(rank, int) and rank > 0, f"Series '{s.get('id')}' rank {rank} is not a positive int"
            ranks.append(rank)

        duplicates = [r for r in ranks if ranks.count(r) > 1]
        assert not duplicates, f"Duplicate priority ranks found: {set(duplicates)}"
        assert len(ranks) == EXPECTED_TOTAL_SERIES

    def test_no_empty_strings_or_nulls_in_critical_fields(self, series_list: List[Dict[str, Any]]):
        """Verifies critical query fields are not null, None, or empty whitespace strings."""
        for s in series_list:
            s_id = s.get("id")
            for crit in ["id", "title_display", "search_query", "category", "content_rating", "type"]:
                val = s.get(crit)
                assert val is not None, f"Series '{s_id}' critical field '{crit}' is None"
                assert isinstance(val, str), f"Series '{s_id}' critical field '{crit}' is not str"
                assert val.strip(), f"Series '{s_id}' critical field '{crit}' is empty whitespace"

    def test_key_mangas_present_and_flagged_as_manga(self, series_list: List[Dict[str, Any]]):
        """Verifies Chainsaw Man, Sousou no Frieren, and Dandadan are present and marked as type='manga'."""
        series_by_id = {s["id"]: s for s in series_list}

        for key_slug in KEY_MANGA_SLUGS:
            assert key_slug in series_by_id, f"Mandatory key manga '{key_slug}' missing from catalog"
            manga_item = series_by_id[key_slug]
            assert manga_item["type"] == "manga", (
                f"Key manga '{key_slug}' type must be 'manga', got '{manga_item['type']}'"
            )
            assert manga_item["category"] == "key_manga", (
                f"Key manga '{key_slug}' category must be 'key_manga', got '{manga_item['category']}'"
            )
            # Manga hierarchy should support volume grouping
            hierarchy = manga_item.get("expected_hierarchy", {})
            if hierarchy:
                assert hierarchy.get("volume_grouping") is True, (
                    f"Key manga '{key_slug}' should specify volume_grouping=True"
                )

    def test_overall_catalog_passes_schema_validator(self, queue_payload: Dict[str, Any]):
        """Validates the live catalog file against the reference validation function."""
        is_valid, errors = validate_catalog_schema(queue_payload)
        assert is_valid, f"Catalog failed schema validation with errors: {errors}"

    # --- Adversarial Schema Validator Verification Tests ---

    def test_validator_rejects_missing_root_key(self, queue_payload: Dict[str, Any]):
        """Adversarial: Mutated payload missing 'catalog_version' is rejected."""
        mutated = dict(queue_payload)
        mutated.pop("catalog_version", None)
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("catalog_version" in e for e in errors)

    def test_validator_rejects_duplicate_slug_ids(self, queue_payload: Dict[str, Any]):
        """Adversarial: Mutated payload containing duplicate slug ID is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        if len(mutated["series"]) >= 2:
            mutated["series"][1]["id"] = mutated["series"][0]["id"]
            is_valid, errors = validate_catalog_schema(mutated)
            assert not is_valid
            assert any("Duplicate slug ID" in e for e in errors)

    def test_validator_rejects_empty_search_query(self, queue_payload: Dict[str, Any]):
        """Adversarial: Mutated payload containing empty search_query is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        mutated["series"][0]["search_query"] = "   "
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("empty or null 'search_query'" in e for e in errors)

    def test_validator_rejects_invalid_content_rating(self, queue_payload: Dict[str, Any]):
        """Adversarial: Mutated payload with invalid content rating is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        mutated["series"][0]["content_rating"] = "unrated_custom"
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("invalid content_rating" in e for e in errors)

    def test_validator_rejects_missing_spanish_codes(self, queue_payload: Dict[str, Any]):
        """Adversarial: Series with only English target language is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        mutated["series"][0]["target_languages"] = ["en"]
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("target_languages must contain" in e for e in errors)

    def test_validator_rejects_duplicate_or_negative_rank(self, queue_payload: Dict[str, Any]):
        """Adversarial: Negative priority rank is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        mutated["series"][0]["priority_rank"] = -1
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("priority_rank must be positive integer" in e for e in errors)

    def test_validator_rejects_incorrect_cohort_counts(self, queue_payload: Dict[str, Any]):
        """Adversarial: Altered category count is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        # Change an action series to key_manga
        mutated["series"][0]["category"] = "key_manga"
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("action/fantasy series" in e for e in errors)


# ==============================================================================
# Tier 3: MangaDex ID Integrity & Contract Authenticity
# ==============================================================================

class TestCatalogTier3MangaDexIntegrity:
    """Tier 3: Rejects synthetic/fabricated UUIDs and ensures strict contract compliance."""

    def test_no_synthetic_or_blacklisted_uuids(self, series_list: List[Dict[str, Any]]):
        """Verifies that none of the 53 series contain any blacklisted or fabricated UUIDs."""
        for s in series_list:
            mid = s.get("mangadex_id")
            assert mid not in BLACKLISTED_FABRICATED_UUIDS, (
                f"Series '{s.get('id')}' contains blacklisted synthetic or mismatched UUID: {mid}"
            )

    def test_non_null_mangadex_ids_are_valid_uuids(self, series_list: List[Dict[str, Any]]):
        """Verifies that every non-null mangadex_id is a valid UUIDv4 string."""
        for s in series_list:
            mid = s.get("mangadex_id")
            if mid is not None:
                assert isinstance(mid, str), f"Series '{s.get('id')}' mangadex_id must be str or None, got {type(mid)}"
                assert UUID_REGEX.match(mid), f"Series '{s.get('id')}' mangadex_id '{mid}' is not a valid UUID"

    def test_null_mangadex_ids_strictly_restricted_to_unhosted_dmca(self, series_list: List[Dict[str, Any]]):
        """Verifies that mangadex_id=None is strictly restricted to designated unhosted/DMCA titles."""
        actual_null_slugs = {s["id"] for s in series_list if s.get("mangadex_id") is None}
        assert actual_null_slugs == ALLOWED_UNHOSTED_DMCA_SLUGS, (
            f"Null mangadex_id titles mismatch. Expected: {sorted(ALLOWED_UNHOSTED_DMCA_SLUGS)}, got: {sorted(actual_null_slugs)}"
        )

    def test_canonical_remediated_series_uuids_match_verified_registry(self, series_list: List[Dict[str, Any]]):
        """Verifies that all 12 remediated titles with known MangaDex entities match canonical UUIDs."""
        series_by_id = {s["id"]: s for s in series_list}
        for slug, expected_uuid in VERIFIED_REMEDIATED_CANONICAL_UUIDS.items():
            assert slug in series_by_id, f"Remediated series '{slug}' missing from catalog"
            actual_uuid = series_by_id[slug].get("mangadex_id")
            assert actual_uuid == expected_uuid, (
                f"Series '{slug}' expected canonical UUID '{expected_uuid}', but found '{actual_uuid}'"
            )

    def test_mangadex_ids_are_globally_unique(self, series_list: List[Dict[str, Any]]):
        """Verifies that all non-null mangadex_id values are unique with zero collisions."""
        mids = [s["mangadex_id"] for s in series_list if s.get("mangadex_id") is not None]
        assert len(mids) == len(set(mids)), (
            f"Duplicate mangadex_id values detected: {[m for m in mids if mids.count(m) > 1]}"
        )
        assert len(mids) == EXPECTED_TOTAL_SERIES - len(ALLOWED_UNHOSTED_DMCA_SLUGS)

    # --- Adversarial Tests for MangaDex ID Integrity ---

    def test_validator_rejects_blacklisted_uuid(self, queue_payload: Dict[str, Any]):
        """Adversarial: Mutated payload with a blacklisted fake UUID is rejected by schema validator."""
        mutated = json.loads(json.dumps(queue_payload))
        fake_uuid = next(iter(BLACKLISTED_FABRICATED_UUIDS))
        mutated["series"][0]["mangadex_id"] = fake_uuid
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("blacklisted fabricated UUID" in e for e in errors)

    def test_validator_rejects_malformed_uuid(self, queue_payload: Dict[str, Any]):
        """Adversarial: Mutated payload with an invalid UUID format string is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        mutated["series"][0]["mangadex_id"] = "not-a-valid-uuid-string"
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("invalid mangadex_id format" in e for e in errors)

    def test_validator_rejects_unauthorized_null_uuid(self, queue_payload: Dict[str, Any]):
        """Adversarial: Mutated payload setting mangadex_id=None on non-DMCA title is rejected."""
        mutated = json.loads(json.dumps(queue_payload))
        target = next(s for s in mutated["series"] if s["id"] not in ALLOWED_UNHOSTED_DMCA_SLUGS)
        target["mangadex_id"] = None
        is_valid, errors = validate_catalog_schema(mutated)
        assert not is_valid
        assert any("null mangadex_id but is not in allowed DMCA/unhosted list" in e for e in errors)

