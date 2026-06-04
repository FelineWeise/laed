# Scaleway provider currently does not expose a dedicated billing alert resource.
# Layer 4 is managed as a documented manual post-apply checklist item:
# - Warning alert: 30 EUR / month
# - Alarm alert: 60 EUR / month
#
# Layer 5 daily rollup: run `gateway-gpu rollup-metrics` from the llm-gateway stack
# (see llm-gateway/README.md for a cron example).
