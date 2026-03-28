---
id: 6ae-kjk-vmy
status: plan
parent: null
dependencies: []
---
# frontend: useSWR for fetching

instead of fetching data directly from the backend, use `useSWR` to prevent flash of unloaded state:
- loading list of tasks
- loading a specific task
- loading run data

search the codebase for more places where a cache would help, but nothing important (e.g. not drift detection) where it's better to show loading state than stale data

revalidate instantly (it's a local backend, everything is cheap)