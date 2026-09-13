export function normalizeBasePath(value) {
  const path = (value || "/").trim();
  if (!path || path === "/") return "/";
  return `/${path.replace(/^\/+|\/+$/g, "")}/`;
}
