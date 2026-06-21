// The four seams plus the request context. Adapters live behind these; only the
// composition root wires concrete adapters to them (design §4.1, §5).
export * from "./clock";
export * from "./photo-storage";
export * from "./judge";
export * from "./context";
export * from "./repositories";
