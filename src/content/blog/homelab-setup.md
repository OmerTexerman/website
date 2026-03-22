---
title: Setting Up My Homelab
description: How I set up a self-hosted infrastructure with Docker Compose on a mini PC.
pubDate: 2026-01-28
tags:
  - homelab
  - docker
  - selfhosted
draft: false
---

I bought a used mini PC and turned it into a home server.

## The Hardware

A Beelink mini PC with a Ryzen 5, 16GB RAM, and a 1TB NVMe. Total cost: about $200. It draws maybe 15W idle.

## The Software

Everything runs in Docker Compose:
- **Nextcloud** for file sync
- **Jellyfin** for media
- **Pi-hole** for DNS-level ad blocking
- **Caddy** as a reverse proxy with automatic HTTPS

## The Network

I have a Cloudflare tunnel so I can access everything remotely without opening ports. It's surprisingly easy to set up.

## Was It Worth It?

Absolutely. I stopped paying for cloud storage and streaming services. The initial setup took a weekend but now it just runs.
