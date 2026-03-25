---
id: 6af-kie-dtx
status: plan
parent: null
dependencies: []
---
# cli: create an e2e testing environment for `hb init`

we need an e2e testing environment for `hb init`

test cases:

failures:
- git is not installed
- not in a git directory
- running in git root, `.hyperbranch` already exists
- running in a subdir of git root, `.hyperbranch` already exists in a) the same subdir; b) git root

successes:
- running in git root
- running in a subdir of git root
- user agrees to commit
- user doesn't agree to commit


to achieve this we probably need some kind of an isolated environment such as a micro-VM or a webcontainer or a full linux running in wasm -- keep in mind that these tests will be run inside a docker container so creating another docker container on top is not an option