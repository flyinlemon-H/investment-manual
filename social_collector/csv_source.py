from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterator

from .normalizer import FIELD_ALIASES


class CsvSourceError(ValueError):
    pass


class CsvSocialPostSource:
    """CSV-backed social post source.

    This is the first concrete source. Future platform crawlers should expose
    the same collect() shape and let the normalizer handle field mapping.
    """

    source_name = "csv"

    def __init__(self, path: Path) -> None:
        self.path = path

    def collect(self) -> Iterator[dict[str, str]]:
        if not self.path.exists():
            raise FileNotFoundError(f"CSV file not found: {self.path}")

        with self.path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                raise CsvSourceError(f"CSV file has no header row: {self.path}")

            normalized_headers = {field.strip().casefold() for field in reader.fieldnames if field}
            content_aliases = {alias.casefold() for alias in FIELD_ALIASES["content"]}
            if normalized_headers.isdisjoint(content_aliases):
                expected = ", ".join(FIELD_ALIASES["content"])
                raise CsvSourceError(
                    f"CSV file is missing a content field: {self.path}. "
                    f"Expected one of: {expected}"
                )

            for row_number, row in enumerate(reader, start=2):
                cleaned = {
                    str(key).strip(): (value or "").strip()
                    for key, value in row.items()
                    if key is not None
                }
                cleaned["_source"] = self.source_name
                cleaned["_source_file"] = str(self.path)
                cleaned["_row_number"] = str(row_number)
                yield cleaned
