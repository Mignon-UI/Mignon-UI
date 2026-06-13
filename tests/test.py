#!/usr/bin/env python3
"""
Simple AI response verification tool.
Connects to the database settings and sends a test prompt to check if the AI responds.
"""

import asyncio
import json
import os
import sys

# Ensure the workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

try:
    from app.core.database import SessionLocal, Settings
    from app.services.llm_client import stream_llm_response
except ImportError as e:
    print(f"\033[91m[Error] Failed to import application modules: {e}\033[0m")
    print("Please run this script from the project root directory.")
    sys.exit(1)

# ANSI terminal colors
C_GREEN = '\033[92m'
C_RED = '\033[91m'
C_YELLOW = '\033[93m'
C_CYAN = '\033[96m'
C_RESET = '\033[0m'

async def main():
    db = SessionLocal()
    try:
        settings = db.query(Settings).filter(Settings.id == 1).first()
        if not settings:
            print(f"{C_RED}[Failure] No settings record found in SQLite database.{C_RESET}")
            sys.exit(1)

        provider = settings.provider
        model = settings.selected_model
        endpoint = settings.local_endpoint or "http://127.0.0.1:11434/v1"

        print(f"{C_CYAN}Testing AI Response Connectivity...{C_RESET}")
        print(f"  Provider : {provider}")
        print(f"  Model    : {model}")
        print(f"  Endpoint : {endpoint if provider != 'openrouter' else 'https://openrouter.ai/api/v1'}")
        print("-" * 50)

        system_prompt = "You are a helpful assistant."
        user_prompt = "Hello! Please reply back with a short greeting so I know you are online and receiving messages."

        print("Sending prompt to AI and waiting for response...\n")

        response_text = ""
        error_msg = None

        try:
            async for chunk in stream_llm_response(settings, system_prompt, user_prompt):
                if chunk.strip().startswith("data:"):
                    data_str = chunk.strip()[5:].strip()
                    try:
                        data_json = json.loads(data_str)
                        if "text" in data_json:
                            token = data_json["text"]
                            print(token, end="", flush=True)
                            response_text += token
                        elif "error" in data_json:
                            error_msg = data_json["error"]
                    except Exception:
                        pass

            print() # Print newline after stream ends

            if error_msg:
                print(f"\n{C_RED}[FAILURE] AI provider returned an error: {error_msg}{C_RESET}")
                sys.exit(1)
            elif response_text.strip():
                print(f"\n{C_GREEN}[SUCCESS] AI responded back successfully!{C_RESET}")
                sys.exit(0)
            else:
                print(f"\n{C_RED}[FAILURE] Connected, but the AI generated an empty response.{C_RESET}")
                sys.exit(1)

        except Exception as e:
            print(f"\n{C_RED}[FAILURE] Request failed with error: {e}{C_RESET}")
            sys.exit(1)

    finally:
        db.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n{C_YELLOW}Test aborted by user.{C_RESET}")
        sys.exit(0)
