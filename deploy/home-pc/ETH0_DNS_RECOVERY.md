# Ubuntu eth0 DNS recovery — supervised, console-only

Related: [USD master plan §2–3](../../docs/USD_MASTER_PLAN.md) and [release tracker #114](https://github.com/kolyagazha89/Usd-2.0/issues/114).

## Observed (2026-11-08)

The Ubuntu runner reported intermittent SOURCE_UNAVAILABLE, IMAGES_PENDING and SIGNATURES_PENDING, finishing in UNEXPECTED_FAILURE. Separate read-only probes reported timeouts to GitHub HTTPS, GHCR and Sigstore; pinned cosign checksum matched. CI publishes images successfully, but CI is **not** host release acceptance.

The operator reported that 8.8.8.8 works and intends to keep it on eth0 rather than receive the gateway DNS from DHCP. This document is a *reviewable procedure*, not evidence of a live network change. Do not edit the production apex DNS, routing, database, schema policy or deploy approvals.

## Safe preparation

**Use the actual Hyper-V Ubuntu VM console with a recovery path, not a remote-only SSH session.** Netplan can interrupt network access. Confirm that the active Netplan ID is literally eth0 (an interface name is not necessarily the Netplan YAML ID), that the network uses Netplan, and that DHCP is enabled:

~~~sh
ip -br link show eth0
ip -4 route
sudo netplan get
resolvectl status eth0
~~~

If the configuration is managed under a different Netplan ID, or by another network manager, **stop** and adapt only after inspecting the live configuration. Do not overwrite existing Netplan files. If DNS is controlled by another policy (VPN/systemd-resolved), diagnose that before writing anything.

Generate the proposed overlay **without modifying host state**:

~~~sh
python3 deploy/home-pc/prepare-eth0-dns.py --interface eth0 --resolver 8.8.8.8
python3 deploy/home-pc/test-prepare-eth0-dns.py -v
~~~

The generated overlay disables DNS servers received via DHCP4/DHCP6 and pins only the operator-tested IPv4 resolver. It does **not** set addresses, gateway, routes, or renderer. Review it with the existing Netplan configuration; verify how the installed backend merges the overlay into the existing eth0 ID.

## Supervised application and rollback

Only from the Ubuntu VM console, after reviewing the generated output and full host configuration:

~~~sh
sudo install -d -m 0700 /root/usd-network-recovery
sudo cp -a /etc/netplan /root/usd-network-recovery/netplan-before
python3 deploy/home-pc/prepare-eth0-dns.py > /tmp/usd-eth0-dns.yaml
sudo install -o root -g root -m 0600 /tmp/usd-eth0-dns.yaml /etc/netplan/90-usd-eth0-dns.yaml
sudo netplan generate
sudo netplan try --timeout 120
~~~

**Do not confirm netplan try unless network connectivity and DNS work.** If Netplan cannot merge or validate the override, remove the new overlay from the VM console and restore the saved configuration; do not force netplan apply over SSH. Do not execute the above automatically from a public-repository GitHub Actions runner.

After a confirmed change, inspect the actual state (the GHCR /v2/ endpoint may return HTTP 401, which is healthy for an unauthenticated probe):

~~~sh
resolvectl status eth0
getent ahostsv4 github.com
git -c credential.helper= ls-remote --exit-code https://github.com/kolyagazha89/Usd-2.0.git refs/heads/main
curl -sS -o /dev/null -w 'GHCR HTTP %{http_code}\n' --connect-timeout 5 --max-time 15 https://ghcr.io/v2/
curl -sS -o /dev/null -w 'Sigstore HTTP %{http_code}\n' --connect-timeout 5 --max-time 15 https://tuf-repo-cdn.sigstore.dev/timestamp.json
/usr/local/libexec/usd-deploy-status read
~~~

Verify DNS remains correct after a DHCP renewal or reboot. Only then retry a **previously authorized** root-owned deploy service through its normal CI/signature/backup/restore gates. No forced release, schema reset, failed-SHA quarantine deletion, or image-signature bypass.

For a console-only manual rollback, remove /etc/netplan/90-usd-eth0-dns.yaml, run sudo netplan generate and use sudo netplan try --timeout 120, restoring the root-owned Netplan backup if needed. Check the active nameservers and network before closing the console.

## Acceptance evidence

Record the sanitized resolver, GitHub/GHCR/Sigstore reachability, root-owned attempt status, exact main SHA, image identities and both public revision endpoints. **DNS fixed** and **Ubuntu accepted the deployment** are two separate milestones. This repository does not have privileged access to the running VM; preparing the overlay in GitHub must never be called an applied network fix.
