from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "backend" / "schema.sql"


def test_backend_indexes_are_idempotent():
    schema = SCHEMA.read_text()
    for line in schema.splitlines():
        statement = line.strip().upper()
        if statement.startswith("CREATE INDEX "):
            assert statement.startswith("CREATE INDEX IF NOT EXISTS ")
