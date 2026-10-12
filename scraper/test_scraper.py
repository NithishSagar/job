"""Offline checks for job_scraper_v2. No network, no Supabase, no credentials.

    cd scraper && python test_scraper.py

Covers the orchestrator against a fake Supabase client, and the cross-board
content-hash / fuzzy dedup layer in isolation.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from typing import Any

from job_scraper_v2 import (
    DUPLICATE_WINDOW_DAYS,
    JobBoardScraper,
    content_hash,
    normalize_title,
)

USER = "11111111-1111-1111-1111-111111111111"

REAL_SOURCES = (
    "Adzuna",
    "Reed",
    "Dev IT Jobs",
    "Artificial Intelligence Jobs UK",
    "Harnham",
    "TechSpark",
    "AI Jobs",
    "HN Hiring",
)


# --------------------------------------------------------- fake supabase client


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    """Enough of the postgrest builder for this module: select/eq/in_/gte/
    range/limit/upsert, resolved in memory on execute()."""

    def __init__(self, table: str, store: FakeSupabase) -> None:
        self.table_name = table
        self.store = store
        self.eqs: dict[str, Any] = {}
        self.ins: dict[str, list[Any]] = {}
        self.gtes: dict[str, Any] = {}
        self.rows_to_write: list[dict[str, Any]] | None = None
        self.span: tuple[int, int] | None = None

    def select(self, _columns: str) -> _Query:
        return self

    def eq(self, key: str, value: Any) -> _Query:
        self.eqs[key] = value
        return self

    def in_(self, key: str, values: list[Any]) -> _Query:
        self.ins[key] = list(values)
        return self

    def gte(self, key: str, value: Any) -> _Query:
        self.gtes[key] = value
        return self

    def limit(self, _n: int) -> _Query:
        return self

    def range(self, start: int, end: int) -> _Query:
        self.span = (start, end)
        return self

    def upsert(self, rows: Any, on_conflict: str | None = None) -> _Query:
        self.rows_to_write = rows if isinstance(rows, list) else [rows]
        self.store.upserts.setdefault(self.table_name, []).extend(self.rows_to_write)
        return self

    def execute(self) -> _Result:
        if self.rows_to_write is not None:
            self.store.rows.setdefault(self.table_name, []).extend(self.rows_to_write)
            return _Result(list(self.rows_to_write))

        out = []
        for row in self.store.rows.get(self.table_name, []):
            if any(row.get(k) != v for k, v in self.eqs.items()):
                continue
            if any(row.get(k) not in vals for k, vals in self.ins.items()):
                continue
            if any(
                not row.get(k) or str(row.get(k)) < str(v) for k, v in self.gtes.items()
            ):
                continue
            out.append(row)
        if self.span:
            out = out[self.span[0] : self.span[1] + 1]
        return _Result(out)


class FakeSupabase:
    def __init__(self, rows: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self.rows = rows or {}
        self.upserts: dict[str, list[dict[str, Any]]] = {}

    def table(self, name: str) -> _Query:
        return _Query(name, self)


# ------------------------------------------------------------------- utilities

PASSED: list[str] = []
FAILED: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSED.append(label)
        print(f"  PASS  {label}")
    else:
        FAILED.append(label)
        print(f"  FAIL  {label}{(' - ' + detail) if detail else ''}")


def ago(days: float) -> str:
    return (datetime.now(UTC) - timedelta(days=days)).isoformat()


def make_job(
    scraper: JobBoardScraper,
    *,
    source: str,
    company: str,
    title: str,
    url: str,
    description: str,
) -> dict[str, Any]:
    job = scraper.build_job(
        source=source,
        company_name=company,
        job_title=title,
        job_url=url,
        description=description,
        location="London, UK",
    )
    assert job is not None
    return job


# ------------------------------------------------------------------- the checks


def test_registry() -> None:
    print("\n[registry]")
    scraper = JobBoardScraper(FakeSupabase(), USER)
    names = [name for name, _ in scraper.scrapers]
    check("25 sources registered", len(scraper.scrapers) == 25, f"got {len(names)}")
    check("no duplicate board names", len(set(names)) == len(names))
    check("Silicon Roundabout registered", "Silicon Roundabout" in names)
    check("Remote Rocketship registered", "Remote Rocketship" in names)
    for name in REAL_SOURCES:
        check(f"real source still registered: {name}", name in names)


def test_build_job_carries_content_hash() -> None:
    print("\n[build_job]")
    scraper = JobBoardScraper(FakeSupabase(), USER)
    job = make_job(
        scraper,
        source="Reed",
        company="Acme AI",
        title="Machine Learning Engineer",
        url="https://reed.co.uk/jobs/1",
        description="Python, PyTorch, visa sponsorship available. London hybrid.",
    )
    check("content_hash present", bool(job.get("content_hash")))
    check("content_hash is sha256 hex", len(job["content_hash"]) == 64)
    check("existing fields untouched (tags)", "Python" in job["tags"])
    check("existing fields untouched (visa)", job["visa_sponsorship"] is True)
    check("existing fields untouched (remote)", job["remote_status"] == "Hybrid")


def test_normalize_and_hash() -> None:
    print("\n[normalize_title / content_hash]")
    check(
        "normalize lowercases, drops punctuation, collapses space",
        normalize_title("  Senior  ML Engineer (Remote!) ") == "senior ml engineer remote",
        normalize_title("  Senior  ML Engineer (Remote!) "),
    )
    check("normalize handles None", normalize_title(None) == "")

    base = content_hash("Acme AI", "Machine Learning Engineer", "Build models." * 40)
    check(
        "same inputs -> same hash",
        base == content_hash("Acme AI", "Machine Learning Engineer", "Build models." * 40),
    )
    check(
        "company casing/padding ignored",
        base == content_hash("  acme ai  ", "Machine Learning Engineer", "Build models." * 40),
    )
    check(
        "title punctuation/casing ignored",
        base == content_hash("Acme AI", "machine-learning engineer!", "Build models." * 40),
    )
    check(
        "different company -> different hash",
        base != content_hash("Globex", "Machine Learning Engineer", "Build models." * 40),
    )
    check(
        "only first 200 chars of description count",
        content_hash("Acme AI", "ML Engineer", "x" * 200 + "AAA")
        == content_hash("Acme AI", "ML Engineer", "x" * 200 + "BBB"),
    )


def test_is_duplicate() -> None:
    print("\n[is_duplicate]")
    scraper = JobBoardScraper(FakeSupabase(), USER)
    now = datetime.now(UTC)
    recent = now - timedelta(days=2)
    stale = now - timedelta(days=DUPLICATE_WINDOW_DAYS + 3)

    job = make_job(
        scraper,
        source="Adzuna",
        company="Acme AI",
        title="Senior Machine Learning Engineer",
        url="https://adzuna.co.uk/jobs/9",
        description="Train and ship recommendation models in PyTorch.",
    )

    # 1. same company + title + description, seen 2 days ago on another board
    hash_hit = {"by_hash": {job["content_hash"]: recent}, "by_company": {}}
    check("exact content hash within 7 days -> duplicate", scraper.is_duplicate(job, hash_hit))

    # 2. same hash but stored 10 days ago -> re-advertised, let it refresh
    hash_stale = {"by_hash": {job["content_hash"]: stale}, "by_company": {}}
    check(
        "exact content hash older than 7 days -> not duplicate",
        not scraper.is_duplicate(job, hash_stale),
    )

    # 3. nothing stored at all
    check(
        "empty cache -> not duplicate",
        not scraper.is_duplicate(job, {"by_hash": {}, "by_company": {}}),
    )

    # 4. fuzzy: hash differs (different description) but same company + title
    fuzzy = {
        "by_hash": {},
        "by_company": {"acme ai": [("senior machine learning engineer", recent)]},
    }
    check("near-identical title at same company -> duplicate", scraper.is_duplicate(job, fuzzy))

    # 5. fuzzy, but the title is a genuinely different role at the same company
    different_role = {
        "by_hash": {},
        "by_company": {"acme ai": [("graduate data analyst", recent)]},
    }
    check(
        "different role at same company -> not duplicate",
        not scraper.is_duplicate(job, different_role),
    )

    # 6. identical title, different company -> a real second vacancy
    other_company = {
        "by_hash": {},
        "by_company": {"globex": [("senior machine learning engineer", recent)]},
    }
    check(
        "same title at a different company -> not duplicate",
        not scraper.is_duplicate(job, other_company),
    )

    # 7. fuzzy matches must also respect the 7-day window
    fuzzy_stale = {
        "by_hash": {},
        "by_company": {"acme ai": [("senior machine learning engineer", stale)]},
    }
    check(
        "fuzzy match older than 7 days -> not duplicate",
        not scraper.is_duplicate(job, fuzzy_stale),
    )


def test_remove_content_duplicates() -> None:
    print("\n[remove_content_duplicates]")
    description = "Train and ship recommendation models in PyTorch. London hybrid."
    stored_hash = content_hash("Acme AI", "Senior Machine Learning Engineer", description)

    store = FakeSupabase(
        {
            "jobs": [
                {
                    "user_id": USER,
                    "company_name": "Acme AI",
                    "job_title": "Senior Machine Learning Engineer",
                    "job_url": "https://reed.co.uk/jobs/1",
                    "content_hash": stored_hash,
                    "date_scraped": ago(2),
                },
                {
                    "user_id": "someone-else",
                    "company_name": "Globex",
                    "job_title": "LLM Engineer",
                    "job_url": "https://reed.co.uk/jobs/2",
                    "content_hash": content_hash("Globex", "LLM Engineer", "other"),
                    "date_scraped": ago(1),
                },
            ]
        }
    )
    scraper = JobBoardScraper(store, USER)

    same_job_other_board = make_job(
        scraper,
        source="Adzuna",
        company="Acme AI",
        title="Senior Machine Learning Engineer",
        url="https://adzuna.co.uk/jobs/9",
        description=description,
    )
    genuinely_new = make_job(
        scraper,
        source="Adzuna",
        company="Initech",
        title="MLOps Engineer",
        url="https://adzuna.co.uk/jobs/10",
        description="Own the Kubeflow pipelines and model registry.",
    )
    duplicate_within_run = make_job(
        scraper,
        source="TechSpark",
        company="Initech",
        title="MLOps Engineer",
        url="https://techjobs.techspark.co/jobs/55",
        description="Own the Kubeflow pipelines and model registry.",
    )

    keep, dropped = scraper.remove_content_duplicates(
        [same_job_other_board, genuinely_new, duplicate_within_run]
    )
    kept_urls = [j["job_url"] for j in keep]

    check("cross-board duplicate dropped", same_job_other_board["job_url"] not in kept_urls)
    check("genuinely new job kept", "https://adzuna.co.uk/jobs/10" in kept_urls)
    check(
        "second copy inside the same run dropped",
        "https://techjobs.techspark.co/jobs/55" not in kept_urls,
    )
    check("dropped count correct", dropped == 2, f"got {dropped}")
    check("kept count correct", len(keep) == 1, f"got {len(keep)}")

    # Another user's identical row must not suppress ours.
    scoped = JobBoardScraper(store, "someone-else")
    keep2, _ = scoped.remove_content_duplicates([genuinely_new])
    check("dedup is scoped per user", len(keep2) == 1)

    # A lookup failure must not lose the batch.
    class Exploding:
        def table(self, _name: str) -> Any:
            raise RuntimeError("postgrest down")

    failing = JobBoardScraper(Exploding(), USER)
    keep3, dropped3 = failing.remove_content_duplicates([same_job_other_board])
    check("lookup failure fails open", len(keep3) == 1 and dropped3 == 0)


def test_run_all_scrapers_mocked() -> None:
    print("\n[run_all_scrapers, mocked supabase]")
    store = FakeSupabase({"jobs": []})
    scraper = JobBoardScraper(store, USER)

    def fake(source: str, n: int):
        def _run() -> list[dict[str, Any]]:
            out = []
            for i in range(n):
                job = make_job(
                    scraper,
                    source=source,
                    company=f"{source} Co {i}",
                    title=f"Machine Learning Engineer {i}",
                    url=f"https://example.test/{source.replace(' ', '-')}/{i}",
                    description=f"Role {i} using Python and PyTorch in London.",
                )
                out.append(job)
            return out

        return _run

    for index, (name, _method) in enumerate(scraper.scrapers):
        if name in REAL_SOURCES:
            scraper.scrapers[index] = (name, fake(name, 3))

    summary = scraper.run_all_scrapers()

    check("sources_total == 25", summary["sources_total"] == 25, str(summary["sources_total"]))
    check("8 sources working", summary["sources_working"] == 8, str(summary["sources_working"]))
    check("17 sources skipped", summary["sources_skipped"] == 17, str(summary["sources_skipped"]))
    check("0 sources failed", summary["sources_failed"] == 0, str(summary["sources_failed"]))
    check("24 jobs found", summary["jobs_found"] == 24, str(summary["jobs_found"]))
    check("dedup counter reported", "jobs_cross_board_duplicates" in summary)
    check("jobs upserted", summary["jobs_upserted"] == 24, str(summary["jobs_upserted"]))

    written = store.upserts.get("jobs", [])
    check("every upserted row has a content_hash", bool(written) and all(r.get("content_hash") for r in written))
    check("board status rows written", len(store.upserts.get("job_board_status", [])) == 25)
    check("board stats rows written", len(store.upserts.get("job_board_stats", [])) == 25)

    skipped = [
        name
        for name, _ in scraper.scrapers
        if name not in REAL_SOURCES
    ]
    reasons_ok = True
    for name in skipped:
        method = dict(scraper.scrapers)[name]
        try:
            method()
        except NotImplementedError as exc:
            if len(str(exc)) < 40:
                reasons_ok = False
        except Exception:
            reasons_ok = False
    check("every stub raises NotImplementedError with a real reason", reasons_ok)

    # A second identical run must add nothing new: the content hashes now match
    # rows stored less than 7 days ago.
    scraper2 = JobBoardScraper(store, USER)
    for index, (name, _method) in enumerate(scraper2.scrapers):
        if name in REAL_SOURCES:
            scraper2.scrapers[index] = (name, fake(name, 3))
    summary2 = scraper2.run_all_scrapers()
    check(
        "re-run drops all 24 as cross-board/content duplicates",
        summary2["jobs_cross_board_duplicates"] == 24,
        str(summary2["jobs_cross_board_duplicates"]),
    )
    check("re-run upserts nothing", summary2["jobs_upserted"] == 0, str(summary2["jobs_upserted"]))


def main() -> int:
    test_registry()
    test_build_job_carries_content_hash()
    test_normalize_and_hash()
    test_is_duplicate()
    test_remove_content_duplicates()
    test_run_all_scrapers_mocked()

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        for label in FAILED:
            print(f"  FAILED: {label}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
