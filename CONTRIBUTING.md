# Contributing to Uncola CLI

Thanks for helping. Please read this before you open a pull request.

## Where does my contribution go?

| Type | What to do |
|---|---|
| Bug or small fix | Open a pull request, with steps to reproduce and a test. |
| New feature or command | Open an issue first, so we can agree on it before you build it. |
| Refactor only | Please don't, unless a maintainer asked for it as part of a fix. |
| New dependency | Open a pull request that explains why it's needed. The CLI has one runtime dependency, and we'd like to keep it that way. |
| Question | Open an issue. |
| Security problem | Don't open an issue. Report it privately from the repository's **Security** tab. |

## Before you open a pull request

```sh
npm install
npm test
npm run typecheck
```

- Both pass.
- Every command keeps working with `--json`.
- New behavior has a test in `test/`.
- Agent instructions live in `skill/uncola/SKILL.md`. Update them if your change affects what an agent should do.

`npm run test:live` runs against Uncola's test server and needs an account there, so maintainers run it before merging.

## License

By contributing, you agree that your contribution is licensed under the [Apache License 2.0](LICENSE).
