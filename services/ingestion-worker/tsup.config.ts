import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  bundle: true,
  noExternal: [/^(?!(pdfjs-dist|@napi-rs\/canvas)).*$/],
  banner: {
    js: [
      `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
      // Polyfill DOMMatrix for pdfjs-dist in Node.js (text extraction only)
      `if(typeof globalThis.DOMMatrix==='undefined'){globalThis.DOMMatrix=class DOMMatrix{constructor(i){this.m11=1;this.m12=0;this.m21=0;this.m22=1;this.m41=0;this.m42=0;this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;this.is2D=true;this.isIdentity=true;if(Array.isArray(i)&&i.length===6){[this.a,this.b,this.c,this.d,this.e,this.f]=i;this.m11=this.a;this.m12=this.b;this.m21=this.c;this.m22=this.d;this.m41=this.e;this.m42=this.f}}}}`,
    ].join('\n'),
  },
});
