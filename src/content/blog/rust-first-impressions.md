---
title: Rust First Impressions
description: Coming from Python and JavaScript, learning Rust has been humbling. Here's what surprised me.
pubDate: 2026-02-20
tags:
  - rust
  - programming
draft: false
---

I started learning Rust to build a CLI tool. The borrow checker beat me up for a week straight.

## The Hard Parts

Lifetimes made no sense at first. I kept fighting the compiler until I realized the compiler was usually right and I was writing bad code.

## The Good Parts

Once it compiles, it works. Like actually works. No null pointer exceptions at 2am. Pattern matching is beautiful. Error handling with `Result` and `?` is way better than try/catch.

## Would I Use It For Everything?

No. For quick scripts, Python is still faster to write. But for anything that needs to be fast and correct, Rust is incredible.
