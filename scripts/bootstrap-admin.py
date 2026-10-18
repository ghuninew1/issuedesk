#!/usr/bin/env python3
"""Interactively create the first IssueDesk admin in the configured remote D1."""

import base64
import getpass
import hashlib
import re
import secrets
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path


ITERATIONS = 100_000


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    if not sys.stdin.isatty():
        print("Run this script in an interactive terminal.", file=sys.stderr)
        return 2

    name = input("Admin name: ").strip()
    email = input("Admin email: ").strip().lower()
    if not name or len(name) > 100 or len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        print("Enter a name (up to 100 characters) and a valid email.", file=sys.stderr)
        return 2

    password = getpass.getpass("Admin password (12–128 characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation or not 12 <= len(password) <= 128:
        print("Passwords must match and contain 12–128 characters.", file=sys.stderr)
        return 2

    confirm = input(f"Create the first admin account for {email} in remote D1? Type 'create' to continue: ")
    if confirm != "create":
        print("Cancelled; no changes were made.")
        return 0

    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS, dklen=32)
    encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
    password_hash = f"pbkdf2-sha256${ITERATIONS}${encode(salt)}${encode(derived)}"
    user_id = str(uuid.uuid4())

    sql = f"""INSERT INTO users (id, email, name, password_hash, role)
SELECT {sql_quote(user_id)}, {sql_quote(email)}, {sql_quote(name)}, {sql_quote(password_hash)}, 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
RETURNING id, email, name, role;"""

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", encoding="utf-8", delete=False) as sql_file:
            temp_path = Path(sql_file.name)
            sql_file.write(sql)
        completed = subprocess.run(
            ["pnpm", "exec", "wrangler", "d1", "execute", "issuedesk-db", "--remote", "--yes", "--file", str(temp_path)],
            check=False,
            cwd=Path(__file__).resolve().parents[1],
        )
        if completed.returncode:
            print("Admin bootstrap failed. Check the Wrangler output; the password was not logged.", file=sys.stderr)
            return completed.returncode
        print("Bootstrap command completed. If D1 returned no inserted row, an admin already exists.")
        return 0
    finally:
        password = ""
        confirmation = ""
        if temp_path:
            temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
