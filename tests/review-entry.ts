// One shell for the independent browser review modules. Only the selected
// module is loaded, so each fixture keeps its original setup and assertions.
const modules = {
  ...import.meta.glob("./*-review.tsx"),
  ...import.meta.glob("./*-review.ts"),
  ...import.meta.glob("./markdown-performance-matrix.tsx"),
  ...import.meta.glob("./markdown-search-audit.tsx"),
};

const name = new URLSearchParams(location.search).get("case");
const entry = name && (/^[a-z0-9-]+$/i.test(name))
  ? modules[`./${name}.tsx` as keyof typeof modules] ?? modules[`./${name}.ts` as keyof typeof modules]
  : undefined;

if (!entry) {
  document.getElementById("root")!.textContent = "Unknown review case.";
} else {
  void entry();
}
