# ClosedSource

An agentic AI coding tool for **non-technical founders**, in the spirit of Claude Code, but **system-design aware**.

> Status: early stage. This README describes the vision; the implementation is in progress.

## The problem

Coding agents today assume you can read code, pick an architecture, and spot a bad design. Non-technical founders can't. They get working demos that quietly turn into tangled, fragile products.

## The idea

ClosedSource is a coding agent that thinks about **system design before it writes code**, and explains its choices in plain language.

- **Describe, don't specify.** Tell it what your product should do in everyday words.
- **Design first.** The agent proposes an architecture (data model, services, third-party tools, hosting) and explains the trade-offs in non-technical terms before building.
- **Design-aware changes.** Every edit is checked against the agreed design, so new features don't break the structure.
- **Plain-language feedback.** Progress, risks, and costs are reported in business terms, not stack traces.
- **Founder in control.** The agent asks for approval on key decisions such as stack, spend, and data handling.

## How it works (planned)

1. **Understand**: interview the founder about the product, users, and constraints.
2. **Design**: produce a system design document that is kept up to date as the project evolves.
3. **Build**: implement in small, reviewable steps that follow the design.
4. **Verify**: run tests and checks, then summarize what changed and why.
5. **Evolve**: flag when a new request needs a design change and propose it.

## Roadmap

- [ ] CLI agent loop
- [ ] Requirements interview flow
- [ ] System design document generation and tracking
- [ ] Design-conformance checks on code changes
- [ ] Plain-language change summaries
- [ ] Deployment guidance

## Contributing

Ideas and feedback are welcome. Open an issue to start a discussion.

## License

See [LICENSE](LICENSE).
