#!/usr/bin/env bash
# Emergency fix (until netplan persists): prefer public default over VPC gateway default.
# Run on laed-base via Scaleway console. Defaults match a typical GP1 + laed-private attach.
set -euo pipefail

PRIV_GW="${PRIV_GW:-172.16.20.4}"
PRIV_DEV="${PRIV_DEV:-ens7}"
NEW_METRIC="${NEW_METRIC:-200}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

# Replace private default with a higher metric so default via public NIC (lower metric) wins.
ip route replace default via "${PRIV_GW}" dev "${PRIV_DEV}" metric "${NEW_METRIC}"

echo "OK. Expected: 'ip route show' shows public default with lower metric than ${PRIV_DEV}."
echo "Check: ip route get 8.8.8.8 from 51.15.207.5  # dev should be your public NIC (e.g. ens2)"
