"""
glsim - a small GenVM stand-in, good enough to execute the real contract file.

This is not a test. It is the harness the tests run on. It exists so the
DETERMINISTIC HALF of the contract can be executed for real: storage writes,
the clause state machine, the clock, the payouts. The pure consensus helpers
are already covered by tests/test_logic.py; everything below the block is what
this reaches.

It deliberately models the parts of GenVM that cause bugs:

  * a non-deterministic block runs TWICE, once as the leader and once as a
    validator, with independent mock responses, so a contract that assumes both
    runs see identical data is caught here rather than on a real network
  * the validator's verdict decides whether the transaction proceeds, and a
    leader error the validators agree with is the transaction's error
  * a leader can be made to LIE (set_leader_payload), so the checks a validator
    runs against a leader it does not trust are reachable
  * storage is snapshotted before a write and rolled back if the method raises,
    and so are the value transfers it queued: a refused transaction pays nobody
  * a block's return value must be a flat dict of str, as the calldata encoder
    demands, and a storage dataclass may not hold a collection
  * an Address compares by its 20 bytes, not by its spelling
"""

import sys
import types
import copy


# ---------------------------------------------------------------------------
# storage types
# ---------------------------------------------------------------------------

class _Generic:
    """What DynArray[T] and TreeMap[K, V] evaluate to.

    Deliberately NOT callable. Real GenVM refuses `DynArray[T]()` with
    "this class can't be instantiated by user".
    """

    def __init__(self, origin):
        self.__origin__ = origin

    def __call__(self, *a):
        raise TypeError("this class can't be instantiated by user")

    def __repr__(self):
        return f"{self.__origin__.__name__}[...]"


class DynArray(list):
    def __class_getitem__(cls, item):
        return _Generic(DynArray)


class TreeMap(dict):
    def __class_getitem__(cls, item):
        return _Generic(TreeMap)

    def get(self, k, default=None):
        return dict.get(self, k, default)


class Address(str):
    """A str, compared the way the runtime's Address compares: by 20 bytes.

    "0xAB..." and "0xab..." are the same address on chain. Normalising on
    construction gives this the same equality, and refusing a malformed value
    mirrors the runtime, which raises on anything that is not 20 bytes.
    """

    def __new__(cls, val):
        s = str(val).strip()
        ok = len(s) == 42 and s[:2] in ("0x", "0X")
        if ok:
            for ch in s[2:]:
                if ch not in "0123456789abcdefABCDEF":
                    ok = False
                    break
        if not ok:
            raise Exception("invalid address " + repr(s))
        return str.__new__(cls, "0x" + s[2:].lower())

    @property
    def as_hex(self):
        return str(self)


def u256(v=0):
    v = int(v)
    if v < 0 or v >= 2 ** 256:
        # The runtime refuses a negative or oversized u256 on storage write;
        # a subtraction that underflows must fail here too, not wrap.
        raise OverflowError(f"u256 out of range: {v}")
    return v


def allow_storage(cls):
    """Marks a dataclass as storable, and refuses what GenVM refuses."""
    for name, ann in getattr(cls, "__annotations__", {}).items():
        origin = getattr(ann, "__origin__", None)
        if isinstance(ann, _Generic) or ann in (DynArray, TreeMap) or origin in (DynArray, TreeMap):
            raise TypeError(
                f"{cls.__name__}.{name}: a storage dataclass cannot contain a "
                f"collection. Make it a top level contract field and carry an "
                f"id on the record instead."
            )
        if ann in (int, list, dict, tuple):
            raise TypeError(
                f"{cls.__name__}.{name}: {ann.__name__} is not a valid storage type"
            )
    return cls


# ---------------------------------------------------------------------------
# errors and results
# ---------------------------------------------------------------------------

class UserError(Exception):
    def __init__(self, message=""):
        super().__init__(message)
        self.message = message


class VMError(Exception):
    pass


class Result:
    pass


class Return(Result):
    def __init__(self, calldata):
        self.calldata = calldata


class Rollback(Result):
    def __init__(self, message):
        self.message = message


class ContractError(Result):
    def __init__(self, message):
        self.message = message


# ---------------------------------------------------------------------------
# the non-deterministic environment
# ---------------------------------------------------------------------------

class WebResponse:
    def __init__(self, status, body):
        self.status = status
        self.body = body
        self.headers = {}


class NonDetEnv:
    """The mock web pages and prompt answers one node sees.

    Prompts are matched by substring, in insertion order. A value may be a
    dict (returned), a list of values (returned in turn, the last repeating),
    or an Exception (raised).
    """

    def __init__(self, pages=None, prompts=None):
        self.pages = pages or {}
        self.prompts = prompts or {}
        self.prompt_calls = []
        self.web_calls = []
        self._turn = {}

    def _answer(self, table, key, value):
        if isinstance(value, list):
            i = self._turn.get(key, 0)
            self._turn[key] = i + 1
            value = value[min(i, len(value) - 1)]
        if isinstance(value, Exception):
            raise value
        return copy.deepcopy(value)

    def get(self, url, headers=None):
        self.web_calls.append(url)
        for key, value in self.pages.items():
            if key in url:
                ans = self._answer(self.pages, key, value)
                if isinstance(ans, WebResponse):
                    return ans
                return WebResponse(ans.get("status", 200), ans.get("body", b""))
        raise UserError(f"no mock page for {url}")

    def exec_prompt(self, prompt, response_format=None, images=None):
        self.prompt_calls.append(prompt)
        for key, value in self.prompts.items():
            if key in prompt:
                return self._answer(self.prompts, key, value)
        raise UserError("no mock prompt response matched")


class _Runtime:
    def __init__(self):
        self.leader_env = NonDetEnv()
        self.validator_env = NonDetEnv()
        self.active = None
        self.sender = Address("0x" + "11" * 20)
        self.value = 0
        self.datetime = "2026-09-22T10:00:00Z"
        self.last_validator_verdict = None
        self.block_runs = 0
        self.leader_payload = None
        self.leader_payload_on = None   # which block run the lie applies to
        self.validator_prompt_calls = 0
        self.transfers = []             # (to, value), in order, committed only


RT = _Runtime()


def check_calldata_shape(value, where="leader_fn"):
    """A block's return value must be a FLAT dict of str. Nothing else.

    This mirrors the calldata encoder, which runs OUTSIDE the contract. When it
    fails on chain there is no traceback and the result code is <unknown>.
    """
    if not isinstance(value, dict):
        raise TypeError(
            "%s returned %s. A block's return value must be a flat dict of str."
            % (where, type(value).__name__)
        )
    for k, v in value.items():
        if not isinstance(k, str):
            raise TypeError("%s returned a key of type %s." % (where, type(k).__name__))
        if isinstance(v, bool):
            raise TypeError("%s returned a bool for %r; send \"yes\" / \"no\"." % (where, k))
        if not isinstance(v, str):
            raise TypeError(
                "%s returned %s for %r. Every value must be str." % (where, type(v).__name__, k)
            )
    return value


def _run_nondet_unsafe(leader_fn, validator_fn):
    """Run the block as the leader, then as a validator, then decide."""
    RT.block_runs += 1

    RT.active = RT.leader_env
    try:
        leader_out = leader_fn()
        check_calldata_shape(leader_out, "leader_fn")
        leaders_res = Return(leader_out)
    except UserError as e:
        leaders_res = Rollback(e.message)
    except TypeError:
        RT.active = None
        raise
    except Exception as e:                       # noqa: BLE001
        leaders_res = ContractError(str(e))

    # A leader is a peer, not a library: what reaches a validator is whatever
    # the leader put on the wire. With more than one block in a transaction,
    # the lie is aimed at one of them: a payload meant for the second round
    # would otherwise be caught by the first round's validator, and the test
    # would pass without ever reaching what it meant to test.
    lying = (RT.leader_payload is not None
             and (RT.leader_payload_on is None or RT.leader_payload_on == RT.block_runs))
    if lying and isinstance(leaders_res, Return):
        leaders_res = Return(RT.leader_payload)

    RT.active = RT.validator_env
    before = len(RT.validator_env.prompt_calls)
    verdict = bool(validator_fn(leaders_res))
    RT.validator_prompt_calls = len(RT.validator_env.prompt_calls) - before
    RT.last_validator_verdict = verdict
    RT.active = None

    if not verdict:
        raise UserError("validators did not agree with the leader")
    if isinstance(leaders_res, Rollback):
        # Agreed on an error: the error is the transaction's outcome.
        raise UserError(leaders_res.message)
    if not isinstance(leaders_res, Return):
        raise UserError("leader failed")
    # What gets stored is the value consensus settled on: the LEADER'S
    # PROPOSAL, not the leader's honest internal state.
    return leaders_res.calldata


# ---------------------------------------------------------------------------
# the gl namespace
# ---------------------------------------------------------------------------

def _identity(fn):
    return fn


class _Write:
    def __call__(self, fn):
        return fn

    @property
    def payable(self):
        return _identity


class _Public:
    def __init__(self):
        self.view = _identity
        self.write = _Write()


class _Message:
    @property
    def sender_address(self):
        return RT.sender

    @property
    def origin_address(self):
        return RT.sender

    @property
    def value(self):
        return RT.value


class _Web:
    def get(self, url, headers=None):
        if RT.active is None:
            raise VMError("web access outside a non-deterministic block")
        return RT.active.get(url, headers)


class _NonDet:
    def __init__(self):
        self.web = _Web()

    def exec_prompt(self, prompt, response_format=None, images=None):
        if RT.active is None:
            raise VMError("prompt outside a non-deterministic block")
        return RT.active.exec_prompt(prompt, response_format, images)


class _VM:
    UserError = UserError
    VMError = VMError
    Result = Result
    Return = Return
    Rollback = Rollback
    ContractError = ContractError
    run_nondet_unsafe = staticmethod(_run_nondet_unsafe)


class _EvmProxy:
    def __init__(self, addr):
        self.addr = Address(addr)

    def emit_transfer(self, value=0, **kw):
        # The external message form takes `value` only. `on` is a TypeError on
        # chain, so it is one here.
        if kw:
            raise TypeError(f"emit_transfer() got unexpected keyword arguments {sorted(kw)}")
        if RT.active is not None:
            raise VMError("a transfer inside a non-deterministic block")
        RT.pending_transfers.append((str(self.addr), int(value)))


class _Evm:
    @staticmethod
    def contract_interface(cls):
        if not (hasattr(cls, "View") and hasattr(cls, "Write")):
            raise TypeError("an EVM interface declares View and Write")

        def make(addr):
            return _EvmProxy(addr)
        return make


class _Contract:
    """Base class. Storage fields are created from the class annotations."""

    FORBIDDEN = {int: "int (use u256)", list: "list (use DynArray[T])",
                 dict: "dict (use TreeMap[K, V])", tuple: "tuple"}

    def __new__(cls, *a, **kw):
        obj = super().__new__(cls)
        for name, ann in getattr(cls, "__annotations__", {}).items():
            if ann in _Contract.FORBIDDEN:
                raise TypeError(f"{cls.__name__}.{name}: {_Contract.FORBIDDEN[ann]} is not a valid storage type")
        for name, ann in getattr(cls, "__annotations__", {}).items():
            origin = getattr(ann, "__origin__", None)
            if origin is DynArray:
                setattr(obj, name, DynArray())
            elif origin is TreeMap:
                setattr(obj, name, TreeMap())
            elif ann is str:
                setattr(obj, name, "")
            elif ann is bool:
                setattr(obj, name, False)
            else:
                setattr(obj, name, 0)
        return obj


class _GL:
    def __init__(self):
        self.Contract = _Contract
        self.public = _Public()
        self.message = _Message()
        self.nondet = _NonDet()
        self.vm = _VM()
        self.evm = _Evm()
        self.message_raw = {"datetime": RT.datetime, "is_init": True}

    def get_contract_at(self, addr):
        raise VMError("not modelled")


gl = _GL()
RT.pending_transfers = []


# ---------------------------------------------------------------------------
# loading a real contract file
# ---------------------------------------------------------------------------

def _install_module():
    m = types.ModuleType("genlayer")
    m.gl = gl
    m.DynArray = DynArray
    m.TreeMap = TreeMap
    m.Address = Address
    m.u256 = u256
    m.allow_storage = allow_storage
    m.__all__ = ["gl", "DynArray", "TreeMap", "Address", "u256", "allow_storage"]
    sys.modules["genlayer"] = m


_install_module()


def load_contract(path):
    """Execute a real contract file and return its module namespace."""
    src = open(path, encoding="utf-8").read()
    ns = {"__name__": f"contract_{path}"}
    exec(compile(src, path, "exec"), ns)
    return types.SimpleNamespace(**ns)


def contract_class(mod):
    """The one class deriving from gl.Contract, whatever it is named."""
    found = [v for v in vars(mod).values()
             if isinstance(v, type) and issubclass(v, _Contract) and v is not _Contract]
    if len(found) != 1:
        raise TypeError(f"expected exactly one contract class, found {len(found)}")
    return found[0]


def deploy(path, *args):
    """Instantiate the contract in this file, exactly as GenVM would."""
    mod = load_contract(path)
    gl.message_raw["is_init"] = True
    c = contract_class(mod)(*args)
    gl.message_raw["is_init"] = False
    c._module = mod
    return c


def set_mocks(leader_prompts=None, validator_prompts=None, leader_pages=None, validator_pages=None):
    """Give the leader and the validator their own view of the world.

    Passing only leader_* makes both nodes see the same thing. Passing both is
    how divergence is tested.
    """
    RT.leader_env = NonDetEnv(leader_pages, leader_prompts)
    RT.validator_env = NonDetEnv(
        validator_pages if validator_pages is not None else leader_pages,
        validator_prompts if validator_prompts is not None else leader_prompts,
    )
    RT.block_runs = 0
    RT.last_validator_verdict = None
    RT.leader_payload = None
    RT.leader_payload_on = None
    RT.validator_prompt_calls = 0


def set_leader_payload(payload, on=None):
    """Make the validator receive `payload` instead of the leader's real return.

    `on` is the 1-based block within the transaction the lie applies to, for a
    contract whose transaction runs more than one. None lies in every block.
    """
    RT.leader_payload = payload
    RT.leader_payload_on = on


def validator_prompt_calls():
    """How many prompts the validator spent on the last block."""
    return RT.validator_prompt_calls


def set_sender(addr):
    RT.sender = Address(addr)


def set_value(v):
    RT.value = int(v)


def set_time(iso):
    RT.datetime = iso
    gl.message_raw["datetime"] = iso


def transfers():
    """Every committed transfer so far, as (address, wei)."""
    return list(RT.transfers)


def reset_transfers():
    RT.transfers = []
    RT.pending_transfers = []


def call(contract, method, *args, value=0):
    """Call a method as one transaction.

    Storage is rolled back if the method raises, and so are the transfers it
    queued: a refused transaction pays nobody. `value` is what the caller sends
    with it, and is reset afterwards so a later call does not inherit it.
    """
    snapshot = {k: copy.deepcopy(v) for k, v in contract.__dict__.items() if not k.startswith("_")}
    RT.pending_transfers = []
    RT.value = int(value)
    try:
        out = getattr(contract, method)(*args)
    except Exception:
        for k, v in snapshot.items():
            setattr(contract, k, v)
        RT.pending_transfers = []
        raise
    finally:
        RT.value = 0
    RT.transfers.extend(RT.pending_transfers)
    RT.pending_transfers = []
    return out
