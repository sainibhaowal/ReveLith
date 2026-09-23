# Changelog

## [1.1.4](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.3...revelith-v1.1.4) (2026-08-22)


### Bug Fixes

* **ci:** point release asset upload to apps/shell/release output directory ([13be6c5](https://github.com/sainibhaowal/ReveLith/commit/13be6c5c9c1837d40a43680794c3488216d374c1))
* **pdf:** add DOMMatrix polyfill for jsdom environment in tests ([aafe725](https://github.com/sainibhaowal/ReveLith/commit/aafe7251fde99db82f5247192218fed842d0a984))


### Performance Improvements

* **ci:** add rust crate build caching for faster native sidecar builds in CI and release pipelines ([3af84a1](https://github.com/sainibhaowal/ReveLith/commit/3af84a1bfef9724aa8108ae21c486a4f5636746b))
* **ci:** parallelize test suite across 6 high-speed Ubuntu matrix runners and fix release upload path ([1b0814c](https://github.com/sainibhaowal/ReveLith/commit/1b0814c6636d9c26b0fbf0b2d9610ec1ce1989a1))

## [1.1.3](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.2...revelith-v1.1.3) (2026-08-22)


### Bug Fixes

* **ci:** add macOS universal rust targets x86_64-apple-darwin and aar… ([69e3945](https://github.com/sainibhaowal/ReveLith/commit/69e394564a38f8a7c1376e878f68a0da7ec2d7ad))
* **ci:** add macOS universal rust targets x86_64-apple-darwin and aarch64-apple-darwin ([4d90d34](https://github.com/sainibhaowal/ReveLith/commit/4d90d345d2c8906c152d9b08a628e64b6e4340e7))

## [1.1.2](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.1...revelith-v1.1.2) (2026-08-22)


### Bug Fixes

* **ci:** install platform-specific native rollup binary for macOS and Linux runners ([049d4c6](https://github.com/sainibhaowal/ReveLith/commit/049d4c676d54d858f6dba4632b191b44918d518c))
* **ci:** install platform-specific native rollup binary for macOS and… ([4b27243](https://github.com/sainibhaowal/ReveLith/commit/4b2724325d9b6a39f965fe8fc1b5c118bc80135c))

## [1.1.1](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.0...revelith-v1.1.1) (2026-08-21)


### Bug Fixes

* **release:** fix Ubuntu libasound dependency, macOS optional rollup binary, and Windows sidecar & repository detection ([1341365](https://github.com/sainibhaowal/ReveLith/commit/13413653d68059f105fe84addb8bf6a6be4ed32e))
* **release:** fix Ubuntu libasound dependency, macOS rollup … ([2f7c675](https://github.com/sainibhaowal/ReveLith/commit/2f7c6756669d3c5ab4fb10191d476f21187e7446))

## [1.1.0](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.0.0...revelith-v1.1.0) (2026-08-21)


### Features

* complete ReveLith office suite - clean branding, 100% test coverage and full UX integrity ([e12b570](https://github.com/sainibhaowal/ReveLith/commit/e12b570223d76d65d96fada4cb7e151c47783a59))


### Bug Fixes

* **ci:** generate valid package-lock.json for npm ci in GitHub Actions ([2be6dd8](https://github.com/sainibhaowal/ReveLith/commit/2be6dd8a373c28556225efd060851994e5d60029))
