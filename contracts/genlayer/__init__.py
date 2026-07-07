"""GenLayer SDK stub for unit testing without the real GenLayer node."""
from unittest.mock import MagicMock

gl = MagicMock()

class TreeMap(dict):
    """Minimal TreeMap — behaves like dict for tests."""
    pass

def contract(cls):
    return cls
