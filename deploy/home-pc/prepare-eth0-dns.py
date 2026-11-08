#!/usr/bin/env python3
"""Print a reviewed Netplan DNS overlay. Never writes host files or applies it.

Use only from a supervised Ubuntu VM console after confirming the Netplan
interface ID, renderer, gateway and working resolver on the actual host.
"""

import argparse
import ipaddress
import re

INTERFACE_ID = re.compile(r"[A-Za-z][A-Za-z0-9_.-]{0,14}\Z")


def render_overlay(interface: str, resolver: str) -> str:
    """Return the minimal DHCP IPv4/IPv6 DNS override, not a route change."""
    if not INTERFACE_ID.fullmatch(interface):
        raise ValueError("Interface must be a simple Netplan ID (1-15 characters)")
    try:
        ip = ipaddress.ip_address(resolver)
    except ValueError as exc:
        raise ValueError("Resolver must be one valid public IPv4 address") from exc
    if ip.version != 4 or not ip.is_global or ip.is_multicast or ip.is_reserved:
        raise ValueError("Resolver must be one valid public IPv4 address")
    return (
        "# USD: review the existing Netplan ID/renderer before installation.\n"
        "# No addresses, routes, gateways or DHCP leases are changed by this overlay.\n"
        "network:\n"
        "  version: 2\n"
        "  ethernets:\n"
        f"    {interface}:\n"
        "      dhcp4-overrides:\n"
        "        use-dns: false\n"
        "      dhcp6-overrides:\n"
        "        use-dns: false\n"
        "      nameservers:\n"
        "        addresses:\n"
        f"          - {ip}\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--interface', default='eth0', help='Verified Netplan interface ID (default: eth0)')
    parser.add_argument('--resolver', default='8.8.8.8', help='Verified public IPv4 resolver (default: 8.8.8.8)')
    args = parser.parse_args()
    try:
        print(render_overlay(args.interface, args.resolver), end='')
    except ValueError as exc:
        parser.error(str(exc))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
