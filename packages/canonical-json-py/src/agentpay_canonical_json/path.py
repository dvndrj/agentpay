"""
JSON-pointer (RFC 6901) path utilities.
"""


def join_path(parent: str, segment: str | int) -> str:
    """
    Build a JSON-pointer (RFC 6901) path from a sequence of segments.

    Segments are escaped per RFC 6901: `~` → `~0`, `/` → `~1`.
    The empty path (root) is represented as the empty string.
    """
    if isinstance(segment, int):
        escaped = str(segment)
    else:
        escaped = segment.replace("~", "~0").replace("/", "~1")
    return f"{parent}/{escaped}"
