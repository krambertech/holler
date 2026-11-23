import { type ProductLink, type ProductPath, productPath } from "@holler/core";

export function productUrl<Path extends ProductPath>(
  env: { PRODUCT_URL: string },
  ...link: ProductLink<Path>
): string {
  return `${env.PRODUCT_URL}${productPath<Path>(...link)}`;
}
