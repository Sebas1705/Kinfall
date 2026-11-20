// Vite's `?inline` CSS import: the stylesheet as a string.
declare module '*.css?inline' {
  const css: string;
  export default css;
}
