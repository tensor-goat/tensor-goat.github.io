---
layout: post
title: Two Input Neuron
date: 2026-11-15 02:19:05
tags:
---

Recently, I was probing with Opus 5.5 on how the SwiGLU and other gated MLP's work.

# Undisclosed version of Two Input MLP

I have a version of my own, a two input neuron, so called layered "gated" MLP, which works like this with 2 hidden layers:

<img src="move-into-first-layer.png" alt="Two-Input MLP" style="display: block; margin-left: 0; margin-right: auto; width: 600px; max-width: 100%;">

# Fable 5.2

Then, I tried Fable 5.2, because it was made available to try for the Pro users. 

I asked it to give me a version where the expressive neurons are into the first layer directly:

## Result

1-layered "gated" MLP...

<video autoplay muted loop playsinline width="100%">
  <source src="one-neuron-xor.mp4" type="video/mp4">
</video>

