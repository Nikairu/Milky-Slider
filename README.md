
# Milky Slider

A lightweight, accessible, touch-friendly image/content slider built with **Vue 3**, **TypeScript**, and **Vite**.

<p align="center">
  <a href="https://github.com/Nikairu/Milky-Slider/actions"><img alt="CI" src="https://img.shields.io/badge/CI-GitHub%20Actions-informational"></a>
  <a href="https://www.npmjs.com/package"><img alt="Type Definitions" src="https://img.shields.io/badge/typed-TypeScript-blue"></a>
  <img alt="Vue" src="https://img.shields.io/badge/vue-3.x-41b883">
  <img alt="Vite" src="https://img.shields.io/badge/vite-5.x-646cff">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Quick start](#quick-start)
- [Usage](#usage)
- [API](#api)
  - [Props](#props)
  - [Slots](#slots)
  - [Events](#events)
  - [Methods](#methods)
- [Accessibility](#accessibility)
- [Keyboard & pointer interactions](#keyboard--pointer-interactions)
- [Styling](#styling)
- [Performance notes](#performance-notes)
- [Development](#development)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

## Overview

Milky Slider provides a minimal API for horizontal and vertical carousels, supports mouse, touch, and keyboard navigation, and ships unopinionated markup so you can style it as you like. It is suitable for SSR/SPA scenarios and integrates well with composables.

> Repo scaffolding is Vue 3 + TypeScript + Vite (as shown on the repository page).

## Features

- Declarative Vue 3 component with full TypeScript types
- Horizontal and vertical sliding
- Infinite/loop and finite modes
- Autoplay with pause-on-hover and pause-on-interaction
- Responsive breakpoints
- Drag/swipe (pointer events) with inertia
- Keyboard navigation and ARIA roles
- Snap alignment (start/center/end)
- Lazy mounting for offscreen slides
- RTL support
- SSR-safe (guards against `window`/`document` on server)
- Zero external runtime dependencies

## Quick start

### Requirements

- Node ≥ 18
- pnpm ≥ 8 (or npm/yarn)
- Vue 3.x

### Install and run (local)

```bash
pnpm install
pnpm dev
# build & preview
pnpm build && pnpm preview
```

### Add to an app

If you plan to publish as a library, expose `MilkySlider.vue` and optional CSS. For a local-only component, import it directly.

```vue
<script setup lang="ts">
import MilkySlider from '@/components/MilkySlider.vue'

const images = [
  { id: 1, src: '/images/1.jpg', alt: 'Slide 1' },
  { id: 2, src: '/images/2.jpg', alt: 'Slide 2' },
  { id: 3, src: '/images/3.jpg', alt: 'Slide 3' }
]
</script>

<template>
  <MilkySlider
    :items="images"
    :loop="true"
    :autoplay="true"
    :interval="4000"
    :slides-to-show="1"
    :slides-to-scroll="1"
    aria-label="Gallery"
  >
    <template #slide="{ item }">
      <img :src="item.src" :alt="item.alt" class="slide-img" />
    </template>
    <template #prev>‹</template>
    <template #next>›</template>
    <template #pagination="{ index, isActive, goTo }">
      <button :class="['dot', { active: isActive }]" @click="goTo(index)" :aria-label="`Go to slide ${index+1}`"></button>
    </template>
  </MilkySlider>
</template>

<style scoped>
.slide-img { width: 100%; height: 320px; object-fit: cover; }
.dot { width: 8px; height: 8px; border-radius: 50%; margin: 0 4px; }
.dot.active { transform: scale(1.25); }
</style>
```

## API

The following describes a clean, minimal API. If your implementation differs, adjust names in code and docs.

### Props

| Prop              | Type                               | Default   | Description                                      |
|-------------------|------------------------------------|-----------|--------------------------------------------------|
| `items`           | `T[]`                              | `[]`      | Data array rendered by the `slide` slot.         |
| `modelValue`      | `number`                           | `0`       | Controlled current index (v-model).              |
| `loop`            | `boolean`                          | `false`   | Wrap around at ends.                             |
| `autoplay`        | `boolean`                          | `false`   | Enable autoplay.                                 |
| `interval`        | `number`                           | `5000`    | Autoplay interval in ms.                         |
| `pauseOnHover`    | `boolean`                          | `true`    | Pause autoplay on hover.                         |
| `pauseOnFocus`    | `boolean`                          | `true`    | Pause autoplay when focused.                     |
| `slidesToShow`    | `number`                           | `1`       | Visible slides.                                  |
| `slidesToScroll`  | `number`                           | `1`       | Slides to move per action.                       |
| `orientation`     | `'horizontal' \| 'vertical'`       | `'horizontal'` | Direction of travel.                       |
| `snapAlign`       | `'start' \| 'center' \| 'end'`     | `'start'` | Alignment within the viewport.                   |
| `dragThreshold`   | `number`                           | `0.15`    | Fraction of viewport before a slide commits.     |
| `infinite`        | `boolean`                          | `false`   | Alias for `loop`.                                |
| `rtl`             | `boolean`                          | `false`   | Right-to-left layout.                            |
| `breakpoints`     | `Record<number, Partial<Props>>`   | `{}`      | Responsive overrides keyed by min-width (px).    |
| `ariaLabel`       | `string`                           | `'Carousel'` | Region label.                                  |

### Slots

- `slide` (scoped: `{ item, index, isActive }`) – render each item
- `prev` – previous control content
- `next` – next control content
- `pagination` (scoped: `{ index, isActive, goTo }`) – custom page bullets

### Events

| Event             | Payload           | When                                                |
|-------------------|-------------------|-----------------------------------------------------|
| `update:modelValue` | `number`        | Emits on index change (for v-model).                |
| `change`          | `{ from, to }`    | After a transition completes.                       |
| `reach-start`     | `void`            | Index reaches 0 (finite mode).                      |
| `reach-end`       | `void`            | Index reaches last (finite mode).                   |
| `drag-start`      | `void`            | User begins a drag/swipe gesture.                   |
| `drag-end`        | `void`            | Drag/swipe gesture ends.                            |

### Methods

Use `ref` to call imperative helpers:

```ts
type MilkySliderRef = {
  next: () => void
  prev: () => void
  goTo: (index: number) => void
  play: () => void
  pause: () => void
}
```

## Accessibility

- Wrapper: `role="region"` with `aria-roledescription="carousel"` and an `aria-label`.
- Slides container: `aria-live="polite"` when autoplay is on; `tabindex="0"` to enable focus.
- Each slide: set `aria-hidden` when offscreen; annotate active slide with `aria-current="true"`.
- Controls: label buttons (`aria-label="Next slide"` etc.).
- Pagination dots: use `aria-controls` and `aria-label` per index.
- Respect reduced motion via `@media (prefers-reduced-motion: reduce)`.

## Keyboard & pointer interactions

- ArrowLeft/ArrowRight (or ArrowUp/ArrowDown for vertical)
- Home/End jump to first/last
- Space toggles autoplay when focused on viewport
- Pointer: drag with mouse/touch; cancel on Escape

## Styling

The component ships with minimal structure. Suggested CSS hooks:

```css
.milky-slider { position: relative; overflow: hidden; }
.milky-track  { display: flex; will-change: transform; }
.milky-slide  { flex: 0 0 auto; }
.milky-prev, .milky-next { position: absolute; top: 50%; transform: translateY(-50%); }
.milky-dots   { display: flex; justify-content: center; gap: .5rem; }
```

## Performance notes

- Transforms via `translate3d` for GPU acceleration
- `requestAnimationFrame` for drag/scroll physics
- Virtualize offscreen slides for large lists
- Avoid layout thrash; batch reads/writes

## Development

```bash
pnpm install
pnpm dev
pnpm test    # if tests are present
pnpm build
pnpm preview
```

## Project structure

```
.
├── index.html
├── src/
│   ├── components/
│   │   └── MilkySlider.vue
│   ├── composables/
│   ├── assets/
│   └── main.ts
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## Testing

- Unit tests with Vitest (`vitest`, `@vue/test-utils`)
- E2E with Playwright for drag/keyboard paths

## Roadmap

- Snap-to-nearest with momentum
- Visible range virtualization
- A11y audit script
- Autoplay visibility integration (pause on `document.hidden`)
- Declarative breakpoints helper

## Contributing

1. Fork and create a feature branch
2. pnpm install
3. Commit using Conventional Commits
4. Open a PR with a concise description and screenshots/gifs

## License

MIT © 2025
