#!/usr/bin/env python3
"""Fail-closed validation of smbcacls --numeric on a dedicated Windows HDD folder.

smbcacls --numeric renders ALLOWED as the number 0 and FULL as 0x001f01ff
on Samba 4.x. Never assume the textual 'ALLOWED' spelling in numeric mode.
No ACL mutation here; caller reads the actual NTFS DACL after changing it.
"""
import re
import sys

REQUIRED = {"S-1-5-18", "S-1-5-32-544"}  # NT AUTHORITY\SYSTEM, BUILTIN\Administrators
FULL_CONTROL = 0x001F01FF
INHERIT_OBJECT_AND_CONTAINER = 0x03


def validate_acl(raw: str):
    lines = [line.strip() for line in raw.splitlines() if line.strip().startswith("ACL:")]
    if len(lines) != len(REQUIRED):
        raise ValueError("Expected exactly SYSTEM and Administrators ACEs, got " + str(len(lines)))
    found = set()
    for line in lines:
        parts = line.split(":")
        if len(parts) != 3 or parts[0] != "ACL":
            raise ValueError("Unexpected NTFS ACL entry structure")
        sid, ace = parts[1], parts[2]
        if sid not in REQUIRED or sid in found:
            raise ValueError("Unexpected or duplicated ACL principal: " + re.sub(r"[^A-Za-z0-9-]", "", sid)[:90])
        spec = ace.split("/")
        if len(spec) != 3:
            raise ValueError("Malformed Windows ACL entry")
        kind, flags, mask = spec
        if kind not in ("0", "0x0", "ALLOWED"):
            raise ValueError("Unexpected Windows ACL entry type (DENY not accepted)")
        try:
            flag_bits = int(flags, 0)
            permission_bits = FULL_CONTROL if mask == "FULL" else int(mask, 0)
        except ValueError as exc:
            raise ValueError("Unknown Windows ACL flags or permissions") from exc
        if flag_bits != INHERIT_OBJECT_AND_CONTAINER or permission_bits != FULL_CONTROL:
            raise ValueError("Windows ACL is missing inheritable FULL control")
        found.add(sid)
    if found != REQUIRED:
        raise ValueError("Required Windows administrators/SYSTEM permissions missing")
    return True


def main():
    try:
        raw = sys.stdin.read()
        if validate_acl(raw):
            print("Windows NTFS backup ACL verified: only SYSTEM and Administrators")
    except ValueError as exc:
        print("Windows backup ACL is not restricted: " + str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
