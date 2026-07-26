# TenkaCloudPassport Symphony

This repository owns and runs its own Symphony instance. It has no runtime or configuration dependency
on the TenkaCloud platform repository.

```bash
export GITHUB_TOKEN='...'
export SYMPHONY_WORKSPACE_ROOT="$HOME/code/tenkacloud-passport/workspaces"
export SYMPHONY_BIN="$HOME/bin/symphony"
make symphony-validate
make symphony-run
```

The workflow watches only `susumutomita/TenkaCloudPassport`, uses port `4314` by default, clones only
this repository, and invokes Passport's own `make agent-gate`. Change `SYMPHONY_PORT`,
`SYMPHONY_LOGS_ROOT`, or `SYMPHONY_WORKFLOW` through Make variables when needed.

The GitHub token should be scoped only to this repository. Other TenkaCloud repositories maintain
separate workflows, workspace roots, ports, logs, tokens, gates, and lifecycle processes.
