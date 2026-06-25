"""Pluggable market-resolver registry."""
from .base import Resolver, ResolverResult
from .json_api import JsonApiResolver
from .llm_search import LlmSearchResolver
from .manual import ManualResolver

RESOLVERS: dict[str, Resolver] = {
    "manual":     ManualResolver(),
    "json_api":   JsonApiResolver(),
    "llm_search": LlmSearchResolver(),
}

__all__ = ["Resolver", "ResolverResult", "RESOLVERS"]
