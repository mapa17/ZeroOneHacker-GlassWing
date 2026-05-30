import json
import os

_dir = os.path.dirname(os.path.abspath(__file__))
_contracts_path = os.path.join(_dir, "..", "..", "contracts", "contracts.json")
with open(_contracts_path, "r", encoding="utf-8") as f:
    CONTRACTS = json.load(f)

STATES = CONTRACTS["states"]
CONF_GATE = CONTRACTS["conf_gate"]
LOW_CONF_EXIT = CONTRACTS["low_conf_exit"]
SEGMENT_PRIOR = CONTRACTS["segment_priors"]
STEP_BASELINE_MS = CONTRACTS["step_baseline_ms"]
LIKELIHOOD = CONTRACTS["likelihood"]
OUT_OF_SCOPE_VALUES = CONTRACTS["out_of_scope_values"]
