export type ProductPath =
  | "/"
  | "/consent"
  | "/hollers/$id"
  | "/install"
  | "/respond/$id"
  | "/settings"
  | "/sign-in";

type ParamsOf<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? ParamsOf<Head> | ParamsOf<Tail>
  : Path extends `$${infer Name}`
    ? Name
    : never;

interface Rest {
  search?: Record<string, string> | undefined;
  hash?: string | undefined;
}

export type ProductLink<Path extends ProductPath> = [ParamsOf<Path>] extends [never]
  ? [path: Path, rest?: Rest]
  : [path: Path, rest: Rest & { params: Record<ParamsOf<Path>, string> }];

export function productPath<Path extends ProductPath>(...link: ProductLink<Path>): string {
  const [path, rest] = link as [Path, (Rest & { params?: Record<string, string> })?];
  const filled = path.replace(/\$(\w+)/g, (_, name) =>
    encodeURIComponent(rest?.params?.[name] ?? ""),
  );
  const search = rest?.search ? `?${new URLSearchParams(rest.search)}` : "";
  const hash = rest?.hash ? `#${rest.hash}` : "";
  return `${filled}${search}${hash}`;
}
