---
title: Architecture
description: "Three swappable layers: gateway, app, inference. Switch inference engines without rewriting auth, safety, or logging."
navTitle: Architecture
---

Three layers, each swappable. The gateway terminates auth and rate limits. Your app owns the chat logic and the safety pipeline. The inference engine can be vLLM today and SGLang tomorrow — Ultralisk doesn't care, because nothing past the gateway depends on it.