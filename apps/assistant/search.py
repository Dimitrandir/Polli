"""Search over the salon's articles for the assistant.

The articles are split into passages under their headings and ranked with BM25. Bulgarian words
are cut down to a rough stem ("косата", "коси" and "коса" all become "кос") so that different
forms of a word match. With a few dozen articles this runs in memory in milliseconds and needs
neither an embeddings service nor a database extension.
"""

import math
import re
import threading
import time
from collections import Counter
from dataclasses import dataclass

from apps.content.models import Article

PASSAGE_CHARS = 1200
INDEX_TTL_SECONDS = 600

_WORD = re.compile(r"[0-9a-zа-яѝ]+")
_HEADING = re.compile(r"^#{1,6}\s+(.*)$")
_ENDINGS = (
    "ището",
    "ията",
    "ите",
    "ата",
    "ото",
    "ият",
    "ия",
    "та",
    "то",
    "ът",
    "ят",
    "а",
    "я",
    "о",
    "е",
    "и",
    "у",
    "ю",
)
_STOPWORDS = {
    "и", "в", "на", "за", "с", "от", "по", "да", "се", "не", "е", "са", "ли", "че", "как", "като", "това", "той",
    "тя", "те", "но", "или", "а", "до", "при", "със", "във", "ще", "съм", "си", "ми", "ви", "го", "я", "ги", "му",
    "кой", "коя", "кое", "кои", "какво", "какъв", "каква", "какви", "може", "мога", "има", "няма", "много", "по-",
    "the", "and", "of", "to",
}  # fmt: skip


def stem(word):
    if len(word) > 3:
        for ending in _ENDINGS:
            if word.endswith(ending) and len(word) - len(ending) >= 3:
                word = word[: -len(ending)]
                break
    return word[:7]


def tokens(text):
    return [stem(w) for w in _WORD.findall(text.lower().replace("ё", "е")) if w not in _STOPWORDS]


@dataclass
class Passage:
    slug: str
    title: str
    heading: str
    text: str
    terms: Counter
    length: int


def split_article(article):
    """Passages of about PASSAGE_CHARS characters; each remembers the heading it sits under."""
    passages = []
    heading = ""
    buffer = []

    def flush():
        text = "\n".join(buffer).strip()
        if text:
            passages.append((heading, text))
        buffer.clear()

    for line in article.body.replace("\r\n", "\n").split("\n"):
        match = _HEADING.match(line.strip())
        if match:
            flush()
            heading = match.group(1).strip("* ")
            continue
        buffer.append(line)
        if sum(len(b) for b in buffer) >= PASSAGE_CHARS and not line.strip():
            flush()
    flush()
    return passages


class ArticleIndex:
    K1 = 1.4
    B = 0.75

    def __init__(self, articles):
        self.passages = []
        for article in articles:
            for heading, text in split_article(article):
                # The title and heading count twice: they say what the passage is about.
                terms = Counter(tokens(f"{article.title} {heading} " * 2 + text))
                self.passages.append(Passage(article.slug, article.title, heading, text, terms, sum(terms.values())))
        self.avg_length = sum(p.length for p in self.passages) / len(self.passages) if self.passages else 0
        doc_freq = Counter(term for p in self.passages for term in p.terms)
        n = len(self.passages)
        self.idf = {term: math.log(1 + (n - df + 0.5) / (df + 0.5)) for term, df in doc_freq.items()}

    def search(self, query, limit=5):
        query_terms = set(tokens(query))
        scored = []
        for p in self.passages:
            score = 0.0
            for term in query_terms:
                tf = p.terms.get(term)
                if tf:
                    norm = self.K1 * (1 - self.B + self.B * p.length / self.avg_length)
                    score += self.idf[term] * tf * (self.K1 + 1) / (tf + norm)
            if score > 0:
                scored.append((score, p))
        scored.sort(key=lambda sp: sp[0], reverse=True)
        return [p for _, p in scored[:limit]]


_lock = threading.Lock()
_index = None
_built_at = 0.0


def clear_index():
    global _index
    with _lock:
        _index = None


def get_index():
    global _index, _built_at
    with _lock:
        if _index is None or time.monotonic() - _built_at > INDEX_TTL_SECONDS:
            _index = ArticleIndex(Article.objects.filter(is_published=True).only("slug", "title", "body"))
            _built_at = time.monotonic()
        return _index


def search_articles(query, limit=5):
    return get_index().search(query, limit)
