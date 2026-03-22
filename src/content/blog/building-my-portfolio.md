---
title: Building a 3D Portfolio Site
description: How I built an interactive 3D desk scene with Three.js and Astro for my personal website.
pubDate: 2026-03-15
tags:
  - webdev
  - threejs
  - astro
draft: false
---

I wanted my portfolio to feel like more than just a list of links. The idea was simple — what if your portfolio was a desk you could interact with?

## The Stack

I went with Astro for the static site generation and Three.js for the 3D scene. No React, no R3F — just vanilla TypeScript and raw Three.js.

## The Desk

Every object on the desk links to a section of the site. The laptop opens projects, the notebook opens the blog, the book stack shows my reading list. Each object has its own open/close animation.

## Mobile

On mobile, the desk becomes a shelf. Same objects, different arrangement. The camera scrolls vertically through three shelves.
