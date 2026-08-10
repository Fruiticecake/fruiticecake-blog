import datetime
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource_models import RepositoryCandidate
from opensource_ranker import infer_category, select_candidates


NOW = datetime.datetime(2026, 8, 9, 12, 0, 0)


def candidate(
    full_name="org/project",
    *,
    topics=None,
    stars=100,
    trending_rank=10,
    pushed_days_ago=1,
    category="ai",
    forks=10,
    archived=False,
    description=None,
    language="Python",
    stars_today=None,
):
    default_topics = {
        "ai": ["ai"],
        "devtools": ["developer-tools"],
        "platform": ["cloud-native"],
        "other": ["hardware"],
    }
    result = RepositoryCandidate(
        full_name=full_name,
        html_url=f"https://github.com/{full_name}",
        description=description or "A useful project.",
        language=language,
        license_name="MIT",
        stars=stars,
        forks=forks,
        topics=default_topics[category] if topics is None else topics,
        created_at=NOW - datetime.timedelta(days=60),
        pushed_at=NOW - datetime.timedelta(days=pushed_days_ago),
        trending_rank=trending_rank,
        stars_today=stars_today,
        category=category,
    )
    result.archived = archived
    return result


def make_category_fixture():
    categories = ["ai"] * 7 + ["devtools"] * 5 + ["platform"] * 5 + ["other"] * 4
    return [
        candidate(
            f"org/{category}-{index}",
            category=category,
            trending_rank=index + 1,
        )
        for index, category in enumerate(categories)
    ]


class SelectCandidatesTests(unittest.TestCase):
    def test_seen_repository_is_excluded_unless_daily_growth_is_exceptional(self):
        ordinary = candidate("org/ordinary-repeat", stars_today=999)
        exceptional = candidate("org/exceptional-repeat", stars_today=1000)

        selected = select_candidates(
            [ordinary, exceptional],
            {"org/ordinary-repeat", "org/exceptional-repeat"},
            limit=2,
        )

        self.assertEqual([item.full_name for item in selected], ["org/exceptional-repeat"])
        self.assertIn("1000", selected[0].repeat_reason)

    def test_category_is_inferred_from_normalized_topics_description_and_language(self):
        cases = (
            (candidate(topics=["Large_Language_Model"]), "ai"),
            (candidate(topics=[], description="A command-line linter for CI", category="other"), "devtools"),
            (candidate(topics=[], description="Kubernetes ingress controller", category="other"), "platform"),
            (candidate(topics=[], description="A PCB design suite", language="C++", category="other"), "other"),
        )

        self.assertEqual([infer_category(item) for item, _ in cases], [want for _, want in cases])

    def test_category_inference_uses_language_when_other_metadata_is_empty(self):
        self.assertEqual(
            infer_category(candidate(topics=[], description="", language="Shell", category="other")),
            "devtools",
        )
        self.assertEqual(
            infer_category(candidate(topics=[], description="", language="HCL", category="other")),
            "platform",
        )

    def test_recent_ai_project_outranks_stale_duplicate(self):
        fresh = candidate("org/fresh-agent", topics=["ai", "agent"], stars=900, trending_rank=2)
        stale = candidate("org/old", stars=50000, trending_rank=None, pushed_days_ago=120)

        ranked = select_candidates([stale, fresh], {"org/old"}, limit=2)

        self.assertEqual(ranked[0].full_name, "org/fresh-agent")

    def test_selection_deduplicates_and_limits_single_category(self):
        duplicate = candidate("ORG/AI-0", category="ai", trending_rank=1)

        selected = select_candidates(make_category_fixture() + [duplicate], set(), limit=12)

        self.assertEqual(len({item.full_name.lower() for item in selected}), len(selected))
        self.assertLessEqual(sum(item.category == "ai" for item in selected), 5)
        self.assertLessEqual(sum(item.category == "devtools" for item in selected), 4)
        self.assertLessEqual(sum(item.category == "platform" for item in selected), 4)
        self.assertLessEqual(sum(item.category == "other" for item in selected), 3)

    def test_rejects_forks_and_archived_repositories(self):
        healthy = candidate("org/healthy", trending_rank=3)
        fork = candidate("org/fork", trending_rank=1)
        fork.is_fork = True
        archived = candidate("org/archived", trending_rank=2, archived=True)

        selected = select_candidates([fork, archived, healthy], set(), limit=3)

        self.assertEqual([item.full_name for item in selected], ["org/healthy"])

    def test_default_limit_returns_twenty_with_proportional_category_targets(self):
        candidates = [
            candidate(f"org/{category}-{index}", category=category, trending_rank=index + 1)
            for category, count in (("ai", 7), ("devtools", 5), ("platform", 5), ("other", 3))
            for index in range(count)
        ]

        selected = select_candidates(candidates, set())

        self.assertEqual(len(selected), 20)
        self.assertEqual(
            {category: sum(item.category == category for item in selected) for category in ("ai", "devtools", "platform", "other")},
            {"ai": 7, "devtools": 5, "platform": 5, "other": 3},
        )

    def test_category_shortfall_backfills_only_to_the_safe_minimum(self):
        candidates = [
            candidate(f"org/ai-{index}", category="ai", trending_rank=index + 1)
            for index in range(20)
        ]

        selected = select_candidates(candidates, set())

        self.assertEqual(len(selected), 8)
        self.assertEqual({item.category for item in selected}, {"ai"})

    def test_same_input_has_the_same_order_on_repeated_calls(self):
        candidates = [
            candidate("org/stale", trending_rank=None, pushed_days_ago=20),
            candidate("org/fresh", trending_rank=None, pushed_days_ago=1),
        ]

        first = [item.full_name for item in select_candidates(candidates, set())]
        second = [item.full_name for item in select_candidates(candidates, set())]

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
