# JS Sequence Diagrams

`sequence-diagram.js` is the official 2.0.1 distribution from
https://bramp.github.io/js-sequence-diagrams/js/sequence-diagram-min.js.
BSD-2-Clause license retained in the source and generated bundle.

Local adaptations: explicit Underscore/Raphael ES module imports, removed the
unused Node CLI adapter, and exported the Diagram class without a global write.
The upstream parser and rendering algorithms are unchanged. Only the simple
Raphael theme is used; no external fonts or scripts are fetched at runtime.
