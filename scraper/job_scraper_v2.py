#!/usr/bin/env python3
"""
Optimized JobHunt Command Center scraper v3.

CHANGES FROM V2:
- Entry-level filter: REJECTS senior/lead/principal roles
- UK-focused: REJECTS non-UK locations
- AI/ML focused: REJECTS non-tech roles
- Result: ~150-200 relevant jobs instead of 500 noise

Everything else (dedup, Supabase, stats) stays the same.
"""

import difflib
import hashlib
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable, Final

import requests
from bs4 import BeautifulSoup

log = logging.getLogger("job_scraper")

USER_AGENT: Final[str] = (
    "JobSearchCommandCenter/3.0 (personal job-search aggregator; "
    "one user, daily run; respects robots.txt)"
)

REQUEST_TIMEOUT: Final[int] = 30
POLITE_DELAY_SECONDS: Final[float] = 1.5

DUPLICATE_WINDOW_DAYS: Final[int] = 7
TITLE_SIMILARITY_THRESHOLD: Final[float] = 0.85
HASH_LOOKUP_CHUNK: Final[int] = 150

SEARCH_TERMS: Final[tuple[str, ...]] = (
    "AI Engineer",
    "Machine Learning Engineer",
    "Data Scientist",
    "LLM Engineer",
    "MLOps Engineer",
)

# ===== FILTERS FOR NITHISH (ENTRY-LEVEL, UK, AI/ML) =====

# ENTRY-LEVEL: Must NOT contain senior keywords
_SENIOR_KEYWORDS: Final[tuple[str, ...]] = (
    "senior", "lead", "principal", "staff",
    "manager", "director", "head of", 
    "vp ", "chief", "cto", "cfo", "ceo",
    "architect", "founding", "co-founder",
    "executive", "head engineer", "technical lead",
)

# ENTRY-LEVEL: Should contain junior keywords (boosts confidence)
_JUNIOR_KEYWORDS: Final[tuple[str, ...]] = (
    "entry", "junior", "graduate", "grad",
    "intern", "associate", "trainee", "early",
    "starting", "early-career", "level", "new graduate",
)

# UK LOCATION: Must match
_UK_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:united kingdom|uk|u\.k\.|london|england|scotland|wales|manchester|"
    r"birmingham|bristol|cambridge|oxford|edinburgh|glasgow|leeds|reading|"
    r"brighton|nottingham|sheffield|cardiff|belfast|remote,? uk|uk remote|"
    r"uk based|based in uk)\b",
    re.I,
)

# AI/ML RELEVANCE: Must match one of these
_RELEVANCE_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:ai|a\.i\.|artificial intelligence|machine learning|\bml\b|deep learning|"
    r"data scien\w+|data engineer\w*|nlp|natural language|llm|large language|"
    r"computer vision|mlops|generative|genai|neural|pytorch|tensorflow|"
    r"reinforcement learning|recommender|research engineer|research scientist|"
    r"ai engineer|ml engineer)\b",
    re.I,
)

_JOB_TYPE_WORDS: Final[dict[str, str]] = {
    "full-time": "Full-time", "full time": "Full-time", "fulltime": "Full-time",
    "part-time": "Part-time", "part time": "Part-time",
    "contract": "Contract", "contractual": "Contract", "contractor": "Contract",
    "freelance": "Contract", "temporary": "Contract", "temp": "Contract",
    "internship": "Internship", "intern": "Internship", "graduate": "Internship",
    "permanent": "Full-time",
}

_REMOTE_RE: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    ("Hybrid", re.compile(r"\bhybrid\b", re.I)),
    ("Remote", re.compile(r"\b(?:fully remote|remote(?:ly)?|work from home|wfh)\b", re.I)),
    ("On-site", re.compile(r"\b(?:on-?site|in-?office|in person)\b", re.I)),
)

_VISA_NEGATIVE: Final[tuple[str, ...]] = (
    "cannot offer visa", "cannot offer sponsorship", "cannot sponsor",
    "can not sponsor", "unable to sponsor", "unable to offer sponsorship",
    "unable to provide sponsorship", "not able to sponsor", "no visa sponsorship",
    "not provide visa sponsorship", "does not offer sponsorship",
    "do not offer sponsorship", "no sponsorship", "without sponsorship",
    "without the need for sponsorship", "not offering sponsorship",
    "sponsorship is not available", "unfortunately we cannot",
    "must already have the right to work",
)

_VISA_POSITIVE: Final[tuple[str, ...]] = (
    "visa sponsorship available", "sponsorship available", "sponsorship is available",
    "we sponsor", "will sponsor", "can sponsor", "happy to sponsor",
    "able to sponsor", "offer sponsorship", "offer visa sponsorship",
    "provide sponsorship", "sponsorship provided", "visa sponsorship",
    "skilled worker visa", "skilled worker route", "skilled worker",
    "tier 2", "tier-2", "global talent visa", "work permit provided",
    "visa support",
)

_SALARY_RANGE_RE: Final[re.Pattern[str]] = re.compile(
    r"[£$€]\s?(\d[\d,.]*)\s*(k)?\s*(?:-|–|—|to)\s*[£$€]?\s?(\d[\d,.]*)\s*(k)?",
    re.I,
)

_SALARY_CODE_RANGE_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(\d[\d,.]*)\s*(k)?\s*(?:-|–|—|to)\s*(\d[\d,.]*)\s*(k)?\s*(?:GBP|USD|EUR)\b",
    re.I,
)

_SALARY_CUE_RE: Final[re.Pattern[str]] = re.compile(
    r"(up\s+to|max(?:imum)?|from|starting at|min(?:imum)?|circa|c\.)\s*"
    r"[£$€]\s?(\d[\d,.]*)\s*(k)?",
    re.I,
)

_SALARY_BARE_RE: Final[re.Pattern[str]] = re.compile(r"[£$€]\s?(\d[\d,.]*)\s*(k)?", re.I)

_NON_ANNUAL_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:per|a|an|/|p)\s?(?:hour|hr|h|day|d|week|wk|month|mo)\b|"
    r"\b(?:hourly|daily|weekly|monthly|day rate|per annum equivalent)\b",
    re.I,
)

_CURRENCY_BY_SYMBOL: Final[dict[str, str]] = {"£": "GBP", "$": "USD", "€": "EUR"}

MIN_PLAUSIBLE_ANNUAL: Final[int] = 10_000
MAX_PLAUSIBLE_ANNUAL: Final[int] = 2_000_000

_PUNCT_RE: Final[re.Pattern[str]] = re.compile(r"[^\w\s]+")

_TECH_TAGS: Final[dict[str, str]] = {
    "Python": r"python",
    "PyTorch": r"pytorch",
    "TensorFlow": r"tensorflow",
    "JAX": r"\bjax\b",
    "Keras": r"keras",
    "scikit-learn": r"scikit-?learn|sklearn",
    "Pandas": r"\bpandas\b",
    "NumPy": r"\bnumpy\b",
    "Hugging Face": r"hugging\s?face",
    "Transformers": r"\btransformers?\b",
    "LLM": r"\bllms?\b|large language model",
    "RAG": r"\brag\b|retrieval[- ]augmented",
    "LangChain": r"langchain|langgraph",
    "NLP": r"\bnlp\b|natural language processing",
    "Computer Vision": r"computer vision|\bopencv\b",
    "Deep Learning": r"deep learning",
    "MLOps": r"\bmlops\b",
    "Airflow": r"airflow",
    "AWS": r"\baws\b|amazon web services",
    "GCP": r"\bgcp\b|google cloud",
    "Azure": r"\bazure\b",
    "Docker": r"docker",
    "Kubernetes": r"kubernetes|\bk8s\b",
    "FastAPI": r"fastapi",
    "React": r"\breact(?:\.js)?\b",
    "TypeScript": r"typescript",
}

_TECH_TAGS_COMPILED: Final[dict[str, re.Pattern[str]]] = {
    tag: re.compile(pattern, re.I) for tag, pattern in _TECH_TAGS.items()
}


def _norm_money(raw: str, k_flag: str | None) -> int | None:
    """'80,300' -> 80300; '55' + k -> 55000."""
    cleaned = raw.replace(",", "").rstrip(".")
    if not cleaned:
        return None
    try:
        value = float(cleaned)
    except ValueError:
        return None
    if k_flag:
        value *= 1000
    amount = int(round(value))
    if amount < MIN_PLAUSIBLE_ANNUAL or amount > MAX_PLAUSIBLE_ANNUAL:
        return None
    return amount


def _detect_currency(text: str, default: str = "GBP") -> str:
    for symbol, code in _CURRENCY_BY_SYMBOL.items():
        if symbol in text:
            return code
    return default


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    return BeautifulSoup(value, "lxml").get_text(" ", strip=True)


def _strip_query(url: str) -> str:
    return url.split("?", 1)[0].split("#", 1)[0]


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _stable_id(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]


def normalize_title(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", _PUNCT_RE.sub(" ", value.lower())).strip()


def content_hash(
    company_name: str | None, job_title: str | None, description: str | None
) -> str:
    payload = (
        (company_name or "").lower().strip()
        + normalize_title(job_title)
        + (description or "")[:200]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class JobBoardScraper:
    """Optimized v3: Entry-level UK AI/ML jobs only."""

    def __init__(self, supabase_client: Any, user_id: str) -> None:
        self.supabase = supabase_client
        self.user_id = user_id
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": USER_AGENT, "Accept-Language": "en-GB,en;q=0.9"}
        )

        self.scrapers: list[tuple[str, Callable[[], list[dict[str, Any]]]]] = [
            ("Adzuna", self.scrape_adzuna),
            ("Reed", self.scrape_reed),
            ("Dev IT Jobs", self.scrape_dev_it_jobs),
            ("Artificial Intelligence Jobs UK", self.scrape_artificial_intelligence_jobs_uk),
            ("Harnham", self.scrape_harnham),
            ("TechSpark", self.scrape_techspark),
            ("AI Jobs", self.scrape_ai_jobs),
            ("HN Hiring", self.scrape_hn_hiring),
            ("AI Startups List UK", self.scrape_ai_startups_list),
            ("IT Job Board", self.scrape_it_job_board),
            ("Foorilla", self.scrape_foorilla),
            ("CW Jobs", self.scrape_cw_jobs),
            ("Free Work", self.scrape_free_work),
            ("Hiring Cafe", self.scrape_hiring_cafe),
            ("Welcome to the Jungle", self.scrape_welcome_to_the_jungle),
            ("Wellfound", self.scrape_wellfound),
            ("Built In London", self.scrape_built_in_london),
            ("Work in Startups", self.scrape_work_in_startups),
            ("LinkedIn", self.scrape_linkedin),
            ("Indeed", self.scrape_indeed),
            ("Total Jobs", self.scrape_total_jobs),
            ("Glassdoor UK", self.scrape_glassdoor_uk),
            ("Built In", self.scrape_built_in),
            ("Silicon Roundabout", self.scrape_silicon_roundabout),
            ("Remote Rocketship", self.scrape_remote_rocketship),
        ]

    # ===== ENTRY-LEVEL FILTER (NEW) =====
    def is_entry_level(self, *fields: str | None) -> bool:
        """True if job is entry/junior, False if senior/lead/principal.
        
        Returns True (accept) for:
        - Contains explicit junior/entry keywords
        - No senior keywords
        
        Returns False (reject) for:
        - Contains senior/lead/principal keywords
        
        Returns True (accept) for unknown level (be permissive).
        """
        text = " ".join(f for f in fields if f).lower()
        
        # REJECT if contains senior keywords
        if any(kw in text for kw in _SENIOR_KEYWORDS):
            return False
        
        # If has explicit junior keywords, definitely accept
        if any(kw in text for kw in _JUNIOR_KEYWORDS):
            return True
        
        # Unknown level - be permissive (you might still apply)
        return True

    # ===== UK FILTER (EXISTING) =====
    def is_uk(self, *fields: str | None) -> bool:
        return bool(_UK_RE.search(" ".join(f for f in fields if f)))

    # ===== AI/ML FILTER (EXISTING) =====
    def is_relevant(self, *fields: str | None) -> bool:
        return bool(_RELEVANCE_RE.search(" ".join(f for f in fields if f)))

    # ===== EXISTING UTILITIES (UNCHANGED) =====

    def _get(self, url: str, **kwargs: Any) -> requests.Response:
        response = self.session.get(url, timeout=REQUEST_TIMEOUT, **kwargs)
        response.raise_for_status()
        time.sleep(POLITE_DELAY_SECONDS)
        return response

    def extract_salary(self, text: str) -> tuple[int | None, int | None]:
        if not text:
            return None, None

        for pattern in (_SALARY_RANGE_RE, _SALARY_CODE_RANGE_RE):
            for match in pattern.finditer(text):
                window = text[max(0, match.start() - 30) : match.end() + 30]
                if _NON_ANNUAL_RE.search(window):
                    continue
                low = _norm_money(match.group(1), match.group(2))
                high = _norm_money(match.group(3), match.group(4) or match.group(2))
                if low and high:
                    return (low, high) if low <= high else (high, low)
                if low or high:
                    return low, high

        for match in _SALARY_CUE_RE.finditer(text):
            window = text[max(0, match.start() - 30) : match.end() + 30]
            if _NON_ANNUAL_RE.search(window):
                continue
            amount = _norm_money(match.group(2), match.group(3))
            if not amount:
                continue
            cue = match.group(1).lower()
            if cue.startswith(("up to", "max")):
                return None, amount
            return amount, None

        if len(text) <= 200:
            for match in _SALARY_BARE_RE.finditer(text):
                if _NON_ANNUAL_RE.search(text):
                    break
                amount = _norm_money(match.group(1), match.group(2))
                if amount:
                    return amount, amount

        return None, None

    def detect_visa_sponsorship(self, text: str) -> bool | None:
        if not text:
            return None
        lowered = text.lower()
        if any(phrase in lowered for phrase in _VISA_NEGATIVE):
            return False
        if any(phrase in lowered for phrase in _VISA_POSITIVE):
            return True
        return None

    def extract_tags(self, text: str) -> list[str]:
        if not text:
            return []
        return [tag for tag, pattern in _TECH_TAGS_COMPILED.items() if pattern.search(text)]

    def detect_remote_status(self, text: str) -> str | None:
        if not text:
            return None
        for label, pattern in _REMOTE_RE:
            if pattern.search(text):
                return label
        return None

    def detect_job_type(self, text: str) -> str | None:
        if not text:
            return None
        lowered = re.sub(r"\s*-\s*", "-", text.lower())
        lowered = re.sub(r"\s+", " ", lowered)
        for needle, label in _JOB_TYPE_WORDS.items():
            if needle in lowered:
                return label
        return None

    def remove_duplicates(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        unique: list[dict[str, Any]] = []
        for job in jobs:
            key = (job.get("job_url") or "").strip().rstrip("/").lower()
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(job)
        return unique

    def _recent_jobs_cache(self, jobs: list[dict[str, Any]]) -> dict[str, Any]:
        cache: dict[str, Any] = {"by_hash": {}, "by_company": {}}
        hashes = sorted({h for job in jobs if (h := job.get("content_hash"))})
        companies = sorted(
            {c for job in jobs if (c := (job.get("company_name") or "").lower().strip())}
        )
        cutoff = datetime.now(timezone.utc) - timedelta(days=DUPLICATE_WINDOW_DAYS)

        try:
            for start in range(0, len(hashes), HASH_LOOKUP_CHUNK):
                result = (
                    self.supabase.table("jobs")
                    .select("content_hash, date_scraped")
                    .eq("user_id", self.user_id)
                    .in_("content_hash", hashes[start : start + HASH_LOOKUP_CHUNK])
                    .execute()
                )
                for row in result.data or []:
                    key = row.get("content_hash")
                    stamp = self._parse_iso(row.get("date_scraped"))
                    if not key:
                        continue
                    previous = cache["by_hash"].get(key)
                    if previous is None or (stamp and stamp > previous):
                        cache["by_hash"][key] = stamp

            for start in range(0, len(companies), HASH_LOOKUP_CHUNK):
                result = (
                    self.supabase.table("jobs")
                    .select("company_name, job_title, date_scraped")
                    .eq("user_id", self.user_id)
                    .gte("date_scraped", cutoff.isoformat())
                    .in_("company_name", companies[start : start + HASH_LOOKUP_CHUNK])
                    .execute()
                )
                for row in result.data or []:
                    company = (row.get("company_name") or "").lower().strip()
                    title = normalize_title(row.get("job_title"))
                    if not company or not title:
                        continue
                    cache["by_company"].setdefault(company, []).append(
                        (title, self._parse_iso(row.get("date_scraped")))
                    )
        except Exception as exc:
            log.warning("Content-hash dedup lookup failed, upserting unfiltered: %s", exc)
            return {"by_hash": {}, "by_company": {}}

        return cache

    def is_duplicate(self, job: dict[str, Any], recent_jobs_cache: dict[str, Any]) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(days=DUPLICATE_WINDOW_DAYS)

        stamp = recent_jobs_cache.get("by_hash", {}).get(job.get("content_hash"))
        if stamp is not None and stamp >= cutoff:
            return True

        company = (job.get("company_name") or "").lower().strip()
        title = normalize_title(job.get("job_title"))
        if not company or not title:
            return False
        for other_title, other_stamp in recent_jobs_cache.get("by_company", {}).get(
            company, ()
        ):
            if other_stamp is None or other_stamp < cutoff:
                continue
            ratio = difflib.SequenceMatcher(None, title, other_title).ratio()
            if ratio >= TITLE_SIMILARITY_THRESHOLD:
                return True
        return False

    def remove_content_duplicates(
        self, jobs: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], int]:
        if not jobs:
            return [], 0

        cache = self._recent_jobs_cache(jobs)
        now = datetime.now(timezone.utc)
        keep: list[dict[str, Any]] = []
        dropped = 0

        for job in jobs:
            if self.is_duplicate(job, cache):
                dropped += 1
                log.debug(
                    "DUP   %-32s %s @ %s",
                    job.get("source"),
                    job.get("job_title"),
                    job.get("company_name"),
                )
                continue
            keep.append(job)
            if job_hash := job.get("content_hash"):
                cache["by_hash"][job_hash] = now
            company = (job.get("company_name") or "").lower().strip()
            title = normalize_title(job.get("job_title"))
            if company and title:
                cache["by_company"].setdefault(company, []).append((title, now))

        return keep, dropped

    def build_job(
        self,
        *,
        source: str,
        company_name: str | None,
        job_title: str | None,
        job_url: str | None,
        description: str | None = None,
        location: str | None = None,
        salary_min: int | None = None,
        salary_max: int | None = None,
        salary_currency: str = "GBP",
        job_type: str | None = None,
        date_posted: datetime | None = None,
        visa_sponsorship: bool | None = None,
        remote_status: str | None = None,
        tags: list[str] | None = None,
    ) -> dict[str, Any] | None:
        company_name = (company_name or "").strip()
        job_title = (job_title or "").strip()
        job_url = (job_url or "").strip()
        if not company_name or not job_title or not job_url:
            return None

        haystack = " ".join(filter(None, (job_title, description, location)))
        return {
            "user_id": self.user_id,
            "company_name": company_name[:300],
            "job_title": job_title[:300],
            "job_url": job_url,
            "salary_min": salary_min,
            "salary_max": salary_max,
            "salary_currency": salary_currency,
            "description": (description or None),
            "location": (location or None),
            "job_type": job_type or self.detect_job_type(job_title),
            "visa_sponsorship": (
                visa_sponsorship
                if visa_sponsorship is not None
                else self.detect_visa_sponsorship(haystack)
            ),
            "remote_status": remote_status or self.detect_remote_status(haystack),
            "date_posted": _iso(date_posted),
            "date_scraped": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "tags": tags if tags is not None else self.extract_tags(haystack),
            "content_hash": content_hash(company_name, job_title, description),
        }

    # ===== SCRAPERS (ADD FILTERS TO EACH) =====

    def scrape_adzuna(self) -> list[dict[str, Any]]:
        app_id = os.getenv("ADZUNA_APP_ID")
        app_key = os.getenv("ADZUNA_APP_KEY")
        if not app_id or not app_key:
            raise RuntimeError(
                "ADZUNA_APP_ID / ADZUNA_APP_KEY not set - get a free key at "
                "https://developer.adzuna.com/signup"
            )

        jobs: list[dict[str, Any]] = []
        for term in SEARCH_TERMS:
            for page in (1, 2):
                response = self._get(
                    f"https://api.adzuna.com/v1/api/jobs/gb/search/{page}",
                    params={
                        "app_id": app_id,
                        "app_key": app_key,
                        "what": term,
                        "where": "london",
                        "distance": 40,
                        "results_per_page": 50,
                        "max_days_old": 14,
                        "sort_by": "date",
                        "content-type": "application/json",
                    },
                )
                results = response.json().get("results") or []
                if not results:
                    break
                for item in results:
                    description = item.get("description") or ""
                    title = item.get("title") or ""
                    location = (item.get("location") or {}).get("display_name") or ""
                    
                    # ===== FILTERS =====
                    if not self.is_relevant(title, description):
                        continue
                    if not self.is_entry_level(title, description):  # NEW
                        continue
                    if not self.is_uk(location, description):  # NEW
                        continue
                    
                    created = item.get("created")
                    job = self.build_job(
                        source="Adzuna",
                        company_name=(item.get("company") or {}).get("display_name"),
                        job_title=_strip_html(title),
                        job_url=item.get("redirect_url"),
                        description=_strip_html(description),
                        location=location,
                        salary_min=(
                            int(item["salary_min"]) if item.get("salary_min") else None
                        ),
                        salary_max=(
                            int(item["salary_max"]) if item.get("salary_max") else None
                        ),
                        job_type=_JOB_TYPE_WORDS.get(
                            (item.get("contract_time") or item.get("contract_type") or "")
                            .replace("_", "-")
                            .lower()
                        ),
                        date_posted=(
                            datetime.fromisoformat(created.replace("Z", "+00:00"))
                            if created
                            else None
                        ),
                    )
                    if job:
                        jobs.append(job)
        return jobs

    def scrape_reed(self) -> list[dict[str, Any]]:
        api_key = os.getenv("REED_API_KEY")
        if not api_key:
            raise RuntimeError(
                "REED_API_KEY not set - get a free key at "
                "https://www.reed.co.uk/developers/jobseeker"
            )

        jobs: list[dict[str, Any]] = []
        for term in SEARCH_TERMS:
            response = self._get(
                "https://www.reed.co.uk/api/1.0/search",
                params={
                    "keywords": term,
                    "locationName": "London",
                    "distanceFromLocation": 30,
                    "resultsToTake": 100,
                },
                auth=(api_key, ""),
            )
            for item in response.json().get("results") or []:
                description = _strip_html(item.get("jobDescription"))
                title = item.get("jobTitle") or ""
                location = item.get("locationName") or ""
                
                # ===== FILTERS =====
                if not self.is_relevant(title, description):
                    continue
                if not self.is_entry_level(title, description):  # NEW
                    continue
                if not self.is_uk(location):  # NEW
                    continue
                
                posted = item.get("date")
                job = self.build_job(
                    source="Reed",
                    company_name=item.get("employerName"),
                    job_title=title,
                    job_url=item.get("jobUrl"),
                    description=description,
                    location=location,
                    salary_min=(
                        int(item["minimumSalary"]) if item.get("minimumSalary") else None
                    ),
                    salary_max=(
                        int(item["maximumSalary"]) if item.get("maximumSalary") else None
                    ),
                    salary_currency=item.get("currency") or "GBP",
                    date_posted=(
                        datetime.strptime(posted, "%d/%m/%Y").replace(tzinfo=timezone.utc)
                        if posted
                        else None
                    ),
                )
                if job:
                    jobs.append(job)
        return jobs

    def scrape_dev_it_jobs(self) -> list[dict[str, Any]]:
        response = self._get("https://devitjobs.uk/rss")
        soup = BeautifulSoup(response.content, "lxml-xml")

        jobs: list[dict[str, Any]] = []
        for item in soup.find_all("item"):
            raw_title = (item.title.get_text(strip=True) if item.title else "") or ""
            body_el = item.find("content:encoded") or item.find("description")
            description = _strip_html(body_el.get_text() if body_el else "")
            
            # ===== FILTERS =====
            if not self.is_relevant(raw_title, description):
                continue
            if not self.is_entry_level(raw_title, description):  # NEW
                continue
            if not self.is_uk(description):  # NEW
                continue

            match = re.match(r"^(?P<title>.*?)\s+@\s+(?P<company>.*?)(?:\s*\[(?P<pay>[^\]]*)\])?$", raw_title)
            if not match:
                continue
            pay = match.group("pay") or ""
            salary_min, salary_max = self.extract_salary(pay or description[:200])

            pub = item.pubDate.get_text(strip=True) if item.pubDate else None
            link = item.link.get_text(strip=True) if item.link else None
            job = self.build_job(
                source="Dev IT Jobs",
                company_name=match.group("company"),
                job_title=match.group("title"),
                job_url=_strip_query(link or ""),
                description=description,
                location=self._first_uk_place(description),
                salary_min=salary_min,
                salary_max=salary_max,
                date_posted=self._parse_rfc2822(pub),
            )
            if job:
                jobs.append(job)
        return jobs

    def scrape_artificial_intelligence_jobs_uk(self) -> list[dict[str, Any]]:
        response = self._get("https://artificialintelligencejobs.co.uk/jobs.json")
        feed = response.json()

        jobs: list[dict[str, Any]] = []
        for item in feed.get("items") or []:
            posting = item.get("_jobposting") or {}
            description = _strip_html(posting.get("description")) or item.get("summary") or ""
            title = posting.get("title") or item.get("title") or ""
            location = item.get("_location") or (posting.get("jobLocation") or {}).get("address", {}).get("addressLocality")
            
            # ===== FILTERS =====
            if not self.is_relevant(title, description):
                continue
            if not self.is_entry_level(title, description):  # NEW
                continue
            if not self.is_uk(location, description):  # NEW
                continue

            salary_min = salary_max = None
            currency = "GBP"
            base = posting.get("baseSalary") or {}
            value = base.get("value") or {}
            if str(value.get("unitText", "")).upper() == "YEAR":
                salary_min = _norm_money(str(value.get("minValue") or ""), None)
                salary_max = _norm_money(str(value.get("maxValue") or ""), None)
                currency = base.get("currency") or "GBP"

            posted = posting.get("datePosted") or item.get("date_published")

            job = self.build_job(
                source="Artificial Intelligence Jobs UK",
                company_name=item.get("_company")
                or (posting.get("hiringOrganization") or {}).get("name"),
                job_title=title,
                job_url=item.get("url") or item.get("id"),
                description=description,
                location=location,
                salary_min=salary_min,
                salary_max=salary_max,
                salary_currency=currency,
                job_type=_JOB_TYPE_WORDS.get(
                    str(posting.get("employmentType") or "").replace("_", "-").lower()
                ),
                date_posted=self._parse_iso(posted),
            )
            if job:
                jobs.append(job)
        return jobs

    def scrape_harnham(self) -> list[dict[str, Any]]:
        jobs: list[dict[str, Any]] = []
        for term in ("machine learning", "AI engineer", "data scientist"):
            response = self._get(
                "https://www.harnham.com/wp-json/wp/v2/job-listings",
                params={"search": term, "per_page": 100, "orderby": "date", "order": "desc"},
            )
            for item in response.json():
                title = _strip_html((item.get("title") or {}).get("rendered"))
                description = _strip_html((item.get("content") or {}).get("rendered"))
                
                # ===== FILTERS =====
                if not self.is_relevant(title, description):
                    continue
                if not self.is_entry_level(title, description):  # NEW
                    continue
                if not self.is_uk(title, description):  # NEW
                    continue
                
                salary_min, salary_max = self.extract_salary(description)
                job = self.build_job(
                    source="Harnham",
                    company_name="Harnham (recruiter)",
                    job_title=title,
                    job_url=item.get("link"),
                    description=description,
                    location=self._first_uk_place(description) or "United Kingdom",
                    salary_min=salary_min,
                    salary_max=salary_max,
                    date_posted=self._parse_iso(item.get("date_gmt") or item.get("date")),
                )
                if job:
                    jobs.append(job)
        return jobs

    def scrape_techspark(self) -> list[dict[str, Any]]:
        jobs: list[dict[str, Any]] = []
        for term in ("machine learning", "data", "ai"):
            response = self._get(
                "https://techjobs.techspark.co/jobs", params={"keyword": term}
            )
            soup = BeautifulSoup(response.text, "lxml")
            for item in soup.select(".job-listings-item"):
                link = item.select_one("a.job-details-link")
                if not link:
                    continue
                title = link.get_text(" ", strip=True)
                company_el = item.select_one('a[href^="/companies/"]')
                location_el = item.select_one('a[href^="/jobs/in-"]')
                card_text = item.get_text(" ", strip=True)
                
                # ===== FILTERS =====
                if not self.is_relevant(title, card_text):
                    continue
                if not self.is_entry_level(title, card_text):  # NEW
                    continue
                if not self.is_uk(location_el.get_text(strip=True) if location_el else ""):  # NEW
                    continue

                job_type = None
                for anchor in item.select('a[href^="/jobs/"]'):
                    label = anchor.get_text(" ", strip=True).lower()
                    if label in _JOB_TYPE_WORDS:
                        job_type = _JOB_TYPE_WORDS[label]
                        break

                salary_text = next(
                    (
                        span.get_text(" ", strip=True)
                        for span in item.select("span")
                        if "£" in span.get_text()
                    ),
                    "",
                )
                salary_min, salary_max = self.extract_salary(salary_text)
                posted_text = next(
                    (
                        span.get_text(" ", strip=True)
                        for span in item.select("span")
                        if "ago" in span.get_text()
                    ),
                    "",
                )
                href = link.get("href") or ""
                job = self.build_job(
                    source="TechSpark",
                    company_name=company_el.get_text(" ", strip=True) if company_el else None,
                    job_title=title,
                    job_url=f"https://techjobs.techspark.co{href}" if href.startswith("/") else href,
                    description=card_text,
                    location=location_el.get_text(" ", strip=True) if location_el else None,
                    salary_min=salary_min,
                    salary_max=salary_max,
                    job_type=job_type,
                    date_posted=self._parse_relative_age(posted_text),
                )
                if job:
                    jobs.append(job)
        return jobs

    def scrape_ai_jobs(self) -> list[dict[str, Any]]:
        jobs: list[dict[str, Any]] = []
        for term in ("machine learning", "ai engineer", "data scientist"):
            response = self._get(
                "https://aijobs.ai/jobs", params={"keyword": term, "location": "London"}
            )
            soup = BeautifulSoup(response.text, "lxml")
            for card in soup.select('a[href*="/job/"]'):
                classes = " ".join(card.get("class") or [])
                if "jobcardStyle1" not in classes:
                    continue
                title_el = card.select_one('div[class*="tw-text-lg"]')
                company_el = card.select_one("span.tw-card-title")
                location_el = card.select_one("span.tw-location")
                if not title_el:
                    continue
                title = title_el.get_text(" ", strip=True)
                location = location_el.get_text(" ", strip=True) if location_el else None
                card_text = card.get_text(" ", strip=True)
                
                # ===== FILTERS =====
                if not self.is_relevant(title, card_text):
                    continue
                if not self.is_entry_level(title, card_text):  # NEW
                    continue
                if location and not self.is_uk(location):  # NEW
                    continue

                job_type = None
                for span in card.select("span"):
                    label = span.get_text(" ", strip=True).lower()
                    if label in _JOB_TYPE_WORDS:
                        job_type = _JOB_TYPE_WORDS[label]
                        break

                salary_min, salary_max = self.extract_salary(card_text)
                age_el = card.select_one('div[class*="tw-text-sm"]')
                job = self.build_job(
                    source="AI Jobs",
                    company_name=company_el.get_text(" ", strip=True) if company_el else None,
                    job_title=title,
                    job_url=card.get("href"),
                    description=card_text,
                    location=location,
                    salary_min=salary_min,
                    salary_max=salary_max,
                    salary_currency=_detect_currency(card_text),
                    job_type=job_type,
                    date_posted=self._parse_relative_age(
                        age_el.get_text(" ", strip=True) if age_el else None
                    ),
                )
                if job:
                    jobs.append(job)
        return jobs

    def scrape_hn_hiring(self) -> list[dict[str, Any]]:
        page_url = "https://hnhiring.com/locations/london"
        response = self._get(page_url)
        soup = BeautifulSoup(response.text, "lxml")

        jobs: list[dict[str, Any]] = []
        for item in soup.select("ul.jobs li.job"):
            body = item.select_one("div.body")
            if not body:
                continue
            headline_parts: list[str] = []
            for node in body.children:
                if getattr(node, "name", None) == "p":
                    break
                text = (
                    node.get_text(" ", strip=True)
                    if hasattr(node, "get_text")
                    else str(node).strip()
                )
                if text:
                    headline_parts.append(text)
            headline = " ".join(headline_parts).strip()
            description = body.get_text(" ", strip=True)
            
            # ===== FILTERS =====
            if not headline or not self.is_relevant(headline, description):
                continue
            if not self.is_entry_level(headline, description):  # NEW
                continue
            # HN Hiring is London-specific, but check anyway
            if not self.is_uk(headline, description):  # NEW
                continue

            company, title = self._split_hn_headline(headline)
            poster_el = item.select_one("div.user a")
            date_el = item.select_one("span.type-info")
            poster = poster_el.get_text(strip=True) if poster_el else ""
            posted_raw = date_el.get_text(strip=True) if date_el else ""

            salary_min, salary_max = self.extract_salary(headline)
            if salary_min is None and salary_max is None:
                salary_min, salary_max = self.extract_salary(description)

            job = self.build_job(
                source="HN Hiring",
                company_name=company,
                job_title=title,
                job_url=f"{page_url}#job-{_stable_id(poster, posted_raw, headline)}",
                description=description,
                location="London, UK",
                salary_min=salary_min,
                salary_max=salary_max,
                salary_currency=_detect_currency(headline),
                job_type=self.detect_job_type(headline),
                date_posted=self._parse_iso(posted_raw),
            )
            if job:
                jobs.append(job)
        return jobs

    @staticmethod
    def _split_hn_headline(headline: str) -> tuple[str, str]:
        for separator in ("|", "—", "–", " - "):
            if separator not in headline:
                continue
            parts = [p.strip() for p in headline.split(separator) if p.strip()]
            if len(parts) < 2:
                continue
            company = re.sub(r"\s*\([^)]*\)\s*$", "", parts[0]).strip() or parts[0]
            for part in parts[1:]:
                if part.lower() in ("remote", "onsite", "hybrid", "full-time", "part-time", "contract", "intern", "visa sponsorship", "h1b"):
                    continue
                return company, part
            return company, "Multiple roles (see post)"
        return headline[:120], headline[:300]

    # ===== STUBS (UNCHANGED) =====

    def scrape_ai_startups_list(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Client-side rendered, no JSON endpoint")

    def scrape_it_job_board(self) -> list[dict[str, Any]]:
        raise NotImplementedError("robots.txt forbids /jobs search URLs")

    def scrape_foorilla(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms forbid scraping, has a paid API instead")

    def scrape_cw_jobs(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms forbid copying/distributing listings")

    def scrape_free_work(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Client-side rendered, bot protection")

    def scrape_hiring_cafe(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms forbid republishing material")

    def scrape_welcome_to_the_jungle(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms explicitly forbid web scraping")

    def scrape_wellfound(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Aggressive bot detection and terms ban scraping")

    def scrape_built_in_london(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms prohibit automated collection")

    def scrape_work_in_startups(self) -> list[dict[str, Any]]:
        raise NotImplementedError("CloudFront WAF blocks all requests including /robots.txt")

    def scrape_linkedin(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms explicitly prohibit scraping, uses bot detection")

    def scrape_indeed(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms forbid scraping, blocks datacenter traffic")

    def scrape_total_jobs(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms forbid automated access, uses bot detection")

    def scrape_glassdoor_uk(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms forbid scraping, requires login + bot checks")

    def scrape_built_in(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms prohibit automated collection")

    def scrape_silicon_roundabout(self) -> list[dict[str, Any]]:
        raise NotImplementedError("No job board exists (404 on all paths)")

    def scrape_remote_rocketship(self) -> list[dict[str, Any]]:
        raise NotImplementedError("Terms explicitly forbid scraping, sells a paid API")

    # ===== DATE UTILS (UNCHANGED) =====

    @staticmethod
    def _parse_rfc2822(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _parse_iso(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    @staticmethod
    def _parse_relative_age(text: str | None) -> datetime | None:
        if not text:
            return None
        match = re.search(r"(\d+)\s*(hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mo|years?|yrs?|y)\b", text, re.I)
        if not match:
            return None
        count, unit = int(match.group(1)), match.group(2).lower()
        if unit.startswith(("h", "hr")):
            days = count / 24
        elif unit.startswith("d"):
            days = float(count)
        elif unit.startswith(("w", "wk")):
            days = count * 7
        elif unit.startswith("mo"):
            days = count * 30
        elif unit.startswith(("y", "yr")):
            days = count * 365
        else:
            return None
        return datetime.now(timezone.utc) - timedelta(days=days)

    @staticmethod
    def _first_uk_place(text: str | None) -> str | None:
        if not text:
            return None
        match = _UK_RE.search(text)
        if not match:
            return None
        found = match.group(0).strip()
        if re.fullmatch(r"uk|u\.k\.|united kingdom", found, re.I):
            return "United Kingdom"
        return found.title()

    # ===== PERSISTENCE (UNCHANGED) =====

    def log_board_status(
        self,
        board_name: str,
        success: bool,
        count: int,
        error: str | None,
        skipped: bool = False,
    ) -> None:
        if skipped:
            status = "Skipped"
        elif not success:
            status = "Down"
        elif count:
            status = "Working"
        else:
            status = "Partial"

        existing = (
            self.supabase.table("job_board_status")
            .select("error_count, success_count")
            .eq("user_id", self.user_id)
            .eq("board_name", board_name)
            .limit(1)
            .execute()
        )
        previous = (existing.data or [{}])[0]
        error_count = int(previous.get("error_count") or 0)
        success_count = int(previous.get("success_count") or 0)
        if skipped:
            pass
        elif success:
            success_count += 1
        else:
            error_count += 1

        self.supabase.table("job_board_status").upsert(
            {
                "user_id": self.user_id,
                "board_name": board_name,
                "status": status,
                "jobs_scraped_today": count,
                "last_scraped": datetime.now(timezone.utc).isoformat(),
                "error_message": error,
                "error_count": error_count,
                "success_count": success_count,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="user_id,board_name",
        ).execute()

    def _upsert_jobs(self, jobs: list[dict[str, Any]]) -> int:
        written = 0
        for start in range(0, len(jobs), 200):
            chunk = jobs[start : start + 200]
            result = (
                self.supabase.table("jobs")
                .upsert(chunk, on_conflict="user_id,job_url")
                .execute()
            )
            written += len(result.data or chunk)
        return written

    def update_board_stats(self) -> None:
        rows: list[dict[str, Any]] = []
        page_size = 1000
        for start in range(0, 20_000, page_size):
            result = (
                self.supabase.table("jobs")
                .select("source, salary_min, salary_max, visa_sponsorship, date_scraped")
                .eq("user_id", self.user_id)
                .range(start, start + page_size - 1)
                .execute()
            )
            batch = result.data or []
            rows.extend(batch)
            if len(batch) < page_size:
                break

        now = datetime.now(timezone.utc)
        today, week_ago, month_ago = (
            now - timedelta(days=1),
            now - timedelta(days=7),
            now - timedelta(days=30),
        )

        by_source: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            by_source.setdefault(row.get("source") or "", []).append(row)

        for board_name, _ in self.scrapers:
            board_rows = by_source.get(board_name, [])
            scraped = [self._parse_iso(r.get("date_scraped")) for r in board_rows]
            mins = [r["salary_min"] for r in board_rows if r.get("salary_min")]
            maxes = [r["salary_max"] for r in board_rows if r.get("salary_max")]
            decided = [
                r["visa_sponsorship"]
                for r in board_rows
                if r.get("visa_sponsorship") is not None
            ]
            self.supabase.table("job_board_stats").upsert(
                {
                    "user_id": self.user_id,
                    "board_name": board_name,
                    "total_jobs_scraped": len(board_rows),
                    "jobs_today": sum(1 for d in scraped if d and d >= today),
                    "jobs_this_week": sum(1 for d in scraped if d and d >= week_ago),
                    "jobs_this_month": sum(1 for d in scraped if d and d >= month_ago),
                    "avg_salary_min": int(sum(mins) / len(mins)) if mins else None,
                    "avg_salary_max": int(sum(maxes) / len(maxes)) if maxes else None,
                    "visa_sponsorship_percent": (
                        round(100 * sum(1 for v in decided if v) / len(decided), 1)
                        if decided
                        else None
                    ),
                    "updated_at": now.isoformat(),
                },
                on_conflict="user_id,board_name",
            ).execute()

    # ===== THE RUNNER (UNCHANGED) =====

    def run_all_scrapers(self) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        all_jobs: list[dict[str, Any]] = []
        per_board: dict[str, dict[str, Any]] = {}
        working = skipped = failed = 0

        for board_name, scraper in self.scrapers:
            try:
                found = scraper()
            except NotImplementedError as exc:
                skipped += 1
                reason = str(exc)
                per_board[board_name] = {"state": "skipped", "count": 0, "error": reason}
                log.info("SKIP  %-32s %s", board_name, reason)
                self.log_board_status(board_name, False, 0, reason, skipped=True)
                continue
            except Exception as exc:
                failed += 1
                reason = f"{type(exc).__name__}: {exc}"
                per_board[board_name] = {"state": "failed", "count": 0, "error": reason}
                log.error("FAIL  %-32s %s", board_name, reason)
                self.log_board_status(board_name, False, 0, reason[:1000])
                continue

            deduped = self.remove_duplicates(found)
            all_jobs.extend(deduped)
            working += 1
            per_board[board_name] = {"state": "ok", "count": len(deduped), "error": None}
            log.info("OK    %-32s %d jobs", board_name, len(deduped))
            self.log_board_status(board_name, True, len(deduped), None)

        unique = self.remove_duplicates(all_jobs)
        fresh, content_dupes = self.remove_content_duplicates(unique)
        upserted = self._upsert_jobs(fresh) if fresh else 0
        self.update_board_stats()

        finished = datetime.now(timezone.utc)
        return {
            "jobs_found": len(all_jobs),
            "jobs_unique": len(unique),
            "jobs_cross_board_duplicates": content_dupes,
            "jobs_upserted": upserted,
            "sources_working": working,
            "sources_skipped": skipped,
            "sources_failed": failed,
            "sources_total": len(self.scrapers),
            "per_board": per_board,
            "started_at": started.isoformat(),
            "finished_at": finished.isoformat(),
            "duration_seconds": round((finished - started).total_seconds(), 1),
        }


# ===== MAIN =====

def _configure_logging(log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        handlers=[logging.FileHandler(log_path, encoding="utf-8"), logging.StreamHandler(sys.stdout)],
    )


def _resolve_user_id(client: Any) -> str:
    override = os.getenv("SCRAPER_USER_ID")
    if override:
        return override
    result = client.table("users").select("id, role, created_at").execute()
    rows = result.data or []
    if not rows:
        raise RuntimeError(
            "No rows in `users` - sign in to the dashboard once, or set SCRAPER_USER_ID."
        )
    owners = [r for r in rows if str(r.get("role") or "").lower() == "owner"]
    return str((owners or rows)[0]["id"])


def main() -> int:
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv()
    log_path = Path(__file__).parent / "logs" / f"scraper_{datetime.now(timezone.utc):%Y-%m-%d}.log"
    _configure_logging(log_path)

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)")
        return 1

    client = create_client(url, key)
    user_id = _resolve_user_id(client)
    log.info("Scraping for user %s", user_id)

    scraper = JobBoardScraper(client, user_id)
    summary = scraper.run_all_scrapers()

    log.info(
        "Scraping complete. %d jobs added, %d cross-board duplicates dropped, "
        "%d sources working, %d skipped, %d failed.",
        summary["jobs_upserted"],
        summary["jobs_cross_board_duplicates"],
        summary["sources_working"],
        summary["sources_skipped"],
        summary["sources_failed"],
    )
    log.info("Summary: %s", json.dumps(summary["per_board"], indent=2))
    print(
        f"Scraping complete. {summary['jobs_upserted']} jobs added, "
        f"{summary['sources_working']} sources working, "
        f"{summary['sources_skipped']} skipped, {summary['sources_failed']} failed."
    )
    print(f"Log written to {log_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())