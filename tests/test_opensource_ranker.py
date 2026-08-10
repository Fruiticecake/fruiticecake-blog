import datetime
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource_models import RepositoryCandidate
from opensource_ranker import select_candidates


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
):
    result = RepositoryCandidate(
        full_name=full_name,
        html_url=f"https://github.com/{full_name}",
        description="A useful project.",
        language="Python",
        license_name="MIT",
        stars=stars,
        forks=forks,
        topics=topics or [],
        created_at=NOW - datetime.timedelta(days=60),
        pushed_at=NOW - datetime.timedelta(days=pushed_days_ago),
        trending_rank=trending_rank,
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


if __name__ == "__main__":
    unittest.main()
