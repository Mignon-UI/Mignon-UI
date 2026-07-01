# Security Policy

We take the security of Mignon UI seriously. This document outlines how to report security vulnerabilities and our process for handling them.

## Reporting a Vulnerability

If you discover a security vulnerability in Mignon UI, please **do not open a public issue**. Instead, report it privately to the maintainers:

1. Send an email to the project maintainers (please check the repository contact details or open a private draft security advisory on GitHub).
2. Provide a detailed description of the vulnerability, including:
   - Steps to reproduce (ideally with a minimal proof-of-concept)
   - The potential impact
   - Your environment (OS, Tauri version, etc.)

We will acknowledge your report within 48 hours and work with you to patch and disclose the issue responsibly.

## Scope

This security policy applies to:
- The core frontend application logic (React, CSS, Vite config)
- The Tauri Rust backend (`src-tauri`)
- Local SQLite database handling
- Integrations with local/cloud LLM APIs

Thank you for helping keep Mignon UI secure for everyone!
