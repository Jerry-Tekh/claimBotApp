"""Small GenLayer SDK stub for local unit tests.

This file is not deployed. It only gives the Python test runner enough of the
SDK surface to import contracts without a live GenLayer runtime.
"""


class TreeMap(dict):
    """Minimal TreeMap that behaves like dict for tests."""


class DynArray(list):
    """Minimal DynArray that behaves like list for tests."""


def _uint(value=0):
    return int(value)


u32 = _uint
u64 = _uint
u128 = _uint
u256 = _uint
bigint = int


class Address(str):
    pass


def contract(cls):
    return cls


def _decorator(fn):
    return fn


class _WriteDecorator:
    def __call__(self, fn):
        return fn

    @property
    def payable(self):
        return _decorator


class _Public:
    view = staticmethod(_decorator)
    write = _WriteDecorator()


class _VM:
    class UserError(Exception):
        pass

    class Return:
        def __init__(self, calldata):
            self.calldata = calldata

    @staticmethod
    def run_nondet_unsafe(leader_fn, _validator_fn):
        return leader_fn()


class _Message:
    sender_address = Address("0x0000000000000000000000000000000000000000")
    origin_address = sender_address
    contract_address = sender_address
    value = u256(0)
    block_number = u256(0)
    chain_id = u256(0)


class _NondetWeb:
    @staticmethod
    def render(_url, mode="text"):
        return ""

    @staticmethod
    def request(_url, **_kwargs):
        return ""


class _Nondet:
    web = _NondetWeb()

    @staticmethod
    def exec_prompt(_prompt, **_kwargs):
        return "{}"


class _EqPrinciple:
    @staticmethod
    def strict_eq(fn):
        return fn()

    @staticmethod
    def prompt_comparative(fn, _principle=None):
        return fn()


class _GL:
    class Contract:
        pass

    public = _Public()
    vm = _VM()
    message = _Message()
    nondet = _Nondet()
    eq_principle = _EqPrinciple()


gl = _GL()
