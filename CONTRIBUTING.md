# Contributing

Thanks for helping. Before opening a pull request:

1. `pnpm install`, then `pnpm check`. It must pass with zero warnings.
2. Keep code modular: put new behaviour behind a port or in its own module rather than growing an existing one.
3. Don't duplicate logic. Extract a shared helper instead (jscpd fails CI on any clone).
4. Add tests. `spec` and `core` stay at 100% coverage.
5. Read [ETHICS.md](ETHICS.md). Pull requests that add live-interview assistance are closed.

## Contributor License Agreement

The project is released under AGPL-3.0 with the Commons Clause, and the maintainer also offers a commercial hosted service. To keep that possible, every contributor must sign a CLA before their first pull request is merged. Under the CLA, you:

- keep the copyright to your contribution;
- grant the maintainer a perpetual, worldwide, royalty-free license to use, modify, sublicense and relicense your contribution, including in commercial and closed-source products;
- confirm the contribution is your own work and that you have the right to grant this license.

A CLA bot will ask you to sign on your first pull request.
