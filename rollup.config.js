import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true
  },
  plugins: [typescript({
    allowSyntheticDefaultImports: true,
    sourceMap: true,
    sourceRoot: 'dist',
    declaration: true,
    declarationDir: 'dist',
  }),{
    renderChunk: (code)=>{
      return {
        code: `#!/usr/bin/env node
${code}`,
        map: null
      }
    }
  }]
};