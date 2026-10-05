"""
Testnet auto-funding for new accounts.

When a user logs in, check their wallet on-chain. If it holds almost no MON (gas),
send a small amount of MON and mint some test mUSD, so anyone can try Tallyo
with their own email. It runs in a background thread and never blocks login.

The faucet key belongs to the APP (testnet only, small balance) - never to a user.
"""
import os
import time
import threading
import logging
from web3 import Web3

log = logging.getLogger("tallyo.funding")

CHAIN_ID = 10143
MUSD_ABI = [{
    "name": "mint", "type": "function", "stateMutability": "nonpayable",
    "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
    "outputs": [],
}]

_lock = threading.Lock()   # one funding sequence at a time (keeps nonces in order)
_recent = {}               # address -> last attempt time, to avoid double funding


def _send(w3, account, tx):
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
    tx_hash = w3.eth.send_raw_transaction(raw)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt["status"] != 1:
        raise RuntimeError("transaction reverted")
    return tx_hash.hex()


def fund_new_wallet(address):
    """Fund `address` if it has almost no gas. Returns a short status string."""
    key = os.getenv("FAUCET_PRIVATE_KEY", "").strip()
    if not key:
        return "disabled (no FAUCET_PRIVATE_KEY)"
    rpc = os.getenv("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz")
    musd_addr = os.getenv("MUSD_ADDRESS", "0x4BA6a94ce34284dc1C8807cB7dE937C7C63b8f13")
    fund_mon = os.getenv("FUND_MON", "0.05")
    fund_musd = os.getenv("FUND_MUSD", "50")
    low_mon = os.getenv("FUND_LOW_MON", "0.01")

    try:
        address = Web3.to_checksum_address(address)
    except Exception:
        return "invalid address"

    with _lock:
        if time.time() - _recent.get(address, 0) < 600:
            return "recently handled"
        _recent[address] = time.time()
        try:
            w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 20}))
            if w3.eth.get_balance(address) >= Web3.to_wei(low_mon, "ether"):
                return "already has gas"

            account = w3.eth.account.from_key(key)
            gas_price = int(w3.eth.gas_price * 1.25)   # small margin so the tx is not underpriced
            nonce = w3.eth.get_transaction_count(account.address, "pending")

            # 1) MON for gas (a plain transfer costs exactly 21000 gas)
            _send(w3, account, {
                "to": address, "value": Web3.to_wei(fund_mon, "ether"),
                "gas": 21000, "gasPrice": gas_price, "nonce": nonce, "chainId": CHAIN_ID,
            })

            # 2) test mUSD (the mUSD contract has an open mint)
            musd = w3.eth.contract(address=Web3.to_checksum_address(musd_addr), abi=MUSD_ABI)
            tx = musd.functions.mint(address, Web3.to_wei(fund_musd, "ether")).build_transaction({
                "from": account.address, "nonce": nonce + 1,
                "gasPrice": gas_price, "chainId": CHAIN_ID,
            })
            tx["gas"] = int(tx["gas"] * 1.3)           # safety margin on the gas estimate
            _send(w3, account, tx)

            log.info("funded %s with %s MON and %s mUSD", address, fund_mon, fund_musd)
            return "funded"
        except Exception as e:
            _recent.pop(address, None)                 # allow a retry on the next login
            log.warning("funding failed for %s: %s", address, e)
            return f"failed: {e}"


def fund_in_background(address):
    """Fire-and-forget version used by the login endpoint."""
    if address and os.getenv("FAUCET_PRIVATE_KEY"):
        threading.Thread(target=fund_new_wallet, args=(address,), daemon=True).start()
