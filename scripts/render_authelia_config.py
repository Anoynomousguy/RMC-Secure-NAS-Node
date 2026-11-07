#!/usr/bin/env python3
"""Render /srv/fortress/authelia/*.yml from *.template.yml and .env (0600)."""
import os
import re
import sys

BASE = "/srv/fortress"
ENV_PATH = os.path.join(BASE, ".env")

def load_env():
    env = {}
    with open(ENV_PATH) as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip("'")
    return env

def render(env, template, output):
    text = open(template).read()
    def repl(match):
        key = match.group(1)
        if key not in env:
            sys.exit(f"missing {key} in .env")
        return env[key]
    text = re.sub(r"\$\{([A-Z0-9_]+)\}", repl, text)
    with open(output, "w") as handle:
        handle.write(text)
    os.chmod(output, 0o600)

def main():
    env = load_env()
    render(env, os.path.join(BASE, "authelia/configuration.template.yml"),
           os.path.join(BASE, "authelia/configuration.yml"))
    render(env, os.path.join(BASE, "authelia/users_database.template.yml"),
           os.path.join(BASE, "authelia/users_database.yml"))
    print("rendered authelia configuration.yml + users_database.yml")

if __name__ == "__main__":
    main()
