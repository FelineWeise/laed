# Cost Control Verification Playbook

## Layer 1 Idle Watcher

1. SSH to GPU.
2. `sudo sed -i 's/^IDLE_TIMEOUT_SECONDS=.*/IDLE_TIMEOUT_SECONDS=60/' /etc/default/laed-gpu-cost-control`
3. `sudo systemctl restart cron`
4. Stop traffic and confirm shutdown within ~5 minutes.

## Layer 2 Uptime Cap

1. SSH to GPU after restart.
2. `sudo sed -i 's/^MAX_UPTIME_SECONDS=.*/MAX_UPTIME_SECONDS=120/' /etc/default/laed-gpu-cost-control`
3. `sudo systemctl restart cron`
4. Confirm forced shutdown around 2 minutes from boot.

## Layer 3 Daily Budget Guard

1. Set `DAILY_UPTIME_BUDGET_SECONDS=120` in LiteLLM env.
2. Generate GPU requests until budget is exhausted.
3. Confirm callback raises `BudgetExceeded`.
4. Confirm LiteLLM fallback route succeeds via third-party model.
