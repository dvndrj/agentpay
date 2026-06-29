"""
Unit tests for schema validation.

**Validates: Requirements 12.5**
"""

import pytest

from agentpay_canonical_json import CanonicalJsonError, schemas, validate


def test_obligation_object_schema_valid():
    """Test that a valid ObligationObject passes validation."""
    obligation = {
        "obligation_id": "01234567-89ab-cdef-0123-456789abcdef",
        "sla_id": "01234567-89ab-cdef-0123-456789abcdef",
        "consumer_handle": "12345",
        "provider_handle": "67890",
        "consumer_smart_account": "0x1234567890123456789012345678901234567890",
        "provider_smart_account": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "amount_usdc": "1000000",
        "asset": "USDC",
        "network": "base-mainnet",
        "nonce": "1",
        "finality_state": "DRAFT",
        "policy_decision_id": "01234567-89ab-cdef-0123-456789abcdef",
        "created_at": "2024-01-01T12:00:00Z",
        "tx_hash": None,  # null in DRAFT
        "evidence_hash": None,  # null in DRAFT
        "schema_version": 1,
    }
    
    result = validate(obligation, schemas.ObligationObjectSchema)
    assert result == obligation


def test_obligation_object_missing_required_field():
    """Test that missing required field is rejected."""
    obligation = {
        "obligation_id": "01234567-89ab-cdef-0123-456789abcdef",
        # missing sla_id
        "consumer_handle": "12345",
        "provider_handle": "67890",
        "consumer_smart_account": "0x1234567890123456789012345678901234567890",
        "provider_smart_account": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "amount_usdc": "1000000",
        "asset": "USDC",
        "network": "base-mainnet",
        "nonce": "1",
        "finality_state": "DRAFT",
        "policy_decision_id": "01234567-89ab-cdef-0123-456789abcdef",
        "created_at": "2024-01-01T12:00:00Z",
        "tx_hash": None,
        "evidence_hash": None,
        "schema_version": 1,
    }
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        validate(obligation, schemas.ObligationObjectSchema)
    assert "missing required field" in str(exc_info.value)
    assert "sla_id" in str(exc_info.value)


def test_obligation_object_unknown_field():
    """Test that unknown field is rejected."""
    obligation = {
        "obligation_id": "01234567-89ab-cdef-0123-456789abcdef",
        "sla_id": "01234567-89ab-cdef-0123-456789abcdef",
        "consumer_handle": "12345",
        "provider_handle": "67890",
        "consumer_smart_account": "0x1234567890123456789012345678901234567890",
        "provider_smart_account": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "amount_usdc": "1000000",
        "asset": "USDC",
        "network": "base-mainnet",
        "nonce": "1",
        "finality_state": "DRAFT",
        "policy_decision_id": "01234567-89ab-cdef-0123-456789abcdef",
        "created_at": "2024-01-01T12:00:00Z",
        "tx_hash": None,
        "evidence_hash": None,
        "schema_version": 1,
        "unknown_field": "should fail",
    }
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        validate(obligation, schemas.ObligationObjectSchema)
    assert "unknown field" in str(exc_info.value)


def test_obligation_object_wrong_type():
    """Test that wrong type for a field is rejected."""
    obligation = {
        "obligation_id": "01234567-89ab-cdef-0123-456789abcdef",
        "sla_id": "01234567-89ab-cdef-0123-456789abcdef",
        "consumer_handle": "12345",
        "provider_handle": "67890",
        "consumer_smart_account": "not-an-address",  # invalid address
        "provider_smart_account": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "amount_usdc": "1000000",
        "asset": "USDC",
        "network": "base-mainnet",
        "nonce": "1",
        "finality_state": "DRAFT",
        "policy_decision_id": "01234567-89ab-cdef-0123-456789abcdef",
        "created_at": "2024-01-01T12:00:00Z",
        "tx_hash": None,
        "evidence_hash": None,
        "schema_version": 1,
    }
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        validate(obligation, schemas.ObligationObjectSchema)
    assert "address" in str(exc_info.value)


def test_policy_schema_valid():
    """Test that a valid Policy passes validation."""
    policy = {
        "smart_account": "0x1234567890123456789012345678901234567890",
        "per_tx_cap_usdc_micro": "1000000",
        "daily_cap_usdc_micro": "10000000",
        "rolling_24h_spend_usdc_micro": "5000000",
        "updated_at": "2024-01-01T12:00:00Z",
        "schema_version": 1,
    }
    
    result = validate(policy, schemas.PolicySchema)
    assert result == policy


def test_invalid_uuid():
    """Test that invalid UUID format is rejected."""
    policy = {
        "smart_account": "0x1234567890123456789012345678901234567890",
        "per_tx_cap_usdc_micro": "1000000",
        "daily_cap_usdc_micro": "10000000",
        "rolling_24h_spend_usdc_micro": "5000000",
        "updated_at": "2024-01-01T12:00:00Z",
        "schema_version": 1,
    }
    
    # This would fail in ObligationObject which has UUID fields
    obligation = {
        "obligation_id": "not-a-uuid",
        "sla_id": "01234567-89ab-cdef-0123-456789abcdef",
        "consumer_handle": "12345",
        "provider_handle": "67890",
        "consumer_smart_account": "0x1234567890123456789012345678901234567890",
        "provider_smart_account": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "amount_usdc": "1000000",
        "asset": "USDC",
        "network": "base-mainnet",
        "nonce": "1",
        "finality_state": "DRAFT",
        "policy_decision_id": "01234567-89ab-cdef-0123-456789abcdef",
        "created_at": "2024-01-01T12:00:00Z",
        "tx_hash": None,
        "evidence_hash": None,
        "schema_version": 1,
    }
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        validate(obligation, schemas.ObligationObjectSchema)
    assert "UUID" in str(exc_info.value) or "well-formed" in str(exc_info.value)


def test_invalid_enum_value():
    """Test that invalid enum value is rejected."""
    obligation = {
        "obligation_id": "01234567-89ab-cdef-0123-456789abcdef",
        "sla_id": "01234567-89ab-cdef-0123-456789abcdef",
        "consumer_handle": "12345",
        "provider_handle": "67890",
        "consumer_smart_account": "0x1234567890123456789012345678901234567890",
        "provider_smart_account": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "amount_usdc": "1000000",
        "asset": "USDC",
        "network": "invalid-network",  # invalid enum value
        "nonce": "1",
        "finality_state": "DRAFT",
        "policy_decision_id": "01234567-89ab-cdef-0123-456789abcdef",
        "created_at": "2024-01-01T12:00:00Z",
        "tx_hash": None,
        "evidence_hash": None,
        "schema_version": 1,
    }
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        validate(obligation, schemas.ObligationObjectSchema)
    assert "enum" in str(exc_info.value)
