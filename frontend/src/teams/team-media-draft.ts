/** Keeps RustFS photo references unique after partial uploads and repeated error handling. */
export function mergeDraftImageKeys(existing:readonly string[],added:readonly string[]):string[]{
 return [...new Set([...existing,...added])];
}
