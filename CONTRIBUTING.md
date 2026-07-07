# Contributing to Mignon UI

Thank you for your interest in contributing to Mignon UI! We welcome contributions from developers of all skill levels.

To maintain code quality and a welcoming community, please follow these guidelines.

---

## 🛠️ Developer Workflow

### 1. Local Development Setup
First, follow the **Developer Setup** instructions in the main [README.md](README.md) to install prerequisites (Node.js, Rust/Cargo, OS Build Tools) and install dependencies:
```bash
npm install
```

To start the app in Tauri development mode:
```bash
npm run tauri:dev
```

### 2. Code Quality & Standards
Before committing any changes, you **must** ensure the code is clean, linted, and all tests pass.

* **Linting**: Run ESLint to check syntax and formatting:
  ```bash
  npm run lint
  ```
* **Testing**: Run unit and integration tests using Vitest:
  ```bash
  npm run test
  ```

### 3. Codebase Health Checks (Fallow)
We use **Fallow** for codebase intelligence and code health analysis (checking for unused exports, dead dependencies, circular references, etc.).
- Ensure your local environment has the `.fallowrc.json` configuration file.
- The `.fallow/` report folder is ignored by Git, but you can inspect your local Fallow reports to ensure your changes do not introduce dead code or architecture violations.

### 4. Codebase Knowledge Graph (Graphify)
We maintain an AST-based knowledge graph of the codebase in `graphify-out/`.
- If you make changes to any source code files, update the graph locally to keep it current:
  ```bash
  graphify update .
  ```

---

## 📂 Submitting a Pull Request

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Commit** your changes with clear, descriptive commit messages.
3. **Verify** your code:
   - Ensure `npm run lint` succeeds.
   - Ensure `npm run test` succeeds.
   - Run `graphify update .` to update the AST graph.
4. **Push** to your fork and submit a Pull Request.
5. Make sure to fill out the **Pull Request Template** details so the maintainers understand your changes.

---

## 💬 Community

By contributing to this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to the project maintainers.

---

## ⚖️ Legal & Contributor Agreement

To maintain the project's long-term sustainability and enable distribution on official App Stores while keeping the code open-source on GitHub, all contributors must agree to our Contributor License Agreement.

Before submitting a Pull Request, please review our full [Contributor License Agreement & Open-Source Promise](Contributor%20License%20Agreement).

### How to Sign
Our automated CLA Assistant bot will guide you. When you open a Pull Request, the bot will post a comment with a link to sign the agreement using your GitHub credentials.
