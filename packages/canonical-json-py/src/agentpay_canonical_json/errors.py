"""
Canonical JSON error types.
"""


class CanonicalJsonError(Exception):
    """
    Thrown when a value cannot be encoded as canonical JSON or fails schema validation.

    The `path` is a JSON-pointer-style string (RFC 6901) identifying the
    offending field (e.g. `/charge/amount_usdc_micro`). The root is the empty
    string. The `reason` is a short, machine-readable description suitable for
    surfacing in error envelopes.
    """

    def __init__(self, path: str, reason: str):
        self.path = path
        self.reason = reason
        display_path = path if path else "/"
        super().__init__(f"{display_path}: {reason}")
